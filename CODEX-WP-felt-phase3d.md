# Felt — Codex Work Package: Phase 3d (range-grid popover bug fixes) — 13 Jun 2026

Implementer: Codex. Reviewer/tester: Claude. Two UI bugs in the position range-grid popover,
both confirmed by Claude via Chrome against localhost:5173. Local filesystem only; Jason pushes to git.

## Verified context (what Claude confirmed working — do not regress)

Phase 3c is solid: the RFI chart (`pokercoaching-rfi-9max.json`) loads, validates, all 7
positions checksum correctly through `ranges.js`, and the in/out-of-range lookup is faithful
(spot-checked HJ raises K8s / folds K7s, UTG raises A5s / folds A4s, BTN raises 32s, hero-seat
"RFI: raise/fold" indicator reads correctly). These bugs are purely about the popover's
hover-dismiss behaviour and its on-screen positioning — the data and lookup are correct.

## Bug 1 — Range-grid popover doesn't close on mouse-out

**Diagnosis (confirmed):** `src/ui/popover.js` exports a generic `createPopover({id,title,onClose,children})`
whose ONLY dismiss handler is `close.addEventListener("click", onClose)`. It's a click-to-close
component. When it's used as the *hover* popover for a seat's position badge, moving the mouse off
the badge fires nothing, so the grid stays up until the user clicks the close control. That's the
reported bug: "they stay around" after browsing off the position marker.

**Fix:** The badge→grid interaction should be hover-driven with hover-dismiss. Implement in the
badge wiring (in `table.js`, where the popover/range-grid is created and attached to
`.position-badge` / `.position-badge-wrap`), NOT by changing `createPopover`'s default behaviour —
that component is generic and may be used as a click-popover elsewhere. Options, in order of preference:

1. Attach `mouseenter` (show) / `mouseleave` (hide) on the `.position-badge-wrap` (the wrap, so moving
   between the badge and the grid that sits adjacent to it doesn't flicker-close). Add a small
   close-delay (~120ms) cancelled if the pointer re-enters the wrap or the grid, so diagonal mouse
   paths from badge to grid don't dismiss prematurely.
2. Keep the existing click-to-close affordance as well if the popover also supports pin-on-click —
   but the default for this hover popover must be: off the badge (and off the grid) → it closes.

**Acceptance:**
- Hover a seat's position badge → grid appears. Move pointer completely away from badge and grid →
  grid disappears within ~150ms, no click needed.
- Move pointer from badge directly onto the grid → grid stays open (no flicker-close mid-path).
- Only one grid visible at a time; hovering a different badge swaps cleanly.
- If `createPopover` is used elsewhere as a click-to-close popover, that usage is unchanged.

## Bug 2 — Range grid clips at the top of the table

**Diagnosis (confirmed):** the grid is `position: absolute` inside `.position-badge-wrap`
(`position: relative`), and it always renders *upward* — Claude measured computed `top: -565px`
relative to the badge. For the hero (bottom of table) that's fine. For top-row seats the grid is
pushed up off the play area / clipped. The grid box is ~430x555px, so it can't fit above a badge
that's near the top of the viewport.

**Fix:** Edge-aware vertical placement. When there isn't enough room above the badge for the grid
(`badgeRect.top < gridHeight + margin`), render the grid *downward* from the badge instead
(flip the offset). Equivalent for horizontal if a side seat pushes it past the left/right edge,
though vertical is the reported case. Compute against `getBoundingClientRect()` + `innerHeight/innerWidth`
at show-time. A CSS-only approach (e.g. a `.flip-down` modifier class toggled in JS based on the
measurement) is fine and preferred over inline magic numbers.

**Acceptance:**
- Open the grid from every seat (all 6 at a 6-max table, ideally also 9-max): the entire 13x13 grid
  is fully on-screen, not clipped by the table edge or the viewport, for every seat.
- Hero seat behaviour unchanged (still renders upward, since there's room).
- Top-row seats render the grid downward (or wherever it fully fits).
- No overlap that hides the hero's highlighted hand cell or the provenance footer.

## Out of scope
- Don't touch the range data, the lookup logic, or the equity engine.
- §12 questions, SB 3-action range, AI coach, roster — all still parked.

## Report back
Files touched, how hover-dismiss is wired (and confirmation `createPopover`'s generic behaviour is
untouched), and how the flip-when-no-room-above placement is computed. Claude will re-verify both
through Chrome across all seats.
