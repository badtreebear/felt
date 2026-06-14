# Felt - Codex Work Package: stale/incorrect "Winner" badge - 13 Jun 2026

Implementer: Codex. Local filesystem only; Jason pushes to git. Design decisions by Claude.

## Symptom

At a showdown, a non-winning seat also shows the green "Winner" badge. Example (screenshot):
board 10♠ A♣ 7♠ Q♥ 7♥. Hero (8♦ 7♣) makes trip 7s and correctly wins the $750 pot — Hero
shows both "Winner" and "Wins $750". But Seat 1 (J♥ 9♠, no winning hand, won no chips) ALSO
shows "Winner". Jason: looks like the previous hand's winner status isn't scrubbed; only
caught it at showdown.

## Diagnosis (already localised — confirm, then fix)

The badge is set in `src/ui/table.js` (createSeats):

```
const isWinner = showdown?.winnerSeats.includes(seat) || phaseWinners(phase).includes(seat);
```

- The headline text ("Hero wins with Three of a Kind, 7's") is built from the SAME
  `showdown.winnerSeats` and shows ONLY Hero — so `showdown.winnerSeats` is `[hero]` and is NOT
  the source of Seat 1's badge.
- Therefore Seat 1 comes from `phaseWinners(phase)` → `state.hand.postflop.winnerSeats`
  containing a seat that won no chips (or not being reset between hands).

`phaseWinners` returns `phase.winnerSeats`. The engine's `completeShowdown`
(`src/engine/postflop-action.js`) sets `postflop.winnerSeats` to the seats that won chips
(keys of `shares`). So either (a) `winnerSeats` is being populated with a non-chip-winner, or
(b) a stale `winnerSeats`/`winnerSeat` from an earlier street or the previous hand is leaking
through. Note: `git status` currently errors with "unknown index entry format" — the git index
looks corrupted; that's separate but worth a heads-up to Jason (may need `rm .git/index &&
git reset` to rebuild).

## Design decision (how it SHOULD behave)

The "Winner" badge must mean "won chips in the current, completed hand" — nothing else:
1. A seat shows "Winner" **only if it is in the set of seats that actually won chips this hand**
   (i.e. has a positive share of some pot, or is the sole player left when everyone folded).
   Hand strength alone must never set it.
2. It must be **empty until the current hand is terminal**, and fully recomputed each hand — no
   carry-over from the previous hand or an earlier street.
3. Drive the badge from a single authoritative source — the engine's chip-winner set
   (`postflop.winnerSeats` / preflop winner). Drop the redundant hand-strength
   `showdown.winnerSeats` term from `isWinner` if it can mark non-chip-winners (keep using
   `showdown` only for the headline text).

## Tasks

- Reproduce (deal hands to showdown; reveal villains). Trace whether Seat 1 enters
  `postflop.winnerSeats` during this hand or is stale.
- Make `isWinner` reflect chip winners only, per the design above.
- Ensure `winnerSeats`/`winnerSeat` are reset at the start of every hand and not set on
  non-terminal phases.
- Add a regression test: a clean single-winner showdown marks exactly one seat as winner;
  a folded/low seat is never marked.

## Acceptance

- At any showdown, only the seat(s) that actually win chips show "Winner"; everyone else does
  not, across many dealt hands at 6- and 9-max.
- Split pots / side pots still mark all genuine chip-winners.
- `npm test` green (add the regression test); no console errors.
