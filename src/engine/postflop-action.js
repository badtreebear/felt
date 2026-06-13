import pokerSolver from "pokersolver";
import { boardForStreet } from "./deck.js";
import { normalizeProfile } from "./player-model.js";
import { getSeatPositions } from "./positions.js";

const { Hand } = pokerSolver;

export const POSTFLOP_STREETS = ["flop", "turn", "river"];

export const POSTFLOP_MODEL_CONSTANTS = {
  baseBetPotFraction: 0.5,
  minBetBb: 1,
  betThreshold: 1.85,
  betAggressionScale: 0.45,
  betRangeWidthScale: 0.15,
  callThreshold: 1.75,
  callRangeWidthScale: 0.4,
  callPassiveScale: 0.45,
  callAggressionScale: 0.2,
  cheapCallPotFraction: 0.2,
};

export function startPostflopStreet({ hand, config, street, seatProfiles, autoActionLimit = Infinity }) {
  if (!POSTFLOP_STREETS.includes(street)) {
    throw new Error(`Unsupported postflop street: ${street}`);
  }

  const previous = hand.postflop || hand.preflop;

  const canContinue = previous?.status === "streetComplete"
    || (previous?.status === "complete" && previous?.result === "wouldSeeFlop");

  if (!canContinue) {
    throw new Error("Postflop action requires a completed prior betting round.");
  }

  const board = boardForStreet(hand.boardRunout, street);
  const postflop = createInitialPostflopState({
    hand,
    config,
    previous,
    seatProfiles,
    street,
    board,
  });

  return runToHeroOrEnd(postflop, { autoActionLimit });
}

export function advancePostflopAction(postflop, { autoActionLimit = 1 } = {}) {
  if (!postflop || postflop.status !== "active") {
    return postflop;
  }

  return runToHeroOrEnd(postflop, { autoActionLimit });
}

export function applyHeroPostflopAction(postflop, input = {}, { autoActionLimit = Infinity } = {}) {
  if (!postflop || postflop.status !== "waitingHero") {
    return postflop;
  }

  const next = clonePostflop(postflop);
  const seat = next.heroSeat;
  const callAmount = amountToCall(next, seat);
  const action = input.action;

  if (action === "fold") {
    applyFold(next, seat);
  } else if (action === "bet" && callAmount <= 0) {
    applyBet(next, seat, cleanBetAmount(input.betAmount || suggestedHeroBet(next)));
  } else if (callAmount > 0) {
    applyCall(next, seat);
  } else {
    applyCheck(next, seat);
  }

  if (next.status === "waitingHero") {
    next.status = "active";
    next.currentSeat = null;
  }

  return runToHeroOrEnd(next, { autoActionLimit });
}

export function legalPostflopActions(postflop) {
  if (!postflop || postflop.status !== "waitingHero") {
    return { canAct: false, callAmount: 0, minBet: 0, maxBet: 0, canBet: false };
  }

  const callAmount = amountToCall(postflop, postflop.heroSeat);

  return {
    canAct: true,
    callAmount,
    minBet: POSTFLOP_MODEL_CONSTANTS.minBetBb,
    maxBet: postflop.stacks[postflop.heroSeat] || 0,
    canBet: callAmount <= 0 && (postflop.stacks[postflop.heroSeat] || 0) > 0,
  };
}

export function suggestedHeroBet(postflop) {
  if (!postflop) {
    return 1;
  }

  return betSizeForProfile({ pot: postflop.pot, stack: postflop.stacks[postflop.heroSeat], profile: "standard" });
}

export function liveSeatsForPostflop(postflop) {
  if (!postflop) {
    return [];
  }

  return activeSeats(postflop);
}

function createInitialPostflopState({ hand, config, previous, seatProfiles, street, board }) {
  const players = config.players;
  const heroSeat = config.heroSeat;
  const positions = getSeatPositions({ players, buttonSeat: hand.buttonSeat });
  const folded = { ...previous.folded };
  const allIn = { ...previous.allIn };
  const stacks = { ...previous.stacks };
  const contributions = { ...previous.contributions };
  const streetContributions = Object.fromEntries(Array.from({ length: players }, (_, seat) => [seat, 0]));
  const actionLog = [...previous.actionLog, streetDealLog({ street, board, heroSeat })];

  return {
    status: "active",
    result: null,
    winnerSeat: null,
    winnerSeats: [],
    heroSeat,
    players,
    buttonSeat: hand.buttonSeat,
    positions,
    seatProfiles,
    holeCards: hand.holeCards,
    board,
    street,
    pot: previous.pot,
    currentBet: 0,
    bettorSeat: null,
    currentSeat: null,
    contributions,
    streetContributions,
    stacks,
    folded,
    allIn,
    toAct: postflopOrder({ players, buttonSeat: hand.buttonSeat, folded, allIn }),
    actionLog,
  };
}

function runToHeroOrEnd(postflop, { autoActionLimit = Infinity } = {}) {
  const next = clonePostflop(postflop);
  let autoActions = 0;

  while (next.status === "active") {
    if (activeSeats(next).length === 1) {
      awardOnlyActivePlayer(next);
      break;
    }

    if (next.toAct.length === 0) {
      closeStreet(next);
      break;
    }

    const seat = next.toAct.shift();

    if (next.folded[seat] || next.allIn[seat]) {
      continue;
    }

    next.currentSeat = seat;

    if (seat === next.heroSeat) {
      next.status = "waitingHero";
      break;
    }

    if (autoActions >= autoActionLimit) {
      next.toAct.unshift(seat);
      next.currentSeat = null;
      break;
    }

    applyVillainDecision(next, seat);
    autoActions += 1;
  }

  return refreshDerived(next);
}

function applyVillainDecision(postflop, seat) {
  const callAmount = amountToCall(postflop, seat);
  const profile = profileForSeat(postflop, seat);
  const strength = handTextureScore({
    cards: postflop.holeCards[seat] || [],
    board: postflop.board,
  });

  if (callAmount <= 0) {
    if (shouldBet({ strength, profile })) {
      applyBet(postflop, seat, betSizeForProfile({
        pot: postflop.pot,
        stack: postflop.stacks[seat],
        profile,
      }));
    } else {
      applyCheck(postflop, seat);
    }
    return;
  }

  if (shouldCall({ strength, profile, callAmount, pot: postflop.pot })) {
    applyCall(postflop, seat);
  } else {
    applyFold(postflop, seat);
  }
}

function shouldBet({ strength, profile }) {
  const threshold = clamp(
    POSTFLOP_MODEL_CONSTANTS.betThreshold
      - (profile.aggression - 1) * POSTFLOP_MODEL_CONSTANTS.betAggressionScale
      - (profile.rangeWidth - 1) * POSTFLOP_MODEL_CONSTANTS.betRangeWidthScale,
    1.15,
    2.35,
  );

  return strength.score >= threshold;
}

function shouldCall({ strength, profile, callAmount, pot }) {
  const threshold = clamp(
    POSTFLOP_MODEL_CONSTANTS.callThreshold
      - (profile.rangeWidth - 1) * POSTFLOP_MODEL_CONSTANTS.callRangeWidthScale
      - Math.max(0, 1 - profile.aggression) * POSTFLOP_MODEL_CONSTANTS.callPassiveScale
      - Math.max(0, profile.aggression - 1) * POSTFLOP_MODEL_CONSTANTS.callAggressionScale,
    1.05,
    2.2,
  );
  const cheapCall = callAmount <= pot * POSTFLOP_MODEL_CONSTANTS.cheapCallPotFraction && strength.score >= 1.2;

  return strength.score >= threshold || cheapCall;
}

function applyCheck(postflop, seat) {
  postflop.actionLog.push(logEntry({ seat, street: postflop.street, action: "checks" }));
}

function applyCall(postflop, seat) {
  const callAmount = amountToCall(postflop, seat);
  putStreetAmount(postflop, seat, postflop.currentBet);
  postflop.actionLog.push(logEntry({ seat, street: postflop.street, action: "calls", size: callAmount }));
}

function applyFold(postflop, seat) {
  postflop.folded[seat] = true;
  postflop.actionLog.push(logEntry({ seat, street: postflop.street, action: "folds" }));

  if (activeSeats(postflop).length === 1) {
    awardOnlyActivePlayer(postflop);
  }
}

function applyBet(postflop, seat, requestedAmount) {
  const amount = Math.min(cleanBetAmount(requestedAmount), postflop.stacks[seat] || 0);

  if (amount <= 0) {
    applyCheck(postflop, seat);
    return;
  }

  putStreetAmount(postflop, seat, amount);
  postflop.currentBet = postflop.streetContributions[seat];
  postflop.bettorSeat = seat;
  postflop.toAct = seatsAfter(postflop, seat).filter((candidate) => (
    candidate !== seat && !postflop.folded[candidate] && !postflop.allIn[candidate]
  ));
  postflop.actionLog.push(logEntry({ seat, street: postflop.street, action: "bets", size: amount }));
}

function closeStreet(postflop) {
  if (postflop.street === "river") {
    completeShowdown(postflop);
    return;
  }

  postflop.status = "streetComplete";
  postflop.result = "nextStreet";
  postflop.currentSeat = null;
  postflop.actionLog.push(logEntry({
    seat: postflop.heroSeat,
    street: postflop.street,
    action: `${postflop.street} action complete`,
  }));
}

function completeShowdown(postflop) {
  const live = activeSeats(postflop);
  const solvedBySeat = {};
  live.forEach((seat) => {
    solvedBySeat[seat] = Hand.solve([...(postflop.holeCards[seat] || []), ...postflop.board]);
  });

  // Distribute across main + side pots by each seat's total contribution to the
  // hand. Folded players' chips remain in the pots but they can't win them.
  const pots = buildSidePots(postflop.contributions, postflop.folded, postflop.players);
  const shares = {};

  pots.forEach((pot) => {
    let eligible = pot.eligible.filter((seat) => solvedBySeat[seat]);
    if (eligible.length === 0) {
      eligible = live;
    }
    const winningHands = Hand.winners(eligible.map((seat) => solvedBySeat[seat]));
    const winners = eligible.filter((seat) => winningHands.includes(solvedBySeat[seat]));
    const split = splitAmount(pot.amount, winners);
    winners.forEach((seat) => {
      shares[seat] = roundAmount((shares[seat] || 0) + (split[seat] || 0));
    });
  });

  Object.entries(shares).forEach(([seat, amount]) => {
    postflop.stacks[seat] = roundAmount((postflop.stacks[seat] || 0) + amount);
  });

  // Headline winner = best hand among all live seats (always wins the main pot).
  const overallHands = Hand.winners(live.map((seat) => solvedBySeat[seat]));
  const overallWinners = live.filter((seat) => overallHands.includes(solvedBySeat[seat]));
  const winnerSeats = Object.keys(shares).map(Number).sort((a, b) => a - b);
  const description = solvedBySeat[overallWinners[0]]?.descr || "";

  postflop.status = "complete";
  postflop.result = "showdown";
  postflop.winnerSeats = winnerSeats;
  postflop.winnerSeat = winnerSeats.length === 1 ? winnerSeats[0] : null;
  postflop.showdownDescription = description;
  postflop.currentSeat = null;
  postflop.actionLog.push(logEntry({
    seat: overallWinners[0],
    street: "showdown",
    action: `wins showdown with ${description}`,
    size: pots.reduce((sum, pot) => sum + pot.amount, 0),
  }));
}

function awardOnlyActivePlayer(postflop) {
  const [winnerSeat] = activeSeats(postflop);

  postflop.status = "complete";
  postflop.result = "winner";
  postflop.winnerSeat = winnerSeat;
  postflop.winnerSeats = [winnerSeat];
  postflop.currentSeat = null;
  postflop.stacks[winnerSeat] = roundAmount((postflop.stacks[winnerSeat] || 0) + postflop.pot);
  postflop.actionLog.push(logEntry({ seat: winnerSeat, street: postflop.street, action: "wins pot", size: postflop.pot }));
}

export function splitAmount(amount, seats) {
  if (!seats.length) {
    return {};
  }

  const chipUnits = Math.round(roundAmount(amount) * 2);
  const baseUnits = Math.floor(chipUnits / seats.length);
  const extraUnits = chipUnits % seats.length;

  return Object.fromEntries(seats.map((seat, index) => [
    seat,
    (baseUnits + (index < extraUnits ? 1 : 0)) / 2,
  ]));
}

// Build main + side pots from each seat's total contribution. Returns an
// ordered list of { amount, eligible } where eligible = non-folded contributors
// who can win that layer.
export function buildSidePots(contributions, folded, players) {
  const contrib = {};
  for (let seat = 0; seat < players; seat += 1) {
    const amount = roundAmount(contributions[seat] || 0);
    if (amount > 0) {
      contrib[seat] = amount;
    }
  }

  const levels = [...new Set(Object.values(contrib))].sort((first, second) => first - second);
  const pots = [];
  let previousLevel = 0;

  levels.forEach((level) => {
    const contributors = Object.keys(contrib)
      .map(Number)
      .filter((seat) => contrib[seat] >= level);
    const amount = roundAmount((level - previousLevel) * contributors.length);

    if (amount > 0) {
      pots.push({
        amount,
        eligible: contributors.filter((seat) => !folded[seat]),
      });
    }

    previousLevel = level;
  });

  return pots;
}

function betSizeForProfile({ pot, stack, profile }) {
  const normalized = normalizeProfile(profile);
  const amount = roundAmount(Math.max(
    POSTFLOP_MODEL_CONSTANTS.minBetBb,
    pot * POSTFLOP_MODEL_CONSTANTS.baseBetPotFraction * normalized.sizing,
  ));

  return Math.min(amount, stack || 0);
}

function putStreetAmount(postflop, seat, totalStreetAmount) {
  const current = postflop.streetContributions[seat] || 0;
  const cleanTotal = Math.max(current, roundAmount(totalStreetAmount));
  const added = Math.min(postflop.stacks[seat] || 0, roundAmount(cleanTotal - current));

  postflop.streetContributions[seat] = roundAmount(current + added);
  postflop.contributions[seat] = roundAmount((postflop.contributions[seat] || 0) + added);
  postflop.stacks[seat] = roundAmount((postflop.stacks[seat] || 0) - added);
  postflop.allIn[seat] = postflop.stacks[seat] <= 0;
  postflop.pot = roundAmount(postflop.pot + added);
}

function amountToCall(postflop, seat) {
  return Math.max(0, postflop.currentBet - (postflop.streetContributions[seat] || 0));
}

function refreshDerived(postflop) {
  postflop.heroToCall = postflop.status === "waitingHero" ? amountToCall(postflop, postflop.heroSeat) : 0;
  postflop.suggestedHeroBet = postflop.status === "waitingHero" ? suggestedHeroBet(postflop) : 0;
  return postflop;
}

function handTextureScore({ cards, board }) {
  const solved = Hand.solve([...cards, ...board]);
  const madeRank = Number(solved.rank) || 1;
  const flushDraw = board.length < 5 && hasFlushDraw([...cards, ...board]);
  const straightDraw = board.length < 5 ? straightDrawScore([...cards, ...board]) : 0;
  const drawScore = (flushDraw ? 0.9 : 0) + straightDraw;

  return {
    madeRank,
    drawScore,
    score: madeRank + drawScore,
  };
}

function hasFlushDraw(cards) {
  const counts = cards.reduce((map, card) => {
    const suit = card.slice(-1);
    map[suit] = (map[suit] || 0) + 1;
    return map;
  }, {});

  return Object.values(counts).some((count) => count >= 4);
}

function straightDrawScore(cards) {
  const rankValues = [...new Set(cards.flatMap((card) => {
    const rank = card.slice(0, -1);
    const value = rankValue(rank);
    return rank === "A" ? [14, 1] : [value];
  }))].sort((first, second) => first - second);

  for (let start = 1; start <= 10; start += 1) {
    const window = [start, start + 1, start + 2, start + 3, start + 4];
    const hits = window.filter((value) => rankValues.includes(value)).length;

    if (hits >= 4) {
      return hits === 5 ? 0 : 0.65;
    }
  }

  return 0;
}

function rankValue(rank) {
  return {
    A: 14,
    K: 13,
    Q: 12,
    J: 11,
    T: 10,
  }[rank] || Number(rank);
}

function postflopOrder({ players, buttonSeat, folded, allIn }) {
  return Array.from({ length: players }, (_, index) => (buttonSeat + 1 + index) % players)
    .filter((seat) => !folded[seat] && !allIn[seat]);
}

function seatsAfter(postflop, seat) {
  return Array.from({ length: postflop.players - 1 }, (_, index) => (seat + 1 + index) % postflop.players);
}

function activeSeats(postflop) {
  return Array.from({ length: postflop.players }, (_, seat) => seat)
    .filter((seat) => !postflop.folded[seat]);
}

function profileForSeat(postflop, seat) {
  return normalizeProfile(postflop.seatProfiles?.[seat] || "standard");
}

function streetDealLog({ street, board, heroSeat }) {
  const text = {
    flop: `flop dealt ${board.join(" ")}`,
    turn: `turn dealt ${board[3]}`,
    river: `river dealt ${board[4]}`,
  }[street];

  return logEntry({ seat: heroSeat, street, action: text });
}

function logEntry({ seat, street, action, size = 0 }) {
  return { seat, street, action, size };
}

function clonePostflop(postflop) {
  return {
    ...postflop,
    positions: { ...postflop.positions },
    seatProfiles: { ...postflop.seatProfiles },
    contributions: { ...postflop.contributions },
    streetContributions: { ...postflop.streetContributions },
    stacks: { ...postflop.stacks },
    folded: { ...postflop.folded },
    allIn: { ...postflop.allIn },
    toAct: [...postflop.toAct],
    actionLog: [...postflop.actionLog],
    winnerSeats: [...postflop.winnerSeats],
    holeCards: postflop.holeCards,
    board: [...postflop.board],
  };
}

function cleanBetAmount(value) {
  return roundAmount(Math.max(0, Number(value) || 0));
}

function roundAmount(value) {
  return Math.round((Number(value) || 0) * 2) / 2;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}
