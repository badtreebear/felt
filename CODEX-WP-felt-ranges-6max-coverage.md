# Felt - Codex Work Package: complete 6-max contextual-range coverage - 13 Jun 2026

Implementer: Codex. Local filesystem only; Jason pushes to git. Design decisions by Claude.
Do this BEFORE Phase 6 (AI coach) — it finishes the in-flight range feature. (It can also run
in parallel with Phase 6 if desired: different files, near-zero conflict.)

## Context / current state (verified in Chrome)

Contextual ranges work across three levels — "CO - open (RFI)", "SB vs CO open - defend",
"BTN vs SB 3-bet - continue". SB-RFI lookup bug is fixed. But several **6-max spots still fall
back** to "no chart for this spot yet", e.g. "SB vs BTN open", "BB vs BTN open". Cause: the
facing-RFI / 3-bet datasets (`pokercoaching-vsrfi-9max.json`, `pokercoaching-vs3bet-9max.json`)
only cover a subset of position pairs so far. The fallback is graceful (clear message, no
crash), but common 6-max defend spots are missing.

Note on positions: 6-max positions (LJ, HJ, CO, BTN, SB, BB) are a subset of the full-ring
names, so a 6-max pair should resolve directly against the same `(responder, opener)` chart —
no special bucketing needed once the pair exists in the data.

## Goal

Every common preflop spot at **6-max** resolves to a real chart (open / defend / 3-bet pot),
not the fallback — with priority on the highest-frequency 6-max spots.

## Tasks

1. **Fill the missing facing-RFI pairs**, prioritised for 6-max:
   - Blind defense: **BB vs BTN, BB vs CO, BB vs SB, SB vs BTN, SB vs CO** (these are the most
     common and currently gappy). The PDF's "Facing RFI: Big Blind" page explicitly includes
     BB vs HJ/CO/BTN/SB etc., so the source exists.
   - In-position defends: BTN vs CO/HJ/LJ, CO vs HJ/LJ.
   - Then any remaining pairs among {LJ,HJ,CO,BTN,SB,BB} that a 6-max hand can produce.
2. **Fill the matching 3-bet-pot charts** (`vs3bet`) for the same high-frequency 6-max spots so
   "<opener> vs <3-bettor> 3-bet - continue" resolves rather than falling back.
3. **Selector audit**: confirm `getRangeForSpot` maps every 6-max `(responder, opener)` /
   3-bet spot to an existing chart when the data is present (no stale "no chart" once the pair
   exists). Keep the graceful fallback only for genuinely unsourced spots.

## Data pipeline (reuse — already proven)

Charts are raster images in `public/preflop-charts.pdf`; extract by **color sampling on the
fixed 13x13 grid**, not text/OCR. Legend: red = 3-bet value, light blue = 3-bet bluff, green =
call, white = fold. See `CODEX-NOTE-range-pdf-extraction.md` for the full recipe, including the
**combo-% self-validation** (every chart prints its per-action combo %; weight cells by combo
count — pair 6 / suited 4 / offsuit 12 — and assert the totals match within tolerance). Match
the JSON structure already used by the existing vsrfi/vs3bet files.

## Tests

- For each newly added pair: data-sanity test (13x13, combo counts within tolerance of the
  printed legend, monotonic where expected) — mirror the existing range sanity tests.
- Selector test: a representative set of 6-max spots (BB vs BTN open, SB vs CO open, a 3-bet
  pot) each return a real chart, not the fallback.

## Acceptance

- Dealing 6-max hands and hovering position markers: no common defend or 3-bet spot shows
  "no chart for this spot yet" (only genuinely unsourced edge spots may, with the clear notice).
- New charts validate against their printed combo percentages.
- `npm test` and `npm run build` clean; no console errors in Chrome + Firefox.

## Out of scope

- New range *types* beyond open / defend / 3-bet pot. Stack-depth variants, multiway-after-
  callers, limped pots. AI coach (Phase 6) and player roster (Phase 7) are separate WPs.
