import profiles from "../data/profiles.json";
import rfiChart from "../data/ranges/default-rfi-9max.json";
import { RANKS } from "./deck.js";
import { positionToRfiLabel } from "./positions.js";
import { expandPositionRange, handKeyToCombos, RFI_POSITIONS_9MAX, validateRfiChart } from "./ranges.js";

export const PROFILE_IDS = Object.keys(profiles);
export const PLAYER_PROFILES = profiles;

export const PLAYER_MODEL_CONSTANTS = {
  premiumHands: ["AA", "KK", "AKs"],
  sbOpenBaselineFactor: 0.85,
  bbDefendBaselineFactor: 0.75,
  openSizeBb: 2.5,
  sbOpenSizeBb: 3,
  threeBetMultiplierIp: 3,
  threeBetMultiplierOop: 3.5,
  fourBetMultiplier: 2.25,
  facingOpen: {
    valueThreeBetBase: 0.1,
    valueThreeBetAggressionScale: 0.07,
    bluffThreeBetAggressionScale: 0.12,
    continueBase: 0.58,
    continueRangeWidthScale: 0.16,
    passiveContinueScale: 0.12,
  },
  facingThreeBet: {
    fourBetBase: 0.045,
    fourBetAggressionScale: 0.04,
    continueBase: 0.28,
    continueRangeWidthScale: 0.1,
    passiveContinueScale: 0.08,
  },
};

const chart = validateRfiChart(rfiChart);
const handRanking = createHandRanking();
const handStrengthIndex = new Map(handRanking.map((entry, index) => [entry.hand, index]));

export function normalizeProfile(profileOrId = "standard") {
  if (typeof profileOrId === "string") {
    return profiles[profileOrId] ? { id: profileOrId, ...profiles[profileOrId] } : normalizeProfile("standard");
  }

  return {
    id: profileOrId.id || "custom",
    label: profileOrId.label || "Custom",
    rangeWidth: cleanDial(profileOrId.rangeWidth),
    aggression: cleanDial(profileOrId.aggression),
    sizing: cleanDial(profileOrId.sizing),
  };
}

export function getProfileOptions() {
  return PROFILE_IDS.map((id) => ({ id, ...profiles[id] }));
}

export function canonicalHandKey(cards) {
  if (!Array.isArray(cards) || cards.length !== 2) {
    return null;
  }

  const first = parseCard(cards[0]);
  const second = parseCard(cards[1]);

  if (!first || !second) {
    return null;
  }

  if (first.rank === second.rank) {
    return `${first.rank}${second.rank}`;
  }

  const firstIndex = RANKS.indexOf(first.rank);
  const secondIndex = RANKS.indexOf(second.rank);
  const high = firstIndex < secondIndex ? first : second;
  const low = firstIndex < secondIndex ? second : first;
  const suffix = high.suit === low.suit ? "s" : "o";

  return `${high.rank}${low.rank}${suffix}`;
}

export function adjustedOpeningRange({ position, profile = "standard" }) {
  const normalized = normalizeProfile(profile);
  const baseline = baselineRangeForPosition(position);
  const effectiveWidth = normalized.rangeWidth * baseline.widthFactor;
  const baseHands = new Set(Object.entries(baseline.range)
    .filter(([, value]) => value > 0)
    .map(([hand]) => hand));
  const targetCombos = Math.round(comboCountForHands(baseHands) * effectiveWidth);
  const hands = resizeRange(baseHands, targetCombos);

  return {
    position,
    chartPosition: baseline.chartPosition,
    profile: normalized,
    hands,
    range: Object.fromEntries([...hands].map((hand) => [hand, 1])),
    comboCount: comboCountForHands(hands),
    targetCombos,
    chartCombos: comboCountForHands(baseHands),
  };
}

export function comboCountForHands(hands) {
  return [...hands].reduce((sum, hand) => sum + handKeyToCombos(hand).length, 0);
}

export function handRankPercent(hand, hands) {
  const sorted = [...hands].sort(compareHandStrength);
  const index = sorted.indexOf(hand);

  if (index < 0) {
    return 1;
  }

  if (sorted.length <= 1) {
    return 0;
  }

  return index / (sorted.length - 1);
}

export function decideFacingOpen({ hand, position, profile }) {
  const adjusted = adjustedOpeningRange({ position, profile });

  if (!adjusted.hands.has(hand)) {
    return { action: "fold", adjusted };
  }

  const normalized = adjusted.profile;
  const strength = handRankPercent(hand, adjusted.hands);
  const constants = PLAYER_MODEL_CONSTANTS.facingOpen;
  const valueThreeBet = clamp(
    constants.valueThreeBetBase + (normalized.aggression - 1) * constants.valueThreeBetAggressionScale,
    0.04,
    0.24,
  );
  const bluffThreeBet = clamp((normalized.aggression - 1) * constants.bluffThreeBetAggressionScale, 0, 0.2);
  const continueBand = clamp(
    constants.continueBase
      + (normalized.rangeWidth - 1) * constants.continueRangeWidthScale
      + Math.max(0, 1 - normalized.aggression) * constants.passiveContinueScale,
    0.36,
    0.88,
  );

  if (strength <= valueThreeBet || strength >= 1 - bluffThreeBet) {
    return { action: "threeBet", adjusted, strength };
  }

  if (strength <= continueBand) {
    return { action: "call", adjusted, strength };
  }

  return { action: "fold", adjusted, strength };
}

export function decideFacingThreeBet({ hand, position, profile }) {
  const adjusted = adjustedOpeningRange({ position, profile });

  if (!adjusted.hands.has(hand)) {
    return { action: "fold", adjusted };
  }

  const normalized = adjusted.profile;
  const strength = handRankPercent(hand, adjusted.hands);
  const constants = PLAYER_MODEL_CONSTANTS.facingThreeBet;
  const fourBetBand = clamp(
    constants.fourBetBase + (normalized.aggression - 1) * constants.fourBetAggressionScale,
    0.02,
    0.14,
  );
  const continueBand = clamp(
    constants.continueBase
      + (normalized.rangeWidth - 1) * constants.continueRangeWidthScale
      + Math.max(0, 1 - normalized.aggression) * constants.passiveContinueScale,
    0.16,
    0.55,
  );

  if (strength <= fourBetBand) {
    return { action: "fourBet", adjusted, strength };
  }

  if (strength <= continueBand) {
    return { action: "call", adjusted, strength };
  }

  return { action: "fold", adjusted, strength };
}

export function openingSizeForPosition(position, profile = "standard") {
  const normalized = normalizeProfile(profile);
  const base = position === "SB" || position === "BTN/SB"
    ? PLAYER_MODEL_CONSTANTS.sbOpenSizeBb
    : PLAYER_MODEL_CONSTANTS.openSizeBb;

  return roundToHalfBb(base * normalized.sizing);
}

export function threeBetSize({ currentBet, position, profile = "standard", outOfPosition = false }) {
  const normalized = normalizeProfile(profile);
  const multiplier = outOfPosition
    ? PLAYER_MODEL_CONSTANTS.threeBetMultiplierOop
    : PLAYER_MODEL_CONSTANTS.threeBetMultiplierIp;

  return roundToHalfBb(currentBet * multiplier * normalized.sizing);
}

export function fourBetSize({ currentBet, profile = "standard" }) {
  const normalized = normalizeProfile(profile);
  return roundToHalfBb(currentBet * PLAYER_MODEL_CONSTANTS.fourBetMultiplier * normalized.sizing);
}

export function profileComboReport(positions = RFI_POSITIONS_9MAX) {
  return Object.fromEntries(PROFILE_IDS.map((profileId) => [
    profileId,
    Object.fromEntries(positions.map((position) => [
      position,
      adjustedOpeningRange({ position, profile: profileId }).comboCount,
    ])),
  ]));
}

function baselineRangeForPosition(position) {
  const chartPosition = positionToRfiLabel(position);

  if (chartPosition) {
    return { chartPosition, range: chart.positions[chartPosition], widthFactor: 1 };
  }

  if (position === "SB" || position === "BTN/SB") {
    return {
      chartPosition: "BTN",
      range: chart.positions.BTN,
      widthFactor: PLAYER_MODEL_CONSTANTS.sbOpenBaselineFactor,
    };
  }

  return {
    chartPosition: "BTN",
    range: chart.positions.BTN,
    widthFactor: PLAYER_MODEL_CONSTANTS.bbDefendBaselineFactor,
  };
}

function resizeRange(baseHands, targetCombos) {
  const hands = new Set(baseHands);
  const premiums = PLAYER_MODEL_CONSTANTS.premiumHands;
  const clampedTarget = clamp(targetCombos, 0, 1326);

  premiums.forEach((hand) => hands.add(hand));

  if (comboCountForHands(hands) < clampedTarget) {
    for (const { hand } of handRanking) {
      if (hands.has(hand)) {
        continue;
      }

      hands.add(hand);

      if (comboCountForHands(hands) >= clampedTarget) {
        break;
      }
    }
  } else {
    const removable = [...hands]
      .filter((hand) => !premiums.includes(hand))
      .sort((first, second) => compareHandStrength(second, first));

    for (const hand of removable) {
      const nextCount = comboCountForHands(hands) - handKeyToCombos(hand).length;

      if (nextCount < clampedTarget) {
        continue;
      }

      hands.delete(hand);
    }
  }

  premiums.forEach((hand) => hands.add(hand));
  return hands;
}

function createHandRanking() {
  return allHandKeys()
    .map((hand) => ({ hand, score: chartScore(hand) + heuristicScore(hand) }))
    .sort((first, second) => second.score - first.score);
}

function chartScore(hand) {
  const positionIndex = RFI_POSITIONS_9MAX.findIndex((position) => chart.positions[position]?.[hand] > 0);

  if (positionIndex >= 0) {
    return 10000 - positionIndex * 1000;
  }

  return 0;
}

function heuristicScore(hand) {
  const first = RANKS.indexOf(hand[0]);
  const second = RANKS.indexOf(hand[1]);
  const firstPower = RANKS.length - first;
  const secondPower = RANKS.length - second;

  if (hand.length === 2) {
    return 700 + firstPower * 30;
  }

  const suitedBonus = hand[2] === "s" ? 80 : 0;
  const gapPenalty = Math.max(0, second - first - 1) * 16;
  const broadwayBonus = first <= 4 && second <= 4 ? 70 : 0;
  return firstPower * 22 + secondPower * 12 + suitedBonus + broadwayBonus - gapPenalty;
}

function allHandKeys() {
  const hands = [];

  RANKS.forEach((firstRank, firstIndex) => {
    RANKS.forEach((secondRank, secondIndex) => {
      if (firstIndex === secondIndex) {
        hands.push(`${firstRank}${secondRank}`);
      } else if (firstIndex < secondIndex) {
        hands.push(`${firstRank}${secondRank}s`, `${firstRank}${secondRank}o`);
      }
    });
  });

  return hands;
}

function compareHandStrength(first, second) {
  return (handStrengthIndex.get(first) ?? 999) - (handStrengthIndex.get(second) ?? 999);
}

function cleanDial(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 1;
}

function parseCard(card) {
  if (typeof card !== "string" || card.length < 2) {
    return null;
  }

  const rank = card.slice(0, -1);
  const suit = card.slice(-1);

  if (!RANKS.includes(rank) || !/^[shdc]$/.test(suit)) {
    return null;
  }

  return { rank, suit };
}

function roundToHalfBb(value) {
  return Math.max(1, Math.round(Number(value) * 2) / 2);
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}
