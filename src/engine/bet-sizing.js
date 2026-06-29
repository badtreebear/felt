import { RANKS } from "./deck.js";

// Equity-aware sizing guidance. Convention-based, informed by the hero's real
// equity and the board texture — NOT a solved/EV-optimal size. It does not model
// villain response per size (fold equity), so it suggests a sensible standard
// size rather than an exploitatively optimal one.
//
// One unified recommendation for every hero spot: when first in it sizes a bet,
// when facing a bet it sizes a raise. It always returns a pot-fraction (for the
// chip face) plus the worked bb amount (for the popover) and an `advice` flag
// saying whether betting/raising is actually the recommended line.

const ROUND_BB = 0.5;
const ALL_IN_COMMIT_RATIO = 0.8;

function rankValue(rank) {
  const index = RANKS.indexOf(rank);
  return index < 0 ? 0 : 14 - index; // A=14 .. 2=2
}

export function boardTextureScore(board = []) {
  const cards = Array.isArray(board) ? board.filter(Boolean) : [];

  if (cards.length < 3) {
    return 0; // preflop / no board -> treat as neutral-dry
  }

  const ranks = cards.map((card) => rankValue(card[0]));
  const suits = cards.map((card) => card[1]);

  let score = 0;

  const suitCounts = {};
  suits.forEach((suit) => { suitCounts[suit] = (suitCounts[suit] || 0) + 1; });
  const maxSuit = Math.max(...Object.values(suitCounts));
  if (maxSuit >= 3) {
    score += 0.5;
  } else if (maxSuit === 2) {
    score += 0.3;
  }

  const distinct = [...new Set(ranks)].sort((a, b) => a - b);
  let connect = 0;
  for (let i = 1; i < distinct.length; i += 1) {
    if (distinct[i] - distinct[i - 1] <= 2) {
      connect += 1;
    }
  }
  score += Math.min(0.5, connect * 0.25);

  if (ranks.length !== new Set(ranks).size) {
    score -= 0.2; // paired boards are drier
  }

  return clamp01(score);
}

export function recommendHeroSize({
  facingBet = false,
  pot = 0,
  stack = 0,
  equity = null,
  toCall = 0,
  board = [],
  minAmount = 0,
  maxAmount = 0,
} = {}) {
  const cleanPot = Math.max(0, Number(pot) || 0);
  const eq = normaliseEquity(equity);

  if (eq === null) {
    return { status: "pending" };
  }

  const texture = boardTextureScore(board);
  const mode = facingBet ? "raise" : "bet";

  // Whether aggression is actually the recommended line. Raising into a bet has
  // to beat just calling, so the bar to raise is higher than the bar to bet when
  // checked to: a middling hand that would happily bet for thin value first-in
  // should usually just call a bet rather than raise it. Keep the first-in
  // (bet) thresholds permissive and the facing-a-bet (raise) thresholds strict.
  const advice = facingBet
    ? (eq >= 0.7
      ? "value"
      : eq >= 0.6
        ? "thin"
        : "callFold")
    : (eq >= 0.6
      ? "value"
      : eq >= 0.45
        ? "thin"
        : "check");

  // Pot fraction for the standard size in this spot, widened on wetter boards.
  let fraction;
  if (advice === "value") {
    fraction = eq >= 0.75 ? 0.75 : 0.66;
  } else if (advice === "thin") {
    fraction = 0.45;
  } else {
    fraction = 0.33; // size you would use if you chose to bet/raise this thin
  }
  fraction = Math.min(1.25, fraction + texture * 0.25);

  // `cleanPot` is the FULL current pot (it already includes the bet/raises in
  // front of the hero). A pot-fraction raise sizes off the pot AFTER the hero
  // calls = cleanPot + toCall — so raise-to = call + fraction of that. (Using
  // 2 * toCall here double-counted the faced bet and over-sized raises in
  // raised/multiway pots.)
  const target = facingBet
    ? toCall + (cleanPot + toCall) * fraction
    : cleanPot * fraction;

  let amount = target;
  let shove = false;
  if (maxAmount > 0 && target >= maxAmount * ALL_IN_COMMIT_RATIO) {
    amount = maxAmount;
    shove = true;
  }
  amount = clampRound(amount, minAmount, maxAmount);

  return {
    status: "ready",
    mode,
    advice,
    fraction: round2(fraction),
    fractionPct: Math.round(fraction * 100),
    amount,
    shove,
    equity: round2(eq),
    texture: round2(texture),
    rationale: sizingRationale({ eq, fraction, texture, shove, mode, advice }),
  };
}

function sizingRationale({ eq, fraction, texture, shove, mode, advice }) {
  const pctText = `${Math.round(fraction * 100)}% of the pot`;
  const wetness = texture >= 0.6 ? "wet" : texture >= 0.3 ? "semi-wet" : "dry";
  const verb = mode === "raise" ? "raise" : "bet";

  if (shove) {
    return `Equity ~${pct(eq)} with a low stack-to-pot ratio — get it in.`;
  }

  if (advice === "value") {
    const strength = eq >= 0.75 ? "strong" : "solid";
    return `Equity ~${pct(eq)} (${strength}) on a ${wetness} board → ${verb} about ${pctText}.`;
  }

  if (advice === "thin") {
    return `Equity ~${pct(eq)} (thin value) on a ${wetness} board → a smaller ${verb} of about ${pctText}.`;
  }

  if (advice === "check") {
    return `Equity ~${pct(eq)} — too thin to bet for value; checking is fine. If you do bet, about ${pctText}.`;
  }

  // callFold
  return `Equity ~${pct(eq)} — this is a call/fold spot, not a raise. A raise here would be a bluff at about ${pctText}.`;
}

function normaliseEquity(equity) {
  if (equity === null || equity === undefined) {
    return null;
  }

  const value = Number(equity);
  return Number.isFinite(value) ? clamp01(value) : null;
}

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function clampRound(amount, minAmount, maxAmount) {
  let value = Math.round(amount / ROUND_BB) * ROUND_BB;

  if (Number.isFinite(minAmount) && minAmount > 0) {
    value = Math.max(value, minAmount);
  }

  if (Number.isFinite(maxAmount) && maxAmount > 0) {
    value = Math.min(value, maxAmount);
  }

  return Math.round(value * 100) / 100;
}

function round2(value) {
  return Math.round(Number(value) * 100) / 100;
}

function pct(value) {
  return `${Math.round(Number(value) * 100)}%`;
}
