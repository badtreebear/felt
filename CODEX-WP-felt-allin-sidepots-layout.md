# Felt - Codex Work Package: All-in / side pots / layout - 13 Jun 2026

Implementer: Codex / Antigrav / opencode. Local filesystem only; Jason pushes to git.

## Already done this session (DO NOT redo — verify only)

All of the following is implemented and was smoke-tested in Chrome on the live dev server.
The changes are uncommitted in the working tree.

1. **Stack carryover restored.** `src/main.js` `startingStacksForNextHand` carries the
   completed hand's stacks into the next hand again (a prior "reset every hand" change was
   reverted — correct stack sizes persist, as intended).
2. **All-in + full side pots (engine).** `src/engine/postflop-action.js`:
   - `completeShowdown` rewritten to distribute chips across main + side pots by each seat's
     total `contributions`, awarding each pot to the best eligible (non-folded) hand and
     splitting ties to the half-chip.
   - New exported helpers `buildSidePots(contributions, folded, players)` and
     `splitAmount(amount, seats)`. Side-pot math verified with a standalone script (equal
     split, short all-in main+side, folded dead money, three-way different stacks — all
     conserve chips).
   - `legalHeroActions` (preflop) now also returns `stack`.
3. **All-in UI.** `src/ui/table.js`:
   - Postflop: "All in <stack>" bet button when betting; "Call"/"All in" label when a call
     commits the whole stack; bet input min clamped so `minBet > stack` can't break it.
   - Preflop: "All in <maxRaiseTo>" raise button; all-in call label.
   - Verified: an "All in $395" button renders for the hero.
4. **New game / restart.** `src/main.js` `newGame()` action (deals with `resetStacks: true`,
   resetting every seat to `config.stack`); `dealNewHand(seed, { resetStacks })` option;
   "New game" button added in `src/ui/controls.js`. Replays still deterministic (they reuse
   `hand.startingStacks`).
5. **Action log card glyphs.** `src/ui/table.js` `withSuitGlyphs()` renders embedded card
   codes as rank + suit symbol (e.g. `Jh` -> `J♥`, `Tc` -> `10♣`) in the numbered action
   list. Suit colour intentionally left as the surrounding text. Verified:
   "Flop: Hero flop dealt 2♥ 6♠ Q♥".
6. **Tests added.** `test/side-pots.test.js` covers `buildSidePots` + `splitAmount`.

## Remaining task 1: result-text / seat-box overlap (NOT done)

Symptom (Jason): "sometimes the hero box covers the action text below the community cards —
the top boxes grow forcing the community cards down."

Diagnosis: `.board` (`src/ui/theme.css`) is absolutely centred (`top:50%; left:50%;
transform: translate(-50%,-50%)`) and holds pot -> street badge -> `.board-cards` ->
`.showdown-result` stacked. `.seats` is `position:absolute; inset:0` and is appended AFTER the
board in the DOM (`table.append(createBoard...)` then `table.append(createSeats...)`), so seats
paint ON TOP of the board. As the board grows (longer result text, 2-line wraps, or taller
content), its bottom edge — the `.showdown-result` line — extends down into the bottom-centre
hero seat, which then covers it. It is intermittent (only when the board is tall enough to
reach the hero seat).

Acceptance: the result text under the community cards is never covered by any seat box, at
6-max AND 9-max, including long descriptions (e.g. "Hero wins with Full House, Q's over 7's")
and uncontested lines. Reasonable approaches (pick one, keep it clean):
- Raise the board's stacking context above `.seats` (z-index) AND give `.showdown-result` a
  subtle semi-opaque background pill so it stays legible if a seat sits behind it; or
- Anchor/reserve stable vertical space so the board never grows into the hero seat; or
- Relocate the result line so it can't collide (e.g. directly under the pot label).
Verify by dealing several hands to showdown at 6- and 9-max and confirming no overlap.

## Remaining task 2: full verification

- Run `npm test` — must be green. NOTE: includes the new `test/side-pots.test.js` and the
  existing `engine-determinism.test.js`. (A previous sandbox couldn't run vitest due to a
  mount quirk; on a normal checkout it runs fine.)
- In the browser, verify end-to-end: a short all-in produces a correct main+side-pot split
  with chip conservation (total stacks before == total stacks after for the table); "New game"
  resets every seat to the configured stack; betting works on flop/turn/river including when
  short (all-in). Use the `window.__feltState` / `window.__feltActions` dev hooks.
- `npm run build` clean; no console errors in Chrome + Firefox.

## Out of scope

- AI coach (Phase 6 / SPEC §9) and player roster (Phase 7 / SPEC §10).
- Table-dressing animations/sound (separate parked backlog).
