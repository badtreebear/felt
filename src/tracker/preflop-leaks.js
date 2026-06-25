import { getRangeForSpot } from "../data/ranges/contextual-ranges.js";
import { canonicalHandKey } from "../engine/player-model.js";

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
  };
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
