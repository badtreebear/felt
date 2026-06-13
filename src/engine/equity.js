import pokerSolver from "pokersolver";
import { createDeck, createRng, RANKS } from "./deck.js";

const { Hand } = pokerSolver;
const DEFAULT_PROGRESS_EVERY = 5000;
const MAX_RANGE_ATTEMPTS = 2000;

export function runEquitySimulation({
  heroCards,
  board = [],
  opponents,
  villains,
  iterations = 10000,
  seed = "felt-equity",
  progressEvery = DEFAULT_PROGRESS_EVERY,
  timeLimitMs = 0,
  onProgress,
} = {}) {
  const cleanHero = normalizeCards(heroCards, "heroCards");
  const cleanBoard = normalizeCards(board, "board");
  const cleanOpponents = (villains || opponents || [{ type: "random" }]).map(normalizeOpponent);

  validateKnownCards(cleanHero, cleanBoard, cleanOpponents);

  const exactResult = maybeRunExact({
    heroCards: cleanHero,
    board: cleanBoard,
    opponents: cleanOpponents,
  });

  if (exactResult) {
    onProgress?.(exactResult);
    return exactResult;
  }

  return runMonteCarlo({
    heroCards: cleanHero,
    board: cleanBoard,
    opponents: cleanOpponents,
    iterations,
    seed,
    progressEvery,
    timeLimitMs,
    onProgress,
  });
}

function maybeRunExact({ heroCards, board, opponents }) {
  if (board.length === 5 && opponents.length === 1 && opponents[0].type === "random") {
    return enumerateOneRandomRiver({ heroCards, board });
  }

  const allExact = opponents.every((opponent) => opponent.type === "cards");
  const missingBoardCards = 5 - board.length;

  if (allExact && missingBoardCards >= 0 && missingBoardCards <= 2) {
    return enumerateBoardRunouts({
      heroCards,
      board,
      opponents,
      missingBoardCards,
    });
  }

  return null;
}

function enumerateOneRandomRiver({ heroCards, board }) {
  const known = new Set([...heroCards, ...board]);
  const remaining = createDeck().filter((card) => !known.has(card));
  const tally = createTally();

  for (const opponentCards of combinations(remaining, 2)) {
    scoreOutcome({
      tally,
      heroCards,
      board,
      opponentHands: [opponentCards],
    });
  }

  return summarizeTally(tally, { exact: true, opponentCount: 1 });
}

function enumerateBoardRunouts({ heroCards, board, opponents, missingBoardCards }) {
  const exactOpponentHands = opponents.map((opponent) => opponent.cards);
  const known = new Set([...heroCards, ...board, ...exactOpponentHands.flat()]);
  const remaining = createDeck().filter((card) => !known.has(card));
  const tally = createTally();

  for (const boardFill of combinations(remaining, missingBoardCards)) {
    scoreOutcome({
      tally,
      heroCards,
      board: [...board, ...boardFill],
      opponentHands: exactOpponentHands,
    });
  }

  return summarizeTally(tally, { exact: true, opponentCount: opponents.length });
}

function runMonteCarlo({
  heroCards,
  board,
  opponents,
  iterations,
  seed,
  progressEvery,
  timeLimitMs,
  onProgress,
}) {
  const targetIterations = Math.max(1, Math.floor(Number(iterations) || 1));
  const publishEvery = Math.max(1, Math.floor(Number(progressEvery) || DEFAULT_PROGRESS_EVERY));
  const rng = createRng(seed);
  const tally = createTally();
  const timeLimited = Number.isFinite(timeLimitMs) && timeLimitMs > 0;
  const start = Date.now();
  const exactOpponentCards = opponents
    .filter((opponent) => opponent.type === "cards")
    .flatMap((opponent) => opponent.cards);
  const baseKnown = new Set([...heroCards, ...board, ...exactOpponentCards]);
  const baseDeck = createDeck().filter((card) => !baseKnown.has(card));
  const missingBoardCards = 5 - board.length;

  if (missingBoardCards < 0) {
    throw new Error("Board cannot contain more than five cards.");
  }

  for (let index = 0; index < targetIterations; index += 1) {
    const deck = [...baseDeck];
    const opponentHands = opponents.map((opponent) => {
      if (opponent.type === "cards") {
        return opponent.cards;
      }

      if (opponent.type === "range") {
        return drawWeightedRangeHand(deck, rng, opponent.range);
      }

      return drawCards(deck, rng, 2);
    });
    const fullBoard = [...board, ...drawCards(deck, rng, missingBoardCards)];

    scoreOutcome({
      tally,
      heroCards,
      board: fullBoard,
      opponentHands,
    });

    if ((index + 1) % publishEvery === 0) {
      onProgress?.(summarizeTally(tally, {
        exact: false,
        opponentCount: opponents.length,
      }));
    }

    if (timeLimited && (index + 1) % 250 === 0 && Date.now() - start >= timeLimitMs) {
      break;
    }
  }

  return summarizeTally(tally, { exact: false, opponentCount: opponents.length });
}

function scoreOutcome({ tally, heroCards, board, opponentHands }) {
  const heroHand = Hand.solve([...heroCards, ...board]);
  const solvedHands = [
    heroHand,
    ...opponentHands.map((cards) => Hand.solve([...cards, ...board])),
  ];
  const winners = Hand.winners(solvedHands);

  tally.iterations += 1;

  if (!winners.includes(heroHand)) {
    tally.losses += 1;
    return;
  }

  const heroShare = 1 / winners.length;
  tally.share += heroShare;

  if (winners.length === 1) {
    tally.wins += 1;
  } else {
    tally.ties += 1;
  }
}

function summarizeTally(tally, { exact, opponentCount }) {
  const iterations = Math.max(1, tally.iterations);
  const heroEquity = tally.share / iterations;

  return {
    heroEquity,
    winRate: tally.wins / iterations,
    tieRate: tally.ties / iterations,
    lossRate: tally.losses / iterations,
    equityCI: exact ? 0 : confidenceHalfWidth(heroEquity, iterations),
    iterations: tally.iterations,
    exact,
    opponentCount,
  };
}

function confidenceHalfWidth(rate, iterations) {
  if (iterations <= 0) {
    return 0;
  }

  return 1.96 * Math.sqrt((rate * (1 - rate)) / iterations);
}

function createTally() {
  return {
    iterations: 0,
    wins: 0,
    ties: 0,
    losses: 0,
    share: 0,
  };
}

function drawCards(deck, rng, count) {
  const cards = [];

  for (let index = 0; index < count; index += 1) {
    const cardIndex = Math.floor(rng() * deck.length);
    cards.push(deck.splice(cardIndex, 1)[0]);
  }

  return cards;
}

function drawWeightedRangeHand(deck, rng, range) {
  const available = range.filter((combo) => combo.cards.every((card) => deck.includes(card)));
  const totalWeight = available.reduce((sum, combo) => sum + combo.weight, 0);

  if (available.length === 0 || totalWeight <= 0) {
    throw new Error("Villain range is fully blocked by known cards.");
  }

  let target = rng() * totalWeight;
  const selected = available.find((combo) => {
    target -= combo.weight;
    return target <= 0;
  }) || available[available.length - 1];

  selected.cards.forEach((card) => removeCard(deck, card));
  return selected.cards;
}

export function comboInRange(cards, grid) {
  if (!Array.isArray(grid) || grid.length !== RANKS.length) {
    return true;
  }

  const [first, second] = cards;
  const firstRank = first.slice(0, -1);
  const secondRank = second.slice(0, -1);
  const firstSuit = first.slice(-1);
  const secondSuit = second.slice(-1);
  const firstIndex = RANKS.indexOf(firstRank);
  const secondIndex = RANKS.indexOf(secondRank);

  if (firstIndex < 0 || secondIndex < 0) {
    return false;
  }

  if (firstIndex === secondIndex) {
    return Number(grid[firstIndex]?.[secondIndex] || 0) > 0;
  }

  const high = Math.min(firstIndex, secondIndex);
  const low = Math.max(firstIndex, secondIndex);
  const row = firstSuit === secondSuit ? high : low;
  const column = firstSuit === secondSuit ? low : high;

  return Number(grid[row]?.[column] || 0) > 0;
}

function removeCard(deck, card) {
  const index = deck.indexOf(card);

  if (index >= 0) {
    deck.splice(index, 1);
  }
}

function* combinations(cards, count, start = 0, prefix = []) {
  if (count === 0) {
    yield prefix;
    return;
  }

  for (let index = start; index <= cards.length - count; index += 1) {
    yield* combinations(cards, count - 1, index + 1, [...prefix, cards[index]]);
  }
}

function normalizeOpponent(opponent) {
  if (Array.isArray(opponent)) {
    return { type: "cards", cards: normalizeCards(opponent, "opponent cards") };
  }

  if (opponent?.type === "cards" || opponent?.type === "exact" || opponent?.cards) {
    return { type: "cards", cards: normalizeCards(opponent.cards, "opponent cards") };
  }

  if (opponent?.type === "range") {
    return { type: "range", range: normalizeWeightedRange(opponent.range) };
  }

  return { type: "random" };
}

function normalizeWeightedRange(range) {
  if (!Array.isArray(range)) {
    throw new Error("Range villains require an expanded combo list.");
  }

  const normalized = range.map((combo) => {
    const cards = normalizeCards(combo.cards, "range combo cards");
    const weight = Number(combo.weight ?? 1);

    if (cards.length !== 2) {
      throw new Error("Range combos must contain exactly two cards.");
    }

    if (new Set(cards).size !== cards.length) {
      throw new Error("Range combo cards cannot contain duplicates.");
    }

    if (!Number.isFinite(weight) || weight <= 0) {
      throw new Error("Range combo weights must be positive numbers.");
    }

    return {
      hand: combo.hand || cards.join(""),
      cards,
      weight,
    };
  });

  if (normalized.length === 0) {
    throw new Error("Range villains require at least one combo.");
  }

  return normalized;
}

function normalizeCards(cards, label) {
  if (!Array.isArray(cards)) {
    throw new Error(`${label} must be an array.`);
  }

  return cards.map((card) => {
    if (!/^(A|K|Q|J|T|[2-9])[shdc]$/.test(card)) {
      throw new Error(`Invalid card notation: ${card}`);
    }

    return card;
  });
}

function validateKnownCards(heroCards, board, opponents) {
  if (heroCards.length !== 2) {
    throw new Error("Hero must have exactly two cards.");
  }

  if (board.length > 5) {
    throw new Error("Board cannot contain more than five cards.");
  }

  const exactOpponentCards = opponents
    .filter((opponent) => opponent.type === "cards")
    .flatMap((opponent) => {
      if (opponent.cards.length !== 2) {
        throw new Error("Card villains must have exactly two cards.");
      }

      return opponent.cards;
    });
  const knownCards = [...heroCards, ...board, ...exactOpponentCards];

  if (new Set(knownCards).size !== knownCards.length) {
    throw new Error("Known cards cannot contain duplicates.");
  }
}
