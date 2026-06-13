export const STREET_ORDER = ["preflop", "flop", "turn", "river", "showdown"];

export const state = {
  config: {
    players: 6,
    heroSeat: 3,
    blinds: { sb: 1, bb: 2 },
    stack: 200,
  },
  hand: {
    seed: "",
    deck: [],
    holeCards: {},
    board: [],
    boardRunout: [],
    burnCards: [],
    street: "preflop",
    pot: 0,
    toCall: 0,
    actionLog: [],
    buttonSeat: 0,
  },
  maths: {
    heroEquity: null,
    equityCI: null,
    tieRate: null,
    iterations: 0,
    opponentCount: 0,
    exact: false,
    requiredEquity: null,
    evCall: null,
    simStatus: "idle",
  },
  ui: {
    openPopover: null,
    openRangeSeat: null,
    revealVillains: false,
    spotMode: "dealt",
    speed: "step",
  },
};

const subscribers = new Set();

export function subscribe(path, callback) {
  const subscriber = { path, callback };
  subscribers.add(subscriber);
  callback(readPath(path), state);

  return () => subscribers.delete(subscriber);
}

export function updateState(mutator) {
  mutator(state);
  notifySubscribers();
}

export function readPath(path) {
  if (!path || path === "*") {
    return state;
  }

  return path.split(".").reduce((value, key) => value?.[key], state);
}

function notifySubscribers() {
  subscribers.forEach(({ path, callback }) => {
    callback(readPath(path), state);
  });
}
