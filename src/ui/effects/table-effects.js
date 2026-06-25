// Table-dressing effects diff (Phase 14, slice A). PURE + deterministic, no DOM.
//
// Turns a pair of game-state snapshots into an ordered list of cosmetic effect
// events (sounds + animations) for the dressing layer to play. It computes
// NOTHING about the game — it only describes transitions that already happened,
// so it can never affect seeded results.
//
// Effect events:
//   { type: "deal-hole" }                         new hand dealt
//   { type: "burn" }                              a new street's burn card
//   { type: "deal-board", cards: [...] }          community card(s) just shown
//   { type: "chip-bet", seat, amount }            a seat put chips in this street
//   { type: "chip-sweep", amount }                betting round closed → pot
//   { type: "pot-award", seats: [...], amount }   showdown / uncontested win

function round(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function totalContrib(snapshot) {
  return Object.values(snapshot.contrib || {}).reduce((sum, v) => sum + (Number(v) || 0), 0);
}

// Normalise the live state into the minimal shape the diff needs. Reads the
// active phase (postflop preferred, else preflop). I/O-ish but trivial.
export function tableSnapshot(state) {
  const hand = state?.hand;

  if (!hand) {
    return null;
  }

  const phase = hand.postflop || hand.preflop || null;
  const src = phase?.streetContributions || phase?.contributions || {};
  const contrib = {};
  for (const seat of Object.keys(src)) {
    contrib[seat] = Number(src[seat]) || 0;
  }

  return {
    handId: hand.seed || "",
    street: hand.street || "preflop",
    board: Array.isArray(hand.board) ? [...hand.board] : [],
    contrib,
    pot: Number(hand.pot) || 0,
    status: phase?.status || "idle",
    winnerSeats: Array.isArray(phase?.winnerSeats) ? [...phase.winnerSeats] : [],
  };
}

export function computeTableEffects(prev, next) {
  if (!next) {
    return [];
  }

  // New hand (or first snapshot): a fresh deal, no carry-over comparisons.
  if (!prev || prev.handId !== next.handId) {
    return next.board.length === 0 ? [{ type: "deal-hole" }] : [];
  }

  const effects = [];

  // Betting round closed → sweep the chips on the felt into the pot. Detected by
  // a street change or the phase reaching streetComplete; only if there were
  // chips out there to sweep.
  const roundClosed = next.street !== prev.street
    || (next.status === "streetComplete" && prev.status !== "streetComplete");
  if (roundClosed && totalContrib(prev) > 0) {
    effects.push({ type: "chip-sweep", amount: round(totalContrib(prev)) });
  }

  // Board grew → a burn then the new community card(s).
  if (next.board.length > prev.board.length) {
    effects.push({ type: "burn" });
    effects.push({ type: "deal-board", cards: next.board.slice(prev.board.length) });
  }

  // A seat added chips on the SAME street → a bet/call/raise. (On a street change
  // contributions reset to 0, which is the sweep above, not a bet.)
  if (next.street === prev.street) {
    for (const seat of Object.keys(next.contrib)) {
      const delta = (next.contrib[seat] || 0) - (prev.contrib[seat] || 0);
      if (delta > 0) {
        effects.push({ type: "chip-bet", seat: Number(seat), amount: round(delta) });
      }
    }
  }

  // Showdown / uncontested win → slide the pot to the winner(s).
  if (next.winnerSeats.length && !prev.winnerSeats.length) {
    effects.push({ type: "pot-award", seats: [...next.winnerSeats], amount: round(next.pot) });
  }

  return effects;
}
