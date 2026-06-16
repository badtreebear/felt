# Felt — Work Package: Range Chart Coverage (no more "no chart for xyz")

Implementer: **Haiku** (lower model — this is mostly enumerate + map + transcribe, all mechanical).
Local filesystem only; Jason commits to git. Three parts; ship/commit each independently.
Order: **A (code routing/fallback) → B (transcribe MIT source) → C (solver, later/optional)**.

Prior analysis already in this repo: `gap-analysis.md`, `user-facing-messages.md`,
`unavailable-combos.txt`. Read those first — they enumerate exactly which combos fail.

---

## Background (what's covered today)

- **RFI:** `default-rfi-6max.json` (LJ, HJ, CO, BTN, SB) and `default-rfi-9max.json`
  (UTG, UTG+1, UTG+2, LJ, HJ, CO, BTN). 2–6 players → 6max chart, 7–9 → 9max.
- **vs-RFI / vs-3bet:** `default-vsrfi-9max.json`, `default-vs3bet-9max.json` — **9-max only**.
- Gaps that throw "no chart": **BB always**, **SB at 7–9p**, **all vs-RFI/vs-3bet at 2–6 players**,
  plus 2-player and 4+bet edge cases.

## The two JSON schemas (match these EXACTLY)

**RFI** (`default-rfi-*.json`):
```json
{ "meta": { "source": "...", "tableSize": 6, "positionsIncluded": [...], ... },
  "positions": { "BTN": { "AA": 1, "AKs": 1, ... } } }
```
`value 1 = raise first in`; **absent = fold**. (Binary grid.)

**vs-RFI / vs-3bet** (`default-vsrfi-9max.json` / `default-vs3bet-9max.json`):
```json
{ "meta": { ... },
  "spots": { "BB_vs_BTN": {
      "responderPosition": "BB",
      "openerPositions": ["BTN"],
      "actions": { "AA": "threeBetValue", "KQs": "call", "AQo": "threeBetBluff" } } } }
```
Actions are `threeBetValue` | `threeBetBluff` | `call`; **absent = fold**.

Range lookups live in `src/data/ranges/opening-ranges.js` (`getOpeningRange`) and
`src/data/ranges/contextual-ranges.js` (`getRangeForSpot`). The "No RFI chart for {position}"
string is `opening-ranges.js:48`; the contextual "no chart for this spot" strings are in
`contextual-ranges.js` (~lines 33, 46, 56, 118, 128).

---

## Part A — Routing + fallback (CODE ONLY — needs no source material)

This alone kills ~95% of the messages.

**A1. BB is never an RFI spot.** In `contextual-ranges.js` `getRangeForSpot`, when the hero is in
the **BB facing an open**, route to the **vs-RFI / defense** path — never call `getOpeningRange`
for BB. (If it's folded around to the BB with no raise, that's a check/walk — no chart needed,
suppress the message.) The "No RFI chart for BB yet." message must disappear entirely.

**A2. Table-size fallback for contextual ranges.** vs-RFI and vs-3bet are 9-max only. For **2–6
player** tables, map the short-table positions to their nearest 9-max equivalent and reuse the
9-max spot (preferred — shows a real defend range), e.g. 6max LJ→9max LJ, HJ→HJ, CO→CO, BTN→BTN,
SB→SB, BB→BB. If no mapped spot exists, fall back to the opening chart with the existing
"…showing {pos} RFI" label. Document the mapping table in a comment.

**A3. SB RFI at 7–9p.** SB exists in the 6-max chart but not 9-max. When the 9-max chart lacks SB,
fall back to the 6-max SB opening range (or the SB data added in Part B).

**A4. Edge cases.** 2-player and 4+bet: leave a clearly-labelled fallback ("approx."). Acceptable.

**Acceptance (A):** Add/extend a test that enumerates `players 2–8 × every hero position ×
{RFI, vs-RFI, vs-3bet}` and asserts `chartAvailable === true` for everything except the accepted
edge cases (2-player, 4+bet). `npm test` + `npm run build` clean. No console errors in Chrome.

---

## Part B — Fill SB / BB / 6-max RFI from a clean MIT source (transcribe + convert)

**Source: `tyloo/poker-range-analyzer`, MIT licensed** (verified — © 2026 Julien Bonvarlet).
Raw data files (one per position):
```
https://raw.githubusercontent.com/tyloo/poker-range-analyzer/main/lib/ranges/utg.ts
                                                                          .../mp.ts
                                                                          .../co.ts
                                                                          .../btn.ts
                                                                          .../sb.ts
                                                                          .../bb.ts
```
Their format: `{ "AKs": { raise: 0-100, call: 0-100, fold: 0-100 }, ... }`. 6-max, ~100bb.
`bb.ts` is explicitly **"BB defense vs BTN open — a call/3bet range, NOT RFI"** (this is the data
for A1's defense path).

**Conversion rules:**
- **RFI grids** (utg/mp/co/btn/sb → our `positions` schema, `value 1 = open`): set a hand to `1`
  iff `raise > 0`. These are opening ranges; `sb.ts` = SB RFI.
- **BB defense** (`bb.ts` → a vs-RFI `spots` entry, e.g. key `BB_vs_BTN`): map each hand by its
  dominant action — `raise >= 50` → `threeBetValue`; else `raise > 0` → `threeBetBluff`;
  else `call > 0` → `call`; else omit (fold). responderPosition `"BB"`, openerPositions `["BTN"]`.
- Add SB/BB where missing; keep the existing `meta` shape. Don't touch the validated 9-max files.

**Licensing (MIT requires this):** set `meta.source` on any adapted file to
`"Adapted from poker-range-analyzer (MIT) — © Julien Bonvarlet"`, and create
`THIRD-PARTY-LICENSES.md` containing the verbatim MIT license text from
`https://raw.githubusercontent.com/tyloo/poker-range-analyzer/main/LICENSE`.

**Acceptance (B):** BB-defense and SB spots resolve to a real range; `meta.source` credits the MIT
source; `THIRD-PARTY-LICENSES.md` present; build clean. Ranges look sane (premiums always in,
monotonic widening from early to late position).

---

## Part C — Contextual + heads-up (solver / Nash — LATER, optional)

The MIT 6-max source does **not** cover opener-specific vs-RFI/vs-3bet matrices for every position,
nor heads-up. For those:
- Generate with an open-source solver — **WASM Postflop** or **TexasSolver** — and export to our
  `spots` schema; or
- Use **Nash push/fold** equilibria (pure math, public domain) for the heads-up / 2-player case.

Not required to eliminate the common messages — Parts A+B do that. Flag as a follow-up.

---

## Guardrails
- Do not break the existing validated 9-max RFI / vs-RFI / vs-3bet charts.
- Keep the binary RFI schema and the `threeBetValue|threeBetBluff|call` action schema intact.
- `npm test` + `npm run build` clean; no console errors in Chrome + Firefox.
- These ranges are approximate/hand-authored (fine for a home-game trainer) — don't claim GTO-exact.
