# Felt - Codex Work Package: Phase 8 - hand tracker, leak finder & known heroes - 14 Jun 2026

Implementer: Codex. Local filesystem only; Jason pushes to git. Design decisions by Claude
(confirmed with Jason). Big feature — build in the slices below, each independently shippable.
Commit between slices.

## Goal

Track every hand the active hero plays, persist it across sessions, and surface the player's
**leaks** — measured against the engine's own ground-truth (Felt already computes the correct
preflop range and postflop EV for every spot). Support **known heroes** so more than one person
can use the same install and keep separate histories.

## Confirmed decisions

- **Leak detection = preflop ranges + postflop EV** (the fuller version).
- **Output = "leaks first":** the Tracker opens on a ranked list of the hero's leaks, with a
  compact stats strip above it.
- **Known heroes, pick-and-auto-track:** choose who's playing from a Heroes list; every hand
  that hero plays records under them until you switch. No manual record toggle.
- **Known heroes mirror the known-players roster** (same CRUD + import/export/delete + seat-name
  label patterns already built in `src/roster/`).

## Architecture

- **New IndexedDB database** (`felt`) via a thin wrapper (`src/store/db.js`, ~60 lines; `idb`
  npm is fine). Stores:
  - `heroes` — `{ id, name, color, createdAt }`.
  - `hands` — recorded hands, **indexed by `heroId`** (and by timestamp), because a hero can
    accumulate thousands. (Hand volume is exactly why localStorage won't do here.)
  - Leave the existing **player roster on localStorage** (don't disturb it). Heroes may live in
    localStorage too if simpler, but `hands` MUST be IndexedDB.
- State: add `heroes`, `activeHeroId`, and (loaded lazily) tracker aggregates to state.
- The recorder reads what the engine already produces at hand end: seed, hero hole cards,
  position, full action log, result/net, and per-decision range + EV context.
- Every hand carries its **seed**, so any leaked hand can be re-dealt ("replay this leak").
- Local-only, no auth. Switching hero shows that hero's data.

## Slice 1 — Known heroes + persistence foundation
- `src/store/db.js` IndexedDB wrapper (open/get/put/delete/getAllByIndex).
- Heroes CRUD (mirror `src/roster/store.js`): create/rename/delete, a color, `activeHeroId`.
- A **Hero picker** in the top bar/controls listing heroes + "add hero"; selecting sets the
  active hero. Auto-create a default hero ("You") if none exists, so nothing breaks for solo use.
- **Seat label:** the hero seat shows the active hero's name (mirror the known-player name label
  in `table.js`).
- Acceptance: can add/select/delete heroes; the hero seat shows the active hero's name; default
  hero auto-created; nothing changes if the feature is unused.

## Slice 2 — Hand recording
- On each **terminal dealt hand**, write a `hands` record under `activeHeroId`:
  `{ id, heroId, ts, seed, players, heroSeat, heroPos, heroCards, board, net, won,
     decisions: [...] }` (decisions filled by slice 3).
- **Track normal dealt hands** (including Pub game vs known players). **Do NOT track Manual-spot
  constructed hands** (those are study tools, not the hero's real play).
- Auto-track the active hero; no toggle.
- Acceptance: playing hands accumulates records under the active hero that survive reload;
  Manual-spot hands are excluded; switching hero routes new hands to the new hero.

## Slice 3a — Preflop leak detection
- For each hero preflop decision, compare the hero's action to the engine's range for the exact
  hand + spot (reuse `getRangeForSpot` / opening + defend + 3-bet charts):
  - First-in: folded a should-open hand → "open-folded too tight"; opened a hand outside range →
    "opened too wide".
  - Facing an open: defend chart says fold/call/3-bet → flag deviations ("defended too wide",
    "over-folded a defend hand", "flatted a 3-bet hand", etc.).
  - Facing a 3-bet: same against the vs-3bet chart.
- Tag each decision `{ spot, heroAction, recommended, leak: true/false, leakType }` and store on
  the hand.
- Acceptance: a hand where the hero deviates from the chart is tagged with the right leak type;
  in-range plays are tagged clean.

## Slice 4 — Tracker UI (leaks-first + stats strip)
- A **Tracker** view (toggle from the top bar) for the **active hero**:
  - **Stats strip:** hands tracked, VPIP, PFR, 3-bet%, fold-to-cbet, WTSD, net result (bb).
    (Computed from the recorded hands.)
  - **Leaks list (headline):** leak categories ranked by frequency (and, once postflop lands,
    total EV/bb lost), each showing the correct play and a count; click a leak to see example
    hands, with a "replay" using the stored seed.
- Acceptance: the Tracker shows the active hero's stats + ranked preflop leaks with drill-down;
  empty/new hero shows a friendly empty state.

## Slice 5 — Import / export / delete hero data
- Mirror the player import/export (`mergeImportedRoster` pattern): export a hero as JSON
  (definition + their hand history); import **merges** (numbered suffix on name clash, fresh
  ids, never overwrite). Delete a hero (confirm) also deletes their hands.
- Offer export of hero-only vs hero+hands (full backup). Acceptance: export → delete → import
  restores the hero and history; import never clobbers existing heroes.

## Slice 6 — Postflop EV leak detection (heaviest — do last)
- **The catch:** the engine currently computes equity / pot-odds / EV(call) only in the maths
  layer (Manual spot). To score postflop leaks in normal play, the recorder must evaluate EV at
  **each hero postflop decision** — i.e. run the existing equity worker for the hero's hand vs
  the live opponents' assigned ranges at that decision point, even in dealt mode. Add a way to
  compute (engine-side) `{ equity, requiredEquity, evCall, verdict }` for a hero decision without
  needing Manual spot.
- Then score: facing a bet, **called with evCall < 0** → "called -EV (paid off)"; **folded with
  evCall > 0** → "folded +EV". Record the chips/bb delta so leaks can rank by cost. (Scoring
  raises/bets is out of v1 scope — call/fold vs EV only.)
- Watch performance: only evaluate at hero decision points (not every villain action); reuse the
  seeded worker; cache per decision. Acceptance: a hero call that the engine rates -EV is flagged
  and contributes its bb cost to the leak ranking; deterministic for a given seed.

## Tests
- `db.js`: CRUD + getAllByIndex round-trip; survives reload.
- Recording: a played hand is stored under the active hero with correct hero cards/position/net;
  Manual-spot hands not recorded; switching hero routes correctly.
- Preflop leak scoring: table of (hand, spot, action) → expected leak/clean (deterministic).
- Stats: VPIP/PFR/etc. computed correctly from a fixture of recorded hands.
- Import/export: round-trips hero + hands; merge numbers duplicate names; delete removes hands.
- Postflop EV scoring (slice 6): a constructed -EV call is flagged with the right bb delta;
  deterministic for a seed.

## Acceptance (overall)
- Pick a hero, play, and the Tracker shows their stats + a ranked leaks list (preflop now,
  postflop-EV once slice 6 lands), with replay-by-seed and import/export/delete.
- Solo users and the no-tracker case are unaffected; `npm test` + `npm run build` clean; no
  console errors.

## Out of scope (later)
- Importing real hand histories from other sites; HUD overlays; cloud sync/multi-device (would
  need a backend); scoring postflop raise/bet sizing leaks. The AI coach (Phase 6) could later
  narrate the leak report, but that's a separate add-on.
