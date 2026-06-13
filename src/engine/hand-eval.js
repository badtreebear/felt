import pokerSolver from "pokersolver";

const { Hand } = pokerSolver;

export function resolveShowdown({ holeCards, board }) {
  if (!Hand) {
    throw new Error("Poker hand evaluator failed to load.");
  }

  if (!Array.isArray(board) || board.length !== 5) {
    throw new Error("Showdown requires a complete five-card board.");
  }

  const entries = Object.entries(holeCards).map(([seat, cards]) => {
    const solved = Hand.solve([...cards, ...board]);

    return {
      seat: Number(seat),
      cards,
      solved,
      description: solved.descr,
    };
  });

  const winningHands = Hand.winners(entries.map((entry) => entry.solved));
  const winnerSeats = entries
    .filter((entry) => winningHands.includes(entry.solved))
    .map((entry) => entry.seat);

  return {
    entries: entries.map(({ solved, ...entry }) => ({
      ...entry,
      rank: solved.rank,
      name: solved.name,
    })),
    winnerSeats,
    winningDescription: entries.find((entry) => winnerSeats.includes(entry.seat))?.description || "",
  };
}
