# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install     # install dependencies
npm run dev     # start Vite dev server (http://localhost:5173)
npm run build   # production build to dist/
npm run preview # preview the production build locally
```

There is no lint, format, or test tooling configured in this repo — no ESLint/Prettier config, no test runner. Verify changes by running `npm run build` (catches syntax/import errors) and by exercising the app in a browser (see `run` skill or start `npm run dev` and use Playwright/manual testing).

## Architecture

This is a single-page Vite + React app, "Lucy lernt Sprachen" — a flashcard-based vocabulary trainer with spaced repetition. It intentionally has no router and no state-management library. Data is local-first (`localStorage`), with cloud sync as an optional layer on top.

### Module layout

The data layer is deliberately separated from the UI so that database work and design work don't collide:

- **`src/lib/srs.js`** — the domain logic: `rate(card, rating)` (the SM-2-like scheduler computing `ease`/`interval`/`dueDate`/`repetitions` from a rating of `again`/`hard`/`good`/`easy`), `levenshtein()`, the gap-sentence helpers (`parseGapLine`/`maskSentence`/`revealSentence`), `deckKeyOf`/`deckLabelOf`, and the card factories `newVocabCard`/`newGapCard`. **This is the single source of truth for the card shape and the scheduling algorithm.** `rate()` and the card shape are duplicated (not imported) in `.claude/skills/spanischcoach/scripts/vocab.js` so that skill runs as a dependency-free Node script — **changes here must be mirrored there.**
- **`src/lib/storage.js`** — `localStorage` read/write plus schema migration. Persisted shape (v2): `{ schemaVersion, cards, activityLocal, activityRemote, flipped, lastUserId, lastSyncAt }` under the key `lucy-lernt-sprachen-vocab-data`.
- **`src/lib/merge.js`** — `mergeCards()` (per-card last-write-wins on `updatedAt`), `combinedActivity()`, `purgeOldTombstones()`. Used both by the import path and by cloud sync, so there is exactly one merge rule.
- **`src/lib/theme.js`** — `THEMES` (light/dark palettes) and the button style helpers. Inline styles throughout; no CSS framework.
- **`src/hooks/useVocabStore.js`** — owns `cards`, activity, `flipped`, persistence. It exposes **only intent-based actions** (`addCards`, `rateCard`, `deleteCard`, `importData`), never a raw `setCards` — that is what guarantees every mutation stamps `updatedAt`.
- **`src/App.jsx`** — UI only: the four views (`dashboard` / `add` / `study` / `browse`) toggled via a single `view` state, each a conditionally-rendered block in one return statement.

### Sync-critical invariants

- **Every card carries `updatedAt`** (full ISO timestamp) and **`deleted`** (tombstone flag). Deleting sets `deleted: true` rather than removing the card — otherwise the other device resurrects it on the next merge.
- **Migration derives `updatedAt` from `lastReviewed`/`createdAt`, never from `Date.now()`.** Both devices hold copies of the same legacy cards, so stamping "now" would let whichever device opens the app second win every card and silently overwrite the other's review progress. Deterministic derivation produces a tie instead, which `pickWinner()` resolves in favour of higher `totalReviews` — a tie must never cost progress.
- **Activity is split into `activityLocal` (this device) and `activityRemote` (sum of others)**; only `activityLocal` is ever pushed. Pushing the combined value would make the counts inflate on every sync.
- `useVocabStore` keeps a `revision` counter bumped only by real user edits — applying a remote state must not bump it, or every pull would trigger a push.

### `.claude/skills/spanischcoach/`

A Claude Code skill that lets Claude act as a chat-based Spanish coach, sharing the app's data model and SM-2 formulas so cards are interchangeable between the app and chat sessions:

- `scripts/vocab.js` — dependency-free Node ESM CLI (`add-vocab`, `add-gap`, `due`, `rate`, `stats`, `list`) that reads/writes `data/spanischcoach/vocab.json` in the same shape as the app's JSON export. Card ratings should always go through this script rather than being computed by hand, so results stay bit-for-bit consistent with `rate()` in `src/lib/srs.js`.
- The app's "Karten → Export/Import" feature is the bridge for moving cards between `localStorage` (browser) and `data/spanischcoach/vocab.json` (repo/chat).

