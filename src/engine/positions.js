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

// Live seats (in seat order). B5: eliminated/sitting-out seats are excluded so
// the button, blinds, and positions are dealt only among players still in.
function liveSeatRing({ players, liveSeats }) {
  if (Array.isArray(liveSeats) && liveSeats.length) {
    return [...liveSeats].sort((a, b) => a - b);
  }
  return Array.from({ length: players }, (_, seat) => seat);
}

export function getSeatPositions({ players, buttonSeat, liveSeats }) {
  const live = liveSeatRing({ players, liveSeats });
  const liveCount = live.length;
  const labels = POSITION_BY_BUTTON_ORDER[liveCount];

  if (!labels) {
    throw new Error("Positions require 2 to 9 live players.");
  }

  // Order the live seats starting from the button; eliminated seats get no
  // position. Falls back to the first live seat if the button itself is out.
  const buttonIndex = Math.max(0, live.indexOf(buttonSeat));
  const positions = {};
  for (let i = 0; i < liveCount; i += 1) {
    const seat = live[(buttonIndex + i) % liveCount];
    positions[seat] = labels[i];
  }
  return positions;
}

// B5: the small/big-blind seats among the live players (heads-up: the button is
// the SB). Used by both the dealer (deck.js) and the engine so they agree.
export function getBlindSeats({ players, buttonSeat, liveSeats }) {
  const live = liveSeatRing({ players, liveSeats });
  const liveCount = live.length;
  const buttonIndex = Math.max(0, live.indexOf(buttonSeat));

  if (liveCount === 2) {
    return { sbSeat: live[buttonIndex], bbSeat: live[(buttonIndex + 1) % liveCount] };
  }

  return {
    sbSeat: live[(buttonIndex + 1) % liveCount],
    bbSeat: live[(buttonIndex + 2) % liveCount],
  };
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
