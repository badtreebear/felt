export const STREET_ORDER = ["preflop", "flop", "turn", "river", "showdown"];

export const state = {
  config: {
    players: 6,
    heroSeat: 3,
    blinds: { sb: 0.5, bb: 1 },
    bbDollarValue: 2,
    stack: 200,
    tableStacks: {},
    seatProfiles: {},
    seatPlayers: {},
    seatModes: {},
    seatAssignments: {},
  },
  roster: [],
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
    startingStacks: {},
    preflop: null,
    postflop: null,
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
    verdict: null,
    simStatus: "idle",
  },
  ui: {
    openPopover: null,
    openRangeSeat: null,
    revealVillains: false,
    showProfiles: false,
    displayUnit: "usd",
    heroRaiseTo: 2.5,
    spotMode: "dealt",
    actionDelayMs: 1000,
    rosterOpen: false,
    rosterImportStatus: null,
    awaitingStart: false,
  },
  coach: {
    config: {
      enabled: false,
      baseUrl: "http://localhost:4000/v1",
      model: "",
      apiKey: "",
    },
    status: "unconfigured",
    settingsOpen: false,
    testStatus: "idle",
    lastError: "",
    availableModels: [],
    callCount: 0,
    chatOpen: false,
    chatInput: "",
    chatHistory: [],
    chatStatus: "idle",
    explain: {},
    review: {
      status: "idle",
      content: "",
      error: "",
    },
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
