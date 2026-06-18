# Felt — Codex Work Package: Trainer-depth roadmap (Phases 9–14) — 17 Jun 2026

Implementer: any coder or model. Local filesystem only; Jason pushes to git. Design by Claude
(confirmed with Jason). This is a **roadmap of independently shippable phases** — each phase below
is a self-contained mini work-package. Do them in order where dependencies are noted; commit
between slices. After every slice: `npm test` + `npm run build` clean, no console errors.

## Why this exists

Felt is already a strong "table that tells you the answer": dealt/manual spots, RFI charts,
postflop EV, equity (Monte Carlo worker), a bet sizer, a leak tracker, an optional AI coach, and
multi-hero history. The gap to a *great trainer* is the loop from **identify a leak → drill it →
measure improvement**, plus decision completeness (facing-action preflop) and making the engine's
reasoning visible. These phases close that gap, mostly by **surfacing ground-truth the engine
already computes** rather than inventing new poker math.

## Cross-cutting constraints (apply to every phase)

- **Seeded determinism is sacred.** All grading/equity must be reproducible for a given seed.
  Nothing here may change the action sequence or result of a seeded hand.
- **Coach stays optional and offline-safe.** No feature may hard-depend on the LLM coach; if the
  coach is unconfigured/unreachable, the deterministic engine path still works.
- **Local-only, no backend.** Reuse the existing IndexedDB (`src/store/db.js`) and localStorage.
- **Don't regress solo/no-tracker use.** Defaults must leave the current experience intact.
- Match existing module conventions; table-driven Vitest tests for every new scorer/selector.

## Notes for implementers / models (Jason: re. trying other models)

Each phase is scoped so a model can execute it cold from this file plus the named modules.
Difficulty tags to help route work:

- **[mechanical]** — wiring existing functions into UI/state; low poker judgment. Safe for
  smaller/cheaper models. Phases 9, 10, 13.
- **[judgment]** — needs correct poker content or math; review by a strong model or human.
  Phase 11 (range content for blinds/short tables) and Phase 12 (bluff combinatorics) especially.

Self-check protocol for any model: implement one slice → `npm test` → `npm run build` → only then
move on. The test fixtures are deterministic, so a model can verify itself without Jason.

---

## Phase 9 — Decision feedback foundation (live grading) [mechanical]

**Goal.** After each hero decision, show in real time: the engine's recommended action, what the
hero did, whether it matched, the EV lost in bb, and a one-line reason. Add a per-session
scoreboard (decisions played, % matching the engine, net bb of EV lost). This is a feature on its
own **and** the substrate Phase 10 (drill) reuses.

**Why first.** The hard part already exists. `src/main.js` `heroPreflopAction` / `heroPostflopAction`
already build `draft.hand.trackerDecisions` for every hero action via
`scorePreflopDecision` (`src/tracker/preflop-leaks.js`), `scorePostflopEvDecision` and
`scorePostflopSizing` (`src/tracker/postflop-leaks.js`), backed by
`evaluatePostflopDecision` (`src/engine/postflop-ev.js`) and `recommendHeroSize`
(`src/engine/bet-sizing.js`). This phase **surfaces** that, it does not recompute it.

**Build.**
- Slice 9.1 — Normalise one decision into a display shape `{ street, spot, heroAction,
  recommended, matched: bool, evLostBb: number|null, reason }`. Add a small
  `src/engine/decision-eval.js` (or extend the tracker scorers) that returns this from the same
  inputs `trackerDecisions` already uses, so live play and the tracker share one definition.
- Slice 9.2 — UI: a feedback line in the hand panel (`src/ui/table.js`, near the action controls)
  that reads the most recent hero decision and renders matched/EV-lost/reason. Keep it quiet when
  there's no decision yet.
- Slice 9.3 — Session scoreboard in `state` (e.g. `state.session = { decisions, matched, evLostBb }`),
  reset on "New game", incremented on each hero decision. Render a compact strip (reuse
  `.maths-chip` styling). A "session" = since last New game; persistence optional.

**Files.** `src/main.js` (already produces decisions — add session aggregation), new
`src/engine/decision-eval.js`, `src/ui/table.js`, `src/ui/chips.js` or `src/ui/controls.js` for the
scoreboard, `src/state.js` (session slice).

**Acceptance.** Each hero decision shows matched/EV-lost/reason; the session strip updates and
resets on New game; values are deterministic for a seed; no change to hand flow.

**Tests.** `decision-eval`: table of (spot, heroAction) → expected `{matched, evLostBb, reason}`,
deterministic. Session aggregation: a fixed sequence of decisions produces the expected totals.

---

## Phase 10 — Drill mode (close the leak loop) [mechanical] — depends on Phase 9

**Goal.** Turn a detected leak into repeatable practice: pick a leak category, get served a set of
matching spots, decide each, get graded (Phase 9), see a running score, and have failed spots
resurface (light spaced repetition). This is the headline "it actually trains you" feature.

**Build.**
- Slice 10.1 — Spot selection v1 (deterministic, from history): given a `leakType`, pull that
  category's example hands from the tracker (`state.tracker.summary.leaks[].examples`, already
  carrying `seed`) and replay them via the existing `actions.replayTrackerHand(seed)` /
  `replayHand` path. Reuse `src/tracker/store.js` `loadHandsForHero`.
- Slice 10.2 — Drill session controller `src/drill/session.js`: holds the queue, current index,
  score, and a "resurface on miss" rule (a missed spot re-enters the queue once). Grade each spot
  with Phase 9's `decision-eval`.
- Slice 10.3 — Drill UI: entry point from the Tracker leak list ("Drill this leak"), a focused
  drill view (spot → hero decides → instant feedback → next), and an end-of-drill summary
  ("8/10, fold-to-cbet improved"). Reuse the hand panel + Phase 9 feedback line.
- Slice 10.4 (optional, later) — Spot selection v2 (generated): deal fresh seeded hands and filter
  to the target category (e.g. keep dealing until the hero faces a c-bet) so drills aren't limited
  to past hands. Keep deterministic via seed ranges.

**Files.** new `src/drill/` (`session.js`, `selection.js`), `src/ui/` drill view, hooks in the
Tracker UI (`src/ui/controls.js` `createTrackerPanel` leak list), reuse seeds/replay in `src/main.js`.

**Acceptance.** From a leak, start a drill, play N spots with instant grading, see a final score
and which metric improved; missed spots resurface; deterministic per seed; coach not required.

**Tests.** Selection: a leakType maps to the expected example seeds. Session: a scripted set of
right/wrong answers yields the expected score and resurfacing behaviour.

---

## Phase 11 — Preflop decision completeness (facing action + chart gaps) [judgment]

**Goal.** Make the engine's preflop recommendation cover the decisions that actually happen, not
just RFI: **blind defense, facing a raise (call/3-bet/fold), facing a 3-bet (call/4-bet/fold)** —
and fill the chart holes in `gap-analysis.md` so "no chart for XYZ" effectively disappears for
2–9 players.

**Context.** Today `preflopOpenVerdict` (`src/ui/chips.js`) and `heroRfiText` (`src/ui/table.js`)
use the **opening** chart only. The contextual data already exists but isn't wired into the live
recommendation: `src/data/ranges/default-vsrfi-9max.json`,
`src/data/ranges/default-vs3bet-9max.json`, `src/data/ranges/contextual-ranges.js`. Per
`gap-analysis.md`, the missing ground is SB/BB opening ranges, a 2-max chart, and vs-RFI/vs-3bet
for 2–6 handed.

**Build.**
- Slice 11.1 — Spot classifier: from the live preflop state, determine the spot (RFI / vs-RFI /
  vs-3bet / blind defense) and the relevant opener/responder positions. One helper both the
  display (`heroRfiText`) and the Bet tip (`heroEngineTip` in `chips.js`) call.
- Slice 11.2 — Wire contextual charts into the recommendation: when facing a raise, return
  call/3-bet/fold from the vs-RFI chart; facing a 3-bet, from the vs-3bet chart. Generalise
  `getOpeningRange` usage to a spot-aware `getRangeForSpot` (some scaffolding may already exist in
  `contextual-ranges.js` — check before adding).
- Slice 11.3 — Fill the gaps (`gap-analysis.md` Option C hybrid): add SB and BB ranges for the
  supported sizes, keep the 2-max → 6max fallback (CO-as-approx) for the rare heads-up case, and
  make the "no chart" message a graceful, labelled fallback rather than a dead end.
- Slice 11.4 — UI: the RFI/spot label and the Bet tip verdict must read correctly for the new
  spots (e.g. "vs CO open: 3-bet" / "BB defend: call"), reusing the range popover/grid.

**Files.** `src/data/ranges/*` (new SB/BB + any new size charts; `validateRfiChart`/comboCount
conventions in `src/engine/ranges.js` must still pass), `src/data/ranges/contextual-ranges.js`,
`src/ui/table.js` (`heroRfiText`, range popover title), `src/ui/chips.js` (`preflopOpenVerdict` →
spot-aware), preflop engine helpers as needed.

**Acceptance.** Facing a raise or 3-bet, the engine gives the right call/3-bet/4-bet/fold verdict;
blinds and 2–6-handed contextual spots no longer say "no chart"; existing RFI behaviour and the
range-chart validation tests are unchanged.

**Tests.** Spot classifier: table of (positions, action so far) → expected spot. New charts pass
`validateRfiChart` combo-count/monotonicity checks. Verdict table for representative vs-RFI /
vs-3bet / blind-defense hands.

**Note.** This is the most poker-judgment-heavy phase — the actual range *content* for SB/BB and
short tables should be sourced from a defensible chart and reviewed, not improvised.

---

## Phase 12 — Make the engine's thinking visible [judgment]

**Goal.** Two high-leverage teaching surfaces that reuse data the engine already has.

**Build.**
- Slice 12.1 — Villain range grid. The engine already assembles each villain's assumed range to
  compute equity (`villainRangesForPostflopDecision` in `src/engine/postflop-ev.js`, via
  `adjustedOpeningRange` in `src/engine/player-model.js`). Render it as a range grid (reuse
  `createRangeGrid` from `src/ui/range-grid.js`) in the spot, so the player can *see* "what they
  have here." A toggle/expander in the hand panel or the Bet tip popover.
- Slice 12.2 — Bluff math in the maths layer. Add, when the hero is betting/raising, the
  **breakeven fold %** for the bet to be +EV (`risk / (risk + reward)`) and a **value:bluff combo
  count** read for the chosen size. Extend `src/ui/chips.js` (a new chip or a section in the Bet
  tip popover); the pot-odds/EV formula helpers in `src/engine/potodds.js` / `src/engine/ev.js`
  are the place for the breakeven helper.

**Files.** `src/ui/chips.js`, `src/ui/range-grid.js`, a villain-range surface in `src/ui/table.js`,
`src/engine/potodds.js`/`ev.js` for the breakeven helper.

**Acceptance.** The villain's range grid is viewable for the current spot; when betting/raising the
maths layer shows the breakeven fold % (and combo read); deterministic; coach not required.

**Tests.** Breakeven helper: table of (bet, pot) → expected fold %. Villain-range surface: the grid
matches `villainRangesForPostflopDecision` for a fixture spot.

---

## Phase 13 — Progress & retention [mechanical]

**Goal.** Show improvement over time and turn player-type knowledge into explicit exploit advice.

**Build.**
- Slice 13.1 — Progress-over-time: the tracker already stores per-hand records with timestamps
  (`src/tracker/store.js`, `summarizeHands` in `src/tracker/stats.js`). Add time-bucketed
  aggregates (e.g. weekly VPIP/PFR/fold-to-cbet/accuracy) and a small trend chart in the Tracker
  view ("fold-to-cbet 70% → 45%").
- Slice 13.2 — Exploit tips by player type: surface profile-specific advice from the modelled
  villain types (`PLAYER_PROFILES`, `getProfileOptions` in `src/engine/player-model.js`) in the
  Bet tip / coach ("vs a calling station: value thinner, stop bluffing"; "vs a nit: respect raises").
- Slice 13.3 (optional) — Session takeaway: one actionable line at session end; can reuse the coach
  if reachable, else a deterministic templated tip from the session scoreboard (Phase 9).

**Files.** `src/tracker/stats.js` (time buckets), Tracker UI in `src/ui/controls.js`, `src/ui/chips.js`
/ coach for exploit tips.

**Acceptance.** Tracker shows an improvement trend across sessions; an exploit tip appears for
non-standard villain types; nothing breaks for a brand-new hero with no history.

**Tests.** Time-bucketed stats over a fixture of timestamped hands. Exploit-tip mapping: profile →
expected advice string.

---

## Phase 14 — Parked / known (reference, not new design)

- **Table dressing (animations + sound).** Already scoped in
  `felt-polish-backlog-table-dressing.md` — card-deal stagger, chip-to-pot movement, optional
  mute-by-default SFX. Was blocked on postflop verification; postflop is solid now, so it's
  **unblocked**. Cosmetic only; must respect `prefers-reduced-motion` and seeded determinism.
- **Real hand-history import.** Import sessions from a real site's hand-history format and review
  them (not just app-dealt hands). Bridges training to real play; larger, parser-heavy; out of
  core scope. (Listed as out-of-scope in the Phase 8 WP.)
- **Tournament / ICM mode.** Push-fold (Nash) charts + ICM pressure. Net-new domain; only if Jason
  wants tournaments. Out of scope for cash-game trainer depth.

---

## Recommended order & grouping

1. **Phase 9** (feedback foundation) → unlocks the rest of the loop. Smallest, do first.
2. **Phase 10** (drill mode) — the headline win; depends on 9.
3. **Phase 11** (facing-action + chart gaps) — biggest *correctness* gap; can run in parallel with
   10 since it touches the recommendation, not the drill plumbing. Strong-model/human review.
4. **Phase 12** (visible thinking) and **Phase 13** (progress/exploits) — polish/depth; independent.
5. **Phase 14** — pick up table dressing whenever "feel" matters; defer import/ICM unless wanted.

## Overall acceptance

A player can see live grading as they play, drill a specific leak and watch the metric move, get a
correct recommendation for *every* preflop spot (open, defend, 3-bet, blinds, 2–9 handed), see the
villain's range and the bluff breakeven behind a decision, and track improvement across sessions —
all deterministic per seed, coach-optional, `npm test` + `npm run build` clean.
