# Felt - Work Package: popup layering, static table, hand-flow maths chips - 13 Jun 2026

Implementer: Antigrav. Local filesystem only; Jason pushes to git. Design decisions by Claude.
Three related UI issues + one small feature.

## 1. Popups must be SOLID and in the FOREGROUND (highest priority)

Symptom: explain / coach / manual-spot info popovers render **behind the community cards** and
look translucent — unreadable, especially in Manual spot mode.

Root cause (confirmed in CSS): popovers are created **inside** the element they anchor to (a
seat / chip). `.seat--hero` has `z-index: 5` and `.board` has `z-index: 6`, so a popover nested
in a seat is trapped inside the seat's stacking context and can NEVER paint above the board or
the cards, regardless of its own `z-index: 20`. The cards then show through, which reads as
"translucent". (The popover's own background is actually opaque `#071714`.)

Fix (design decision): **render all popovers/coach popups in a single top-level overlay layer**
that is NOT nested inside any seat/board stacking context — e.g. a dedicated overlay container
appended at the app-root level (a lightweight "portal"), positioned at the trigger's screen
coordinates. Give that layer a z-index above everything (e.g. 1000). Requirements:
- Fully **opaque** background, solid border, drop shadow (keep current `#071714` styling).
- Always above cards, seats, board, result text.
- Applies to: chip-explain popover, range popover, the AI coach explain/response popovers, and
  any manual-spot info popup. One shared overlay mechanism, not per-component hacks.
- Anchor to and reposition with the trigger (keep the existing placement logic, e.g.
  `range-popover-placement`, but compute against the viewport now that it's portaled).
- Close on outside-click / Escape (keep current behaviour).

## 2. The table must NOT move when popups/panels appear

Symptom: opening a popup or the coach panel shifts the whole table/screen around. Jason wants
the table to stay put.

Fix (design decision):
- Popovers are overlays (item 1) — out of document flow — so they can't reflow anything. That
  alone fixes the popover-driven shift.
- For anything that is intentionally **inline** in the right-hand `.hand-panel` (the coach chat /
  review area), give it a **reserved, stable footprint**: fixed height with internal scroll, so
  expanding/collapsing it does not change the panel's outer size or push the table. The
  `.table-shell` grid columns (table | hand-panel) must stay a constant width/position
  regardless of coach/popup state.
- Net rule: **the poker table's size and position are invariant to any popup or panel state.**
  Reserve space up front rather than growing into it.

## 3. Feature: clickable EQ / pot-odds / EV chips in the hand-flow section

Today the hand panel shows "To call / Equity / Pot odds / EV call" as **static text**
(`createMeta` in `table.js`), while the hero seat shows them as **clickable maths chips**
(`createMathsChips` in `src/ui/chips.js`) that open the explain popover + coach.

Add the same clickable chips to the hand-flow / hand-panel section so Jason can click Equity,
Pot odds, and EV call there too and get the worked explanation + coach. Reuse
`createMathsChips` (or factor a shared helper) so behaviour and styling match the hero-seat
chips exactly — same popover, same coach explain button. Keep the plain text as a fallback only
if a value isn't clickable (e.g. no engine number yet).

## Tests / acceptance

- In Manual spot mode, open the info + coach popovers: they render fully opaque, above the
  cards, readable — at 6-max and 9-max.
- Opening any popover or the coach panel does not move or resize the poker table (verify the
  table's bounding box is unchanged before/after opening each popup type).
- The hand-flow Equity / Pot odds / EV call chips are clickable and open the same explain +
  coach popover as the hero-seat chips, with matching styling.
- `npm test` and `npm run build` clean; no console errors in Chrome + Firefox.

## Notes

- Don't lower `.board`'s z-index to "fix" layering — it's there to keep the showdown result
  readable over the hero seat. The correct fix is portaling the popovers above everything, per
  item 1.
- No AI coaching on seat areas is fine/expected — not in scope here.
