# Playtest harness — notes & roadmap

## Phase 1 (done): grading fuzzer
`npm run fuzz` — see the top of `scripts/fuzz.mjs`. Hammers the live-grading
scoring layer with random valid inputs (cash + tournament blinds) and asserts
internal-consistency invariants: finite + correctly-signed EV, chip↔bb labels,
no good play graded as a miss, no "bet bigger with a weak hand". Runs until
Ctrl-C; issues print to screen and append to `fuzz-report.log` (gitignored),
 each reproducible with `npm run fuzz -- --seed=<n>`.

Stopping it (especially when launched in the background, where Ctrl-C can't
reach it):
- `Ctrl-C` (foreground only)
- `--minutes=N` — self-terminating time budget
- `--hands=N` — stop after N hands
- create a file named `STOP-FUZZ` in the project folder — halts gracefully at the
  next check (~every 5k hands) and deletes itself. Works for background runs.

Verified it can fail: reintroducing the all-in sign-flip bug made it flag
thousands of issues; with the fix in place it reports 0.

## Phase 2 (todo): coverage audits — "where does the app go silent?"
A different question from "is the advice correct?" — this is "is there advice/a
table AT ALL?". No poker oracle needed; it's enumeration + gap reporting.

### Missing tables (preflop) — DONE: `npm run audit`
`scripts/audit-core.mjs` enumerates every preflop spot that can actually occur
(players 2-9 × seat × depth × facing-action, openers constrained to seats that
act before hero) and classifies each as: a real chart, a FILLABLE gap, a
KNOWN-unsupported fallback, or an ANOMALY (empty grid / all-fold / illegal rec).

Finding (v0.11.0): 0 fillable gaps, 0 anomalies. RFI and vs-single-open coverage
is complete. The only fallbacks are vs-3-bet spots, which the code deliberately
doesn't chart yet ("no chart for this re-raised spot yet"). So the one real area
to expand, if ever wanted, is vs-3-bet defense — a known, intentional limitation.

NOTE on method: the first cut reported 28 "gaps", but they were positionally
impossible spots (e.g. CO facing a BTN open — CO acts first) manufactured by a
naive enumeration. Constraining openers to earlier-acting seats dropped it to 0.
Lesson: a coverage auditor must only enumerate spots that can really happen, or
it cries wolf. Entry points: src/data/ranges/contextual-ranges.js (getRangeForSpot),
src/tracker/preflop-leaks.js (recommendedAction).

### Missing advice (postflop)
Sweep realistic postflop spots and flag where the grader returns `null` (no
feedback) in situations a human clearly would have a read — e.g. a clear value
or clear-fold spot that produces nothing. Needs a "should there have been
advice?" threshold, so it's a coverage *report* to review, not a hard pass/fail.

## Phase 3 (todo, harder): correctness benchmarks
A handful of hand-authored canonical spots (nut hand, bottom-pair stab, clear
fold) with expected grades, so a regression in the ADVICE ITSELF is caught.
This is the only piece that needs a trusted poker oracle (the equity engine +
hand-checked expectations) — deliberately small and curated, not generated.
