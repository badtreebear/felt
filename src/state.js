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
    seatNames: {},
    startStreet: "preflop",
  },
  roster: [],
  heroes: [],
  activeHeroId: "",
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
    trackerRecordId: "",
    trackerDecisions: [],
    lastFeedback: null,
  },
  session: {
    enabled: false,
    decisions: 0,
    // Three-way live-grading tally (Good / OK / Leak). `matched` is kept as the
    // sum of good + neutral for any back-compat readers; the scoreboard reads the
    // split counters directly.
    matched: 0,
    good: 0,
    neutral: 0,
    fail: 0,
    evDeltaBb: 0,
  },
  // B1: tournament blind schedule. Off by default so cash play is unchanged
  // (the UI toggle comes in B3). When enabled, new hands read blinds + starting
  // stack from the selected structure and advance the level by hands played.
  tournament: {
    enabled: false,
    structureId: "pub",
    levelIndex: 0,
    handsAtLevel: 0,
    // Optional chip buy-in override; null = use the structure's startingStack.
    buyIn: null,
  },
  drill: {
    active: false,
    mode: "history",
    leakType: "",
    targetStreet: "",
    spots: [],
    index: 0,
    results: [],
    awaitingNext: false,
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
    showMaths: false,
    showThreats: false,
    overbetWarn: false,
    deepSizing: false,
    actionDelayMs: 1000,
    settingsOpen: false,
    rosterOpen: false,
    rosterImportStatus: null,
    awaitingStart: false,
    seatScale: 1,
    showSetupTypes: false,
    trackerOpen: false,
    glossaryOpen: false,
    trackerImportStatus: null,
    dataImportStatus: null,
    pendingImport: null,
  },
  tracker: {
    hands: [],
    summary: null,
    selectedLeakType: "",
    status: "idle",
  },
  coach: {
    settings: {
      activeConfigId: "",
      configs: [],
    },
    config: {
      id: "",
      name: "",
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
