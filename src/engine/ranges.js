import { RANKS, SUITS } from "./deck.js";

export const RFI_POSITIONS_9MAX = ["UTG", "UTG+1", "UTG+2", "LJ", "HJ", "CO", "BTN"];
const PREFLOP_TOTAL_COMBOS = 1326;
export const ACTION_RANGE_ACTIONS = [
  "threeBetValue",
  "threeBetBluff",
  "fourBetValue",
  "fourBetBluff",
  "call",
];

export function validateRangeChart(chart) {
  if (!chart || typeof chart !== "object") {
    throw new Error("Range chart must be an object.");
  }

  if (!chart.meta || typeof chart.meta !== "object") {
    throw new Error("Range chart is missing meta.");
  }

  if (chart.meta.source === undefined || chart.meta.source === "") {
    throw new Error("Range chart meta.source is required.");
  }

  if (!Number.isInteger(chart.meta.tableSize) || chart.meta.tableSize < 2 || chart.meta.tableSize > 9) {
    throw new Error("Range chart meta.tableSize must be an integer from 2 to 9.");
  }

  if (!chart.positions || typeof chart.positions !== "object") {
    throw new Error("Range chart is missing positions.");
  }

  Object.entries(chart.positions).forEach(([position, range]) => {
    if (!range || typeof range !== "object" || Array.isArray(range)) {
      throw new Error(`Range for ${position} must be an object.`);
    }

    Object.entries(range).forEach(([hand, value]) => {
      if (!isCanonicalHandKey(hand)) {
        throw new Error(`Unknown hand key in ${position}: ${hand}`);
      }

      if (!Number.isFinite(value) || value < 0 || value > 1) {
        throw new Error(`Range value for ${position} ${hand} must be from 0 to 1.`);
      }
    });
  });

  return chart;
}

export function validateRfiChart(chart, { positions = RFI_POSITIONS_9MAX } = {}) {
  validateRangeChart(chart);

  if (!chart.meta.comboCounts || typeof chart.meta.comboCounts !== "object") {
    throw new Error("RFI chart meta.comboCounts is required.");
  }

  const expected = new Set(positions);
  const actual = Object.keys(chart.positions);
  const unexpected = actual.filter((position) => !expected.has(position));

  if (unexpected.length) {
    throw new Error(`RFI chart has unexpected position: ${unexpected[0]}`);
  }

  positions.forEach((position) => {
    if (!chart.positions[position]) {
      throw new Error(`RFI chart is missing position: ${position}`);
    }

    const expectedCombos = chart.meta.comboCounts[position];

    if (!Number.isInteger(expectedCombos) || expectedCombos < 0) {
      throw new Error(`RFI chart meta.comboCounts.${position} must be a non-negative integer.`);
    }

    const expandedCombos = expandPositionRange(chart.positions[position]).length;

    if (expandedCombos !== expectedCombos) {
      throw new Error(`RFI chart combo count mismatch for ${position}: expected ${expectedCombos}, got ${expandedCombos}.`);
    }
  });

  for (let index = 1; index < positions.length; index += 1) {
    const previous = chart.meta.comboCounts[positions[index - 1]];
    const current = chart.meta.comboCounts[positions[index]];

    if (previous > current) {
      throw new Error(`RFI chart combo counts must widen monotonically: ${positions[index - 1]} > ${positions[index]}.`);
    }
  }

  return chart;
}

export function validateVsRfiChart(chart) {
  validateActionRangeChart(chart);

  Object.entries(chart.spots).forEach(([key, spot]) => {
    if (!spot.responderPosition || typeof spot.responderPosition !== "string") {
      throw new Error(`Facing RFI spot ${key} is missing responderPosition.`);
    }

    if (!Array.isArray(spot.openerPositions) || spot.openerPositions.length === 0) {
      throw new Error(`Facing RFI spot ${key} is missing openerPositions.`);
    }

    if (!spot.comboCounts || typeof spot.comboCounts !== "object") {
      throw new Error(`Facing RFI spot ${key} is missing comboCounts.`);
    }

    const actualCounts = actionRangeComboCounts(spot.actions);
    Object.entries(actualCounts).forEach(([action, count]) => {
      if (spot.comboCounts[action] !== count) {
        throw new Error(`Facing RFI combo count mismatch for ${key} ${action}: expected ${spot.comboCounts[action]}, got ${count}.`);
      }
    });
  });

  return chart;
}

export function validateVsThreeBetChart(chart) {
  validateActionRangeChart(chart);

  Object.entries(chart.spots).forEach(([key, spot]) => {
    if (!spot.openerPosition || typeof spot.openerPosition !== "string") {
      throw new Error(`Facing 3-bet spot ${key} is missing openerPosition.`);
    }

    if (!Array.isArray(spot.threeBettorPositions) || spot.threeBettorPositions.length === 0) {
      throw new Error(`Facing 3-bet spot ${key} is missing threeBettorPositions.`);
    }

    if (!Number.isInteger(spot.openingRangeCombos) || spot.openingRangeCombos < 0) {
      throw new Error(`Facing 3-bet spot ${key} is missing openingRangeCombos.`);
    }

    if (!Number.isInteger(spot.foldToThreeBetCombos) || spot.foldToThreeBetCombos < 0) {
      throw new Error(`Facing 3-bet spot ${key} is missing foldToThreeBetCombos.`);
    }

    if (!Number.isInteger(spot.notInOpeningRangeCombos) || spot.notInOpeningRangeCombos < 0) {
      throw new Error(`Facing 3-bet spot ${key} is missing notInOpeningRangeCombos.`);
    }

    if (!spot.comboCounts || typeof spot.comboCounts !== "object") {
      throw new Error(`Facing 3-bet spot ${key} is missing comboCounts.`);
    }

    const actualCounts = actionRangeComboCounts(spot.actions);
    Object.entries(actualCounts).forEach(([action, count]) => {
      if (spot.comboCounts[action] !== count) {
        throw new Error(`Facing 3-bet combo count mismatch for ${key} ${action}: expected ${spot.comboCounts[action]}, got ${count}.`);
      }
    });

    const continueCombos = Object.values(actualCounts).reduce((sum, count) => sum + count, 0);
    const rangeCombos = continueCombos + spot.foldToThreeBetCombos;

    if (rangeCombos !== spot.openingRangeCombos) {
      throw new Error(`Facing 3-bet opening range mismatch for ${key}: expected ${spot.openingRangeCombos}, got ${rangeCombos}.`);
    }

    const totalCombos = rangeCombos + spot.notInOpeningRangeCombos;

    if (totalCombos !== PREFLOP_TOTAL_COMBOS) {
      throw new Error(`Facing 3-bet total combo mismatch for ${key}: expected ${PREFLOP_TOTAL_COMBOS}, got ${totalCombos}.`);
    }

    validateComboPercentages({ key, spot, actualCounts });
  });

  return chart;
}

export function validateActionRangeChart(chart) {
  if (!chart || typeof chart !== "object") {
    throw new Error("Action range chart must be an object.");
  }

  if (!chart.meta || typeof chart.meta !== "object") {
    throw new Error("Action range chart is missing meta.");
  }

  if (chart.meta.source === undefined || chart.meta.source === "") {
    throw new Error("Action range chart meta.source is required.");
  }

  if (!Number.isInteger(chart.meta.tableSize) || chart.meta.tableSize < 2 || chart.meta.tableSize > 9) {
    throw new Error("Action range chart meta.tableSize must be an integer from 2 to 9.");
  }

  if (!chart.spots || typeof chart.spots !== "object") {
    throw new Error("Action range chart is missing spots.");
  }

  Object.entries(chart.spots).forEach(([key, spot]) => {
    if (!spot || typeof spot !== "object" || Array.isArray(spot)) {
      throw new Error(`Action range spot ${key} must be an object.`);
    }

    if (!spot.actions || typeof spot.actions !== "object" || Array.isArray(spot.actions)) {
      throw new Error(`Action range spot ${key} is missing actions.`);
    }

    Object.entries(spot.actions).forEach(([hand, action]) => {
      if (!isCanonicalHandKey(hand)) {
        throw new Error(`Unknown hand key in ${key}: ${hand}`);
      }

      if (!ACTION_RANGE_ACTIONS.includes(action)) {
        throw new Error(`Unknown action range value in ${key} ${hand}: ${action}`);
      }
    });
  });

  return chart;
}

export function rangeToGrid(positionRange) {
  const grid = Array.from({ length: RANKS.length }, () => Array.from({ length: RANKS.length }, () => 0));

  Object.entries(positionRange || {}).forEach(([hand, value]) => {
    const cell = handKeyToCell(hand);
    grid[cell.row][cell.column] = value;
  });

  return grid;
}

export function actionRangeToGrid(actionRange) {
  const grid = Array.from({ length: RANKS.length }, () => Array.from({ length: RANKS.length }, () => null));

  Object.entries(actionRange || {}).forEach(([hand, action]) => {
    const cell = handKeyToCell(hand);
    grid[cell.row][cell.column] = { action, weight: 1 };
  });

  return grid;
}

export function expandPositionRange(positionRange) {
  return Object.entries(positionRange || {})
    .filter(([, weight]) => weight > 0)
    .flatMap(([hand, weight]) => handKeyToCombos(hand).map((cards) => ({
      hand,
      cards,
      weight,
    })));
}

export function actionRangeComboCounts(actionRange) {
  // Combo counts per action; consumed by contextual ranges + chart validation.
  return Object.entries(actionRange || {}).reduce((counts, [hand, action]) => {
    counts[action] = (counts[action] || 0) + handKeyToCombos(hand).length;
    return counts;
  }, {});
}

function validateComboPercentages({ key, spot, actualCounts }) {
  if (!spot.comboPercentages || typeof spot.comboPercentages !== "object") {
    throw new Error(`Facing 3-bet spot ${key} is missing comboPercentages.`);
  }

  if (!spot.openingRangePercentages || typeof spot.openingRangePercentages !== "object") {
    throw new Error(`Facing 3-bet spot ${key} is missing openingRangePercentages.`);
  }

  const counts = {
    ...actualCounts,
    foldToThreeBet: spot.foldToThreeBetCombos,
    notInOpeningRange: spot.notInOpeningRangeCombos,
  };

  Object.entries(counts).forEach(([action, count]) => {
    const expected = roundPercentage(count, PREFLOP_TOTAL_COMBOS);

    if (spot.comboPercentages[action] !== expected) {
      throw new Error(`Facing 3-bet combo percentage mismatch for ${key} ${action}: expected ${expected}, got ${spot.comboPercentages[action]}.`);
    }
  });

  Object.entries({
    ...actualCounts,
    foldToThreeBet: spot.foldToThreeBetCombos,
  }).forEach(([action, count]) => {
    const expected = roundPercentage(count, spot.openingRangeCombos);

    if (spot.openingRangePercentages[action] !== expected) {
      throw new Error(`Facing 3-bet opening range percentage mismatch for ${key} ${action}: expected ${expected}, got ${spot.openingRangePercentages[action]}.`);
    }
  });
}

function roundPercentage(count, total) {
  if (!total) {
    return 0;
  }

  return Math.round((count / total) * 1000) / 10;
}

export function getChartPositionRange(chart, position) {
  validateRangeChart(chart);

  if (!chart.positions[position]) {
    throw new Error(`Range chart has no position: ${position}`);
  }

  return chart.positions[position];
}

export function handKeyToCombos(hand) {
  if (!isCanonicalHandKey(hand)) {
    throw new Error(`Unknown hand key: ${hand}`);
  }

  const firstRank = hand[0];
  const secondRank = hand[1];

  if (hand.length === 2) {
    const combos = [];

    for (let first = 0; first < SUITS.length - 1; first += 1) {
      for (let second = first + 1; second < SUITS.length; second += 1) {
        combos.push([`${firstRank}${SUITS[first]}`, `${firstRank}${SUITS[second]}`]);
      }
    }

    return combos;
  }

  if (hand[2] === "s") {
    return SUITS.map((suit) => [`${firstRank}${suit}`, `${secondRank}${suit}`]);
  }

  return SUITS.flatMap((firstSuit) => (
    SUITS
      .filter((secondSuit) => secondSuit !== firstSuit)
      .map((secondSuit) => [`${firstRank}${firstSuit}`, `${secondRank}${secondSuit}`])
  ));
}

export function isCanonicalHandKey(hand) {
  if (typeof hand !== "string") {
    return false;
  }

  if (/^(A|K|Q|J|T|[2-9])\1$/.test(hand)) {
    return true;
  }

  if (!/^(A|K|Q|J|T|[2-9]){2}[so]$/.test(hand)) {
    return false;
  }

  const firstIndex = RANKS.indexOf(hand[0]);
  const secondIndex = RANKS.indexOf(hand[1]);

  return firstIndex >= 0 && secondIndex >= 0 && firstIndex < secondIndex;
}

function handKeyToCell(hand) {
  if (!isCanonicalHandKey(hand)) {
    throw new Error(`Unknown hand key: ${hand}`);
  }

  const firstIndex = RANKS.indexOf(hand[0]);
  const secondIndex = RANKS.indexOf(hand[1]);

  if (hand.length === 2) {
    return { row: firstIndex, column: firstIndex };
  }

  if (hand[2] === "s") {
    return { row: firstIndex, column: secondIndex };
  }

  return { row: secondIndex, column: firstIndex };
}
