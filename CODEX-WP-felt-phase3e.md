# Felt — Codex Work Package: Phase 3e (range-grid label + overlap) — 13 Jun 2026

Implementer: Codex. Reviewer/tester: Claude. Two issues found by Claude testing 3d via Chrome.
Local filesystem only; Jason pushes to git.

## 3d verification result (what's confirmed FIXED — do not regress)

- Viewport clipping is fixed: grids now flip downward when there's no room above, and render
  fully on-screen from every seat (verified LJ and HJ flip correctly, nothing clipped at any edge).
- Hover-dismiss works: moving off the badge/grid closes the popover, no click needed.
- BB and SB correctly show "No RFI chart for {pos} yet" (deferred positions — this is INTENDED,
  not a bug; leave as-is).

Two things remain.

## Issue 1 — Grid header is mislabelled "6max opening range"

**Diagnosis (confirmed):** every position's range-grid header reads e.g. `LJ 6max opening range`.
But the loaded data is the **9-max** RFI chart (`pokercoaching-rfi-9max.json`, `meta.tableSize: 9`)
and the table is showing the 9-max position set (UTG..BTN + blinds). "6max" is just wrong text.

**Fix:** Derive the label from the chart's `meta` rather than hardcoding "6max". Use `meta.tableSize`
(→ "9-max") and `meta.chart` ("Raise First In (RFI)"). Header like `LJ — RFI opening range (9-max)`
or simply `LJ opening range` is fine; the point is it must not claim 6-max when the data is 9-max.
Check `range-grid.js` (header is built there, around the `heroRangeVerdict` / title area).

**Acceptance:** every grid header reflects the actual chart (9-max / RFI), no "6max" string anywhere
when the 9-max chart is loaded.

## Issue 2 — Open grid overlaps adjacent seats' cards

**Diagnosis (confirmed):** the range grid is `z-index: 50`; seats are `z-index: auto`. The grid is
positioned relative to its own seat's badge, and for side/edge seats it expands *over a neighbouring
seat* — Claude measured the LJ grid overlapping the HJ seat (and the grid covers that seat's card
backs since 50 > auto). This is the "hero hand / sheet covered" report: an open grid sits on top of
an adjacent seat's contents.

**Fix:** placement should avoid covering other seats. Preferred approach: position the grid toward
open table space — i.e. choose the side (up/down AND left/right) that has room and the fewest seat
collisions, not just vertical flip. The existing "flip down when no room above" logic from 3d is the
right pattern; extend it to also pick horizontal direction (and/or offset toward the table exterior
or centre) so the grid lands in empty space rather than over a seat. A simple, robust version:
compute the grid's candidate rects for each placement (above/below × left/right of the badge), score
each by (a) fully in viewport, (b) least overlap-area with other `.seat` elements, and render in the
best-scoring placement.

If a placement that fully avoids seats isn't always possible at this table size, then at minimum the
*active grid* must visually sit cleanly above everything (raise its container's stacking context) AND
not obscure the hero's own cards or any seat's position badge — but avoiding seat overlap by placement
is the better fix than just stacking on top.

**Acceptance:**
- Open the grid from every seat (6-max; ideally 9-max too): the grid does not cover any other seat's
  cards or badge. It lands in open space (table interior or exterior margin).
- Still fully on-screen (don't reintroduce the clipping 3d fixed).
- Hero's own cards remain visible when the hero's grid is open.
- Dismiss-on-mouseout still works.

## Out of scope
- Range data, lookup logic, equity engine — untouched.
- BB/SB empty state is correct — don't "fix" it.
- §12, SB 3-action range, AI coach, roster — still parked.

## Report back
Files touched, how the label is now derived from meta, and how placement picks a non-overlapping
position. Claude will re-verify all seats via Chrome.
