import { getSeatPositions } from "./positions.js";
import {
  adjustedOpeningRange,
  canonicalHandKey,
  decideFacingOpen,
  decideFacingThreeBet,
  fourBetSize,
  openingSizeForPosition,
  normalizeProfile,
  threeBetSize,
} from "./player-model.js";

export function startPreflopAction({ hand, config, seatProfiles, autoActionLimit = Infinity }) {
  const preflop = createInitialPreflopState({ hand, config, seatProfiles });
  return runToHeroOrEnd(preflop, { autoActionLimit });
}

export function advancePreflopAction(preflop, { autoActionLimit = 1 } = {}) {
  if (!preflop || preflop.status !== "active") {
    return preflop;
  }

  return runToHeroOrEnd(preflop, { autoActionLimit });
}

export function applyHeroPreflopAction(preflop, input, { autoActionLimit = Infinity } = {}) {
  if (!preflop || preflop.status !== "waitingHero") {
    return preflop;
  }

  const next = clonePreflop(preflop);
  const seat = next.currentSeat;
  const callAmount = amountToCall(next, seat);
  const action = input.action;

  if (action === "fold") {
    applyFold(next, seat, "folds");
  } else if (action === "raise") {
    const requested = Number(input.raiseTo);
    const fallback = next.currentBet > 0 ? next.currentBet + next.minRaise : openingSizeForPosition(next.positions[seat], "standard");
    applyRaise(next, seat, Math.max(requested || 0, fallback), "raises to");
  } else if (callAmount > 0) {
    applyCall(next, seat, "calls");
  } else {
    applyCheck(next, seat);
  }

  if (next.status === "waitingHero") {
    next.status = "active";
    next.currentSeat = null;
  }

  return runToHeroOrEnd(next, { autoActionLimit });
}

export function suggestedHeroRaiseTo(preflop) {
  if (!preflop) {
    return 2.5;
  }

  if (preflop.voluntaryRaiserSeat === null) {
    return openingSizeForPosition(preflop.positions[preflop.heroSeat], "standard");
  }

  if (preflop.raiseCount === 1) {
    return threeBetSize({
      currentBet: preflop.currentBet,
      position: preflop.positions[preflop.heroSeat],
      profile: "standard",
      outOfPosition: isOutOfPosition(preflop, preflop.heroSeat, preflop.aggressorSeat),
    });
  }

  return fourBetSize({ currentBet: preflop.currentBet, profile: "standard" });
}

export function amountToCall(preflop, seat = preflop?.currentSeat) {
  if (!preflop || seat === null || seat === undefined) {
    return 0;
  }

  return Math.max(0, preflop.currentBet - (preflop.contributions[seat] || 0));
}

export function legalHeroActions(preflop) {
  if (!preflop || preflop.status !== "waitingHero") {
    return { canAct: false, callAmount: 0, minRaiseTo: 0 };
  }

  const callAmount = amountToCall(preflop, preflop.heroSeat);
  const minRaiseTo = preflop.voluntaryRaiserSeat === null
    ? openingSizeForPosition(preflop.positions[preflop.heroSeat], "standard")
    : preflop.currentBet + preflop.minRaise;

  return {
    canAct: true,
    callAmount,
    minRaiseTo,
    maxRaiseTo: preflop.contributions[preflop.heroSeat] + preflop.stacks[preflop.heroSeat],
    stack: preflop.stacks[preflop.heroSeat] || 0,
  };
}

function createInitialPreflopState({ hand, config, seatProfiles }) {
  const players = config.players;
  const heroSeat = config.heroSeat;
  const buttonSeat = hand.buttonSeat;
  const sbSeat = players === 2 ? buttonSeat : (buttonSeat + 1) % players;
  const bbSeat = players === 2 ? (buttonSeat + 1) % players : (buttonSeat + 2) % players;
  const positions = getSeatPositions({ players, buttonSeat });
  const contributions = Object.fromEntries(Array.from({ length: players }, (_, seat) => [seat, 0]));
  const stacks = startingStacksForConfig(config, players);
  const folded = Object.fromEntries(Array.from({ length: players }, (_, seat) => [seat, false]));
  const allIn = Object.fromEntries(Array.from({ length: players }, (_, seat) => [seat, false]));

  // Busted seats (no chips) sit out the hand — folded before the deal.
  const out = {};
  for (let seat = 0; seat < players; seat += 1) {
    if ((stacks[seat] || 0) <= 0) {
      folded[seat] = true;
      out[seat] = true;
    }
  }

  const blinds = config.blinds;

  postBlind({ contributions, stacks, seat: sbSeat, amount: blinds.sb });
  postBlind({ contributions, stacks, seat: bbSeat, amount: blinds.bb });

  return {
    status: "active",
    result: null,
    winnerSeat: null,
    winnerSeats: [],
    heroSeat,
    players,
    buttonSeat,
    sbSeat,
    bbSeat,
    positions,
    seatProfiles,
    holeCards: hand.holeCards,
    pot: roundAmount(Object.values(contributions).reduce((sum, amount) => sum + amount, 0)),
    currentBet: blinds.bb,
    minRaise: blinds.bb,
    raiseCount: 0,
    voluntaryRaiserSeat: null,
    aggressorSeat: null,
    currentSeat: null,
    contributions,
    stacks,
    folded,
    allIn,
    out,
    toAct: preflopOrder({ players, bbSeat }),
    actionLog: [...hand.actionLog],
  };
}

function runToHeroOrEnd(preflop, { autoActionLimit = Infinity } = {}) {
  const next = clonePreflop(preflop);
  let autoActions = 0;

  while (next.status === "active") {
    if (activeSeats(next).length === 1) {
      awardOnlyActivePlayer(next);
      break;
    }

    if (next.toAct.length === 0) {
      completeOpenAction(next);
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

function applyVillainDecision(preflop, seat) {
  const cards = preflop.holeCards?.[seat] || [];
  const hand = canonicalHandKey(cards);
  const position = preflop.positions[seat];
  const profile = profileForSeat(preflop, seat);
  const callAmount = amountToCall(preflop, seat);

  if (preflop.voluntaryRaiserSeat === null) {
    if (position === "BB" && callAmount === 0) {
      applyCheck(preflop, seat);
      return;
    }

    const adjusted = adjustedOpeningRange({ position, profile });

    if (hand && adjusted.hands.has(hand)) {
      applyRaise(preflop, seat, openingSizeForPosition(position, profile), "raises to");
    } else {
      applyFold(preflop, seat, "folds");
    }
    return;
  }

  if (preflop.raiseCount === 1) {
    const decision = decideFacingOpen({ hand, position, profile });

    if (decision.action === "threeBet") {
      applyRaise(preflop, seat, threeBetSize({
        currentBet: preflop.currentBet,
        position,
        profile,
        outOfPosition: isOutOfPosition(preflop, seat, preflop.aggressorSeat),
      }), "3-bets to");
    } else if (decision.action === "call") {
      applyCall(preflop, seat, "calls");
    } else {
      applyFold(preflop, seat, "folds");
    }
    return;
  }

  const decision = decideFacingThreeBet({ hand, position, profile });

  if (decision.action === "fourBet") {
    applyRaise(preflop, seat, fourBetSize({ currentBet: preflop.currentBet, profile }), "4-bets to");
  } else if (decision.action === "call") {
    applyCall(preflop, seat, "calls");
  } else {
    applyFold(preflop, seat, "folds");
  }
}

function applyFold(preflop, seat, action) {
  preflop.folded[seat] = true;
  preflop.actionLog.push(logEntry({ seat, action }));

  if (activeSeats(preflop).length === 1) {
    awardOnlyActivePlayer(preflop);
  }
}

function applyCheck(preflop, seat) {
  preflop.actionLog.push(logEntry({ seat, action: "checks" }));
}

function applyCall(preflop, seat, action) {
  const callTo = preflop.currentBet;
  const callAmount = amountToCall(preflop, seat);
  putToAmount(preflop, seat, callTo);
  preflop.actionLog.push(logEntry({ seat, action, size: callAmount }));
}

function applyRaise(preflop, seat, requestedTotal, action) {
  const stackCap = preflop.contributions[seat] + preflop.stacks[seat];
  const minTotal = preflop.voluntaryRaiserSeat === null
    ? Math.max(preflop.currentBet + preflop.minRaise, requestedTotal)
    : preflop.currentBet + preflop.minRaise;
  const total = roundAmount(Math.min(Math.max(requestedTotal, minTotal), stackCap));
  const raiseSize = Math.max(0, total - preflop.currentBet);

  putToAmount(preflop, seat, total);
  preflop.minRaise = Math.max(raiseSize, preflop.minRaise);
  preflop.currentBet = total;
  preflop.voluntaryRaiserSeat = preflop.voluntaryRaiserSeat ?? seat;
  preflop.aggressorSeat = seat;
  preflop.raiseCount += 1;
  preflop.toAct = seatsAfter(preflop, seat).filter((candidate) => (
    candidate !== seat && !preflop.folded[candidate] && !preflop.allIn[candidate]
  ));
  preflop.actionLog.push(logEntry({ seat, action, size: total }));
}

function completeOpenAction(preflop) {
  if (preflop.voluntaryRaiserSeat === null && activeSeats(preflop).length === 1) {
    awardOnlyActivePlayer(preflop);
    return;
  }

  preflop.status = "complete";
  preflop.result = "wouldSeeFlop";
  preflop.winnerSeat = null;
  preflop.winnerSeats = [];

  preflop.actionLog.push({
    seat: preflop.aggressorSeat ?? preflop.bbSeat,
    street: "preflop",
    action: "preflop complete - would see flop",
    size: preflop.pot,
  });
}

function awardOnlyActivePlayer(preflop) {
  const [winnerSeat] = activeSeats(preflop);

  preflop.status = "complete";
  preflop.result = "winner";
  preflop.winnerSeat = winnerSeat;
  payPotToSeat(preflop, winnerSeat);
  preflop.actionLog.push(logEntry({ seat: winnerSeat, action: "wins pot", size: preflop.pot }));
}

function refreshDerived(preflop) {
  preflop.pot = roundAmount(Object.values(preflop.contributions).reduce((sum, amount) => sum + amount, 0));
  preflop.heroToCall = preflop.status === "waitingHero" ? amountToCall(preflop, preflop.heroSeat) : 0;
  return preflop;
}

function putToAmount(preflop, seat, totalAmount) {
  const current = preflop.contributions[seat] || 0;
  const cleanTotal = Math.max(current, roundAmount(totalAmount));
  const added = Math.min(preflop.stacks[seat], roundAmount(cleanTotal - current));

  preflop.contributions[seat] = roundAmount(current + added);
  preflop.stacks[seat] = roundAmount(preflop.stacks[seat] - added);
  preflop.allIn[seat] = preflop.stacks[seat] <= 0;
  preflop.pot = roundAmount(preflop.pot + added);
}

function postBlind({ contributions, stacks, seat, amount }) {
  const posted = Math.min(roundAmount(amount), stacks[seat] || 0);
  contributions[seat] = posted;
  stacks[seat] = roundAmount((stacks[seat] || 0) - posted);
}

function startingStacksForConfig(config, players) {
  return Object.fromEntries(Array.from({ length: players }, (_, seat) => {
    const configuredStack = Number(config.tableStacks?.[seat]);
    return [seat, Number.isFinite(configuredStack) ? roundAmount(configuredStack) : config.stack];
  }));
}

function payPotToSeat(preflop, seat) {
  preflop.stacks[seat] = roundAmount((preflop.stacks[seat] || 0) + preflop.pot);
}

function preflopOrder({ players, bbSeat }) {
  return Array.from({ length: players }, (_, index) => (bbSeat + 1 + index) % players);
}

function seatsAfter(preflop, seat) {
  return Array.from({ length: preflop.players - 1 }, (_, index) => (seat + 1 + index) % preflop.players);
}

function activeSeats(preflop) {
  return Array.from({ length: preflop.players }, (_, seat) => seat)
    .filter((seat) => !preflop.folded[seat]);
}

function isOutOfPosition(preflop, seat, aggressorSeat) {
  if (aggressorSeat === null || aggressorSeat === undefined) {
    return false;
  }

  const order = seatsAfter(preflop, preflop.buttonSeat);
  return order.indexOf(seat) < order.indexOf(aggressorSeat);
}

function profileForSeat(preflop, seat) {
  return normalizeProfile(preflop.seatProfiles?.[seat] || "standard");
}

function logEntry({ seat, action, size = 0 }) {
  return { seat, street: "preflop", action, size };
}

function clonePreflop(preflop) {
  return {
    ...preflop,
    positions: { ...preflop.positions },
    seatProfiles: { ...preflop.seatProfiles },
    contributions: { ...preflop.contributions },
    stacks: { ...preflop.stacks },
    folded: { ...preflop.folded },
    allIn: { ...preflop.allIn },
    toAct: [...preflop.toAct],
    actionLog: [...preflop.actionLog],
    winnerSeats: [...(preflop.winnerSeats || [])],
    holeCards: preflop.holeCards,
  };
}

function roundAmount(value) {
  return Math.round((Number(value) || 0) * 2) / 2;
}
