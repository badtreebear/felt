# Felt - Note for Codex: extracting the range charts from preflop-charts.pdf

Re: contextual-ranges WP. Confirmed in-sandbox why `pypdf` only returns page headings.

## What the PDF actually is

- `public/preflop-charts.pdf`, 14 pages. Page text holds only **headings** (e.g.
  "Facing RFI: CO", "CO vs UTG/UTG+1") — that's all pypdf/pdftotext can see.
- The 13x13 grids are embedded **raster JPEG images** (≈600x800 each, RGB). `pdfimages -list`
  shows 4 images on a "Facing RFI" page = one chart per opener. So OCR/text extraction is the
  wrong tool entirely.
- Page map: p3 = Raise First In (RFI, one grid per opening position); the "Facing RFI: <pos>"
  pages = vs-open responses, **4 charts per page, one per opener** (the BB page has 7); the
  remaining pages are the third set (3-bet / facing-3-bet). Read each chart's opener from the
  page text above the image.

## The grids are color-coded — that's the whole signal

Legend (read off the chart, definitive):
- **Red** = 3-Bet for Value
- **Light blue** = 3-Bet as a Bluff
- **Green** = Call
- **White** = Fold

Each cell also prints its hand label, but you DON'T need OCR: the grid is the standard 13x13
layout. With `RANKS = "AKQJT98765432"`, cell `(r, c)` is:
- `r == c` -> pair (e.g. (0,0)=AA)
- `r < c`  -> suited  (`RANKS[r]+RANKS[c]+"s"`)
- `r > c`  -> offsuit (`RANKS[c]+RANKS[r]+"o"`)
So only the cell COLOR needs reading.

## Recipe (proven in sandbox; refine the two starred bits)

1. Extract images: `pdfimages -j -f <p> -l <p> public/preflop-charts.pdf /tmp/chart` (or render
   the page with `pdftoppm -r 220` and crop the 4 quadrants). Each image is one chart =
   13x13 grid (top, ~square) + legend strip (bottom).
2. **\*Calibrate colors from the legend swatches**, don't hard-code RGB guesses: sample the four
   coloured legend boxes in each image to get exact V/B/C/F RGBs, then classify each cell by
   nearest colour. (Hard-coded thresholds left ~30% of cells unclassified — calibrating fixes
   this.)
3. For each of the 169 cells, **\*sample a text-free sub-region** (e.g. a small patch in a cell
   corner, or the median/mode colour of the cell) so the printed hand label doesn't skew the
   reading.
4. Map cell -> hand (positional, above) -> action. Emit JSON keyed by
   `(responderPosition, openerPosition)` with per-cell action, matching the structure used by
   the existing `pokercoaching-rfi-*.json`.

## Built-in validation (use this — it's the big win)

Every chart prints the **combo percentage per action** in its legend (e.g. this CO-vs-UTG chart:
Value 4.8%, Bluff 2.4%, Call 5.7%, Fold 88.0%). After extracting a grid, weight cells by combo
count (`pair=6, suited=4, offsuit=12`, total 1326) and assert your per-action % matches the
printed legend within a tight tolerance. That auto-validates every chart you extract — same
rigor the RFI JSONs were held to. If a chart's numbers don't reconcile, the colour calibration
or grid bbox for that chart is off.

## Sanity already observed

A first-pass classification of CO-vs-UTG reproduced the expected shape (red premiums top-left,
green calls, fold-heavy bottom-right) and combo-weighted folds in the right ballpark — the
approach is sound; it just needs the two starred refinements to hit the printed totals.
