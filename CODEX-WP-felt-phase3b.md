# Felt — Codex Work Package: Phase 3b (13 Jun 2026)

Implementer: Codex. Architect/reviewer: Claude. Spec: `SPEC-felt-poker-trainer.md` (repo root).
All work to local filesystem; Jason pushes to git manually.

## Standing constraints (do not violate)

- Engine computes all maths. No AI-generated range or odds data, ever.
- Monte Carlo equity stays in the Web Worker, seeded and replayable. Do not break determinism.
- Vanilla JS + Vite, fully client-side, no new network calls, no new dependencies without flagging it.
- Do NOT build anything from spec §11 (parking lot: decision log, self-dossier, pattern tells).
- Out of scope this package: range grid clipping at table edge (Phase 5 polish), AI coach (§9), roster (§10).

---

## Task 1 — Fix doubled seat badges (bug)

**Symptom:** Seats render "BB BB" / "SB SB" — the legacy blind chip and the new Phase 3
position label both display.

**Fix:** Single source of truth. The position label component owns blind display; remove
(or suppress) the legacy blind chip render path entirely rather than hiding it with CSS.
Dealer button must be unaffected.

**Acceptance:**
- Deal ≥10 hands: every seat shows exactly one badge, correct position, blinds rotate correctly.
- No orphaned blind-chip code left rendering zero-size elements.

## Task 2 — Equity regression tests (confirm or add)

If these already exist, report where; otherwise add them to the test suite:

1. **Chop test:** 2c3d vs 2s3h, preflop heads-up → equity ≈ 50.0% each, tolerance ±1.5%.
   (Guards the tie-credit fix — tie must credit 0.5, not 0.)
2. **Multiway baseline:** Ah6c vs 5 random villains → ≈ 17.6%, tolerance ±1.5%.
3. **Determinism:** identical seed + identical spot → bit-identical equity output across runs.

Use enough iterations that tolerance holds reliably (50k reference; may reduce for CI speed
only if tolerance still passes consistently across 10 consecutive runs).

## Task 3 — Range data plumbing (schema + loader, no real charts yet)

Chart source is not yet chosen; Claude will transcribe real charts later. Build the pipes now.

**Schema** — one JSON file per chart set, e.g. `src/data/ranges/<source-slug>-<tablesize>.json`:

```json
{
  "meta": {
    "source": "TBD — human-transcribed, citation required",
    "url": "TBD",
    "tableSize": 6,
    "transcribedBy": "claude",
    "date": "2026-06-13"
  },
  "positions": {
    "UTG": { "AA": 1, "AKs": 1, "AKo": 1, "A5s": 0.5 }
  }
}
```

- Hand keys: canonical notation — pairs `"77"`, suited `"AKs"`, offsuit `"AKo"` (169 max).
- Values: float 0–1 (frequency). Use 1 for now; floats keep the door open for mixed strategies.
- Loader module: validate schema (reject unknown hand keys, out-of-range values, missing meta),
  expand a position's range into the concrete combo list (e.g. "AKs" → 4 combos), and expose
  lookup for the 13x13 grid UI.
- Ship one clearly-labelled **placeholder** range file (`meta.source: "PLACEHOLDER — not for play"`)
  so the grid and Task 4 can be exercised. Do not invent "realistic" ranges — anything obviously
  synthetic (e.g. simple top-X% by rank) is fine as long as it's labelled.

**Acceptance:** loader rejects malformed files with a useful error; grid can render a loaded
range; combo expansion count is correct (AA=6, AKs=4, AKo=12).

## Task 4 — Equity vs known cards / vs range (worker upgrade)

Currently equity always computes vs random hands, even when "reveal villain cards" is on
(open item from handoff). Generalise the worker input:

```js
villains: [
  { type: "random" },
  { type: "cards", cards: ["As", "Kd"] },
  { type: "range", range: <expanded combo list with weights> }
]
```

- `cards`: remove those exact cards from the deck; no sampling for that villain.
- `range`: each iteration, sample that villain's hand from the combo list (weight-proportional),
  rejecting combos blocked by hero/board/other villains' dealt cards. Resample on collision;
  guard against pathological cases (range fully blocked → surface an error, don't spin).
- `random`: unchanged.
- Seeded determinism must hold across all three types.
- UI wiring: when "reveal villain cards" is on, pass `type: "cards"`. Range assignment UI is
  NOT required this task — engine support + a dev-console/test path is enough.

**Acceptance:**
- Reveal on: AhAs vs revealed KhKs preflop ≈ 81.9% ±1.5.
- Range sampling: villain range = {AA only} vs hero KhKs ≈ 18.1% ±1.5 (mirror check).
- Existing chop + multiway regression tests still pass.
- Same seed → same result for cards-type and range-type villains.

---

## Verification (Claude, post-implementation)

Chrome on http://localhost:5173: badge visual check over dealt hands; scrape EQUITY/POT ODDS/EV
and ground-truth vs python treys (tie-split, 50k iters, ±2% incl. rounding); reveal-villain
spot-checks against known matchup equities.

## Report back

For each task: files touched, test names added, anything that deviated from this brief and why.
