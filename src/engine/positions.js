const POSITION_BY_BUTTON_ORDER = {
  2: ["BTN/SB", "BB"],
  3: ["BTN", "SB", "BB"],
  4: ["BTN", "SB", "BB", "CO"],
  5: ["BTN", "SB", "BB", "UTG", "CO"],
  6: ["BTN", "SB", "BB", "UTG", "MP", "CO"],
  7: ["BTN", "SB", "BB", "UTG", "MP", "HJ", "CO"],
  8: ["BTN", "SB", "BB", "UTG", "UTG+1", "MP", "HJ", "CO"],
  9: ["BTN", "SB", "BB", "UTG", "UTG+1", "LJ", "MP", "HJ", "CO"],
};

export function getSeatPositions({ players, buttonSeat }) {
  const labels = POSITION_BY_BUTTON_ORDER[players];

  if (!labels) {
    throw new Error("Positions require 2 to 9 players.");
  }

  return Object.fromEntries(
    Array.from({ length: players }, (_, seat) => {
      const distanceFromButton = (seat - buttonSeat + players) % players;
      return [seat, labels[distanceFromButton]];
    }),
  );
}

export function normalizeRangePosition(position) {
  if (position === "BTN/SB") {
    return "BTN";
  }

  return position;
}

export function rangeBucketForPlayers(players) {
  return players <= 6 ? "6max" : "9max";
}
