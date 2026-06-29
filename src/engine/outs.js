import pokerSolver from "pokersolver";

const { Hand } = pokerSolver;

const RANKS = ["2", "3", "4", "5", "6", "7", "8", "9", "T", "J", "Q", "K", "A"];
const SUITS = ["s", "h", "d", "c"];

// Hero's drawing outs: unseen cards that improve the hero to a higher-category
// hand (one pair -> two pair / trips, a draw -> flush / straight, etc.).
//
// This is hero-only and counts *improvement*, not "outs to win" — so it's a
// heuristic. It's the basis for the rule of 2 & 4 (outs x4 on the flop with two
// cards to come, x2 on the turn with one to come). It can overcount when an out
// also helps a villain; the simulated equity is the accurate win read.
export function heroOuts({ holeCards = [], board = [] } = {}) {
  const hole = (holeCards || []).filter(Boolean);
  const boardCards = (board || []).filter(Boolean);

  // Outs only apply with two hole cards and a flop or turn (cards still to come).
  if (hole.length < 2 || boardCards.length < 3 || boardCards.length >= 5) {
    return { outs: 0, cardsToCome: 0, improvePct: 0, cards: [] };
  }

  const cardsToCome = 5 - boardCards.length; // 2 on the flop, 1 on the turn
  const known = new Set([...hole, ...boardCards]);
  const holeRanks = hole.map((card) => card[0]);
  const currentRank = Hand.solve([...hole, ...boardCards]).rank;

  const cards = [];
  for (const rank of RANKS) {
    for (const suit of SUITS) {
      const card = `${rank}${suit}`;
      if (known.has(card)) {
        continue;
      }
      const improved = Hand.solve([...hole, ...boardCards, card]);
      if (improved.rank <= currentRank) {
        continue;
      }
      // A card that only pairs the BOARD (a rank not in the hero's hand) doesn't
      // actually improve the hero — everyone shares that pair — so it's not an
      // out. Only count a high-card -> pair jump when it pairs a hole card.
      if (improved.name === "Pair" && !holeRanks.includes(rank)) {
        continue;
      }
      cards.push(card);
    }
  }

  // Rule of 2 & 4: rough chance of hitting at least one out, capped at 100%.
  const outs = cards.length;
  const improvePct = Math.min(100, outs * (cardsToCome === 2 ? 4 : 2));
  return { outs, cardsToCome, improvePct, cards };
}
