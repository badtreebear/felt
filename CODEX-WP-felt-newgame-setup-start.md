# Felt - Codex Work Package: New game → set up → Start flow - 14 Jun 2026

Implementer: Codex. Local filesystem only; Jason pushes to git. Design decisions by Claude
(confirmed with Jason). Small, self-contained. **Commit the current roster work first** so this
lands on a clean base.

## Problem

"New game" deals a hand immediately, so Jason can't finish assigning known players to seats (via
the per-seat "tailor table" pickers) before the action starts. He wants to set up the table,
then start.

## Design

Introduce a **setup state** between "New game" and the first hand:

1. **New game** → resets every seat to the configured starting stack AND enters a setup state;
   it does NOT deal. (Add `ui.awaitingStart = true`, or a `ui.tableMode = "setup"`.)
2. In setup, the table shows the **seats** (positions, any assigned known-player names/colours,
   starting stacks) but **no cards, no board, no betting action**. The seat-picker "tailor
   table" controls remain available so Jason assigns who sits where. Show a clear prompt and a
   prominent **Start** button (e.g. "Set up your table, then Start").
3. **Start** → exits setup and deals the first hand using the configured seating + fresh stacks
   (`dealNewHand({ resetStacks: true })`). Seat assignments already persist via
   `config.seatPlayers` / `config.seatProfiles`, so the dealt hand reflects the setup.

Keep everything else as-is:
- App load still deals a hand normally (don't boot into setup).
- **Pub game** still deals immediately (it's the quick "random fill + go" path) — it can simply
  exit setup if active. Only **New game** is the deliberate set-up-then-Start path.
- During setup, "Deal new hand" / "Next street" / hero actions should be hidden or disabled
  (there's no hand yet); "Start" replaces them.

## Implementation notes

- `state.js`: add the setup flag to `ui`.
- `main.js`: `newGame()` sets the flag + resets stacks (no deal); add a `startGame()` action
  that clears the flag and deals. The render subscription already re-renders on state change.
- Render guard (`renderTable` / hand panel): when the setup flag is on, render the seats without
  hole cards / board / action and show the Start button + prompt. Make sure `createSeats` /
  `createBoard` don't assume an in-progress hand (no crash on empty `holeCards` / `board`). The
  seats should still show assigned names/colours and stacks so the lineup is visible.
- The per-seat pickers live in the controls and already work in any state — just make sure they
  update the seating while in setup.

## Tests / acceptance

- Clicking New game: stacks reset, table is in setup (no cards/board/action), a Start button is
  shown; no hand is dealt yet.
- Assigning known players to seats in setup, then Start, deals the first hand with exactly that
  lineup and fresh stacks.
- Pub game still deals immediately; normal app load still deals a hand; in-hand play unchanged.
- No console errors in setup or on Start. `npm test` + `npm run build` clean.

## Done already (not in scope here)
- "Random / Standard" seat-picker option relabelled to "Default" (done).
