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

This is a single-page Vite + React app, "Lucy lernt Sprachen" — a flashcard-based vocabulary trainer with spaced repetition. It intentionally has no backend, no router, and no state-management library: nearly the entire app lives in one component tree in `src/App.jsx` (~900 lines), mounted by `src/main.jsx`.

### `src/App.jsx` structure

- **SM-2-like spaced repetition core** — `rate(card, rating)` near the top of the file computes the next `ease`/`interval`/`dueDate`/`repetitions` for a card given a rating (`again`/`hard`/`good`/`easy`). This function is the single source of truth for the scheduling algorithm; it's duplicated (not imported) in `.claude/skills/spanischcoach/scripts/vocab.js` so that skill can run without a build step — **when changing the rating logic, update both places.**
- **Two card types** share one array (`cards` state): `vocab` cards (`front`/`back`/`langA`/`langB`) and `gap` cards (fill-in-the-blank sentences, parsed from lines like `Yo [como] fruta.` via `parseGapLine`/`maskSentence`/`revealSentence`). `deckKeyOf`/`deckLabelOf` group cards into "decks" (e.g. `vocab::Spanisch→Deutsch`, `gap::Spanisch`) for the dashboard and study-session filters.
- **Persistence**: all state (`cards`, `activity` log, `flipped` display preference) is debounce-saved to `localStorage` under the key `lucy-lernt-sprachen-vocab-data` (see the `useEffect` persistence block). This only works in a real browser context — it's unreliable inside sandboxed/iframed previews, which the code has a comment about. Export/import (JSON, via copy-paste or file) exists as a manual backup path since there's no server sync.
- **Views** are toggled via a single `view` state (`dashboard` / `add` / `study` / `browse`) rather than a router — each is a conditionally-rendered block within the same return statement.
- **Study session flow**: `startStudy(deckKey, label, onlyDue)` builds a shuffled `queue` from `cards`, then a `useEffect` pulls the next card into `current`. Rating a card via `submitRating` calls `rate()`, updates `cards`, logs today's activity (for the streak/heatmap), and advances the queue (an "again" rating re-inserts the card a few positions ahead instead of removing it).
- **Answer checking** for typed/gap answers uses `levenshtein()` with a tolerance proportional to answer length, so minor typos still count as correct.
- Inline styles + a `THEMES` object (light/dark palettes) are used throughout instead of a CSS framework; there's no separate stylesheet beyond a `<style>` block for fonts/scrollbars.

### `.claude/skills/spanischcoach/`

A Claude Code skill that lets Claude act as a chat-based Spanish coach, sharing the app's data model and SM-2 formulas so cards are interchangeable between the app and chat sessions:

- `scripts/vocab.js` — dependency-free Node ESM CLI (`add-vocab`, `add-gap`, `due`, `rate`, `stats`, `list`) that reads/writes `data/spanischcoach/vocab.json` in the same shape as the app's JSON export (`{ cards: [...], activityLog: {...} }`). Card ratings should always go through this script rather than being computed by hand, so results stay bit-for-bit consistent with `rate()` in `App.jsx`.
- The app's "Karten → Export/Import" feature is the bridge for moving cards between `localStorage` (browser) and `data/spanischcoach/vocab.json` (repo/chat).
