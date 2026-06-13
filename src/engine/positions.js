const POSITION_BY_BUTTON_ORDER = {
  2: ["BTN/SB", "BB"],
  3: ["BTN", "SB", "BB"],
  4: ["BTN", "SB", "BB", "CO"],
  5: ["BTN", "SB", "BB", "HJ", "CO"],
  6: ["BTN", "SB", "BB", "LJ", "HJ", "CO"],
  7: ["BTN", "SB", "BB", "UTG+2", "LJ", "HJ", "CO"],
  8: ["BTN", "SB", "BB", "UTG+1", "UTG+2", "LJ", "HJ", "CO"],
  9: ["BTN", "SB", "BB", "UTG", "UTG+1", "UTG+2", "LJ", "HJ", "CO"],
};

const RFI_LABEL_BY_POSITION = {
  UTG: "UTG",
  "UTG+1": "UTG+1",
  "UTG+2": "UTG+2",
  LJ: "LJ",
  HJ: "HJ",
  CO: "CO",
  BTN: "BTN",
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
  return positionToRfiLabel(position) || position;
}

export function positionToRfiLabel(position) {
  return RFI_LABEL_BY_POSITION[position] || null;
}

export function rangeBucketForPlayers(players) {
  return players <= 6 ? "6max" : "9max";
}
