import pokerSolver from "pokersolver";
import { boardTextureScore } from "./bet-sizing.js";

const { Hand } = pokerSolver;

// Board-threat enumerator (Phase 15, slice 15.1). Pure + deterministic, no DOM.
//
// Given the community board (and optionally the hero's hole cards), list the
// made-hand categories the board now makes POSSIBLE for an opponent, and flag
// which of them BEAT the hero's current made hand. This is the data behind the
// "what beats you" readout — the antidote to judging your hand by its ABSOLUTE
// rank instead of its strength RELATIVE to the board + villain ranges.
//
// Hand ranking is delegated to pokersolver (same evaluator as resolveShowdown);
// we never re-implement hand ranking here.
//
// Known, deliberate limitation: beatsHero is decided at the CATEGORY level only
// (a flush beats your two pair). We do NOT model a higher hand of the SAME
// category (a bigger flash over your flush) — that is combinatorially heavy and
// out of scope for a teaching readout. Same-category threats report
// beatsHero:false and carry note:"same-category" so the UI can phrase carefully.

const RANK_VALUE = {
  A: 14, K: 13, Q: 12, J: 11, T: 10,
  9: 9, 8: 8, 7: 7, 6: 6, 5: 5, 4: 4, 3: 3, 2: 2,
};

// Higher ordinal beats lower. Keyed by pokersolver hand names.
const CATEGORY_ORDER = {
  "High Card": 1,
  Pair: 2,
  "Two Pair": 3,
  "Three of a Kind": 4,
  Straight: 5,
  Flush: 6,
  "Full House": 7,
  "Four of a Kind": 8,
  "Straight Flush": 9,
  "Royal Flush": 9,
};

function parseCard(card) {
  const text = String(card || "").trim();
  if (text.length < 2) {
    return null;
  }
  const rank = text[0].toUpperCase();
  const suit = text[1].toLowerCase();
  const value = RANK_VALUE[rank];
  if (!value || !"shdc".includes(suit)) {
    return null;
  }
  return { rank, suit, value };
}

function parseBoard(board) {
  return (Array.isArray(board) ? board : [])
    .map(parseCard)
    .filter(Boolean);
}

function countBy(items, key) {
  const counts = {};
  for (const item of items) {
    const k = item[key];
    counts[k] = (counts[k] || 0) + 1;
  }
  return counts;
}

// Distinct rank-values present, with Ace also counted as 1 for the wheel.
function straightValues(cards) {
  const values = new Set(cards.map((c) => c.value));
  if (values.has(14)) {
    values.add(1);
  }
  return values;
}

// A straight is possible if some run of 5 consecutive ranks contains >=3 board
// ranks (the opponent supplies the other 2 from their hand).
function straightPossible(values) {
  for (let start = 1; start <= 10; start += 1) {
    let hits = 0;
    for (let v = start; v < start + 5; v += 1) {
      if (values.has(v)) {
        hits += 1;
      }
    }
    if (hits >= 3) {
      return true;
    }
  }
  return false;
}

// Conservative open straight-draw hint (board not yet complete): a 5-run holding
// exactly 2 board ranks, within a 4-span so they're genuinely connected.
function straightDrawPossible(cards) {
  const values = straightValues(cards);
  for (let start = 1; start <= 10; start += 1) {
    let hits = 0;
    for (let v = start; v < start + 5; v += 1) {
      if (values.has(v)) {
        hits += 1;
      }
    }
    if (hits === 2) {
      return true;
    }
  }
  return false;
}

// Straight flush: same window test, restricted to a single suit's board cards.
function straightFlushPossible(cards) {
  for (const suit of ["s", "h", "d", "c"]) {
    const suited = cards.filter((c) => c.suit === suit);
    if (suited.length >= 3 && straightPossible(straightValues(suited))) {
      return true;
    }
  }
  return false;
}

function heroMade(heroCards, board) {
  const cards = [...(heroCards || []), ...(board || [])].filter(Boolean);
  if (!Hand || cards.length < 5) {
    return null;
  }
  try {
    const solved = Hand.solve(cards);
    return {
      name: solved.name,
      ordinal: CATEGORY_ORDER[solved.name] || 1,
      description: solved.descr,
    };
  } catch {
    return null;
  }
}

/**
 * Enumerate the made-hand threats the board enables and which beat the hero.
 *
 * @param {string[]} board - community cards, e.g. ["Ah","Kd","7h"]
 * @param {string[]} [heroCards] - hero hole cards, e.g. ["Qs","Qc"]
 * @returns {{ threats: Array<{kind,label,possible,beatsHero,note?,draw?}>,
 *            wetness: number, hero: {name,ordinal,description}|null }}
 */
export function boardThreats(board, heroCards) {
  const cards = parseBoard(board);
  const wetness = boardTextureScore(Array.isArray(board) ? board : []);
  const hero = heroMade(heroCards, board);
  const heroOrdinal = hero?.ordinal ?? 0;

  // Too little board to read threats (preflop / pre-flop-deal).
  if (cards.length < 3) {
    return { threats: [], wetness, hero };
  }

  const suitCounts = countBy(cards, "suit");
  const rankCounts = countBy(cards, "rank");
  const maxSuit = Math.max(0, ...Object.values(suitCounts));
  const rankCountValues = Object.values(rankCounts);
  const boardPaired = rankCountValues.some((n) => n >= 2);
  const boardTrips = rankCountValues.some((n) => n >= 3);
  const distinctRanks = Object.keys(rankCounts).length;
  const values = straightValues(cards);
  const complete = cards.length >= 5;

  // ordinal -> definition of each made-hand category and whether the board
  // enables it for an opponent.
  const candidates = [
    {
      ordinal: 9,
      kind: "straightFlush",
      label: "Straight flush",
      possible: straightFlushPossible(cards),
    },
    {
      ordinal: 8,
      kind: "quads",
      label: "Four of a kind",
      // Needs a board pair (opp holds the other two) or board trips (opp holds the 4th).
      possible: boardPaired,
    },
    {
      ordinal: 7,
      kind: "fullHouse",
      label: "Full house",
      possible: boardPaired || boardTrips,
    },
    {
      ordinal: 6,
      kind: "flush",
      label: "Flush",
      possible: maxSuit >= 3,
    },
    {
      ordinal: 5,
      kind: "straight",
      label: "Straight",
      possible: straightPossible(values),
    },
    {
      ordinal: 4,
      kind: "set",
      label: "Set / trips",
      // A set (pocket pair matching a board card) or trips is essentially always
      // available on a normal board with an unpaired rank present.
      possible: distinctRanks >= 1,
    },
    {
      ordinal: 3,
      kind: "twoPair",
      label: "Two pair",
      possible: distinctRanks >= 2,
    },
  ];

  const threats = candidates
    .filter((c) => c.possible)
    .map((c) => {
      const sameCategory = c.ordinal === heroOrdinal;
      return {
        kind: c.kind,
        label: c.label,
        possible: true,
        beatsHero: hero ? c.ordinal > heroOrdinal : null,
        ...(sameCategory ? { note: "same-category" } : {}),
      };
    });

  // Draw hints (board not yet complete) — danger flags, not current "beats you".
  if (!complete) {
    if (maxSuit === 2) {
      threats.push({ kind: "flushDraw", label: "Flush draw", possible: true, beatsHero: false, draw: true });
    }
    if (straightDrawPossible(cards)) {
      threats.push({ kind: "straightDraw", label: "Straight draw", possible: true, beatsHero: false, draw: true });
    }
  }

  return { threats, wetness, hero };
}

// Exposed for reuse by the relative-strength readout (slice 15.2) and tests.
export { heroMade, CATEGORY_ORDER };
