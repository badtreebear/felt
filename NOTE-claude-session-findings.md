# Felt - Claude autonomous session findings - 13 Jun 2026

Verification + fixes done while Jason was away. Everything below was checked against the live
dev server in Chrome (the reliable path here — see the sandbox caveat at the bottom).

## Fixed this session

### Vite stale-cache (app was blank)
After Codex was interrupted mid-write, the running dev server was serving a frozen, stale
module and the app wouldn't boot (`ranges.js does not provide an export named
actionRangeComboCounts`, though the export was present on disk). Forced a re-transform with a
no-op edit to `ranges.js`; app boots again. If this recurs after interrupting an agent, just
restart the dev server (Ctrl+C, `npm run dev`).

### Seat/result overlap (#19 — was NOT fixed by Codex's pass)
The hero box grew upward into the result text when it gained Winner/Wins badges (seats are
centred on their anchor, so extra content pushes the top up). Codex had added `z-index: 6` +
`pointer-events: none` to `.board` (so the result paints on top), but the result still clipped
the hero's title. My changes in `src/ui/theme.css`:
- `.board`: `top: 50%`, `gap: 6px` (tighter, kept Codex's z-index/pointer-events).
- `.showdown-result` background to ~opaque (`rgba(7,23,20,0.97)`).
- `.seat--hero`: `transform: translate(-50%, calc(-50% + 16px))` so its badges grow toward the
  rail, not up into the result.
Verified across 21 showdowns at 6- and 9-max: hero title covered in **0** cases, result text
readable, hero box stays within the rail.

## Verified working (Codex's recent work)

- **Winner badge**: 29 showdowns, **0** cases of a non-chip-winner showing "Winner". Codex's
  patch is good.
- **All-in + side pots**: 40 hands, 38 showdowns, 9 hero all-ins -> **0 chip-conservation
  violations** (total table chips constant at 1200 every hand). Side-pot accounting is correct
  end-to-end; betting works on flop/turn/river including short/all-in.
- **Contextual ranges**: titles are context-aware — "CO - open (RFI)", "BTN - open (RFI)" for
  first-in seats, and "BB vs SB open - defend" (full 169-cell chart) for the defender. The
  hover-on-position-marker trigger is unchanged. Good.

## BUG for Codex: SB opening range not found

Hovering the SB when it's first-in shows the fallback **"No RFI chart for SB yet."** (0 cells).
But the data IS present: `src/data/ranges/pokercoaching-rfi-6max.json` has an `"SB"` opening
range (line ~287; combo count 838, 62.3%) and it's listed in the chart's positions. So this is
a **lookup bug in `getRangeForSpot` (contextual-ranges.js), not missing data** — the SB
first-in spot isn't being mapped to the existing SB opening chart (likely SB is special-cased,
or a position-key mismatch). Repro: deal a 6-max hand, hover SB's position marker. Add a test
that the selector returns the SB RFI grid for an SB first-in spot.

## Sandbox test caveat (not a code problem)

I could not run `npm test` in my sandbox: the workspace mount is serving a stale, truncated
copy of `src/engine/ranges.js` (153 lines, cut mid-string), so every suite that imports it
fails to parse. The real file is valid (the app + contextual ranges run fine in Chrome). **On
your real checkout `npm test` reads the complete files and will run normally** — please run it
there to confirm green (incl. Codex's `contextual-ranges.test.js`, `table-winners.test.js`, and
my `side-pots.test.js`).

## Suggested next steps
1. Codex: fix the SB opening-range lookup (above).
2. Run `npm test` on the real checkout; fix the git index first if needed
   (`rm .git/index && git reset`).
3. Then the remaining contextual-range data (more vs-RFI pairs, 3-bet pots) per the existing WP
   + the PDF extraction note.
