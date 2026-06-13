# Felt — Codex Work Package: Phase 3c (13 Jun 2026)

Implementer: Codex. Architect/reviewer: Claude. Spec: `SPEC-felt-poker-trainer.md`.
Local filesystem only; Jason pushes to git manually. Repo now live: `badtreebear/felt` (private).

## Context

Phase 3b landed and is verified (badges fixed, equity-vs-cards/range working, range
loader + validator + combo expansion all pass). Range **data** source is now chosen:
**PokerCoaching.com free preflop charts** (Jonathan Little), Exploitative 100bb full-ring
9-max, transcribed from the source range strings and combo-verified against the printed
chart counts. Claude is finalizing the RFI data now; **7 RFI files** (UTG, UTG+1, UTG+2,
LJ, HJ, CO, BTN) will drop into `src/data/ranges/` shortly. **SB is deliberately deferred**
to Phase 4 — it is not raise-or-fold (it has a limp tier: value-raise + bluff-raise + limp),
so it needs a 3-action representation the current RFI model can't express. Build everything
below to handle 7 RFI positions cleanly and treat SB as "no RFI chart loaded yet."

Standing constraints unchanged: engine computes maths, no AI-generated ranges, vanilla
JS + Vite client-side, no new deps without flagging, do NOT build §11 parking-lot items.

## Task 1 — Adopt the real RFI schema

Claude's transcribed files will follow this exact shape (one file per chart set):

```json
{
  "meta": {
    "source": "PokerCoaching.com — Jonathan Little free preflop charts (Exploitative 100bb)",
    "url": "https://pokercoaching.com/preflop-charts/",
    "chart": "Raise First In (RFI)",
    "tableSize": 9,
    "effectiveStack": "100bb",
    "page": 3,
    "transcribedBy": "claude (parsed from source range strings)",
    "verifiedBy": "jason (visual diff vs source PDF) + combo-count checksum",
    "date": "2026-06-13",
    "comboCounts": { "UTG": 134, "...": 0 },
    "legend": { "raise": "...", "fold": "..." }
  },
  "positions": {
    "UTG":  { "AA": 1, "AKs": 1, "...": 1 },
    "UTG+1":{ }, "UTG+2": {}, "LJ": {}, "HJ": {}, "CO": {}, "BTN": {}
  }
}
```

- Position keys are the 7 RFI-as-raise-or-fold positions: `UTG, UTG+1, UTG+2, LJ, HJ, CO, BTN`.
  **No SB, no BB** in this file (SB deferred to Phase 4; BB never RFIs).
- Each shipped file carries `meta.comboCounts` — the loader smoke test (Task 4) asserts the
  expanded grid matches these exactly, so a corrupted file fails loudly.
- Map the engine's internal position enum to these labels in ONE place (a lookup), not
  scattered. Replace the Phase-3b placeholder file's `MP` position key with this scheme.
- Values are frequency 0–1 (RFI charts are pure, so all 1; keep float type for later mixed charts).
- Keep the placeholder file but rename clearly (`placeholder-9max.json` →
  stays as a fixture for tests; never loaded in the live app).
- When the hero is in SB (or BB), there is no RFI chart — the grid/indicator should show a
  neutral "no RFI chart for this position yet" state, not an empty or error grid.
- `validateRangeChart` must accept the new `meta` fields without rejecting them, and must
  still reject malformed hand keys / out-of-range values / missing `meta.source`.

## Task 2 — Wire RFI ranges into the table UI

- On each dealt hand, the hero's seat has a known position. Look up that position's RFI
  range from the loaded 9-max chart and surface it in the existing 13x13 range-grid
  popover (the hover grid from Phase 3 already renders a range — feed it the real one).
- Highlight the hero's actual hand cell in the grid (already works — keep it).
- Show the chart provenance somewhere unobtrusive in the grid popover (e.g. a footer line
  reading `meta.source`), since the spec requires source citation visible to the user.
- The grid must visually distinguish in-range vs out-of-range cells. Frequencies between
  0 and 1 should render as partial (for future mixed charts) — a simple opacity or
  split-cell treatment is fine; don't over-build.
- Do NOT fix the top-seat grid clipping here — that's Phase 5 polish (open item 3).

## Task 3 — "In/out of range" indicator for hero

Small, engine-driven (not AI): given hero position + hand + the loaded RFI chart, display
whether the hero's hand is a raise-first-in hand from this position. Text only, e.g.
`RFI: raise` / `RFI: fold` near the hero seat or in the hand-flow panel. This is a
lookup, not advice — no coaching language, no AI. Gate it so it only shows when a real
(non-placeholder) chart is loaded, the hero is in one of the 7 charted positions (not
SB/BB), and the action is actually RFI (everyone folded to hero).

## Task 4 — Loader robustness for the real files

- Add a smoke test that loads each shipped real chart file through `validateRangeChart`
  and asserts: all 7 positions present (UTG, UTG+1, UTG+2, LJ, HJ, CO, BTN), every hand
  key canonical, and the expanded combo count of each position **equals `meta.comboCounts[pos]`**
  (this is the authoritative checksum — a corrupted/edited file won't match).
- Assert ranges widen monotonically by combo count UTG ≤ UTG+1 ≤ UTG+2 ≤ LJ ≤ HJ ≤ CO ≤ BTN.
  (No SB exception needed now — SB isn't in the file.)
- If a file fails validation at app start, fail loudly in dev (console.error + visible
  banner), don't silently render an empty grid.

## Out of scope this package
- §12 open questions (table-size toggle, stakes display, villain labels) — still pending Jason.
- AI coach (§9), roster (§10), grid clipping (Phase 5), Phase 4 scripted opponents.

## Report back
Per task: files touched, test names added, how the position-enum→label mapping is done,
and confirmation the placeholder is no longer loaded in the live path.
