# Felt - Codex Work Package: context-aware range charts - 13 Jun 2026

Implementer: Codex. Local filesystem only; Jason pushes to git. Design decisions by Claude.

## Goal

Today, hovering a seat's position marker always shows that position's **opening (RFI)** range
(`getOpeningRange` in `src/ui/table.js`, data in `src/data/ranges/pokercoaching-rfi-*.json`).
Make the popover show the **spot-correct** range for that seat given the preflop action so far,
using the additional charts from Jonathan Little's PokerCoaching.com set (RFI, vs-RFI
call/3-bet, blind defense, 3-bet defense). Keep the interaction identical.

## Hard design constraints (do not change)

- The range popover is triggered ONLY by hovering/focusing the seat's position marker, exactly
  as it works now. Do not add always-on panels or change the trigger.
- Internal card/rank representation and the 13x13 grid format stay as they are.
- RFI behaviour for first-in spots must be unchanged (reuse the existing RFI JSONs).

## Design decisions (what range to show)

For the hovered seat, pick the chart from the preflop action state up to that seat:

1. **Folded to the seat / first to act (no prior raise):** opening (RFI) range — existing.
2. **Facing exactly one raise (single opener):** that seat's **response vs the opener** — a
   "defend" chart. If the data carries per-hand actions, colour call vs 3-bet (see grid note);
   otherwise show a single combined defend range. Blind defense (BB/SB vs a late open) is just
   this path — no special-casing.
3. **Facing a 3-bet or more (raiseCount >= 2):** Phase B. For now fall back gracefully (show the
   opener's RFI or a clear "no chart for this spot yet" state — see fallback).
4. **Multiway already raised + called, or limped pots:** Phase B; fall back as in 3.

Selection keys off the existing preflop phase data (who has raised, from which position,
`raiseCount`, `voluntaryRaiserSeat`). The popover **title must state the context**, e.g.
"CO — open (RFI)", "BB vs BTN open — defend", so it's never ambiguous which chart is shown.

**Fallback rule:** if no chart exists for the resolved spot, show the seat's RFI range with a
title note like "opening range (no chart for this spot yet)". Never show a blank/incorrect grid.

## Data (this is the real work — flag for Jason)

The code is small; sourcing and validating the chart data is the bulk of the effort, exactly
like the RFI transcription was (see the verified-RFI notes: combo counts, monotonic, premiums
retained, % within ~0.7 of source).

- Add new JSON datasets mirroring the RFI structure, e.g.
  `pokercoaching-vsrfi-9max.json` / `-6max.json`, keyed by **(responderPosition, openerPosition)**.
  Each 13x13 cell should carry action weights (`fold` / `call` / `3bet`) so the grid can colour
  call vs 3-bet; a combined "in range" boolean is acceptable for a first pass.
- Source from the free PokerCoaching preflop pack
  (https://pokercoaching.com/preflop-charts/ — "full-preflop-charts.pdf"). Transcribe and
  **validate** each chart with the same rigor as RFI (combo counts per hand class, monotonicity,
  premiums retained). Cross-check a few cells against the source.
- **Start with the highest-frequency subset** so this ships incrementally and usefully:
  blind defense (BB and SB vs BTN/CO/SB opens) and in-position flat/3-bet spots (e.g. BTN vs
  CO/MP). Add remaining pairs after. Where a pair is missing, the fallback rule covers it.
- Keep stack depth fixed to the trainer's default (~100bb / whatever RFI used); note depth in
  each file. Stack-depth variants are out of scope here.

## Code plan

- New selector, e.g. `getRangeForSpot({ players, seat, position, hand })` in the ranges layer.
  It inspects `hand.preflop` action state to resolve which chart applies, loads from the right
  dataset, and returns `{ grid, title, kind }`. Pure function; unit-testable.
- `src/ui/table.js` `createPositionBadge` calls `getRangeForSpot(...)` instead of
  `getOpeningRange(...)`, and uses the returned `title`. Hover/focus wiring unchanged.
- `src/ui/range-grid.js`: if cells carry call/3-bet weights, colour them distinctly (e.g. call
  vs 3-bet vs mixed); keep the hero-hand highlight behaviour. Combined-range boolean still
  renders fine for charts without action splits.

## Tests

- `getRangeForSpot`: first-in → RFI; facing one open → correct vs-RFI chart for the pos pair;
  facing a 3-bet → fallback; missing pair → fallback with the note. Deterministic.
- Data sanity (per new dataset): expected number of charts, every grid 13x13, combo counts
  within tolerance of source, monotonic where expected (mirror the RFI sanity test).

## Acceptance

- Hovering a position marker shows the spot-correct chart with a clear title: RFI when first-in,
  the defend chart when facing a single open (incl. blind defense), graceful fallback otherwise.
- RFI spots are byte-identical to today. No change to the hover trigger.
- `npm test` green (new selector + data sanity tests); `npm run build` clean; no console errors.

## Out of scope (future)

- 3-bet/4-bet pot charts, multiway-after-callers, limped pots, stack-depth variants, and any
  postflop range work. AI coach (Phase 6) and player roster (Phase 7) unaffected.
