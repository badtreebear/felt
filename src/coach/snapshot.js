import { PLAYER_PROFILES } from "../engine/player-model.js";
import { getSeatPositions } from "../engine/positions.js";
import { villainRangeGridsForSpot } from "../engine/postflop-ev.js";
import { RANKS } from "../engine/deck.js";

// `recommendation` is the engine's authoritative line for the spot (the same
// string the bet tip shows). It is passed in by the caller (computed via
// `engineTipText` in the UI layer) so this module stays decoupled from the UI.
// Every coach surface (bet tip, explain, chat, review) MUST pass it — the
// prompts treat it as authoritative, and omitting it leaves the coach siding
// with the raw pot-odds `verdict`, which mis-advises first-in spots.
export function buildCoachSnapshot(state, { recommendation = null } = {}) {
  const positions = getSeatPositions({
    players: state.config.players,
    buttonSeat: state.hand.buttonSeat,
  });
  const heroSeat = state.config.heroSeat;

  // First-in (unopened) preflop spots are raise-or-fold: no one has voluntarily
  // bet/raised, so the amount "to call" is only the blind to complete and the
  // pot-odds verdict is meaningless. Expose this explicitly so the coach never
  // frames a blind-completion as a "call" decision.
  const preflopWaiting = state.hand.preflop?.status === "waitingHero" && state.hand.street === "preflop";
  const facingRaise = preflopWaiting
    ? (state.hand.preflop?.voluntaryRaiserSeat ?? null) !== null
    : Number(state.hand.toCall) > 0;

  return {
    seed: state.hand.seed,
    table: {
      players: state.config.players,
      heroSeat,
      heroPos: positions[heroSeat],
      blinds: [state.config.blinds.sb, state.config.blinds.bb],
      // A5: effective stack in big blinds (from the preflop snapshot), so the
      // coach can recognise short-stack / push-fold spots and explain shove/fold.
      effectiveStackBb: state.hand.preflop?.effectiveStackBb ?? null,
    },
    street: state.hand.street,
    hero: state.hand.holeCards[heroSeat] || [],
    board: state.hand.board || [],
    pot: state.hand.pot,
    toCall: state.hand.toCall,
    // True only when facing a voluntary bet/raise. First-in => false => the
    // coach should frame the spot as raise-or-fold, not call/fold.
    facingRaise,
    // The engine's recommended line for THIS spot. Authoritative; the coach
    // defers to it over the raw pot-odds verdict.
    recommendation,
    actionLog: (state.hand.actionLog || []).map((entry) => formatActionEntry({ entry, state, positions })),
    // Per-villain assumed range (position + profile), so the coach can reason
    // about what opponents hold. Compact summary (count + % of all hands), not a
    // full grid. Empty array when not computable (e.g. preflop / no postflop spot).
    villains: villainRangeSummary(state),
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

// Total combos of a 169-hand starting grid (pairs 6, suited 4, offsuit 12).
const TOTAL_STARTING_COMBOS = 1326;

// Combos represented by a 13x13 weight grid cell at [row][col]: diagonal =
// pocket pair (6), upper triangle = suited (4), lower triangle = offsuit (12).
function cellCombos(row, col) {
  if (row === col) return 6;
  return row < col ? 4 : 12;
}

// Compact per-villain range summary for the coach: position, profile, the
// number of combos the engine assumes they hold, and that as a % of all hands
// (a loose "how wide is this player here" read). Derived from the SAME grids the
// engine uses for equity, so the coach and the engine agree. Postflop spots only.
function villainRangeSummary(state) {
  const postflop = state?.hand?.postflop;
  if (!postflop) {
    return [];
  }
  const grids = villainRangeGridsForSpot(postflop) || [];
  return grids.map(({ position, profile, grid }) => {
    let combos = 0;
    for (let row = 0; row < RANKS.length; row += 1) {
      for (let col = 0; col < RANKS.length; col += 1) {
        const weight = Number(grid?.[row]?.[col]) || 0;
        if (weight > 0) {
          combos += cellCombos(row, col) * Math.min(1, weight);
        }
      }
    }
    const pct = Math.round((combos / TOTAL_STARTING_COMBOS) * 100);
    const label = (PLAYER_PROFILES[profile]?.label || profile || "standard").toLowerCase();
    return { position, profile: label, combos: Math.round(combos), rangePct: pct };
  });
}

