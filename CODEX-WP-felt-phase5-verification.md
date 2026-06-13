# Felt - Codex Work Package: Phase 5 Verification (postflop correctness) - 13 Jun 2026

Implementer: Antigrav (Codex). Local filesystem only; Jason pushes to git.

## Context / current state

- The Phase 5 startup hang is gone. `src/engine/board.js` was refactored away; the app
  now boots clean on `http://127.0.0.1:5173` with no console errors and no pending module
  requests. The stale `ANTIGRAV-felt-phase5-boardjs-hang.md` note is obsolete.
- Postflop play is functional end-to-end in manual smoke testing: preflop closes ->
  "Continue to flop" -> flop/turn/river deal one street at a time -> showdown.
- `npm test` is green (57/57). `verify_showdown.py` (Playwright + treys) already exists and
  reaches one showdown, parses the board + live hole cards, and compares the app winner to
  treys. It already maps the card face "10" back to "T" for treys.
- Recently landed (do not re-do): street-change badge clearing and folds-persist in
  `src/ui/table.js`; ten renders as "10" in `src/ui/cards.js`; default pace is now 1.0s
  (`ui.actionDelayMs: 1000` in `src/state.js`).

## Goal

Turn the one-shot manual check into a repeatable, high-volume verification that proves
Phase 5 postflop is correct, then record the result. This is a QA/verification package -
no new gameplay features. If a check fails, fix the underlying bug and re-run.

## Scope of verification

1. **Board dealing per street.**
   - Flop reveals exactly 3 cards, turn exactly 4, river exactly 5.
   - Board cards come from `boardRunout` in order; burn cards are excluded.
   - No board card ever duplicates another board card or any dealt hole card.

2. **Showdown correctness vs an independent evaluator (treys).**
   - Over at least 200 dealt hands that reach showdown, the app's declared winner(s) match
     treys' winner(s) exactly. This must include split pots: when treys reports a tie, the
     app must split, and vice versa (zero mismatches allowed).
   - Pot conservation: total chips awarded at showdown equals the pot; per-seat stack deltas
     reconcile (sum of contributions in == pot out, winners credited correctly).

3. **Seeded replay determinism.**
   - Replaying the same hand (the "Replay hand" control re-runs the same seed) reproduces an
     identical action log, board, pot, final stacks, and showdown result. Serialize the hand
     state for two runs of the same seed and assert byte-for-byte equality.

4. **Street progression / betting resolution (Phase 5A rules).**
   - Each postflop street runs at most one bet + one response cycle (no raises/check-raises
     in 5A).
   - A fold to a bet ends the hand immediately and awards the whole pot to the last live
     player (no showdown).
   - A checked/called street advances flop -> turn -> river -> showdown.

5. **Regression guards for the recently landed UI fixes.**
   - Folded seats keep their "Fold" badge across every later street.
   - Call/Check/Raise/Bet badges clear the moment the street advances.
   - Any ten renders as "10" (board and hole cards) and is not clipped on the card.

## Tooling / how to run it

- Extend `verify_showdown.py` into a loop harness:
  - Repeat: click "Deal new hand" -> auto-play to showdown (click hero Check/Call and any
    "Continue to ..." cue) -> parse board + live hole cards -> evaluate with treys ->
    compare to the app's `.showdown-result` text -> record pass/fail with the seed and the
    full board+hands on any mismatch. Loop >= 200 hands.
  - To keep it deterministic and fast, set pace to Instant for the harness run (drag the Pace
    slider to 0 or set `ui.actionDelayMs = 0` via a test hook) so there are no timers to wait
    on; the 1.0s default is a UX choice, not a harness requirement.
  - For the determinism check (item 3), use the "Replay hand" control: capture serialized
    state, replay, capture again, assert equal.
- Optional enablement (only if needed to make the harness robust): expose a read-only
  `window.__feltState` getter (or a `?seed=` query param that injects the deal seed) so the
  harness can log/inject seeds and serialize state without scraping the DOM. Keep any such
  hook dev-only and out of the production bootstrap path. Prefer reusing existing DOM/state
  if it's already sufficient.
- Selectors already used by `verify_showdown.py`: `.showdown-result`,
  `button.completion-cue__button`, `button.hero-action-button`, `.board .card__rank`,
  `.board .card__suit`, `.seat`, `.fold-stamp`, `.seat__title strong`. Confirm these still
  match current markup before the long run; fix the selectors in the script if the markup
  drifted (e.g. board container class).

## Tests (add to the vitest suite where it belongs at the engine level)

- Board-from-runout: `boardForStreet` returns 0/3/4/5 cards for preflop/flop/turn/river and
  never includes burn cards.
- No-collision: for a dealt hand, the set of {all hole cards} ∪ {boardRunout} ∪ {burns} has
  no duplicates and totals the expected count.
- Showdown split: a constructed board+hands that ties awards the pot to all tied seats and
  the split sums back to the pot.
- Fold-out: a hand where everyone folds to a bet awards the full pot to the last live seat
  with no showdown.
- Determinism: same seed -> identical serialized hand state (engine-level, no browser).

## Acceptance

- 200+ auto-played hands reach showdown with zero winner mismatches vs treys and zero pot
  reconciliation errors; the harness prints a clean summary and dumps any failing seed.
- Determinism check passes for a sample of replayed seeds.
- New engine tests above are added and green; `npm test` and `npm run build` pass with no
  runtime console errors in Chrome and Firefox.
- A short results note (pass counts, any bugs found + fixed) is written back to the repo,
  and the obsolete `ANTIGRAV-felt-phase5-boardjs-hang.md` is deleted.

## Out of scope

- AI coach layer (Phase 6 / SPEC §9) and player roster + persistence (Phase 7 / SPEC §10).
- Any change to range narrowing street-by-street (explicitly deferred in Phase 5A).
- The range-popover highlight behaviour (separate open design question, not a Phase 5 item).
