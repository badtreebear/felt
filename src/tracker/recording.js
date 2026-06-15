import { getSeatPositions } from "../engine/positions.js";

export function createHandRecordId(heroId, seed) {
  return `${heroId}:${seed}:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 8)}`;
}

export function buildHandRecord(state) {
  if (!state.activeHeroId || state.ui.spotMode === "manual" || !state.hand.seed) {
    return null;
  }

  const phase = terminalPhase(state);

  if (!phase) {
    return null;
  }

  const heroSeat = state.config.heroSeat;
  const startingStack = Number(state.hand.startingStacks?.[heroSeat]);
  const endingStack = Number(phase.stacks?.[heroSeat]);
  const positions = phase.positions || getSeatPositions({
    players: state.config.players,
    buttonSeat: state.hand.buttonSeat,
  });
  const net = Number.isFinite(startingStack) && Number.isFinite(endingStack)
    ? roundAmount(endingStack - startingStack)
    : 0;

  return {
    id: state.hand.trackerRecordId || createHandRecordId(state.activeHeroId, state.hand.seed),
    heroId: state.activeHeroId,
    ts: Date.now(),
    seed: state.hand.seed,
    players: state.config.players,
    heroSeat,
    heroPos: positions[heroSeat] || "",
    heroCards: [...(state.hand.holeCards?.[heroSeat] || [])],
    board: [...(phase.board || state.hand.board || [])],
    net,
    won: heroWon({ phase, heroSeat, net }),
    result: phase.result || "",
    actionLog: (phase.actionLog || state.hand.actionLog || []).map((entry) => ({ ...entry })),
    decisions: (state.hand.trackerDecisions || []).map((decision) => ({ ...decision })),
  };
}

function terminalPhase(state) {
  if (state.hand.postflop?.status === "complete") {
    return state.hand.postflop;
  }

  if (state.hand.preflop?.status === "complete" && state.hand.preflop.result === "winner") {
    return state.hand.preflop;
  }

  return null;
}

function heroWon({ phase, heroSeat, net }) {
  if (Array.isArray(phase.winnerSeats) && phase.winnerSeats.length) {
    return phase.winnerSeats.includes(heroSeat);
  }

  if (phase.winnerSeat !== null && phase.winnerSeat !== undefined) {
    return phase.winnerSeat === heroSeat;
  }

  return net > 0;
}

function roundAmount(value) {
  return Math.round((Number(value) || 0) * 2) / 2;
}
