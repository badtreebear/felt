import { PLAYER_PROFILES } from "../engine/player-model.js";
import { getSeatPositions } from "../engine/positions.js";

export function buildCoachSnapshot(state) {
  const positions = getSeatPositions({
    players: state.config.players,
    buttonSeat: state.hand.buttonSeat,
  });
  const heroSeat = state.config.heroSeat;

  return {
    seed: state.hand.seed,
    table: {
      players: state.config.players,
      heroSeat,
      heroPos: positions[heroSeat],
      blinds: [state.config.blinds.sb, state.config.blinds.bb],
    },
    street: state.hand.street,
    hero: state.hand.holeCards[heroSeat] || [],
    board: state.hand.board || [],
    pot: state.hand.pot,
    toCall: state.hand.toCall,
    actionLog: (state.hand.actionLog || []).map((entry) => formatActionEntry({ entry, state, positions })),
    engine: {
      equity: state.maths.heroEquity,
      ci: state.maths.equityCI,
      requiredEquity: state.maths.requiredEquity,
      evCall: state.maths.evCall,
      verdict: state.maths.verdict ?? null,
    },
  };
}

function formatActionEntry({ entry, state, positions }) {
  const seat = Number(entry.seat);
  const position = positions[seat] || `Seat ${seat + 1}`;
  const actor = seat === state.config.heroSeat
    ? `${position}(hero)`
    : `${position}(${profileLabel(state, seat)})`;
  const size = Number(entry.size) > 0 ? ` ${entry.size}` : "";

  return `${entry.street}: ${actor} ${entry.action}${size}`;
}

function profileLabel(state, seat) {
  const profileId = state.config.seatProfiles?.[String(seat)] || "standard";
  const profile = PLAYER_PROFILES[profileId] || PLAYER_PROFILES.standard;
  return (profile.label || profileId).toLowerCase();
}
