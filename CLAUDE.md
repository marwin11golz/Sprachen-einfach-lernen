# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install     # install dependencies
npm run dev     # start Vite dev server (http://localhost:5173)
npm run build   # production build to dist/
npm run preview # preview the production build locally
```

There is no lint, format, or test tooling in this repo — no ESLint/Prettier config, no test runner, no test files. The verification loop is therefore: `npm run build` (catches syntax/import errors only) **plus** actually exercising the change in a browser — either the `run` skill, or `npm run preview` driven with Playwright. For anything touching scheduling, answer checking, or speech, drive the real UI and assert on the outcome; a green build says almost nothing about correctness here.

## Architecture

Single-page Vite + React app, "Sprachen lernen" — a flashcard vocabulary trainer with spaced repetition. Deliberately no router and no state-management library. Data is local-first (`localStorage`); Supabase cloud sync is an optional layer that the app runs fine without.

### Module layout

The data layer is deliberately separated from the UI so that database work and design work don't collide.

**Domain / data**

- **`src/lib/fsrs.js`** — the FSRS-6 scheduling core (stability/difficulty/retrievability/interval formulas, standard weights). Pure functions, no imports.
- **`src/lib/srs.js`** — domain logic built on `fsrs.js`: `rate(card, rating)`, the card factories `newVocabCard`/`newGapCard`, `levenshtein()`, `splitAnswer()`/`cardSides()`, gap-sentence helpers (`parseGapLine`/`maskSentence`/`revealSentence`), `deckKeyOf`/`deckLabelOf`, and the `LANGUAGES` table. **Single source of truth for the card shape and the scheduling algorithm.**
- **`src/lib/storage.js`** — `localStorage` read/write plus schema migration. Persisted shape (v2): `{ schemaVersion, cards, activityLocal, activityRemote, flipped, newCardsPerDay, prefsUpdatedAt, lastUserId, lastSyncAt }` under the key `lucy-lernt-sprachen-vocab-data`. That key still carries the app's old name on purpose — renaming it would orphan every existing user's data.
- **`src/lib/merge.js`** — `mergeCards()` (per-card last-write-wins on `updatedAt`, ties resolved by `pickWinner()`), `combinedActivity()`, `purgeOldTombstones()`. Used by both the import path and cloud sync, so there is exactly one merge rule.

**Cloud sync (optional)**

- **`src/lib/supabase.js`** — client, or `null` when `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` are absent. `cloudConfigured` is the flag every caller checks; without it the app stays purely local instead of crashing.
- **`src/lib/sync.js`** — `syncNow()`/`syncOnce()`: fetch everything → merge → derive the push set from the merge result. Takes the client as an argument rather than importing it, so it is testable without a network. Always fetches the full card set (a personal deck is tiny, and it removes the whole "which change did I miss" failure class). `syncNow()` de-dupes concurrent calls via an in-flight promise.
- **`src/hooks/useAuth.js`**, **`src/hooks/useCloudSync.js`** — auth session, and *when* to sync (on sign-in, debounced after local edits, on reconnect/foreground). Sync is paused while `view === 'study'` so a remote state can't overwrite a card being rated.

**UI**

- **`src/lib/theme.js`** — the design system: `SPACE`/`RADIUS`/`FONT`/`NAVBAR_H` scales, `THEMES` (light/dark palettes), and the style helpers `btnPrimary`/`btnSecondary`/`btnOutline`/`btnGhost` (each with `sm`/`md`/`lg` sizes), `pill`, `ratingBtn`, `surface`, `surfaceSoft`, `divider`, plus the `typo*` family. Inline styles throughout; no CSS framework. **All hardcoded spacing/radius/font values have been removed.** Reach for these tokens rather than fresh magic numbers — spacing: `{ xs:4, sm:8, md:12, lg:16, xl:24, xxl:32, xxxl:48 }`, radius: `{ sm:6, md:8, lg:12, pill:999 }`, font: `{ xs:11, sm:12, base:13, md:14, lg:16, xl:18, xxl:22, hero:32 }`. This discipline ensures visual consistency across all changes.
- **`src/hooks/useVocabStore.js`** — owns `cards`, activity, `flipped`, `newCardsPerDay`, persistence. Exposes **only intent-based actions** (`addCards`, `rateCard`, `deleteCard`, `importData`), never a raw `setCards` — that is what guarantees every mutation stamps `updatedAt`.
- **`src/App.jsx`** — all UI. Views are toggled by a single `view` state: `dashboard` / `add` / `browse` / `account` render as conditional blocks inside the main return, but **`study` returns early as its own full-screen layer** (before the header and bottom nav) so the learning session has no surrounding chrome. Two top-level `return`s, not one.
- **`src/ui/AuthScreen.jsx`**, **`src/ui/SyncBadge.jsx`** — the only extracted components.

### Sync-critical invariants

- **Every card carries `updatedAt`** (full ISO timestamp) and **`deleted`** (tombstone flag). Deleting sets `deleted: true` rather than removing the card — otherwise the other device resurrects it on the next merge.
- **Migration derives `updatedAt` from `lastReviewed`/`createdAt`, never from `Date.now()`.** Both devices hold copies of the same legacy cards, so stamping "now" would let whichever device opens the app second win every card and silently overwrite the other's review progress. Deterministic derivation produces a tie instead, which `pickWinner()` resolves in favour of higher `totalReviews` — a tie must never cost progress.
- **Activity is split into `activityLocal` (this device) and `activityRemote` (sum of others)**; only `activityLocal` is ever pushed. Pushing the combined value would make the counts inflate on every sync.
- **`cardToRow()` sends the client's `updatedAt`, not `now()`** — otherwise every uploaded card would look new on the next pull and the devices would ping-pong forever. Timestamps from Postgres go through `normalizeStamp()` because `"…+00:00"` and `"…Z"` are the same moment but compare differently as strings.
- `useVocabStore` keeps a `revision` counter bumped only by real user edits — applying a remote state must not bump it, or every pull would trigger a push.
- **Preferences sync carries only `flipped`.** `newCardsPerDay` is deliberately local-only: it's a pacing preference, not progress, and keeping it out means zero changes to `sync.js`.

### Domain conventions worth knowing

- **`repetitions` equals `totalReviews + 1`** and is never reset by an "again" rating (that was an SM-2 concept). Resetting it would make a forgotten, long-learned card count as "new" again in the dashboard and in the daily limit.
- **Legacy SM-2 cards are seeded lazily.** `seedFromLegacy()` in `srs.js` derives `stability`/`difficulty` from the old `interval`/`ease` on the card's first rating after the upgrade — due dates are untouched, so no card jumps.
- **The daily new-card limit caps only new cards.** In `startStudy()`, the pool is split into reviews (`repetitions > 0`, never capped — that's the point of spaced repetition) and new cards (sorted oldest-`createdAt` first, capped by `newCardsPerDay` minus what was already introduced today). "Alle wiederholen" bypasses the cap entirely. The "introduced today" count is *derived* from the cards (`totalReviews === 1 && lastReviewed === today`), not stored — that keeps it correct across multiple sessions and a sync in between.
- **A `|` or a spaced dash splits answer from example sentence on *either* side of a vocab card** (`splitAnswer()`, applied to both sides by `cardSides()`). Only the part before the separator is typed and checked; the rest is context. The dash *must* be surrounded by spaces so `E-Mail` and `well-known` survive, and en/em dashes count because phone keyboards autocorrect `" - "` into `" – "`. **Each sentence belongs to its own language**: `casa | Vivo en una casa. = Haus | Ich wohne in einem Haus.` shows the Spanish sentence on the Spanish side and the German one on the German side, and they swap together with `flipped`. That is why a back-side sentence can no longer leak onto the front and give the answer away. Cards carrying only one sentence keep it on the translation side and work unchanged — no migration was needed, because the sentence never was its own field.
- **Language names in `LANGUAGES` are persisted card data** (`langA`/`langB`/`language`). Renaming an entry orphans existing cards' language; adding entries is safe. Each carries a BCP-47 `code` used for speech — without it the browser reads every word in the default voice, so English "future" comes out German.

### Design aesthetic: Anki-style

The app's visual design targets a professional, utilitarian look (inspired by Anki) rather than decorative/playful. Changes prioritize clarity and efficiency: smaller radius, flatter shadows, tighter spacing, smaller font scale. This is enforced through the design token system — no hardcoding. When styling a new component, use `SPACE`/`RADIUS`/`FONT`/`THEMES` tokens exclusively. If a value doesn't fit the scales, it means the component needs rethinking, not a new magic number.

Two rules the color system rests on, both enforced by hand — nothing checks them at build time:

- **One filled green button per screen.** `btnPrimary` marks the single main action; every competing action uses `btnOutline` (or `btnGhost`). Two filled buttons side by side read as two main actions and the screen loses its center of gravity.
- **Green means "act now", not "this is a number".** `primary` carries the main action, the active state, progress and the key figures; `success`/`warning`/`error` are reserved for immediate feedback (rating buttons, toasts) and must not be borrowed as a second accent — `success` and `primary` are nearly the same green and reading two of them on one screen is what "leicht variierende Grüntöne" means. Categories are distinguished by the *shape* of their icon, never by a color of their own: that is why the Fehlerkartei's warning triangle is green like every other deck icon.

### UI gotchas

- **Nav visibility is driven purely by CSS media queries** (`.nav-top-links` / `.nav-bottom` in the `globalCss` template string). Top nav on wide screens, floating bottom pill on phones. Putting an inline `display` on either element silently defeats the breakpoint and shows **both** navigations at once — this has already happened once.
- **Speech voices load asynchronously.** `getVoices()` is usually empty on first call, so `App.jsx` caches them in a ref and refreshes on `voiceschanged`. Some browsers also ignore `utterance.lang` unless an explicit `voice` is set, which is why the code resolves a matching voice (exact region first, then language prefix).
- PWA is configured for `autoUpdate` + `skipWaiting` in `vite.config.js`, so users get new versions on next launch without reinstalling. Supabase responses are deliberately **not** runtime-cached — a failed request should retry later, not serve stale data.

### `.claude/skills/spanischcoach/`

A skill that lets Claude act as a chat-based Spanish coach, sharing the app's data model and FSRS formulas so cards are interchangeable between the app and chat sessions.

- `scripts/vocab.js` — dependency-free Node ESM CLI (`add-vocab`, `add-gap`, `due`, `rate`, `stats`, `list`) reading/writing `data/spanischcoach/vocab.json` in the same shape as the app's JSON export. Ratings should always go through this script rather than being computed by hand, so results stay bit-for-bit consistent with `rate()`.
- **`rate()`, the FSRS formulas, the card shape, and `splitAnswer()`/`cardSides()` are duplicated (not imported) here** so the script runs without a build step — **changes to any of those must be mirrored into `vocab.js`.** `splitAnswer()` is critical because it defines what counts as a correct answer: if the two sides disagree on the answer/example separator, something the app accepts would be marked wrong in chat, and vice versa. `cardSides()` matters for the same reason on the *question* side — without it the script prints the example sentence inside the prompt. When adding separator patterns to `splitAnswer()` in `srs.js`, always update the regex in both files identically. UI-only concerns (theme, view logic, the language picker lists) are not.
- The app's "Karten → Export/Import" is the bridge between `localStorage` (browser) and `data/spanischcoach/vocab.json` (repo/chat), and remains the only way to move cards without signing in.

## Language

The app, all UI copy, and the code comments are in German. Commit messages and comments in this repo are written in German prose that explains *why* a non-obvious decision was made, not what the line does — match that register.
