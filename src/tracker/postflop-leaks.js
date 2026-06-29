import { canonicalHandKey } from "../engine/player-model.js";
import { boardThreats } from "../engine/board-threats.js";

export function scorePostflopEvDecision({ postflop, action, evaluation, bb } = {}) {
  const toCall = Number(evaluation?.toCall ?? postflop?.heroToCall) || 0;

  if (!postflop || postflop.status !== "waitingHero" || toCall <= 0 || !evaluation) {
    return null;
  }

  if (action !== "call" && action !== "fold") {
    return null;
  }

  // Tracker math runs in chips; labels and EV reads are bb-denominated. In cash
  // mode bb is 1 (chips == bb); in tournament mode bb is the level's big blind
  // in chips (e.g. 200), so we convert at the display/EV-report boundary.
  const bbSize = blindSize(bb);
  const ev = Number(evaluation.evCall);
  const evBb = chipsToBb(ev, bbSize);
  const recommended = ev > 0 ? "call" : "fold";
  const isLeak = (action === "call" && ev < 0) || (action === "fold" && ev > 0);
  const isGood = (action === "call" && ev > 0) || (action === "fold" && ev < 0);

  let category = "";
  if (isLeak) {
    category = action === "call" ? "called -EV (paid off)" : "folded +EV";
  } else if (isGood) {
    category = action === "call" ? "good call (+EV)" : "good fold";
  }

  return {
    street: postflop.street,
    spot: postflopSpotLabel(postflop, toCall, bbSize),
    hand: canonicalHandKey(postflop.holeCards?.[postflop.heroSeat]) || "",
    heroAction: action,
    recommended,
    leak: isLeak,
    good: isGood,
    leakType: category,
    equity: roundMetric(evaluation.equity),
    requiredEquity: roundMetric(evaluation.requiredEquity),
    evCall: roundMetric(evBb),
    verdict: evaluation.verdict || recommended,
    costBb: isLeak ? roundCost(Math.abs(evBb)) : 0,
    benefitBb: isGood ? roundCost(Math.abs(evBb)) : 0,
    potBeforeHeroCall: evaluation.potBeforeHeroCall ?? null,
    toCall,
  };
}

export const OVERSIZED_RATIO = 1.5;
export const UNDERSIZED_RATIO = 0.3;

// "Overvalued your hand" thresholds (judgment - kept conservative). An oversized
// bet is only the relative-strength leak when the hand is genuinely behind the
// continuing range (low if-called equity) AND the board is dangerous (a made
// hand already beats hero, or the texture is wet). A big bet with a strong hand
// is just a value bet and must NOT be flagged.
const OVERVALUE_EQUITY = 0.55;
const OVERVALUE_WETNESS = 0.5;
// A small bet is only an "undersized VALUE bet" worth sizing up when hero is
// genuinely ahead of the continuing range. Below this, a small bet is treated as
// a legitimate blocker / thin / give-up and we don't advise betting bigger.
const UNDERSIZE_VALUE_EQUITY = 0.6;

export function scorePostflopSizing({ postflop, action, committed, allIn, commitmentEval, board, bb } = {}) {
  if (!postflop || (action !== "bet" && action !== "raise")) {
    return null;
  }

  const commit = Number(committed) || 0;
  const pot = Math.max(0, Number(postflop.pot) || 0);

  if (commit <= 0) {
    return null;
  }

  // bb converts the chip-denominated commitment and EV into big blinds for the
  // label and cost reads (1 in cash mode, the level's big blind in tournaments).
  const bbSize = blindSize(bb);

  // All-in commitment scored on equity: if the if-called EV is negative the chips
  // went in too light (no fold equity at an all-in, so this is EV-honest).
  if (allIn && commitmentEval) {
    const ev = Number(commitmentEval.evCall);

    if (!Number.isFinite(ev)) {
      return null;
    }

    const evBb = chipsToBb(ev, bbSize);
    const metrics = {
      equity: roundMetric(commitmentEval.equity),
      requiredEquity: roundMetric(commitmentEval.requiredEquity),
      evCall: roundMetric(evBb),
    };

    if (ev < 0) {
      return baseDecision(postflop, action, commit, {
        ...metrics,
        leak: true,
        leakType: "got it in light",
        recommended: "pot control / fold",
        costBb: roundCost(Math.abs(evBb)),
      }, bbSize);
    }

    return baseDecision(postflop, action, commit, {
      ...metrics,
      good: true,
      leakType: "got it in good",
      recommended: "keep getting it in",
      benefitBb: roundCost(evBb),
    }, bbSize);
  }

  if (allIn) {
    return null;
  }

  const ratio = pot > 0 ? commit / pot : 0;

  if (ratio >= OVERSIZED_RATIO) {
    // Relative-strength check: is this big bet actually behind the board + range?
    const equity = Number(commitmentEval?.equity);
    const ev = Number(commitmentEval?.evCall);
    const heroCards = postflop.holeCards?.[postflop.heroSeat] || [];
    const { threats, wetness } = boardThreats(board || [], heroCards);
    const beaten = threats.some((threat) => threat.beatsHero === true);
    const dangerous = beaten || wetness >= OVERVALUE_WETNESS;
    const weak = Number.isFinite(equity) && equity < OVERVALUE_EQUITY;

    if (weak && dangerous) {
      const evBb = Number.isFinite(ev) ? chipsToBb(ev, bbSize) : null;
      // The concrete made-hand categories the board already makes possible that
      // beat hero (e.g. "flush", "straight"). Carried through to live grading so
      // the explanation can name the danger instead of saying "respect the board".
      const beats = threats
        .filter((threat) => threat.beatsHero === true)
        .map((threat) => threat.label.toLowerCase());
      return baseDecision(postflop, action, commit, {
        leak: true,
        leakType: "overvalued your hand",
        recommended: "pot control - respect the board",
        equity: roundMetric(equity),
        evCall: evBb !== null ? roundMetric(evBb) : null,
        // Cost = how much the if-called EV is underwater (the chips you bloat in
        // while behind). Falls back to 0 when EV is unavailable.
        costBb: evBb !== null && evBb < 0 ? roundCost(Math.abs(evBb)) : 0,
        beats,
      }, bbSize);
    }

    // Texture-neutral big bet (or strong hand): keep the lighter review flag so
    // nothing regresses, but it is not the relative-strength leak.
    return baseDecision(postflop, action, commit, {
      leak: true,
      leakType: "oversized bet (review)",
      recommended: "smaller sizing",
      costBb: 0,
    }, bbSize);
  }

  if (ratio > 0 && ratio <= UNDERSIZED_RATIO) {
    const equity = Number(commitmentEval?.equity);
    const haveEquity = Number.isFinite(equity);
    const ahead = haveEquity && equity >= UNDERSIZE_VALUE_EQUITY;

    if (haveEquity && !ahead) {
      // Small bet with a hand that is NOT ahead of the continuing range: this is
      // legitimate as a blocker, a thin stab, or a give-up. Don't tell the user
      // to bet bigger — flag it neutrally for review with no cost.
      return baseDecision(postflop, action, commit, {
        leak: true,
        leakType: "small bet (review)",
        recommended: "blocker / thin value — fine to keep small",
        equity: roundMetric(equity),
        costBb: 0,
      }, bbSize);
    }

    // Either we confirmed hero is ahead (deep analysis on) or we have no equity
    // read (analysis off): suggest larger sizing only when ahead, otherwise stay
    // neutral so we never advise betting bigger with a weak hand.
    return baseDecision(postflop, action, commit, {
      leak: true,
      leakType: ahead ? "undersized value bet" : "small bet (review)",
      recommended: ahead ? "larger sizing for value" : "small bet — size up only if ahead",
      equity: haveEquity ? roundMetric(equity) : null,
      costBb: 0,
    }, bbSize);
  }

  return null;
}

function baseDecision(postflop, action, commit, extra, bbSize = 1) {
  const position = postflop.positions?.[postflop.heroSeat] || `Seat ${postflop.heroSeat + 1}`;
  const verb = action === "raise" ? "raise to" : "bet";
  return {
    street: postflop.street,
    spot: `${position} ${postflop.street} ${verb} ${formatBb(commit, bbSize)}`,
    hand: canonicalHandKey(postflop.holeCards?.[postflop.heroSeat]) || "",
    heroAction: action,
    recommended: extra.recommended || "",
    leak: extra.leak ?? false,
    good: extra.good ?? false,
    leakType: extra.leakType,
    equity: extra.equity ?? null,
    requiredEquity: extra.requiredEquity ?? null,
    evCall: extra.evCall ?? null,
    verdict: extra.recommended || "",
    costBb: extra.costBb ?? 0,
    benefitBb: extra.benefitBb ?? 0,
    potBeforeHeroCall: Math.max(0, Number(postflop.pot) || 0),
    toCall: commit,
    beats: extra.beats ?? null,
  };
}

function postflopSpotLabel(postflop, toCall, bbSize = 1) {
  const position = postflop.positions?.[postflop.heroSeat] || `Seat ${postflop.heroSeat + 1}`;
  return `${position} ${postflop.street} facing ${formatBb(toCall, bbSize)}`;
}

// Normalise the blind size: a positive finite number, else 1 (cash mode, where
// one chip is one big blind). Guards against 0/NaN that would blow up division.
function blindSize(bb) {
  const value = Number(bb);
  return Number.isFinite(value) && value > 0 ? value : 1;
}

// Convert a chip amount to big blinds.
function chipsToBb(value, bbSize) {
  return (Number(value) || 0) / blindSize(bbSize);
}

// Render an amount that arrives in chips as big blinds. In cash mode (bbSize 1)
// chips already are bb, so we show the plain "X bb". In tournament mode we mirror
// the seat-stack convention and show both: "2,838 · 14.2bb".
function formatBb(chipValue, bbSize = 1) {
  const chips = Number(chipValue) || 0;
  const size = blindSize(bbSize);
  const bbAmount = chips / size;

  if (size === 1) {
    return `${formatAmount(bbAmount)} bb`;
  }

  return `${formatChipCount(chips)} · ${formatAmount(bbAmount)}bb`;
}

function formatAmount(value) {
  const number = Number(value) || 0;
  return Number.isInteger(number) ? String(number) : number.toFixed(1).replace(/\.0$/, "");
}

function formatChipCount(value) {
  const rounded = Math.round((Number(value) || 0) * 10) / 10;
  return rounded.toLocaleString("en-US", { maximumFractionDigits: 1 });
}

function roundMetric(value) {
  return Math.round((Number(value) || 0) * 1000) / 1000;
}

function roundCost(value) {
  return Math.round((Number(value) || 0) * 10) / 10;
}
