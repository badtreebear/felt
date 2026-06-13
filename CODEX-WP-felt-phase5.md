# Felt - Codex Work Package: Phase 5A (deterministic postflop continuation) - 13 Jun 2026

Implementer: Codex. Local filesystem only; Jason pushes to git.

## Goal

Extend Phase 4 from "preflop only" into a playable deterministic hand flow through
flop, turn, river, and showdown. This is still a scripted trainer, not a solver:
villains use simple profile-driven heuristics to create plausible betting lines and
hero pot-odds decisions.

## Scope

- Continue from a Phase 4 preflop state when action closes with multiple live players.
- Reveal flop/turn/river one street at a time.
- Run one simple betting round per postflop street.
- Stop for hero decisions when hero faces a bet or has the option to bet/check.
- End the hand when only one player remains or after river action closes, then reveal
  showdown and award the pot.
- Keep all decisions deterministic from the existing dealt hand, board, profiles, and
  public state. No random postflop sampling.

## Explicit Design Choices

- Opponent ranges are not narrowed street by street in this phase. Equity continues to
  use currently live opponents; exact hand cards are used only when villain reveal is on.
- Villain hand strength uses the already-dealt hole cards and visible board. This is a
  teaching simulator, not hidden-information AI.
- Each postflop street allows at most one bet and one response cycle. No raises or
  check-raises in Phase 5A. Hero actions are fold / check / call / bet.
- Bet sizing is profile driven:
  - standard base bet is 0.5 pot.
  - sizing dial scales the base bet.
  - bets are rounded to 0.5bb and capped by stack.
- Villain betting threshold is heuristic:
  - made hands and strong draws bet more often.
  - aggression lowers the threshold to bet and call.
  - station calls wider; nit folds more.
- If all players check/call and the street closes:
  - flop -> turn
  - turn -> river
  - river -> showdown
- When showdown happens, use the existing hand evaluator and split the pot across tied
  winners.

## UI

- Replace the Phase 4 terminal cue "deal next hand" with "Continue to flop" when
  preflop completes with multiple live players.
- Keep "Deal new hand" available at all times.
- Show hero action controls during postflop decisions.
- Show a clear hand-complete cue at showdown or when everyone folds to a bet.
- Keep Manual spot maths panel gated to Manual spot mode.
- Keep postflop play separate from AI coach. Phase 6 remains the coach layer.

## Tests

- Deterministic postflop action: same input produces same log, pot, stacks, and status.
- Continue from preflop to flop reveals exactly three board cards.
- Hero can fold facing a postflop bet and the bettor wins the pot.
- Checked/called river resolves to showdown and awards/splits the pot.
- Manual maths panel remains hidden in Dealt mode.

## Acceptance

- A hand that ends preflop still shows a hand-complete cue and can deal next.
- A hand that would see a flop now offers a visible continue action.
- Postflop streets advance through flop/turn/river/showdown with logs and visible board.
- Hero action buttons work when postflop action reaches hero.
- `npm test` and `npm run build` pass.
