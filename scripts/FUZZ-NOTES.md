# Playtest harness — notes & roadmap

## Phase 1 (done): grading fuzzer
`npm run fuzz` — see the top of `scripts/fuzz.mjs`. Hammers the live-grading
scoring layer with random valid inputs (cash + tournament blinds) and asserts
internal-consistency invariants: finite + correctly-signed EV, chip↔bb labels,
no good play graded as a miss, no "bet bigger with a weak hand". Runs until
Ctrl-C; issues print to screen and append to `fuzz-report.log` (gitignored),
each reproducible with `npm run fuzz -- --seed=<n>`.

Verified it can fail: reintroducing the all-in sign-flip bug made it flag
thousands of issues; with the fix in place it reports 0.

## Phase 2 (todo): coverage audits — "where does the app go silent?"
A different question from "is the advice correct?" — this is "is there advice/a
table AT ALL?". No poker oracle needed; it's enumeration + gap reporting.

### Missing tables (preflop)
Enumerate every spot the app can present — position × players × stack depth ×
facing-action — call `getRangeForSpot` / `scorePreflopDecision`, and list every
combination that falls through to `"no chart"` / `recommended: "unknown"`.
Output: a definitive list of range gaps instead of discovering them mid-play.
Entry points: `src/data/ranges/contextual-ranges.js` (getRangeForSpot),
`src/tracker/preflop-leaks.js` (recommendedAction / rangeKind === "fallback").

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
