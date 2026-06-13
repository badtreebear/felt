import { RANKS, SUITS } from "./deck.js";

const REQUIRED_META_FIELDS = ["source", "url", "tableSize", "transcribedBy", "date"];

export function validateRangeChart(chart) {
  if (!chart || typeof chart !== "object") {
    throw new Error("Range chart must be an object.");
  }

  if (!chart.meta || typeof chart.meta !== "object") {
    throw new Error("Range chart is missing meta.");
  }

  REQUIRED_META_FIELDS.forEach((field) => {
    if (chart.meta[field] === undefined || chart.meta[field] === "") {
      throw new Error(`Range chart meta.${field} is required.`);
    }
  });

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

export function rangeToGrid(positionRange) {
  const grid = Array.from({ length: RANKS.length }, () => Array.from({ length: RANKS.length }, () => 0));

  Object.entries(positionRange || {}).forEach(([hand, value]) => {
    const cell = handKeyToCell(hand);
    grid[cell.row][cell.column] = value;
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
