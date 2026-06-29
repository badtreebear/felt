// Felt grading fuzzer.
//
// Generates random-but-valid inputs for the live-grading scoring layer
// (scorePostflopEvDecision / scorePostflopSizing / normaliseDecision) across
// cash AND tournament blind sizes, then asserts invariants. This is the layer
// where every grading bug this session lived (chips↔bb, the all-in sign flip,
// "bet bigger with a weak hand"), so it's the highest-value thing to hammer.
//
// Runs until you stop it (Ctrl-C). Every issue prints to the screen in full AND
// is appended to fuzz-report.log, each reproducible via its seed:
//     npm run fuzz -- --seed=<n>
//
// Flags:
//   --seed=<n>      replay a single seed and exit (for reproducing a hit)
//   --hands=<n>     stop after N hands instead of running forever
//   --quiet         heartbeat only on screen (issues still go to the log)

import { scorePostflopEvDecision, scorePostflopSizing } from "../src/tracker/postflop-leaks.js";
import { normaliseDecision } from "../src/engine/decision-eval.js";

// ---- tiny seeded RNG (mulberry32) so every hand is reproducible by seed ----
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const STREETS = ["flop", "turn", "river"];
const POSITIONS = ["UTG", "MP", "HJ", "CO", "BTN", "SB", "BB"];
const RANKS = "23456789TJQKA".split("");
const SUITS = "shdc".split("");

function pick(r, arr) { return arr[Math.floor(r() * arr.length)]; }
function card(r) { return pick(r, RANKS) + pick(r, SUITS); }
function twoCards(r) {
  const a = card(r);
  let b = card(r);
  while (b === a) b = card(r);
  return [a, b];
}

// A plausible postflop state the scorers read fields from.
function makePostflop(r) {
  const street = pick(r, STREETS);
  const pot = Math.round((2 + r() * 400) * 10) / 10;
  const heroToCall = r() < 0.5 ? Math.round(r() * pot * 10) / 10 : 0;
  return {
    status: "waitingHero",
    street,
    heroSeat: 0,
    positions: { 0: pick(r, POSITIONS) },
    holeCards: { 0: twoCards(r) },
    pot,
    stacks: { 0: Math.round(r() * 20000) },
    heroToCall,
  };
}

// Blind size: cash (1) most of the time, plus tournament chip blinds so the
// chips↔bb conversion is exercised hard.
function makeBb(r) {
  if (r() < 0.4) return 1;
  return pick(r, [2, 5, 25, 50, 100, 200, 500, 1000]);
}

// A board for sizing's boardThreats() read.
function makeBoard(r, street) {
  const n = street === "flop" ? 3 : street === "turn" ? 4 : 5;
  const used = new Set();
  const out = [];
  while (out.length < n) {
    const c = card(r);
    if (!used.has(c)) { used.add(c); out.push(c); }
  }
  return out;
}

// ---- invariant checks. Each returns a string describing a violation, or null.
function checkDecision(label, decision, ctx) {
  if (decision == null) return null; // null = "nothing to grade", always allowed
  const issues = [];

  const numFields = ["evCall", "costBb", "benefitBb", "equity", "requiredEquity"];
  for (const f of numFields) {
    const v = decision[f];
    if (v != null && !Number.isFinite(Number(v))) {
      issues.push(`${f} is not finite (${v})`);
    }
  }

  // Costs/benefits are magnitudes — never negative.
  if (Number(decision.costBb) < 0) issues.push(`costBb negative (${decision.costBb})`);
  if (Number(decision.benefitBb) < 0) issues.push(`benefitBb negative (${decision.benefitBb})`);

  // Spot label sanity: no raw NaN/undefined, and tournament (bb!=1) must show
  // the "chips · Xbb" form, never a bare chip count mislabeled "bb".
  const spot = String(decision.spot || "");
  if (/NaN|undefined|null/.test(spot)) issues.push(`spot has bad token: "${spot}"`);
  if (ctx.bb !== 1 && /facing \d[\d,]* bb\b/.test(spot) && !spot.includes("·")) {
    issues.push(`tournament spot looks like chips-as-bb: "${spot}"`);
  }

  // EV magnitude sanity: a per-decision bb EV shouldn't be absurd. With pots
  // capped ~400 chips and bb up to 1000, |evBb| should stay well under ~1000.
  const ev = Math.abs(Number(decision.evCall) || 0);
  if (ev > 5000) issues.push(`evCall implausibly large for bb=${ctx.bb}: ${decision.evCall}`);

  // leak/good are mutually exclusive.
  if (decision.leak && decision.good) issues.push(`both leak and good set`);

  // A leak should never recommend the action the hero took as if correct;
  // and an undersized weak hand must NOT advise larger sizing.
  if (decision.leakType === "small bet (review)" && /larger/i.test(decision.recommended || "")) {
    issues.push(`small bet (weak) still advises larger sizing: "${decision.recommended}"`);
  }

  return issues.length ? `${label}: ${issues.join("; ")}` : null;
}

function checkNormalised(norm, decision, ctx) {
  if (norm == null) return null;
  const issues = [];
  if (!Number.isFinite(Number(norm.evDeltaBb))) issues.push(`evDeltaBb not finite (${norm.evDeltaBb})`);
  // Deviation is signed <= 0 (0 = matched/good, negative = leak). A positive
  // delta would mean "you beat the best line", which is impossible.
  if (Number(norm.evDeltaBb) > 0) issues.push(`evDeltaBb positive (${norm.evDeltaBb})`);
  // The all-in sign-flip bug: a decision the tracker flagged GOOD must never
  // normalise to a negative "missed" — that means good play graded as a mistake.
  if (decision.good && (norm.matched === false || Number(norm.evDeltaBb) < 0)) {
    issues.push(`good play graded as a miss (matched=${norm.matched}, delta=${norm.evDeltaBb})`);
  }
  // A benefit (if present) must not co-exist with a negative delta either.
  if (Number(norm.benefitBb) > 0 && Number(norm.evDeltaBb) < 0) {
    issues.push(`benefit with negative delta (benefit ${norm.benefitBb}, delta ${norm.evDeltaBb})`);
  }
  if (norm.matched === false && norm.evDeltaBb === 0 && norm.reason == null && decision.leak) {
    issues.push(`flagged missed leak but zero delta and no reason`);
  }
  return issues.length ? `normalise: ${issues.join("; ")}` : null;
}

// ---- one hand: build inputs, score, normalise, collect any violations.
export function playHand(seed) {
  const r = rng(seed);
  const bb = makeBb(r);
  const post = makePostflop(r);
  const board = makeBoard(r, post.street);
  const found = [];

  // 1) call/fold EV decision
  if (post.heroToCall > 0) {
    const evaluation = {
      evCall: (r() - 0.5) * post.pot * 2, // chips, can be + or -
      equity: r(),
      requiredEquity: r(),
      toCall: post.heroToCall,
      potBeforeHeroCall: post.pot,
    };
    for (const action of ["call", "fold"]) {
      const d = scorePostflopEvDecision({ postflop: post, action, evaluation, bb });
      const i1 = checkDecision("evDecision", d, { bb });
      if (i1) found.push(i1);
      if (d) {
        const i2 = checkNormalised(normaliseDecision(d), d, { bb });
        if (i2) found.push(i2);
      }
    }
  }

  // 2) sizing / commitment decision (bet/raise)
  {
    const committed = Math.round((1 + r() * 8000) * 10) / 10;
    const allIn = r() < 0.2;
    const commitmentEval = r() < 0.6
      ? { equity: r(), requiredEquity: r(), evCall: (r() - 0.5) * post.pot * 2 }
      : null;
    const action = r() < 0.5 ? "bet" : "raise";
    const d = scorePostflopSizing({ postflop: post, action, committed, allIn, commitmentEval, board, bb });
    const i1 = checkDecision("sizing", d, { bb });
    if (i1) found.push(i1);
    if (d) {
      const i2 = checkNormalised(normaliseDecision(d), d, { bb });
      if (i2) found.push(i2);
    }
  }

  return found;
}

