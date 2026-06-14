import { createIcons, RefreshCcw, RotateCcw, Settings, Shuffle, StepForward } from "lucide";
import { coachChatCompletion, testCoachConnection as pingCoachConnection } from "./coach/client.js";
import { coachStatus, isCoachConfigured, isCoachReachable, loadCoachConfig, saveCoachConfig } from "./coach/config.js";
import { buildChatMessages, buildExplainMessages, buildHandReviewMessages } from "./coach/prompts.js";
import { buildCoachSnapshot } from "./coach/snapshot.js";
import { boardForStreet, dealHoldemHand, nextStreet, STREET_LABELS } from "./engine/deck.js";
import { getOpeningRangeLoadError } from "./data/ranges/opening-ranges.js";
import { callVerdict, evCall } from "./engine/ev.js";
import {
  advancePreflopAction,
  applyHeroPreflopAction,
  startPreflopAction,
  suggestedHeroRaiseTo,
} from "./engine/preflop-action.js";
import {
  advancePostflopAction,
  applyHeroPostflopAction,
  startPostflopStreet,
  suggestedHeroBet,
} from "./engine/postflop-action.js";
import { requiredEquity } from "./engine/potodds.js";
import { state, subscribe, updateState } from "./state.js";
import { renderControls } from "./ui/controls.js";
import { renderTable } from "./ui/table.js";
import "./ui/theme.css";

const app = document.querySelector("#app");

if (!app) {
  throw new Error("App root not found.");
}



app.innerHTML = `
  <div class="app-shell">
    <header class="app-header">
      <div>
        <p>Felt</p>
        <h1>Texas Hold'em trainer</h1>
      </div>
      <span class="phase-badge">Phase 5: scripted postflop</span>
    </header>
    <div id="controls-root"></div>
    <div id="range-alert-root"></div>
    <div id="table-root"></div>
  </div>
`;

const controlsRoot = document.querySelector("#controls-root");
const rangeAlertRoot = document.querySelector("#range-alert-root");
const tableRoot = document.querySelector("#table-root");
let equityWorker = null;
let equityRequestId = 0;
let autoActionTimer = null;
let coachRequestId = 0;

state.coach.config = loadCoachConfig();
state.coach.status = coachStatus(state.coach.config);

const actions = {
  dealNewHand(seed, { resetStacks = false } = {}) {
    clearAutoActionTimer();
    const players = state.config.players;
    const heroSeat = Math.floor(players / 2);
    const startingStacks = resetStacks
      ? defaultStacksForPlayers(players, state.config.stack)
      : startingStacksForNextHand({ seed, players, heroSeat });
    const autoActionLimit = autoActionLimitForState(state);
    const manualSpot = state.ui.spotMode === "manual"
      ? { pot: state.hand.pot || 24, toCall: state.hand.toCall || 8 }
      : null;
    const hand = dealHoldemHand({
      players,
      heroSeat,
      blinds: state.config.blinds,
      seed,
    });

    updateState((draft) => {
      draft.config.heroSeat = heroSeat;
      draft.config.tableStacks = startingStacks;
      ensureSeatProfiles(draft.config);
      draft.hand = hand;
      draft.hand.startingStacks = { ...startingStacks };
      draft.hand.postflop = null;
      draft.ui.revealVillains = false;
      draft.ui.openPopover = null;
      draft.ui.openRangeSeat = null;
      resetCoachHandState(draft);
      applyPreflopToDraft(draft, startPreflopAction({
        hand,
        config: draft.config,
        seatProfiles: draft.config.seatProfiles,
        autoActionLimit,
      }));

      if (manualSpot) {
        draft.hand.pot = manualSpot.pot;
        draft.hand.toCall = manualSpot.toCall;
      }

      refreshMaths(draft, { keepEquity: false });
    });

    queueEquitySimulation();
    scheduleAutoAction();
  },
  replayHand() {
    if (state.hand.seed) {
      actions.dealNewHand(state.hand.seed);
    }
  },
  newGame() {
    // Reset every seat to the configured starting stack and deal fresh.
    actions.dealNewHand(undefined, { resetStacks: true });
  },
  setPlayers(players) {
    clearAutoActionTimer();
    updateState((draft) => {
      draft.config.players = players;
      draft.config.heroSeat = Math.floor(players / 2);
      draft.config.tableStacks = defaultStacksForPlayers(players, draft.config.stack);
      ensureSeatProfiles(draft.config);
    });
    actions.dealNewHand();
  },
  setStreet(street) {
    if (state.hand.preflop) {
      return;
    }

    updateState((draft) => {
      draft.hand.street = street;
      draft.hand.board = boardForStreet(draft.hand.boardRunout, street);
      draft.hand.actionLog = actionLogForStreet(draft.hand, draft.config.heroSeat, street);
      draft.ui.openPopover = null;
      draft.ui.openRangeSeat = null;
      refreshMaths(draft, { keepEquity: false });
    });
    queueEquitySimulation();
  },
  advanceStreet() {
    if (canContinueScriptedHand(state)) {
      actions.continueScriptedHand();
      return;
    }

    actions.setStreet(nextStreet(state.hand.street));
  },
  continueScriptedHand() {
    clearAutoActionTimer();
    const autoActionLimit = autoActionLimitForState(state);

    updateState((draft) => {
      const nextPostflopStreet = nextScriptedStreet(draft.hand);

      if (!nextPostflopStreet) {
        return;
      }

      applyPostflopToDraft(draft, startPostflopStreet({
        hand: draft.hand,
        config: draft.config,
        street: nextPostflopStreet,
        seatProfiles: draft.config.seatProfiles,
        autoActionLimit,
      }));
      draft.ui.openPopover = null;
      draft.ui.openRangeSeat = null;
      refreshMaths(draft, { keepEquity: false });
    });
    queueEquitySimulation();
    scheduleAutoAction();
  },
  setRevealVillains(revealVillains) {
    updateState((draft) => {
      draft.ui.revealVillains = revealVillains;
      draft.ui.openPopover = null;
      refreshMaths(draft, { keepEquity: false });
    });
    queueEquitySimulation();
  },
  setSpotMode(spotMode) {
    updateState((draft) => {
      draft.ui.spotMode = spotMode;
      draft.ui.openPopover = null;
      draft.ui.openRangeSeat = null;

      if (spotMode === "manual") {
        if (draft.hand.toCall <= 0) {
          draft.hand.pot = 24;
          draft.hand.toCall = 8;
        }
      } else if (!draft.hand.preflop && !draft.hand.postflop) {
        draft.hand.pot = draft.config.blinds.sb + draft.config.blinds.bb;
        draft.hand.toCall = 0;
      }

      refreshMaths(draft, { keepEquity: true });
    });
  },
  setManualSpot(values) {
    updateState((draft) => {
      draft.ui.spotMode = "manual";

      if (Object.hasOwn(values, "pot")) {
        draft.hand.pot = cleanAmount(values.pot);
      }

      if (Object.hasOwn(values, "toCall")) {
        draft.hand.toCall = cleanAmount(values.toCall);
      }

      if (draft.hand.toCall <= 0) {
        draft.ui.openPopover = null;
      }

      refreshMaths(draft, { keepEquity: true });
    });
  },
  setOpenPopover(openPopover) {
    updateState((draft) => {
      draft.ui.openPopover = draft.ui.openPopover === openPopover ? null : openPopover;
    });
  },
  setOpenRangeSeat(openRangeSeat) {
    updateState((draft) => {
      draft.ui.openRangeSeat = openRangeSeat;
      draft.ui.openPopover = null;
    });
  },
  setCoachSettingsOpen(settingsOpen) {
    updateState((draft) => {
      draft.coach.settingsOpen = settingsOpen;
    });
  },
  setCoachConfig(values) {
    const previousBaseUrl = state.coach.config.baseUrl;
    const config = saveCoachConfig({
      ...state.coach.config,
      ...values,
    });

    updateState((draft) => {
      draft.coach.config = config;
      draft.coach.status = coachStatus(config);
      draft.coach.testStatus = "idle";
      draft.coach.lastError = "";

      if (!isCoachConfigured(config)) {
        resetCoachResponses(draft);
      }

      if (Object.hasOwn(values, "baseUrl") && config.baseUrl !== previousBaseUrl) {
        draft.coach.availableModels = [];
      }
    });

    // Saving configured settings should immediately try to connect.
    if (isCoachConfigured(config)) {
      actions.testCoachConnection();
    }
  },
  async testCoachConnection() {
    const requestId = nextCoachRequestId();
    const config = { ...state.coach.config };

    updateState((draft) => {
      draft.coach.testStatus = "running";
      draft.coach.lastError = "";
    });

    const result = await pingCoachConnection(config);

    updateState((draft) => {
      if (requestId !== coachRequestId || !sameCoachConfig(config, draft.coach.config)) {
        return;
      }

      draft.coach.testStatus = result.ok ? "success" : "error";
      draft.coach.status = coachStatus(config, result.ok ? "reachable" : "unreachable");
      draft.coach.lastError = result.ok ? "" : result.error;
      draft.coach.availableModels = Array.isArray(result.models) ? result.models : draft.coach.availableModels;
    });
  },
  async requestCoachExplain(topic) {
    if (!isCoachReachable(state.coach)) {
      updateState((draft) => markCoachOffline(draft));
      return;
    }

    const requestId = nextCoachRequestId();
    const config = { ...state.coach.config };
    const snapshot = buildCoachSnapshot(state);
    const messages = buildExplainMessages({ snapshot, topic });

    updateState((draft) => {
      draft.coach.callCount += 1;
      draft.coach.explain[topic] = { status: "loading", content: "", error: "" };
    });

    const result = await coachChatCompletion(config, messages, { maxTokens: 320 });

    updateState((draft) => {
      if (requestId !== coachRequestId) {
        return;
      }

      if (!result.ok) {
        draft.coach.explain[topic] = { status: "idle", content: "", error: "" };
        markCoachOffline(draft, result.error);
        return;
      }

      draft.coach.explain[topic] = { status: "done", content: sanitizeCoachContent(result.content), error: "" };
      draft.coach.status = "reachable";
      draft.coach.lastError = "";
    });
  },
  setCoachChatOpen(chatOpen) {
    updateState((draft) => {
      draft.coach.chatOpen = chatOpen;
    });
  },
  async sendCoachChat(chatInput = "") {
    const input = String(chatInput || state.coach.chatInput || "").trim();

    if (!input) {
      return;
    }

    if (!isCoachReachable(state.coach)) {
      updateState((draft) => markCoachOffline(draft));
      return;
    }

    const requestId = nextCoachRequestId();
    const config = { ...state.coach.config };
    const history = [...state.coach.chatHistory];
    const snapshot = buildCoachSnapshot(state);
    const messages = buildChatMessages({ snapshot, history, input });

    updateState((draft) => {
      draft.coach.callCount += 1;
      draft.coach.chatInput = "";
      draft.coach.chatStatus = "loading";
      draft.coach.chatHistory.push({ role: "user", content: input });
    });

    const result = await coachChatCompletion(config, messages, { maxTokens: 220 });

    updateState((draft) => {
      if (requestId !== coachRequestId) {
        return;
      }

      draft.coach.chatStatus = "idle";

      if (!result.ok) {
        markCoachOffline(draft, result.error);
        return;
      }

      draft.coach.chatHistory.push({ role: "assistant", content: sanitizeCoachContent(result.content) });
      draft.coach.status = "reachable";
      draft.coach.lastError = "";
    });
  },
  async requestCoachReview() {
    if (!isCoachReachable(state.coach)) {
      updateState((draft) => markCoachOffline(draft));
      return;
    }

    const requestId = nextCoachRequestId();
    const config = { ...state.coach.config };
    const snapshot = buildCoachSnapshot(state);
    const messages = buildHandReviewMessages({ snapshot });

    updateState((draft) => {
      draft.coach.callCount += 1;
      draft.coach.review = { status: "loading", content: "", error: "" };
    });

    const result = await coachChatCompletion(config, messages, { maxTokens: 450 });

    updateState((draft) => {
      if (requestId !== coachRequestId) {
        return;
      }

      if (!result.ok) {
        draft.coach.review = { status: "idle", content: "", error: "" };
        markCoachOffline(draft, result.error);
        return;
      }

      draft.coach.review = { status: "done", content: sanitizeCoachContent(result.content), error: "" };
      draft.coach.status = "reachable";
      draft.coach.lastError = "";
    });
  },
  setSeatProfile(seat, profileId) {
    clearAutoActionTimer();
    const seed = state.hand.seed;

    updateState((draft) => {
      draft.config.seatProfiles[String(seat)] = profileId;
      draft.ui.openPopover = null;
      draft.ui.openRangeSeat = null;
    });

    if (seed) {
      actions.dealNewHand(seed);
    }
  },
  setShowProfiles(showProfiles) {
    updateState((draft) => {
      draft.ui.showProfiles = showProfiles;
    });
  },
  setDisplayUnit(displayUnit) {
    updateState((draft) => {
      draft.ui.displayUnit = displayUnit;
    });
  },
  setActionDelayMs(actionDelayMs) {
    updateState((draft) => {
      draft.ui.actionDelayMs = cleanAmount(actionDelayMs);
    });
    scheduleAutoAction();
  },
  setHeroRaiseTo(heroRaiseTo) {
    updateState((draft) => {
      draft.ui.heroRaiseTo = cleanAmount(heroRaiseTo);
    });
  },
  heroPreflopAction(action, raiseTo) {
    clearAutoActionTimer();
    const autoActionLimit = autoActionLimitForState(state);

    updateState((draft) => {
      const preflop = applyHeroPreflopAction(draft.hand.preflop, {
        action,
        raiseTo: cleanAmount(raiseTo ?? draft.ui.heroRaiseTo),
      }, { autoActionLimit });
      applyPreflopToDraft(draft, preflop);
      draft.hand.postflop = null;
      draft.ui.openPopover = null;
      draft.ui.openRangeSeat = null;
    });
    queueEquitySimulation();
    scheduleAutoAction();
  },
  heroPostflopAction(action, betAmount) {
    clearAutoActionTimer();
    const autoActionLimit = autoActionLimitForState(state);

    updateState((draft) => {
      const postflop = applyHeroPostflopAction(draft.hand.postflop, {
        action,
        betAmount: cleanAmount(betAmount ?? draft.ui.heroRaiseTo),
      }, { autoActionLimit });
      applyPostflopToDraft(draft, postflop);
      draft.ui.openPopover = null;
      draft.ui.openRangeSeat = null;
      refreshMaths(draft, { keepEquity: false });
    });
    queueEquitySimulation();
    scheduleAutoAction();
  },
};

function scheduleAutoAction() {
  clearAutoActionTimer();

  const phase = currentAutoPhase(state);

  if (!phase) {
    return;
  }

  const delay = actionDelayForState(state);

  if (delay <= 0) {
    advanceAutoAction(Infinity);
    return;
  }

  autoActionTimer = window.setTimeout(() => {
    autoActionTimer = null;
    advanceAutoAction(1);
  }, delay);
}

function advanceAutoAction(autoActionLimit) {
  updateState((draft) => {
    if (draft.hand.postflop?.status === "active") {
      applyPostflopToDraft(draft, advancePostflopAction(draft.hand.postflop, { autoActionLimit }));
      refreshMaths(draft, { keepEquity: false });
      return;
    }

    if (draft.hand.preflop?.status === "active") {
      applyPreflopToDraft(draft, advancePreflopAction(draft.hand.preflop, { autoActionLimit }));
      refreshMaths(draft, { keepEquity: false });
    }
  });
  queueEquitySimulation();
  scheduleAutoAction();
}

function clearAutoActionTimer() {
  if (autoActionTimer) {
    window.clearTimeout(autoActionTimer);
    autoActionTimer = null;
  }
}

function resetCoachHandState(draft) {
  draft.coach.callCount = 0;
  draft.coach.chatInput = "";
  draft.coach.chatHistory = [];
  draft.coach.chatStatus = "idle";
  resetCoachResponses(draft);
}

function resetCoachResponses(draft) {
  draft.coach.explain = {};
  draft.coach.review = {
    status: "idle",
    content: "",
    error: "",
  };
}

function markCoachOffline(draft, error = "Coach offline - trainer fully functional.") {
  draft.coach.status = coachStatus(draft.coach.config, "unreachable");
  draft.coach.testStatus = "error";
  draft.coach.lastError = error;
  draft.coach.chatStatus = "idle";
}

function nextCoachRequestId() {
  coachRequestId += 1;
  return coachRequestId;
}

// Belt-and-suspenders: strip any LaTeX/markdown-math the model emits despite the
// system prompt (e.g. "$\text{K}\heartsuit\text{Q}\heartsuit$" -> "K♥Q♥").
function sanitizeCoachContent(text) {
  if (typeof text !== "string") {
    return "";
  }

  return text
    // unwrap inline math delimiters only when they wrap a backslash command,
    // so legitimate dollar amounts like "$5" are preserved.
    .replace(/\$([^$]*\\[^$]*)\$/g, "$1")
    .replace(/\\(?:heartsuit|hearts|heart)\b/g, "♥")
    .replace(/\\(?:spadesuit|spades|spade)\b/g, "♠")
    .replace(/\\(?:diamondsuit|diamonds|diamond)\b/g, "♦")
    .replace(/\\(?:clubsuit|clubs|club)\b/g, "♣")
    .replace(/\\(?:text|mathrm|mathbf|mathit|mathsf)\{([^}]*)\}/g, "$1")
    .replace(/\\[a-zA-Z]+\b/g, "")
    .replace(/\{([^{}]*)\}/g, "$1")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function sameCoachConfig(first, second) {
  return first.enabled === second.enabled
    && first.baseUrl === second.baseUrl
    && first.model === second.model
    && first.apiKey === second.apiKey;
}

function currentAutoPhase(currentState) {
  const phase = currentState.hand.postflop?.status === "active"
    ? currentState.hand.postflop
    : currentState.hand.preflop;

  return phase?.status === "active" ? phase : null;
}

subscribe("*", () => {
  renderControls(controlsRoot, state, actions);
  renderRangeAlert(rangeAlertRoot);
  renderTable(tableRoot, state, actions);
  createIcons({
    icons: {
      RefreshCcw,
      RotateCcw,
      Settings,
      Shuffle,
      StepForward,
    },
  });
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && (state.ui.openPopover || state.ui.openRangeSeat !== null)) {
    actions.setOpenPopover(null);
    actions.setOpenRangeSeat(null);
  }
});

actions.dealNewHand();

// If the coach was already enabled + configured, test the saved connection on
// load so it shows connected without a manual click (a health check, not a
// coaching call).
if (isCoachConfigured(state.coach.config)) {
  actions.testCoachConnection();
}

function renderRangeAlert(container) {
  const error = getOpeningRangeLoadError();
  container.replaceChildren();

  if (!error) {
    return;
  }

  const alert = document.createElement("div");
  alert.className = "app-alert";
  alert.setAttribute("role", "alert");
  alert.textContent = `RFI chart failed to load: ${error.message}`;
  container.append(alert);
}

function queueEquitySimulation() {
  const heroCards = state.hand.holeCards[state.config.heroSeat] || [];
  const villains = villainInputsForCurrentState();
  const phase = state.hand.postflop || state.hand.preflop;

  if (heroCards.length !== 2) {
    return;
  }

  if (phase?.folded?.[state.config.heroSeat]) {
    updateState((draft) => {
      applyEquityResult(draft, {
        heroEquity: 0,
        equityCI: 0,
        tieRate: 0,
        iterations: 1,
        opponentCount: villains.length,
        exact: true,
      });
      draft.maths.simStatus = "done";
    });
    return;
  }

  if (villains.length === 0) {
    updateState((draft) => {
      applyEquityResult(draft, {
        heroEquity: 1,
        equityCI: 0,
        tieRate: 0,
        iterations: 1,
        opponentCount: 0,
        exact: true,
      });
      draft.maths.simStatus = "done";
    });
    return;
  }

  const requestId = equityRequestId + 1;
  equityRequestId = requestId;

  updateState((draft) => {
    draft.maths.simStatus = "running";
    draft.maths.iterations = 0;
    draft.maths.exact = false;
  });

  const worker = getEquityWorker();
  const input = {
    heroCards,
    board: state.hand.board,
    villains,
    iterations: state.hand.board.length === 0 ? 20000 : 10000,
    progressEvery: 5000,
    timeLimitMs: 300,
    seed: `${state.hand.seed}-${state.hand.street}-${state.config.players}`,
  };

  worker.postMessage({ id: requestId, input });
}

function villainInputsForCurrentState() {
  const phase = state.hand.postflop || state.hand.preflop;
  const villainSeats = Array.from({ length: state.config.players }, (_, seat) => seat)
    .filter((seat) => seat !== state.config.heroSeat)
    .filter((seat) => !phase?.folded?.[seat]);

  if (state.ui.revealVillains || state.hand.street === "showdown") {
    return villainSeats.map((seat) => ({
      type: "cards",
      cards: state.hand.holeCards[seat],
    }));
  }

  return villainSeats.map(() => ({ type: "random" }));
}

function getEquityWorker() {
  if (equityWorker) {
    return equityWorker;
  }

  equityWorker = new Worker(new URL("./engine/equity.worker.js", import.meta.url), {
    type: "module",
  });

  equityWorker.onmessage = (event) => {
    const { id, type, result, error } = event.data;

    if (id !== equityRequestId) {
      return;
    }

    if (type === "error") {
      updateState((draft) => {
        draft.maths.simStatus = "error";
        draft.maths.error = error;
      });
      return;
    }

    updateState((draft) => {
      applyEquityResult(draft, result);
      draft.maths.simStatus = type === "done" ? "done" : "running";
    });
  };

  return equityWorker;
}

function applyEquityResult(draft, result) {
  draft.maths.heroEquity = result.heroEquity;
  draft.maths.equityCI = result.equityCI;
  draft.maths.tieRate = result.tieRate;
  draft.maths.iterations = result.iterations;
  draft.maths.opponentCount = result.opponentCount;
  draft.maths.exact = result.exact;
  draft.maths.error = null;
  refreshMaths(draft, { keepEquity: true });
}

function refreshMaths(draft, { keepEquity }) {
  draft.maths.requiredEquity = requiredEquity(draft.hand.pot, draft.hand.toCall);

  if (!keepEquity) {
    draft.maths.heroEquity = null;
    draft.maths.equityCI = null;
    draft.maths.tieRate = null;
    draft.maths.iterations = 0;
    draft.maths.exact = false;
    draft.maths.verdict = null;
  }

  draft.maths.evCall = draft.maths.heroEquity === null
    ? null
    : evCall({
      equity: draft.maths.heroEquity,
      pot: draft.hand.pot,
      toCall: draft.hand.toCall,
    });
  draft.maths.verdict = draft.maths.heroEquity === null || draft.hand.toCall <= 0
    ? null
    : callVerdict({
      equity: draft.maths.heroEquity,
      pot: draft.hand.pot,
      toCall: draft.hand.toCall,
    });
}

function applyPreflopToDraft(draft, preflop) {
  draft.hand.preflop = preflop;
  draft.hand.pot = preflop.pot;
  draft.hand.toCall = preflop.heroToCall || 0;
  draft.hand.actionLog = preflop.actionLog;

  if (isTerminalPhase(preflop)) {
    draft.config.tableStacks = { ...preflop.stacks };
  }

  if (preflop.status === "waitingHero") {
    draft.ui.heroRaiseTo = suggestedHeroRaiseTo(preflop);
  }
}

function applyPostflopToDraft(draft, postflop) {
  draft.hand.postflop = postflop;
  draft.hand.street = postflop.result === "showdown" ? "showdown" : postflop.street;
  draft.hand.board = postflop.board;
  draft.hand.pot = postflop.pot;
  draft.hand.toCall = postflop.heroToCall || 0;
  draft.hand.actionLog = postflop.actionLog;

  if (isTerminalPhase(postflop)) {
    draft.config.tableStacks = { ...postflop.stacks };
  }

  if (postflop.status === "waitingHero") {
    draft.ui.heroRaiseTo = suggestedHeroBet(postflop);
  }
}

function ensureSeatProfiles(config) {
  config.seatProfiles = config.seatProfiles || {};
  config.tableStacks = normalizeStacksForPlayers(config.tableStacks, config.players, config.stack);

  for (let seat = 0; seat < config.players; seat += 1) {
    if (seat === config.heroSeat) {
      continue;
    }

    config.seatProfiles[String(seat)] = config.seatProfiles[String(seat)] || "standard";
  }
}

function startingStacksForNextHand({ seed, players }) {
  // Replaying a specific hand: reuse the exact stacks it started with so the
  // replay stays deterministic.
  if (seed && state.hand.startingStacks) {
    return normalizeStacksForPlayers(state.hand.startingStacks, players, state.config.stack);
  }

  // A fresh hand carries over the stacks from the completed hand so the table
  // plays as a continuous session (stacks grow/shrink with results). Use the
  // "New game" control to reset everyone to the configured stack.
  const completedPhase = completedPhaseForStacks(state);

  if (!seed && completedPhase?.stacks) {
    return normalizeStacksForPlayers(completedPhase.stacks, players, state.config.stack);
  }

  return normalizeStacksForPlayers(state.config.tableStacks, players, state.config.stack);
}

function completedPhaseForStacks(currentState) {
  if (isTerminalPhase(currentState.hand.postflop)) {
    return currentState.hand.postflop;
  }

  if (isTerminalPhase(currentState.hand.preflop)) {
    return currentState.hand.preflop;
  }

  return null;
}

function isTerminalPhase(phase) {
  return phase?.status === "complete" && phase.result !== "wouldSeeFlop";
}

function normalizeStacksForPlayers(stacks, players, fallbackStack) {
  return Object.fromEntries(Array.from({ length: players }, (_, seat) => {
    const stack = Number(stacks?.[seat]);
    return [seat, Number.isFinite(stack) ? cleanAmount(stack) : fallbackStack];
  }));
}

function defaultStacksForPlayers(players, stack) {
  return Object.fromEntries(Array.from({ length: players }, (_, seat) => [seat, stack]));
}

function autoActionLimitForState(currentState) {
  return actionDelayForState(currentState) > 0 ? 0 : Infinity;
}

function actionDelayForState(currentState) {
  return Math.max(0, Math.min(2000, cleanAmount(currentState.ui.actionDelayMs)));
}

function cleanAmount(value) {
  const amount = Number(value);

  if (!Number.isFinite(amount) || amount < 0) {
    return 0;
  }

  return amount;
}

function canContinueScriptedHand(currentState) {
  return Boolean(nextScriptedStreet(currentState.hand));
}

function nextScriptedStreet(hand) {
  if (hand.postflop?.status === "streetComplete") {
    if (hand.postflop.street === "flop") {
      return "turn";
    }

    if (hand.postflop.street === "turn") {
      return "river";
    }
  }

  if (!hand.postflop && hand.preflop?.status === "complete" && hand.preflop.result === "wouldSeeFlop") {
    return "flop";
  }

  return null;
}

function actionLogForStreet(hand, heroSeat, street) {
  const streetOrder = ["preflop", "flop", "turn", "river", "showdown"];
  const selectedIndex = streetOrder.indexOf(street);
  const log = hand.actionLog.filter((entry) => entry.street === "preflop");

  if (selectedIndex >= streetOrder.indexOf("flop")) {
    log.push({ seat: heroSeat, street: "flop", action: `flop dealt ${hand.boardRunout.slice(0, 3).join(" ")}`, size: 0 });
  }

  if (selectedIndex >= streetOrder.indexOf("turn")) {
    log.push({ seat: heroSeat, street: "turn", action: `turn dealt ${hand.boardRunout[3]}`, size: 0 });
  }

  if (selectedIndex >= streetOrder.indexOf("river")) {
    log.push({ seat: heroSeat, street: "river", action: `river dealt ${hand.boardRunout[4]}`, size: 0 });
  }

  if (street === "showdown") {
    log.push({ seat: heroSeat, street: "showdown", action: "all live hands revealed", size: 0 });
  }

  return log.map((entry) => ({
    ...entry,
    streetLabel: STREET_LABELS[entry.street],
  }));
}

if (import.meta.env.DEV) {
  window.__feltState = () => state;
  window.__feltActions = actions;
}
