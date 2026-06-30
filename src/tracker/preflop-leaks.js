import { getRangeForSpot } from "../data/ranges/contextual-ranges.js";
import { canonicalHandKey, handStrengthPercentile } from "../engine/player-model.js";

export function scorePreflopDecision({ preflop, action }) {
  if (!preflop || preflop.status !== "waitingHero") {
    return null;
  }

  const heroSeat = preflop.heroSeat;
  const position = preflop.positions?.[heroSeat] || "";
  const handKey = canonicalHandKey(preflop.holeCards?.[heroSeat] || []);
  const range = getRangeForSpot({
    players: preflop.players,
    seat: heroSeat,
    position,
    hand: {
      buttonSeat: preflop.buttonSeat,
      preflop,
    },
    effBb: preflop.effectiveStackBb,
  });
  const heroAction = normalizeHeroAction({ preflop, action });
  const recommended = recommendedAction({ range, handKey });
  const leak = leakForDecision({ range, heroAction, recommended });

  // Estimate the EV cost of a chart-deviation leak in big blinds. The preflop
  // chart only knows you deviated, not by how much — so for a too-wide CALL we
  // price the call with real pot odds and a rough percentile equity (hybrid),
  // and for the other leak types (over-3-bet, over-fold, missed open) we fall
  // back to a small fixed nominal. This is an ESTIMATE, not a solver number.
  const costBb = leak ? estimatePreflopLeakCostBb({ preflop, heroAction, handKey, leakType: leak }) : 0;

  return {
    street: "preflop",
    spot: range.title || `${position} preflop`,
    rangeKind: range.kind || "unknown",
    position,
    hand: handKey,
    heroAction,
    recommended,
    leak: Boolean(leak),
    leakType: leak || "",
    costBb,
  };
}

// Small fixed nominal costs (bb) for chart leaks where there is no clean call
// price to compute against. Directional, deliberately conservative.
const NOMINAL_LEAK_COST_BB = {
  "3-bet too wide": 0.5,
  "opened too wide": 0.3,
  "over-folded a defend hand": 0.2,
  "over-folded vs 3-bet": 0.3,
  "missed an open": 0.3,
  "continued too wide vs 3-bet": 0.6,
  "flatted a 3-bet hand": 0.3,
  "flatted a 4-bet hand": 0.4,
  "3-bet a call hand": 0.2,
  "4-bet a call hand": 0.3,
};
const DEFAULT_NOMINAL_LEAK_COST_BB = 0.3;

// Rough RAW equity of a hand vs a typical opening range, from its absolute
// strength percentile (0 = AA, 1 = 72o). Vs a real (non-random) opening range
// the weakest hands sit lower than vs random, so we map the strongest to ~82%
// and the weakest to ~30%.
function estimateEquityVsOpen(handKey) {
  const pct = handStrengthPercentile(handKey);
  return clamp(0.82 - 0.52 * pct, 0.22, 0.9);
}

// Equity REALIZATION factor: you cash in less than your raw share preflop,
// especially out of position and with dominated/offsuit hands, because of
// reverse implied odds and tough postflop spots. This is the piece pure pot
// odds miss — and the real reason the chart folds a hand that looks priced-in.
// In position ~0.85, out of position ~0.68; trim further for offsuit non-pairs.
function realizationFactor(handKey, inPosition) {
  let factor = inPosition ? 0.85 : 0.68;
  const offsuitNonPair = handKey.length === 3 && handKey.endsWith("o");
  if (offsuitNonPair) {
    factor -= 0.05;
  }
  return clamp(factor, 0.5, 1);
}

// Hero is in position for the rest of the hand if they act after the preflop
// aggressor postflop — i.e. hero's seat is later in postflop order. Postflop
// order starts at SB, so the seat further from the button-left (closer to the
// button) acts later. We approximate with position labels: blinds and early
// seats are OOP vs a later-position raiser.
function heroInPosition(preflop) {
  const pos = preflop.positions?.[preflop.heroSeat] || "";
  // BTN is always in position; the blinds are always out of position.
  if (pos === "BTN") return true;
  if (pos === "SB" || pos === "BB") return false;
  // CO is in position vs anyone but the button; treat as IP for this estimate.
  if (pos === "CO") return true;
  // Otherwise (UTG/HJ/LJ flatting a later open) assume out of position.
  return false;
}

function estimatePreflopLeakCostBb({ preflop, heroAction, handKey, leakType }) {
  // A too-wide CALL has a concrete price: invest `call` to win the pot. We price
  // it with one-shot call EV on REALIZED equity (raw equity x realization), which
  // captures why a priced-in-looking flat still loses chips. Only "calling too
  // light" leaks use this; a fold/raise leak has no call price.
  const isCallLeak = heroAction === "call"
    && (leakType === "defended too wide" || leakType === "continued too wide vs 3-bet");

  if (isCallLeak) {
    const bb = preflop.bigBlind > 0 ? preflop.bigBlind : 1;
    const heroIn = preflop.contributions?.[preflop.heroSeat] || 0;
    const callChips = Math.max(0, (preflop.currentBet || 0) - heroIn);
    const potChips = Math.max(0, preflop.pot || 0);
    const callBb = callChips / bb;
    const potBb = potChips / bb;

    if (callBb <= 0) {
      return roundCost(NOMINAL_LEAK_COST_BB[leakType] ?? DEFAULT_NOMINAL_LEAK_COST_BB);
    }

    const rawEquity = estimateEquityVsOpen(handKey);
    const realized = clamp(rawEquity * realizationFactor(handKey, heroInPosition(preflop)), 0.05, 0.95);
    // One-shot call EV in bb on realized equity: win (pot + call) with `realized`,
    // lose `call` otherwise.
    const evBb = realized * (potBb + callBb) - (1 - realized) * callBb;
    // A flagged call leak should never read as 0.0 (that recreates the OK-but-
    // "missed" contradiction). Floor at 0.1bb; cap at the chips risked.
    const cost = evBb < 0 ? Math.min(Math.abs(evBb), callBb) : 0;
    return roundCost(Math.max(cost, 0.1));
  }

  return roundCost(NOMINAL_LEAK_COST_BB[leakType] ?? DEFAULT_NOMINAL_LEAK_COST_BB);
}

function clamp(value, lo, hi) {
  return Math.max(lo, Math.min(hi, value));
}

function roundCost(value) {
  return Math.round((Number(value) || 0) * 10) / 10;
}

function normalizeHeroAction({ preflop, action }) {
  if (action === "raise") {
    if (preflop.voluntaryRaiserSeat === null || preflop.voluntaryRaiserSeat === undefined) {
      return "raise";
    }

    if (preflop.raiseCount === 1) {
      return "threeBet";
    }

    return "fourBet";
  }

  if (action === "fold") {
    return "fold";
  }

  const callAmount = Math.max(0, (preflop.currentBet || 0) - (preflop.contributions?.[preflop.heroSeat] || 0));
  return callAmount > 0 ? "call" : "check";
}

export function recommendedAction({ range, handKey }) {
  if (!handKey || !range?.chartAvailable || range.kind === "fallback") {
    return "unknown";
  }

  if (range.kind === "rfi") {
    return range.combos?.some?.((combo) => combo.hand === handKey) || rfiIncludesHand(range, handKey)
      ? "raise"
      : "fold";
  }

  if (range.kind === "vsRfi") {
    return mapFacingOpenAction(range.actions?.[handKey]);
  }

  if (range.kind === "vs3bet") {
    return mapFacingThreeBetAction(range.actions?.[handKey]);
  }

  return "unknown";
}

function rfiIncludesHand(range, handKey) {
  const cell = range.grid?.[cellRow(handKey)]?.[cellColumn(handKey)];

  if (typeof cell === "number") {
    return cell > 0;
  }

  if (cell && typeof cell === "object") {
    return Number(cell.weight) > 0;
  }

  return false;
}

function mapFacingOpenAction(action) {
  if (action === "threeBetValue" || action === "threeBetBluff") {
    return "threeBet";
  }

  return action === "call" ? "call" : "fold";
}

function mapFacingThreeBetAction(action) {
  if (action === "fourBetValue" || action === "fourBetBluff") {
    return "fourBet";
  }

  return action === "call" ? "call" : "fold";
}

function leakForDecision({ range, heroAction, recommended }) {
  if (!recommended || recommended === "unknown") {
    return "";
  }

  if (range.kind === "rfi") {
    if (recommended === "raise" && heroAction === "fold") {
      return "open-folded too tight";
    }

    if (recommended === "raise" && ["call", "check"].includes(heroAction)) {
      return "missed an open";
    }

    if (recommended === "fold" && heroAction === "raise") {
      return "opened too wide";
    }

    return "";
  }

  if (range.kind === "vsRfi") {
    if (recommended === "fold" && heroAction === "call") {
      return "defended too wide";
    }

    if (recommended === "fold" && heroAction === "threeBet") {
      return "3-bet too wide";
    }

    if (recommended !== "fold" && heroAction === "fold") {
      return "over-folded a defend hand";
    }

    if (recommended === "threeBet" && heroAction === "call") {
      return "flatted a 3-bet hand";
    }

    if (recommended === "call" && heroAction === "threeBet") {
      return "3-bet a call hand";
    }

    return "";
  }

  if (range.kind === "vs3bet") {
    if (recommended === "fold" && ["call", "fourBet"].includes(heroAction)) {
      return "continued too wide vs 3-bet";
    }

    if (recommended !== "fold" && heroAction === "fold") {
      return "over-folded vs 3-bet";
    }

    if (recommended === "fourBet" && heroAction === "call") {
      return "flatted a 4-bet hand";
    }

    if (recommended === "call" && heroAction === "fourBet") {
      return "4-bet a call hand";
    }
  }

  return "";
}

const RANKS = ["A", "K", "Q", "J", "T", "9", "8", "7", "6", "5", "4", "3", "2"];

function cellRow(handKey) {
  if (!handKey) {
    return -1;
  }

  const first = RANKS.indexOf(handKey[0]);
  const second = RANKS.indexOf(handKey[1]);
  return handKey.length === 2 || handKey[2] === "s" ? first : second;
}

function cellColumn(handKey) {
  if (!handKey) {
    return -1;
  }

  const first = RANKS.indexOf(handKey[0]);
  const second = RANKS.indexOf(handKey[1]);
  return handKey.length === 2 || handKey[2] === "o" ? first : second;
}
