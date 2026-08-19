# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install     # install dependencies
npm run dev     # start Vite dev server (http://localhost:5173)
npm run build   # production build to dist/
npm run preview # serve the production build (needed to exercise the service worker)
```

Cloud sync needs `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in `.env.local` (template: `.env.example`; `.env*` is gitignored). Without them `cloudConfigured` is `false`, `supabase` is `null`, and the app deliberately runs local-only rather than crashing — so both states are worth testing after touching the sync layer.

There is no lint, format, or test tooling configured — no ESLint/Prettier config, no test runner. Verify with `npm run build` (catches syntax/import errors) plus throwaway Node/Playwright scripts driving a real browser (Chromium at `/opt/pw-browsers/chromium`). The pure modules (`lib/srs.js`, `lib/merge.js`, `lib/sync.js`) are importable straight from Node, and `syncOnce()` takes its database client as an argument specifically so it can be exercised against a stub with no network.

## Architecture

Single-page Vite + React app, "Lucy lernt Sprachen" — a flashcard vocabulary trainer with spaced repetition. No router, no state-management library. **Local-first**: `localStorage` is the source of truth for the running app; Supabase sync and the PWA shell are layers on top, each of which can fail without taking the app down.

### Module layout

The data layer is deliberately separated from the UI so database work and design work don't collide. This is a checkable property, not just a convention: `grep "supabase\|localStorage" src/App.jsx` returns nothing — the UI has no idea a database exists.

- **`src/lib/srs.js`** — domain logic: `rate(card, rating)` (SM-2-like scheduler computing `ease`/`interval`/`dueDate`/`repetitions` from `again`/`hard`/`good`/`easy`), `levenshtein()`, gap-sentence helpers (`parseGapLine`/`maskSentence`/`revealSentence`), `deckKeyOf`/`deckLabelOf`, card factories `newVocabCard`/`newGapCard`. **Single source of truth for the card shape and the scheduling algorithm.** `rate()` and the card shape are duplicated (not imported) in `.claude/skills/spanischcoach/scripts/vocab.js` so that skill runs as a dependency-free Node script — **changes here must be mirrored there.**
- **`src/lib/storage.js`** — `localStorage` read/write plus schema migration. Persisted shape (v2) under key `lucy-lernt-sprachen-vocab-data`: `{ schemaVersion, cards, activityLocal, activityRemote, flipped, prefsUpdatedAt, lastUserId, lastSyncAt }`. Also owns `getDeviceId()` and `backupRaw()`.
- **`src/lib/merge.js`** — `mergeCards()` (per-card last-write-wins on `updatedAt`, with `pickWinner()` for ties), `combinedActivity()`, `purgeOldTombstones()`. Used by both the import path and cloud sync, so there is exactly one merge rule.
- **`src/lib/theme.js`** — `THEMES` (light/dark palettes), `hexToRgba`, and the button style helpers. Inline styles throughout; no CSS framework and no stylesheet beyond a `<style>` block for fonts. Extracted from `App.jsx` only because the auth screen needs it too.
- **`src/lib/supabase.js`** — client construction only. Exports `supabase` (or `null`) and `cloudConfigured`. `detectSessionInUrl: false` because magic links are deliberately not used.
- **`src/lib/sync.js`** — the algorithm: pull everything → merge → derive push set → push. Takes the client as an argument rather than importing it, which is what makes it testable offline. Also exports `normalizeStamp`/`rowToCard`/`cardToRow`/`isNewer`.
- **`src/hooks/useVocabStore.js`** — owns cards, activity, preferences, persistence. Exposes **only intent-based actions** (`addCards`, `rateCard`, `deleteCard`, `importData`, `applyRemote`), never a raw `setCards` — that is what guarantees every mutation stamps `updatedAt`.
- **`src/hooks/useAuth.js`** — email/password auth, Supabase errors mapped to German.
- **`src/hooks/useCloudSync.js`** — decides *when* to sync and owns `syncState` plus the different-account guard.
- **`src/ui/AuthScreen.jsx`, `src/ui/SyncBadge.jsx`** — account view and the always-visible status pill (which is also where `storageWarning` surfaces).
- **`src/App.jsx`** — UI only: five views (`dashboard` / `add` / `study` / `browse` / `account`) toggled via a single `view` state, each a conditionally-rendered block in one return statement.

### Sync-critical invariants

Each of these exists because violating it silently corrupts or loses user data.

- **Every card carries `updatedAt`** (full ISO timestamp) and **`deleted`** (tombstone). Deleting sets `deleted: true` rather than removing the card — otherwise the other device resurrects it on the next merge. The UI never sees tombstones; `useVocabStore` filters them once.
- **Migration derives `updatedAt` from `lastReviewed`/`createdAt`, never from `Date.now()`.** Both devices hold copies of the same legacy cards, so stamping "now" would let whichever device opens the app second win every card and silently overwrite the other's review progress. Deterministic derivation produces a tie instead, which `pickWinner()` resolves in favour of higher `totalReviews` — a tie must never cost progress.
- **Normalize timestamps coming from Postgres.** It returns `…762+00:00` while the client generates `…762Z`. Compared as strings these differ (`'+' < 'Z'`), so an actual tie would read as a difference and the two devices would overwrite each other forever. `normalizeStamp()` canonicalizes on every read.
- **`updated_at` is written by the client, never `now()`, and must have no update trigger.** Otherwise a just-pushed row returns with a newer timestamp than the identical local copy and looks changed again on the next pull.
- **The push set is derived from the merge result** (`isNewer(merged, remote)`), not from a dirty list. Anything edited offline is automatically newer, so it goes up at the next successful sync; a half-finished push is simply re-derived and retried. `isNewer` must keep the same tie-break as `pickWinner`, or a tie-winner would never be uploaded.
- **Activity is split into `activityLocal` (this device) and `activityRemote` (sum of others)**; only `activityLocal` is ever pushed, into a row keyed by `device_id`. Pushing the combined display value would make counts inflate on every sync.
- **`useVocabStore.revision` is bumped only by real user edits.** `applyRemote()` must never bump it, or every pull would trigger a push and the devices would ping-pong.
- **No sync while `view === 'study'`** — a remote update mid-session would clobber a card being rated.

### Supabase schema

Not stored as a migration file anywhere; this is the reference. All three tables are RLS-protected — the `anon` key is public by design and RLS is the actual security boundary, so an unprotected table means a world-readable vocabulary set.

```sql
create table public.cards (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null, data jsonb not null,
  deleted boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, id));

create table public.activity (
  user_id uuid not null references auth.users(id) on delete cascade,
  device_id text not null, day date not null,
  count integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, device_id, day));

create table public.preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now());
```

Each table has RLS enabled and exactly one policy: `for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id)`. Card fields live in `data` (JSONB) so new fields need no migration; `deleted` and `updated_at` are promoted out because sync filters and orders on them.

### PWA

`vite-plugin-pwa` with `registerType: 'autoUpdate'` — an installed home-screen app stuck on an old build is the worst failure mode here. Deliberately **no** `runtimeCaching`: database responses must never come from a cache; offline requests should fail so sync retries later.

iOS ignores the manifest, so `index.html` carries the `apple-*` meta tags — `apple-mobile-web-app-capable` is what actually removes the Safari chrome. Because the app then extends under the status bar, the sticky header and content container use `env(safe-area-inset-*)`. Icons are pre-rendered PNGs in `public/icons` so the build needs no image dependency; iOS only picks up icon and name at install time, so changing them means re-adding the home-screen icon.

### `.claude/skills/spanischcoach/`

A Claude Code skill that lets Claude act as a chat-based Spanish coach, sharing the app's data model and SM-2 formulas so cards are interchangeable between the app and chat sessions:

- `scripts/vocab.js` — dependency-free Node ESM CLI (`add-vocab`, `add-gap`, `due`, `rate`, `stats`, `list`) that reads/writes `data/spanischcoach/vocab.json` in the same shape as the app's JSON export. Card ratings should always go through this script rather than being computed by hand, so results stay bit-for-bit consistent with `rate()` in `src/lib/srs.js`. It is not connected to Supabase.
- The app's "Karten → Export/Import" feature is the bridge for moving cards between `localStorage` (browser) and `data/spanischcoach/vocab.json` (repo/chat).
