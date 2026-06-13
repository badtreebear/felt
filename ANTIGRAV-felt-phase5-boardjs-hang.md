# Felt — Phase 5 startup hang: `board.js` not loading (13 Jun 2026)

For: Antigrav (Codex credits exhausted). Diagnosed by Claude via Chrome devtools on localhost:5173.

## Symptom
App never finishes loading. Page does not reach idle; screenshots/JS-eval time out. **No
console errors or failed imports are thrown** — it just hangs.

## Root cause (confirmed via network inspection)
Two module requests are stuck **pending** (never resolve, never 200):
- `/src/engine/board.js`  ← NEW in Phase 5
- `/src/engine/equity.worker.js`  ← (the worker; may be pending as a downstream consequence)

All other modules return 200 normally (main.js, table.js, postflop-action.js, preflop-action.js,
player-model.js, ranges.js, state.js, etc. all load fine).

A module request that hangs pending — rather than 404ing or erroring — almost always means the
**Vite dev server cannot transform/parse the file**: a syntax error, an unterminated
string/template literal, or a malformed/circular import in `board.js` is stalling the transform,
so the request never completes and the importing module (and thus app bootstrap) blocks forever.

## What to check first (fastest path)
1. **The Vite dev server terminal** — it will be showing a transform/parse error for
   `src/engine/board.js` with a file + line number. That message names the exact problem.
   Fix that and the pending request will resolve.
2. Confirm `board.js` is syntactically valid (run it through `node --check src/engine/board.js`
   or `npx vite build` to surface the parse error out-of-band).
3. Check `board.js`'s imports — a circular import between `board.js` and another Phase 5 module
   (e.g. postflop-action.js or hand-eval.js) could also stall resolution.
4. Once `board.js` loads, re-check that `equity.worker.js` resolves (it may have been pending only
   because bootstrap stalled before the worker spun up).

## Note on the equity worker
`equity.worker.js` was verified working in Phases 2-4 (Monte Carlo equity, seeded, tie-split
correct). If it is *still* pending after `board.js` is fixed, that's a separate regression — but
most likely it's just blocked behind the board.js stall and will recover.

## Not yet verifiable
Because the app won't load, NONE of Phase 5 (postflop play, board dealing, street progression,
showdown) has been tested yet. Once startup is fixed, Claude will verify the full postflop flow
via Chrome: board deals correctly per street, postflop betting resolves, showdown evaluates the
winner correctly (cross-checked against treys), and seeded replays stay identical.

## Also ready to land (separate, unblocked)
- `pokercoaching-rfi-6max.json` — verified 6-max RFI chart (LJ/HJ/CO/BTN/SB), combo counts
  226/280/368/568/838, monotonic, premiums retained, % within ~0.7 of source. Drop in
  `src/data/ranges/`. Loader should select 6-max for 3-6 players, 9-max for 7-9 (see below).
