import { BarChart3, BookOpen, Calculator, createIcons, Download, RefreshCcw, RotateCcw, Settings, Shuffle, StepForward, Trash2, Upload, Users, Zap } from "lucide";
import { coachChatCompletion, testCoachConnection as pingCoachConnection } from "./coach/client.js";
import { coachStatus, isCoachConfigured, loadCoachConfig, saveCoachConfig, loadCoachSettings, saveCoachSettings, normalizeSavedCoachConfig, createCoachConfigId, normalizeCoachConfig } from "./coach/config.js";
import { clearCoachKey, loadCoachKey, setCoachKey } from "./coach/key-store.js";
import {
  buildBetTipMessages,
  buildChatMessages,
  buildExplainMessages,
  buildHandReviewMessages,
  buildTrackerLeakMessages,
  buildTrackerSummaryMessages,
} from "./coach/prompts.js";
import { buildCoachSnapshot } from "./coach/snapshot.js";
import {
  buildTrackerLeakSnapshot,
  buildTrackerSummarySnapshot,
  TRACKER_SUMMARY_TOPIC,
  trackerExampleTopic,
  trackerLeakTopic,
} from "./coach/tracker.js";
import { boardForStreet, dealHoldemHand, nextStreet, STREET_LABELS } from "./engine/deck.js";
import { getOpeningRangeLoadError } from "./data/ranges/opening-ranges.js";
import { callVerdict, evCall } from "./engine/ev.js";
import { evaluatePostflopDecision, evaluateHeroCommitment, postflopDecisionKey } from "./engine/postflop-ev.js";
import {
  advancePreflopAction,
  applyHeroPreflopAction,
  startPreflopAction,
} from "./engine/preflop-action.js";
import {
  advancePostflopAction,
  applyHeroPostflopAction,
  legalPostflopActions,
  startPostflopStreet,
} from "./engine/postflop-action.js";
import { requiredEquity } from "./engine/potodds.js";
import { advanceAfterHand, blindsForLevel, getBlindStructure, startTournament } from "./engine/tournament.js";
import { state, subscribe, updateState } from "./state.js";
import {
  createHero,
  deleteHeroAndHands,
  ensureDefaultHero,
  heroExportPayload,
  importedHeroEntries,
  loadActiveHeroId,
  loadHeroes,
  mergeImportedHeroes,
  saveActiveHeroId,
  saveHero,
} from "./heroes/store.js";
import { PROFILE_IDS } from "./engine/player-model.js";
import { applySeatAssignment } from "./roster/seat-assignments.js";
import { createPlayer, loadRoster, mergeImportedRoster, normalizePlayer, saveRoster } from "./roster/store.js";
import { resolveSeatProfilesForHand } from "./roster/weights.js";
import { scorePreflopDecision } from "./tracker/preflop-leaks.js";
import { scorePostflopEvDecision, scorePostflopSizing, OVERSIZED_RATIO, UNDERSIZED_RATIO } from "./tracker/postflop-leaks.js";
import { normaliseDecision } from "./engine/decision-eval.js";
import { buildHandRecord, createHandRecordId } from "./tracker/recording.js";
import { loadHandsForHero, saveHandRecord } from "./tracker/store.js";
import { summarizeHands } from "./tracker/stats.js";
import { renderControls } from "./ui/controls.js";
import { renderTable } from "./ui/table.js";
import { betTipTopic, engineTipText } from "./ui/chips.js";
import { collectDrillSpots, leakStreet } from "./drill/selection.js";
import {
  advanceDrill,
  createDrillSession,
  emptyDrill,
  recordDrillResult,
} from "./drill/session.js";
import "./ui/theme.css";

const WILD_NAMES = [
  "Alice", "Bob", "Carrie", "Dave", "Emma", "Frank", "Grace", "Henry",
  "Isla", "Jack", "Kate", "Liam", "Maya", "Noah", "Olivia", "Pete",
  "Quinn", "Rosa", "Sam", "Tara", "Uma", "Vince", "Wendy", "Yuki",
];

const app = document.querySelector("#app");

if (!app) {
  throw new Error("App root not found.");
}



app.innerHTML = `
  <div class="app-shell">
    <header class="app-header">
      <h1>
        <span class="app-title__brand">Felt</span><span class="app-title__sep">·</span><span class="app-title__sub">Texas Hold'em trainer</span>
      </h1>
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
let trackerRequestId = 0;
const recordedHandIds = new Set();

state.roster = loadRoster();
const coachSettings = loadCoachSettings();
state.coach.settings.activeConfigId = coachSettings.activeConfigId;
state.coach.settings.configs = coachSettings.configs;
state.coach.config = coachSettings.activeConfig;
if (state.coach.config.model && !state.coach.config.enabled) {
  state.coach.config.enabled = true;
}
state.coach.status = coachStatus(state.coach.config);

const actions = {
  dealNewHand(seed, { resetStacks = false, stackOverrides = null } = {}) {
    clearAutoActionTimer();
    const players = state.config.players;
    const heroSeat = Math.floor(players / 2);

    // B1: in tournament mode, blinds and (on reset) the starting stack come from
    // the selected structure. resetStacks starts a fresh tournament at level 1.
    const tournamentOn = state.tournament.enabled;
    const structure = tournamentOn ? getBlindStructure(state.tournament.structureId) : null;
    const progress = tournamentOn && resetStacks
      ? startTournament(state.tournament.structureId)
      : state.tournament;
    const blinds = tournamentOn ? blindsForLevel(structure, progress.levelIndex) : state.config.blinds;

    const tournamentBuyIn = tournamentOn
      ? (Number(state.tournament.buyIn) > 0 ? Number(state.tournament.buyIn) : structure.startingStack)
      : null;
    const startingStacks = resetStacks
      ? defaultStacksForPlayers(players, tournamentOn ? tournamentBuyIn : state.config.stack)
      : startingStacksForNextHand({ seed, players, heroSeat });

    if (stackOverrides) {
      for (const [seat, amount] of Object.entries(stackOverrides)) {
        startingStacks[seat] = amount;
      }
    }
    const autoActionLimit = autoActionLimitForState(state);
    const manualSpot = state.ui.spotMode === "manual"
      ? { pot: state.hand.pot || 24, toCall: state.hand.toCall || 8 }
      : null;
    // B5: seats with chips are live; the dealer deals the button + blinds only
    // among them so busted players don't get dealt the blinds.
    const liveSeats = Object.entries(startingStacks)
      .filter(([, amount]) => Number(amount) > 0)
      .map(([seat]) => Number(seat));

    // The dealer button rotates one live seat per hand (not re-randomised each
    // hand). Replaying the current hand reproduces its exact button; a drill/other
    // seed and the first hand of a session fall back to the deck's random draw.
    const prevButton = state.hand?.buttonSeat;
    let buttonSeat;
    if (seed && seed === state.hand?.seed) {
      buttonSeat = prevButton;
    } else if (seed || resetStacks || !Number.isInteger(prevButton)) {
      buttonSeat = undefined;
    } else {
      buttonSeat = nextLiveButtonSeat(prevButton, liveSeats);
    }

    const hand = dealHoldemHand({
      players,
      heroSeat,
      blinds,
      seed,
      liveSeats,
      buttonSeat,
    });

    updateState((draft) => {
      draft.config.heroSeat = heroSeat;
      draft.config.tableStacks = startingStacks;

      // B1: apply this hand's tournament blinds, then advance the level counter
      // for the next fresh hand (replays keep the level they were played at).
      if (tournamentOn) {
        draft.config.blinds = blinds;
        // Merge progress into the existing tournament state rather than replacing
        // it — startTournament()/advanceAfterHand() only carry structure/level
        // fields, so a plain assignment would drop `enabled` and `buyIn`. Losing
        // `enabled` flips the table into cash display mode, where formatAmount
        // multiplies every amount by bbDollarValue (default 2) — that's the
        // "stacks doubled to 2x the buy-in" report (chips were always correct).
        draft.tournament = {
          ...draft.tournament,
          ...(seed ? progress : advanceAfterHand(progress, structure)),
        };
      }
      ensureSeatProfiles(draft.config);
      const resolvedSeats = resolveSeatProfilesForHand({
        config: draft.config,
        roster: draft.roster,
        seed: hand.seed,
      });
      draft.config.seatProfiles = resolvedSeats.seatProfiles;
      draft.config.seatModes = resolvedSeats.seatModes;
      draft.hand = hand;
      draft.hand.startingStacks = { ...startingStacks };
      draft.hand.postflop = null;
      draft.hand.trackerRecordId = draft.activeHeroId ? createHandRecordId(draft.activeHeroId, hand.seed) : "";
      draft.hand.trackerDecisions = [];
      draft.hand.lastFeedback = null;
      draft.ui.awaitingStart = false;
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
    void recordCurrentHandIfTerminal();
  },
  replayHand() {
    if (state.hand.seed) {
      actions.dealNewHand(state.hand.seed);
    }
  },
  newGame() {
    // Reset stacks and drop into a setup state (no hand dealt yet) so the table
    // can be arranged via the seat pickers; "Start" deals the first hand.
    clearAutoActionTimer();
    const players = state.config.players;
    const heroSeat = Math.floor(players / 2);

    updateState((draft) => {
      draft.config.heroSeat = heroSeat;
      draft.config.tableStacks = defaultStacksForPlayers(players, draft.config.stack);
      draft.hand.preflop = null;
      draft.hand.postflop = null;
      draft.hand.holeCards = {};
      draft.hand.board = [];
      draft.hand.boardRunout = [];
      draft.hand.burnCards = [];
      draft.hand.street = "preflop";
      draft.hand.pot = 0;
      draft.hand.toCall = 0;
      draft.hand.actionLog = [];
      draft.hand.seed = "";
      draft.hand.startingStacks = {};
      draft.hand.trackerRecordId = "";
      draft.hand.trackerDecisions = [];
      draft.hand.lastFeedback = null;
      draft.ui.awaitingStart = true;
      draft.ui.openPopover = null;
      draft.ui.openRangeSeat = null;
      draft.ui.revealVillains = false;
      draft.drill = emptyDrill();
      resetSession(draft); // a session is "since New game"
      resetCoachHandState(draft);
    });
  },
  startGame() {
    actions.dealNewHand(undefined, { resetStacks: true });
    const target = state.config.startStreet || "preflop";
    if (target !== "preflop") {
      actions.setStreet(target);
    }
  },
  rebuyHero() {
    // Top the hero back up to the starting stack (others keep their stacks). In a
    // tournament that's the buy-in (the structure's startingStack if no override),
    // not the cash config stack.
    const heroSeat = Math.floor(state.config.players / 2);
    const tournamentOn = state.tournament?.enabled;
    const structure = tournamentOn ? getBlindStructure(state.tournament.structureId) : null;
    const rebuyTo = tournamentOn
      ? (Number(state.tournament.buyIn) > 0 ? Number(state.tournament.buyIn) : structure.startingStack)
      : state.config.stack;
    actions.dealNewHand(undefined, { stackOverrides: { [heroSeat]: rebuyTo } });
  },
  async heroAdd({ name } = {}) {
    const hero = createHero({ name });

    if (!hero) {
      return null;
    }

    await saveHero(hero);
    saveActiveHeroId(hero.id);
    updateState((draft) => {
      draft.heroes = [...draft.heroes, hero];
      draft.activeHeroId = hero.id;
      draft.tracker.selectedLeakType = "";
      draft.ui.trackerImportStatus = null;
      draft.hand.lastFeedback = null;
    });
    await refreshTrackerData(hero.id);
    return hero;
  },
  selectHero(id) {
    if (!state.heroes.some((hero) => hero.id === id)) {
      return;
    }

    saveActiveHeroId(id);
    updateState((draft) => {
      draft.activeHeroId = id;
      draft.tracker.selectedLeakType = "";
      draft.ui.trackerImportStatus = null;
      if (draft.hand.seed) {
        draft.hand.trackerRecordId = createHandRecordId(id, draft.hand.seed);
        draft.hand.trackerDecisions = [];
        draft.hand.lastFeedback = null;
      }
    });
    void refreshTrackerData(id);
  },
  async heroRename(id, name) {
    const cleanName = String(name || "").trim();
    const hero = state.heroes.find((candidate) => candidate.id === id);

    if (!hero || !cleanName) {
      return null;
    }

    const saved = await saveHero({ ...hero, name: cleanName });
    updateState((draft) => {
      draft.heroes = draft.heroes.map((candidate) => (candidate.id === id ? saved : candidate));
    });
    return saved;
  },
  async heroRemove(id) {
    if (!id) {
      return;
    }

    await deleteHeroAndHands(id);
    let heroes = state.heroes.filter((hero) => hero.id !== id);
    heroes = await ensureDefaultHero(heroes);
    const activeHeroId = state.activeHeroId === id
      ? heroes[0]?.id || ""
      : state.activeHeroId;

    saveActiveHeroId(activeHeroId);
    updateState((draft) => {
      draft.heroes = heroes;
      draft.activeHeroId = activeHeroId;
      draft.tracker.selectedLeakType = "";
      draft.ui.trackerImportStatus = {
        kind: "success",
        message: "Hero deleted.",
      };
    });
    await refreshTrackerData(activeHeroId);
  },
  setTrackerOpen(open) {
    updateState((draft) => {
      draft.ui.trackerOpen = open;
    });
  },
  setGlossaryOpen(open) {
    updateState((draft) => {
      draft.ui.glossaryOpen = open;
    });
  },
  setTrackerLeak(leakType) {
    updateState((draft) => {
      draft.tracker.selectedLeakType = draft.tracker.selectedLeakType === leakType ? "" : leakType;
    });
  },
  replayTrackerHand(seed) {
    if (seed) {
      actions.dealNewHand(seed);
    }
  },
  heroExport({ includeHands = true } = {}) {
    const hero = activeHero(state);
    return heroExportPayload(hero, includeHands ? state.tracker.hands : []);
  },
  async backupSettings() {
    const heroData = await Promise.all(
      state.heroes.map(async (hero) => {
        const hands = await loadHandsForHero(hero.id);
        return { hero, hands };
      }),
    );

    const coachConfig = { ...state.coach.config };
    if (coachConfig.apiKey) {
      coachConfig.apiKey = "[set — not included in backup]";
    }

    const backup = {
      version: 1,
      exportedAt: new Date().toISOString(),
      config: {
        players: state.config.players,
        stack: state.config.stack,
        bbDollarValue: state.config.bbDollarValue,
        startStreet: state.config.startStreet,
      },
      ui: {
        displayUnit: state.ui.displayUnit,
        actionDelayMs: state.ui.actionDelayMs,
      },
      coach: coachConfig,
      roster: state.roster,
      heroes: heroData,
    };

    const date = new Date().toISOString().slice(0, 10);
    const blob = new Blob([`${JSON.stringify(backup, null, 2)}\n`], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `felt-backup-${date}.json`;
    link.style.display = "none";
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);

    const handCount = heroData.reduce((sum, entry) => sum + (entry.hands?.length || 0), 0);
    updateState((draft) => {
      draft.ui.pendingImport = null;
      draft.ui.dataImportStatus = {
        kind: "success",
        message: `Backup saved as felt-backup-${date}.json — ${state.roster.length} player${state.roster.length === 1 ? "" : "s"}, ${heroData.length} hero${heroData.length === 1 ? "" : "es"}, ${handCount} hand${handCount === 1 ? "" : "s"} (API key not included).`,
      };
    });
  },
  // Stage a parsed backup for confirmation (shows counts + Merge/Replace) rather
  // than importing immediately, so re-importing can't silently double data and
  // the destination coach endpoint is surfaced before any key is sent.
  stageImport(payload) {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      pendingImportPayload = null;
      updateState((draft) => {
        draft.ui.pendingImport = null;
        draft.ui.dataImportStatus = {
          kind: "error",
          message: "Import failed. Choose a valid Felt backup JSON file.",
        };
      });
      return;
    }

    const heroEntries = Array.isArray(payload.heroes) ? payload.heroes : [];
    const players = Array.isArray(payload.roster) ? payload.roster.length : 0;
    const heroes = heroEntries.filter((entry) => entry?.hero).length;
    const hands = heroEntries.reduce(
      (sum, entry) => sum + (Array.isArray(entry?.hands) ? entry.hands.length : 0),
      0,
    );

    const coachUrl = typeof payload.coach?.baseUrl === "string" ? payload.coach.baseUrl : "";
    let coachOrigin = "";
    let coachRemote = false;
    if (coachUrl) {
      try {
        const parsed = new URL(coachUrl);
        coachOrigin = parsed.origin;
        coachRemote = !/^(localhost|127\.0\.0\.1|\[::1\])$/i.test(parsed.hostname);
      } catch {
        coachOrigin = coachUrl;
        coachRemote = true;
      }
    }

    pendingImportPayload = payload;
    updateState((draft) => {
      draft.ui.dataImportStatus = null;
      draft.ui.pendingImport = {
        summary: { players, heroes, hands },
        coach: { origin: coachOrigin, remote: coachRemote },
      };
    });
  },
  cancelImport() {
    pendingImportPayload = null;
    updateState((draft) => {
      draft.ui.pendingImport = null;
    });
  },
  async confirmImport(mode = "merge") {
    const payload = pendingImportPayload;
    pendingImportPayload = null;

    if (!payload) {
      updateState((draft) => {
        draft.ui.pendingImport = null;
      });
      return;
    }

    await actions.importAllData(payload, { mode });
  },
  async importAllData(payload, { mode = "merge" } = {}) {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      updateState((draft) => {
        draft.ui.pendingImport = null;
        draft.ui.dataImportStatus = {
          kind: "error",
          message: "Import failed. Choose a valid Felt backup file.",
        };
      });
      return;
    }

    const replace = mode === "replace";

    // Replace: clear existing heroes + their hands and the roster first, so the
    // backup becomes the whole state instead of stacking on top (which would
    // double everything on a re-import).
    if (replace) {
      for (const hero of state.heroes) {
        try {
          await deleteHeroAndHands(hero.id);
        } catch {
          // Best-effort clear; keep going so a single failure can't strand us.
        }
      }
      updateState((draft) => {
        draft.heroes = [];
        draft.activeHeroId = "";
        draft.roster = saveRoster([]);
        if (draft.tracker) {
          draft.tracker.hands = [];
          draft.tracker.selectedLeakType = "";
        }
      });
    }

    // Table config + display prefs. (These aren't persisted across reloads, but
    // restoring them keeps the imported session consistent with the backup.)
    updateState((draft) => {
      const config = payload.config || {};
      if (Number.isFinite(config.players)) {
        draft.config.players = config.players;
        draft.config.heroSeat = Math.floor(config.players / 2);
      }
      if (Number.isFinite(config.stack)) {
        draft.config.stack = config.stack;
      }
      if (Number.isFinite(config.bbDollarValue)) {
        draft.config.bbDollarValue = config.bbDollarValue;
      }
      if (typeof config.startStreet === "string") {
        draft.config.startStreet = config.startStreet;
      }
      draft.config.tableStacks = defaultStacksForPlayers(draft.config.players, draft.config.stack);
      ensureSeatProfiles(draft.config);

      const ui = payload.ui || {};
      if (typeof ui.displayUnit === "string") {
        draft.ui.displayUnit = ui.displayUnit;
      }
      if (Number.isFinite(ui.actionDelayMs)) {
        draft.ui.actionDelayMs = cleanAmount(ui.actionDelayMs);
      }
    });

    // Coach / AI setup — restore everything EXCEPT the API key, which is never
    // written to a backup (security). The base URL + model carry over so the
    // user only has to paste their key once on the new machine.
    if (payload.coach && typeof payload.coach === "object") {
      const { apiKey: _ignoredApiKey, ...coachWithoutKey } = payload.coach;
      actions.setCoachConfig(coachWithoutKey);
    }

    // Known players (roster) — merged with anything already present.
    let rosterAdded = 0;
    if (Array.isArray(payload.roster)) {
      const rosterResult = actions.rosterImport(payload.roster);
      rosterAdded = rosterResult?.added || 0;
    }

    // Heroes + their tracked hands. A backup nests hands under each hero
    // ({ hero, hands }); flatten them and remap to the freshly-saved hero IDs.
    const heroEntries = Array.isArray(payload.heroes) ? payload.heroes : [];
    const sourceHeroes = heroEntries.map((entry) => entry?.hero).filter(Boolean);
    const flatHands = heroEntries
      .flatMap((entry) => (Array.isArray(entry?.hands) ? entry.hands : []))
      // Drop malformed records: a hand must be a plain object with a string seed.
      .filter((hand) => hand && typeof hand === "object" && typeof hand.seed === "string" && hand.seed);

    let heroesAdded = 0;
    let handsAdded = 0;
    let quotaHit = false;

    if (sourceHeroes.length) {
      const result = mergeImportedHeroes(state.heroes, { heroes: sourceHeroes });
      const savedHeroes = [];
      for (const hero of result.imported) {
        savedHeroes.push(await saveHero(hero));
      }
      heroesAdded = savedHeroes.filter(Boolean).length;

      // Map each source hero id to its freshly-saved id (index aligned).
      const heroIdMap = new Map();
      sourceHeroes.forEach((source, index) => {
        if (source?.id && savedHeroes[index]?.id) {
          heroIdMap.set(source.id, savedHeroes[index].id);
        }
      });
      if (sourceHeroes.length === 1 && savedHeroes[0]?.id) {
        heroIdMap.set(sourceHeroes[0]?.id, savedHeroes[0].id);
      }

      // Persist hands in chunks, yielding to the event loop between batches so a
      // large history doesn't freeze the UI; stop cleanly if storage fills up.
      const CHUNK = 200;
      for (let i = 0; i < flatHands.length && !quotaHit; i += CHUNK) {
        const batch = flatHands.slice(i, i + CHUNK);
        for (const hand of batch) {
          const heroId = heroIdMap.get(hand.heroId)
            || (savedHeroes.length === 1 ? savedHeroes[0]?.id : null);
          if (!heroId) {
            continue;
          }
          try {
            await saveHandRecord({
              ...hand,
              id: createHandRecordId(heroId, hand.seed),
              heroId,
              ts: Number(hand.ts) || Date.now(),
            });
            handsAdded += 1;
          } catch {
            quotaHit = true;
            break;
          }
        }
        await new Promise((resolve) => setTimeout(resolve, 0));
      }

      const activeHeroId = savedHeroes[0]?.id || state.activeHeroId;
      saveActiveHeroId(activeHeroId);
      updateState((draft) => {
        draft.heroes = result.heroes;
        draft.activeHeroId = activeHeroId;
      });
      await refreshTrackerData(activeHeroId);
    }

    updateState((draft) => {
      draft.ui.pendingImport = null;
      draft.ui.dataImportStatus = quotaHit
        ? {
          kind: "error",
          message: `Storage limit reached - imported ${rosterAdded} player${rosterAdded === 1 ? "" : "s"}, ${heroesAdded} hero${heroesAdded === 1 ? "" : "es"} and ${handsAdded} hand${handsAdded === 1 ? "" : "s"} before running out of space.`,
        }
        : {
          kind: "success",
          message: `${replace ? "Replaced with" : "Imported"} ${rosterAdded} player${rosterAdded === 1 ? "" : "s"}, ${heroesAdded} hero${heroesAdded === 1 ? "" : "es"} (${handsAdded} hand${handsAdded === 1 ? "" : "s"}) and AI settings. Re-enter your AI API key in Coach to finish.`,
        };
    });
  },
  setDataImportStatus(dataImportStatus) {
    updateState((draft) => {
      draft.ui.dataImportStatus = dataImportStatus;
    });
  },
  async heroImport(payload) {
    const sourceHeroes = importedHeroEntries(payload);
    const result = mergeImportedHeroes(state.heroes, payload);

    if (!result.added) {
      updateState((draft) => {
        draft.ui.trackerImportStatus = {
          kind: "error",
          message: "Import failed. No valid hero found.",
        };
      });
      return result;
    }

    const savedHeroes = [];
    for (const hero of result.imported) {
      savedHeroes.push(await saveHero(hero));
    }

    const importedHands = await importHandsForHeroes({
      payload,
      sourceHeroes,
      importedHeroes: savedHeroes,
    });
    const activeHeroId = savedHeroes[0]?.id || state.activeHeroId;
    saveActiveHeroId(activeHeroId);
    updateState((draft) => {
      draft.heroes = result.heroes;
      draft.activeHeroId = activeHeroId;
      draft.tracker.selectedLeakType = "";
      draft.ui.trackerImportStatus = {
        kind: "success",
        message: `Imported ${savedHeroes.length} hero${savedHeroes.length === 1 ? "" : "es"} and ${importedHands} hand${importedHands === 1 ? "" : "s"}.`,
      };
    });
    await refreshTrackerData(activeHeroId);
    return result;
  },
  setTrackerImportStatus(trackerImportStatus) {
    updateState((draft) => {
      draft.ui.trackerImportStatus = trackerImportStatus;
    });
  },
  rosterAdd({ name, profile = "standard" } = {}) {
    const player = createPlayer({ name, profile });

    if (!player) {
      return;
    }

    updateState((draft) => {
      draft.roster = saveRoster([...draft.roster, player]);
      draft.ui.rosterImportStatus = null;
    });
  },
  rosterRemove(id) {
    updateState((draft) => {
      draft.roster = saveRoster(draft.roster.filter((player) => player.id !== id));

      const seatPlayers = { ...draft.config.seatPlayers };
      const seatModes = { ...draft.config.seatModes };
      const seatProfiles = { ...draft.config.seatProfiles };
      const seatAssignments = { ...draft.config.seatAssignments };
      for (const seat of Object.keys(seatPlayers)) {
        if (seatPlayers[seat] === id) {
          delete seatPlayers[seat];
          delete seatModes[seat];
          delete seatProfiles[seat];
          delete seatAssignments[seat];
        }
      }
      draft.config.seatPlayers = seatPlayers;
      draft.config.seatModes = seatModes;
      draft.config.seatProfiles = seatProfiles;
      draft.config.seatAssignments = seatAssignments;
    });
  },
  setRosterOpen(open) {
    if (state.ui.rosterOpen === open) {
      return;
    }

    updateState((draft) => {
      draft.ui.rosterOpen = open;
    });
  },
  rosterSetProfile(id, profile) {
    updateState((draft) => {
      draft.roster = saveRoster(draft.roster.map((player) => (
        player.id === id ? { ...player, profile } : player
      )));
    });
  },
  rosterSetWeights(id, weights) {
    updateState((draft) => {
      draft.roster = saveRoster(draft.roster.map((player) => (
        player.id === id ? { ...player, weights } : player
      )));
    });
  },
  rosterExport() {
    return state.roster.map((player) => normalizePlayer(player)).filter(Boolean);
  },
  rosterImport(payload) {
    let result = { added: 0, skipped: 0, roster: state.roster };

    updateState((draft) => {
      result = mergeImportedRoster(draft.roster, payload);
      draft.roster = saveRoster(result.roster);
      draft.ui.rosterImportStatus = {
        kind: result.added > 0 ? "success" : "neutral",
        message: `Imported ${result.added} player${result.added === 1 ? "" : "s"}${result.skipped ? `, skipped ${result.skipped}` : ""}.`,
      };
    });

    return result;
  },
  setRosterImportStatus(rosterImportStatus) {
    updateState((draft) => {
      draft.ui.rosterImportStatus = rosterImportStatus;
    });
  },
  dealHomeGame() {
    // Seat the known-player roster into the villain seats (round-robin if there
    // are fewer players than seats) and deal — "the pub game".
    if (!state.roster.length) {
      return;
    }

    const players = state.config.players;
    const heroSeat = Math.floor(players / 2);
    const shuffled = [...state.roster].sort(() => Math.random() - 0.5);
    const seatPlayers = {};
    const seatProfiles = { ...state.config.seatProfiles };
    const seatAssignments = {};
    let index = 0;

    for (let seat = 0; seat < players; seat += 1) {
      if (seat === heroSeat) {
        continue;
      }

      const player = shuffled[index];

      if (player) {
        // Seat the next known player.
        seatPlayers[seat] = player.id;
        seatProfiles[String(seat)] = player.profile;
        seatAssignments[String(seat)] = `player:${player.id}`;
        index += 1;
      } else {
        // Not enough known players — fill the rest with a standard player.
        seatProfiles[String(seat)] = "standard";
        seatAssignments[String(seat)] = "profile:standard";
      }
    }

    updateState((draft) => {
      draft.config.seatPlayers = seatPlayers;
      draft.config.seatProfiles = seatProfiles;
      draft.config.seatModes = {};
      draft.config.seatAssignments = seatAssignments;
      draft.config.seatNames = {};
    });
  },
  dealWildTable() {
    const players = state.config.players;
    const heroSeat = Math.floor(players / 2);
    const seatProfiles = {};
    const seatModes = {};
    const seatNames = {};
    const shuffledNames = [...WILD_NAMES].sort(() => Math.random() - 0.5);
    let nameIdx = 0;

    for (let seat = 0; seat < players; seat += 1) {
      if (seat === heroSeat) continue;
      const profile = PROFILE_IDS[Math.floor(Math.random() * PROFILE_IDS.length)];
      seatProfiles[String(seat)] = profile;
      seatModes[String(seat)] = "wild";
      seatNames[seat] = shuffledNames[nameIdx % shuffledNames.length];
      nameIdx += 1;
    }

    updateState((draft) => {
      draft.config.seatPlayers = {};
      draft.config.seatProfiles = seatProfiles;
      draft.config.seatModes = seatModes;
      draft.config.seatAssignments = {};
      draft.config.seatNames = seatNames;
    });
  },
  setPlayers(players) {
    clearAutoActionTimer();
    updateState((draft) => {
      draft.config.players = players;
      draft.config.heroSeat = Math.floor(players / 2);
      draft.config.tableStacks = defaultStacksForPlayers(players, draft.config.stack);
      ensureSeatProfiles(draft.config);
      draft.config.seatNames = {};
    });
    if (!state.ui.awaitingStart) {
      actions.dealNewHand();
    }
  },
  setStreet(street) {
    updateState((draft) => {
      draft.hand.preflop = null;
      draft.hand.postflop = null;
      draft.hand.street = street;
      draft.hand.board = boardForStreet(draft.hand.boardRunout, street);
      draft.hand.actionLog = actionLogForStreet(draft.hand, draft.config.heroSeat, street);
      draft.ui.openPopover = null;
      draft.ui.openRangeSeat = null;
      refreshMaths(draft, { keepEquity: false });
    });
    queueEquitySimulation();
  },
  setStartStreet(street) {
    updateState((draft) => {
      draft.config.startStreet = street;
    });
  },
  setSeatScale(scale) {
    updateState((draft) => {
      draft.ui.seatScale = scale;
    });
  },
  setShowSetupTypes(value) {
    updateState((draft) => {
      draft.ui.showSetupTypes = value;
    });
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
      // Clear the prior street's grade so a leftover (e.g. the preflop call grade)
      // doesn't linger and look like it's grading the new street. A check produces
      // no grade, so the panel stays clean until the next gradable decision.
      draft.hand.lastFeedback = null;
      draft.ui.openPopover = null;
      draft.ui.openRangeSeat = null;
      refreshMaths(draft, { keepEquity: false });
    });
    queueEquitySimulation();
    scheduleAutoAction();
    void recordCurrentHandIfTerminal();
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
  async requestBetTipCoach() {
    if (!isCoachConfigured(state.coach.config)) {
      return; // the popover shows an offline / not-configured note instead
    }

    const topic = betTipTopic(state);
    const existing = state.coach.explain?.[topic];

    if (existing && existing.status === "loading") {
      return; // a request for this exact spot is already in flight
    }

    const snapshot = buildCoachSnapshot(state, { recommendation: engineTipText(state) });
    const messages = buildBetTipMessages({ snapshot });

    await requestCoachMessages({ topic, messages, maxTokens: 180 });
  },
  dismissCoachExplain(topic) {
    updateState((draft) => {
      if (draft.coach.explain?.[topic]) {
        draft.coach.explain[topic] = { status: "idle", content: "", error: "" };
      }
    });
  },
  dismissCoachReview() {
    updateState((draft) => {
      draft.coach.review = { status: "idle", content: "", error: "" };
    });
  },
  setOpenRangeSeat(openRangeSeat) {
    updateState((draft) => {
      draft.ui.openRangeSeat = openRangeSeat;
      draft.ui.openPopover = null;
    });
  },
  setSettingsOpen(settingsOpen) {
    updateState((draft) => {
      draft.ui.settingsOpen = settingsOpen;
      draft.coach.settingsOpen = false;
    });
  },
  setCoachSettingsOpen(settingsOpen) {
    updateState((draft) => {
      draft.coach.settingsOpen = settingsOpen;
    });
  },
  setCoachConfig(values) {
    const previousBaseUrl = state.coach.config.baseUrl;

    updateState((draft) => {
      const merged = { ...draft.coach.config, ...values };
      if (merged.model && !merged.enabled) {
        merged.enabled = true;
      }
      draft.coach.config = merged;
      draft.coach.status = coachStatus(merged);
      draft.coach.testStatus = "idle";
      draft.coach.lastError = "";

      if (!isCoachConfigured(merged)) {
        resetCoachResponses(draft);
      }

      if (Object.hasOwn(values, "baseUrl") && merged.baseUrl !== previousBaseUrl) {
        draft.coach.availableModels = [];
      }
    });

    if (isCoachConfigured(state.coach.config)) {
      actions.testCoachConnection();
    }
  },
  async saveCurrentCoachConfig() {
    let savedConfigId;
    updateState((draft) => {
      if (!draft.coach.config.id) {
        draft.coach.config.id = createCoachConfigId();
      }
      savedConfigId = draft.coach.config.id;

      const configToSave = { ...draft.coach.config };
      const index = draft.coach.settings.configs.findIndex((c) => c.id === configToSave.id);
      
      const savedConfig = normalizeSavedCoachConfig(configToSave);
      
      if (index >= 0) {
        draft.coach.settings.configs[index] = savedConfig;
      } else {
        draft.coach.settings.configs.push(savedConfig);
      }
      
      draft.coach.settings.activeConfigId = savedConfig.id;
    });

    const settings = {
      activeConfigId: state.coach.settings.activeConfigId,
      configs: state.coach.settings.configs,
    };
    saveCoachSettings(settings);

    if (Object.hasOwn(state.coach.config, "apiKey")) {
      await setCoachKey(savedConfigId, state.coach.config.apiKey);
    }
  },
  async loadSavedCoachConfig(id) {
    const savedConfig = state.coach.settings.configs.find((c) => c.id === id);
    if (!savedConfig) return;

    updateState((draft) => {
      draft.coach.settings.activeConfigId = id;
      draft.coach.config = normalizeCoachConfig(savedConfig);
      draft.coach.status = "unconfigured";
      draft.coach.testStatus = "idle";
      draft.coach.lastError = "";
      draft.coach.availableModels = [];
    });

    const settings = {
      activeConfigId: state.coach.settings.activeConfigId,
      configs: state.coach.settings.configs,
    };
    saveCoachSettings(settings);

    const apiKey = await loadCoachKey(id);
    if (apiKey) {
      updateState((draft) => {
        draft.coach.config.apiKey = apiKey;
      });
    }

    if (isCoachConfigured(state.coach.config)) {
      actions.testCoachConnection();
    }
  },
  newCoachConfig() {
    updateState((draft) => {
      draft.coach.config = {
        id: "",
        name: "",
        enabled: true,
        baseUrl: "http://localhost:4000/v1",
        model: "",
        apiKey: "",
      };
      draft.coach.status = "unconfigured";
      draft.coach.testStatus = "idle";
      draft.coach.lastError = "";
      draft.coach.availableModels = [];
    });
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
    const snapshot = buildCoachSnapshot(state, { recommendation: engineTipText(state) });
    const messages = buildExplainMessages({ snapshot, topic });

    await requestCoachMessages({ topic, messages, maxTokens: 320 });
  },
  async requestTrackerCoachSummary() {
    const snapshot = buildTrackerSummarySnapshot(state);
    const messages = buildTrackerSummaryMessages({ snapshot });

    await requestCoachMessages({ topic: TRACKER_SUMMARY_TOPIC, messages, maxTokens: 260 });
  },
  async requestTrackerCoachLeak(leakType, exampleId = "") {
    const snapshot = buildTrackerLeakSnapshot(state, { leakType, exampleId });
    const topic = snapshot.example
      ? trackerExampleTopic(snapshot.example)
      : trackerLeakTopic(leakType);
    const messages = buildTrackerLeakMessages({ snapshot });

    await requestCoachMessages({ topic, messages, maxTokens: 260 });
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

    if (!isCoachConfigured(state.coach.config)) {
      updateState((draft) => markCoachOffline(draft));
      return;
    }

    const requestId = nextCoachRequestId();
    const config = { ...state.coach.config };
    const history = [...state.coach.chatHistory];
    const snapshot = buildCoachSnapshot(state, { recommendation: engineTipText(state) });
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
    if (!isCoachConfigured(state.coach.config)) {
      updateState((draft) => markCoachOffline(draft));
      return;
    }

    const requestId = nextCoachRequestId();
    const config = { ...state.coach.config };
    const snapshot = buildCoachSnapshot(state, { recommendation: engineTipText(state) });
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
    actions.setSeatAssignment(seat, `profile:${profileId}`);
  },
  setSeatAssignment(seat, assignment) {
    clearAutoActionTimer();
    const seed = state.hand.seed;

    updateState((draft) => {
      const seats = applySeatAssignment(draft.config, draft.roster, seat, assignment);

      if (!seats) {
        return;
      }

      draft.config.seatPlayers = seats.seatPlayers;
      draft.config.seatProfiles = seats.seatProfiles;
      draft.config.seatModes = seats.seatModes;
      draft.config.seatAssignments = seats.seatAssignments;
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
  setShowMaths(showMaths) {
    updateState((draft) => {
      draft.ui.showMaths = Boolean(showMaths);
      if (!draft.ui.showMaths && draft.ui.spotMode !== "manual") {
        draft.ui.openPopover = null;
      }
    });
  },
  setShowThreats(value) {
    updateState((draft) => {
      draft.ui.showThreats = Boolean(value);
    });
  },
  setOverbetWarn(value) {
    updateState((draft) => {
      draft.ui.overbetWarn = Boolean(value);
    });
  },
  setDeepSizing(value) {
    updateState((draft) => {
      draft.ui.deepSizing = Boolean(value);
    });
  },
  setDisplayUnit(displayUnit) {
    updateState((draft) => {
      draft.ui.displayUnit = displayUnit;
    });
  },
  setSessionEnabled(enabled) {
    updateState((draft) => {
      draft.session.enabled = Boolean(enabled);
      // Toggling live grading starts (or clears) a fresh session tally.
      resetSession(draft);
      draft.hand.lastFeedback = null;
    });
  },
  // B3: switch tournament mode on/off. Enabling resets to level 1 and applies
  // the structure's level-1 blinds (start a New game to apply the starting
  // stack); disabling reverts to the cash blinds.
  setTournamentEnabled(enabled) {
    updateState((draft) => {
      draft.tournament.enabled = Boolean(enabled);
      if (enabled) {
        const progress = startTournament(draft.tournament.structureId);
        Object.assign(draft.tournament, progress);
        draft.config.blinds = blindsForLevel(getBlindStructure(progress.structureId), progress.levelIndex);
      } else {
        draft.config.blinds = { sb: 0.5, bb: 1 };
      }
    });
  },
  setTournamentStructure(structureId) {
    updateState((draft) => {
      const progress = startTournament(structureId);
      Object.assign(draft.tournament, progress);
      if (draft.tournament.enabled) {
        draft.config.blinds = blindsForLevel(getBlindStructure(progress.structureId), progress.levelIndex);
      }
    });
  },
  // B3: optional chip buy-in override. Empty/<=0 falls back to the structure's
  // startingStack. Applies on the next New game (deal-in with the new stack).
  setTournamentBuyIn(chips) {
    updateState((draft) => {
      const value = Number(chips);
      draft.tournament.buyIn = Number.isFinite(value) && value > 0 ? value : null;
    });
  },
  startDrill(leakType, mode = "history") {
    const generated = mode === "generated";
    const spots = generated ? [] : collectDrillSpots(state.tracker.hands, leakType);
    const targetStreet = generated ? (leakStreet(state.tracker.hands, leakType) || "preflop") : "";

    if (!generated && !spots.length) {
      return;
    }

    updateState((draft) => {
      draft.drill = createDrillSession({ mode, leakType, targetStreet, spots });
      // Drills force live grading on so each spot is scored.
      draft.session.enabled = true;
      resetSession(draft);
      draft.hand.lastFeedback = null;
      draft.ui.trackerOpen = false; // leave the tracker panel for the table
    });

    // History replays the exact seed; generated deals a fresh random hand.
    actions.dealNewHand(generated ? undefined : spots[0].seed);
  },
  drillAdvance() {
    let result = { done: true, seed: null };

    updateState((draft) => {
      result = advanceDrill(draft.drill);
      if (!result.done) {
        draft.hand.lastFeedback = null;
      }
    });

    if (result.done) {
      return; // queue (incl. any resurfaced spots) exhausted — panel shows the summary
    }

    // History replays the next queued seed; generated deals a fresh random hand.
    actions.dealNewHand(result.seed ?? undefined);
  },
  endDrill() {
    updateState((draft) => {
      draft.drill = emptyDrill();
      draft.session.enabled = false;
      draft.hand.lastFeedback = null;
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
      const decision = scorePreflopDecision({
        preflop: draft.hand.preflop,
        action,
      });
      const preflop = applyHeroPreflopAction(draft.hand.preflop, {
        action,
        raiseTo: cleanAmount(raiseTo ?? draft.ui.heroRaiseTo),
      }, { autoActionLimit });
      if (decision) {
        draft.hand.trackerDecisions = [...(draft.hand.trackerDecisions || []), decision];
        if (draft.session.enabled) {
          const feedback = normaliseDecision(decision);
          recordSessionDecision(draft, feedback);
          captureDrillResult(draft, feedback);
        }
      }
      applyPreflopToDraft(draft, preflop);
      draft.hand.postflop = null;
      draft.ui.openPopover = null;
      draft.ui.openRangeSeat = null;
    });
    queueEquitySimulation();
    scheduleAutoAction();
    void recordCurrentHandIfTerminal();
  },
  heroPostflopAction(action, betAmount) {
    clearAutoActionTimer();
    const autoActionLimit = autoActionLimitForState(state);

    updateState((draft) => {
      const pre = draft.hand.postflop;
      const heroSeat = pre?.heroSeat;
      const preStack = Number(pre?.stacks?.[heroSeat]) || 0;

      // Call/fold vs EV (paid off / folded +EV).
      const evaluation = evaluatePostflopDecision({
        hand: draft.hand,
        config: draft.config,
        postflop: pre,
      });
      const callFoldDecision = scorePostflopEvDecision({
        postflop: pre,
        action,
        evaluation,
        bb: draft.config.blinds?.bb,
      });

      const postflop = applyHeroPostflopAction(pre, {
        action,
        betAmount: cleanAmount(betAmount ?? draft.ui.heroRaiseTo),
      }, { autoActionLimit });

      // Bet/raise sizing + all-in commitment ("got it in light").
      let sizingDecision = null;
      if (action === "bet" || action === "raise") {
        const postStack = Number(postflop?.stacks?.[heroSeat]) || 0;
        const committed = Math.max(0, Math.round((preStack - postStack) * 100) / 100);
        const allIn = postStack <= 0 && committed > 0;
        // if-called equity vs the continuing range. Needed for the all-in "got
        // it in light" read and for the oversized "overvalued your hand" check —
        // computed only when one of those is in play, so normal bets pay no
        // extra simulation.
        const potForRatio = Math.max(0, Number(pre?.pot) || 0);
        const ratio = potForRatio > 0 ? committed / potForRatio : 0;
        const oversized = ratio >= OVERSIZED_RATIO;
        // "Deep sizing analysis" (opt-in): also run the if-called equity sim on
        // UNDERSIZED bets, so "bet larger" can be gated on actually being ahead
        // instead of pure bet/pot geometry. Off by default — small bets otherwise
        // pay no extra simulation (the sim is a synchronous main-thread cost).
        const undersizedDeep = draft.ui.deepSizing && ratio > 0 && ratio <= UNDERSIZED_RATIO;
        const commitmentEval = (allIn || oversized || undersizedDeep)
          ? evaluateHeroCommitment({ hand: draft.hand, config: draft.config, postflop: pre, committed })
          : null;
        sizingDecision = scorePostflopSizing({
          postflop: pre,
          action,
          committed,
          allIn,
          commitmentEval,
          board: draft.hand.board,
          bb: draft.config.blinds?.bb,
        });
      }

      const decisions = [callFoldDecision, sizingDecision].filter(Boolean);
      if (decisions.length) {
        draft.hand.trackerDecisions = [...(draft.hand.trackerDecisions || []), ...decisions];
        if (draft.session.enabled) {
          // Sizing decisions are review flags with no EV; show the most
          // recent decision with a number (call/fold) when one exists, else
          // the sizing flag.
          const lastWithEv = [...decisions].reverse().find((d) => typeof d.evCall === "number");
          const last = lastWithEv || decisions[decisions.length - 1];
          const feedback = normaliseDecision(last);
          recordSessionDecision(draft, feedback);
          captureDrillResult(draft, feedback);
        }
      }
      applyPostflopToDraft(draft, postflop);
      draft.ui.openPopover = null;
      draft.ui.openRangeSeat = null;
      refreshMaths(draft, { keepEquity: false });
    });
    queueEquitySimulation();
    scheduleAutoAction();
    void recordCurrentHandIfTerminal();
  },
};

// Live-grading session aggregation. `evDeltaBb` from normaliseDecision is signed
// (0 = matched the engine's best line, negative = leak); ungraded "no chart"
// decisions are shown but not scored.
function recordSessionDecision(draft, feedback) {
  draft.hand.lastFeedback = feedback;

  if (!feedback || feedback.matched === null) {
    return;
  }

  draft.session.decisions += 1;

  // Three-way tally. `grade` defaults to the binary matched read for any decision
  // shape that predates the grade field, so a missing grade never miscounts.
  const grade = feedback.grade
    || (feedback.matched ? "neutral" : "fail");

  if (grade === "good") {
    draft.session.good += 1;
  } else if (grade === "fail") {
    draft.session.fail += 1;
  } else {
    draft.session.neutral += 1;
  }

  // `matched` stays as good + neutral (everything that didn't cost EV) for any
  // back-compat reader; the scoreboard now reads the split counters.
  draft.session.matched = draft.session.good + draft.session.neutral;
  draft.session.evDeltaBb = Math.round((draft.session.evDeltaBb + (Number(feedback.evDeltaBb) || 0)) * 10) / 10;
}

function resetSession(draft) {
  draft.session.decisions = 0;
  draft.session.matched = 0;
  draft.session.good = 0;
  draft.session.neutral = 0;
  draft.session.fail = 0;
  draft.session.evDeltaBb = 0;
}

// During a drill, capture the result of the decision made on the leak's street
// (preflop decisions carry "preflop"), then pause for the player to advance.
function captureDrillResult(draft, feedback) {
  const drill = draft.drill;

  if (!drill.active || drill.awaitingNext || !feedback) {
    return;
  }

  const generated = drill.mode === "generated";
  const spot = generated ? null : drill.spots[drill.index];

  if (!generated && !spot) {
    return;
  }

  const targetStreet = generated ? drill.targetStreet : spot.street;

  if (targetStreet && feedback.street && feedback.street !== targetStreet) {
    return; // not the drilled decision yet (e.g. an earlier street)
  }

  // Pass the raw matched value (true | false | null) so the controller can tell a
  // genuine miss (resurface once) from a "no chart" non-decision (don't resurface).
  recordDrillResult(drill, {
    seed: generated ? (draft.hand.seed || "") : spot.seed,
    matched: feedback.matched,
    evDeltaBb: feedback.evDeltaBb,
  });
}

async function initializeTracker() {
  updateState((draft) => {
    draft.tracker.status = "loading";
  });

  try {
    const heroes = await ensureDefaultHero(await loadHeroes());
    const activeHeroId = saveActiveHeroId(loadActiveHeroId(heroes));

    updateState((draft) => {
      draft.heroes = heroes;
      draft.activeHeroId = activeHeroId;
    });
    await refreshTrackerData(activeHeroId);
  } catch (error) {
    console.error("Failed to initialize tracker.", error);
    updateState((draft) => {
      draft.tracker.status = "error";
      draft.ui.trackerImportStatus = {
        kind: "error",
        message: "Tracker storage failed to load.",
      };
    });
  }
}

async function refreshTrackerData(heroId = state.activeHeroId) {
  const requestId = trackerRequestId + 1;
  trackerRequestId = requestId;

  if (!heroId) {
    updateState((draft) => {
      draft.tracker.hands = [];
      draft.tracker.summary = summarizeHands([]);
      draft.tracker.status = "idle";
    });
    return;
  }

  updateState((draft) => {
    draft.tracker.status = "loading";
  });

  try {
    const hands = await loadHandsForHero(heroId);

    updateState((draft) => {
      if (requestId !== trackerRequestId || draft.activeHeroId !== heroId) {
        return;
      }

      draft.tracker.hands = hands;
      draft.tracker.summary = summarizeHands(hands);
      draft.tracker.status = "idle";
    });
  } catch (error) {
    console.error("Failed to load tracker hands.", error);
    updateState((draft) => {
      if (requestId !== trackerRequestId) {
        return;
      }

      draft.tracker.status = "error";
      draft.ui.trackerImportStatus = {
        kind: "error",
        message: "Tracker hands failed to load.",
      };
    });
  }
}

async function recordCurrentHandIfTerminal() {
  if (state.drill.active) {
    return; // replayed drill hands are practice, not real history
  }

  const record = buildHandRecord(state);

  if (!record || recordedHandIds.has(record.id)) {
    return;
  }

  recordedHandIds.add(record.id);

  try {
    await saveHandRecord(record);

    if (record.heroId === state.activeHeroId) {
      await refreshTrackerData(record.heroId);
    }
  } catch (error) {
    recordedHandIds.delete(record.id);
    console.error("Failed to record hand.", error);
    updateState((draft) => {
      draft.ui.trackerImportStatus = {
        kind: "error",
        message: "Hand tracker failed to save this hand.",
      };
    });
  }
}

// Holds a parsed backup between staging (stageImport) and confirmation
// (confirmImport). Kept at module scope rather than in state so a large backup
// isn't deep-cloned into the store on every render.
let pendingImportPayload = null;

async function importHandsForHeroes({ payload, sourceHeroes, importedHeroes }) {
  const hands = Array.isArray(payload?.hands) ? payload.hands : [];

  if (!hands.length || !importedHeroes.length) {
    return 0;
  }

  const heroIdMap = new Map();
  sourceHeroes.forEach((sourceHero, index) => {
    const imported = importedHeroes[index];

    if (sourceHero?.id && imported?.id) {
      heroIdMap.set(sourceHero.id, imported.id);
    }
  });

  if (sourceHeroes.length === 1 && importedHeroes[0]) {
    heroIdMap.set(sourceHeroes[0]?.id, importedHeroes[0].id);
  }

  let importedCount = 0;
  for (const hand of hands) {
    const heroId = heroIdMap.get(hand.heroId) || (importedHeroes.length === 1 ? importedHeroes[0].id : null);

    if (!heroId || !hand?.seed) {
      continue;
    }

    await saveHandRecord({
      ...hand,
      id: createHandRecordId(heroId, hand.seed),
      heroId,
      ts: Number(hand.ts) || Date.now(),
    });
    importedCount += 1;
  }

  return importedCount;
}

function activeHero(currentState) {
  return currentState.heroes.find((hero) => hero.id === currentState.activeHeroId)
    || currentState.heroes[0]
    || null;
}

function scheduleAutoAction() {
  clearAutoActionTimer();

  const phase = currentAutoPhase(state);

  if (!phase) {
    // The hero has folded and has no more decisions: auto-play the remaining
    // streets to the end so the hand still records without the user clicking
    // through each street. Normal (hero still in) hands are untouched.
    if (heroIsOut(state) && canContinueScriptedHand(state)) {
      // Always defer via a timer (even at instant pace) so each street runs on
      // its own tick rather than recursing synchronously through the whole board.
      autoActionTimer = window.setTimeout(() => {
        autoActionTimer = null;
        actions.advanceStreet();
      }, Math.max(0, actionDelayForState(state)));
    }

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

function heroIsOut(currentState) {
  const heroSeat = currentState.config.heroSeat;
  const phase = currentState.hand.postflop || currentState.hand.preflop;
  return Boolean(phase?.folded?.[heroSeat]);
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
  void recordCurrentHandIfTerminal();
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

async function requestCoachMessages({ topic, messages, maxTokens }) {
  // Attempt whenever the coach is configured — even if currently flagged offline.
  // The request itself re-probes (client.js retries fast failures) and flips the
  // status back to reachable on success, so a blip no longer needs a manual test.
  if (!isCoachConfigured(state.coach.config)) {
    updateState((draft) => markCoachOffline(draft));
    return;
  }

  const requestId = nextCoachRequestId();
  const config = { ...state.coach.config };

  updateState((draft) => {
    draft.coach.callCount += 1;
    draft.coach.explain[topic] = { status: "loading", content: "", error: "" };
  });

  const result = await coachChatCompletion(config, messages, { maxTokens });

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
      Download,
      Upload,
      Users,
      BarChart3,
      BookOpen,
      Calculator,
      Trash2,
      Zap,
    },
  });
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && (state.ui.openPopover || state.ui.openRangeSeat !== null)) {
    actions.setOpenPopover(null);
    actions.setOpenRangeSeat(null);
  }
});

initializeApp();

async function initializeApp() {
  await initializeTracker();
  actions.newGame();

  // Load the API key from secure storage (OS keychain in the desktop build) and
  // migrate any legacy plaintext key out of localStorage.
  await hydrateCoachKey();

  // If the coach was already enabled + configured, test the saved connection on
  // load so it shows connected without a manual click (a health check, not a
  // coaching call).
  if (isCoachConfigured(state.coach.config)) {
    actions.testCoachConnection();
  }
}

async function hydrateCoachKey() {
  try {
    const key = await loadCoachKey();

    if (key) {
      updateState((draft) => {
        draft.coach.config.apiKey = key;
        draft.coach.status = coachStatus(draft.coach.config);
      });
    }
  } catch {
    // Secure store unavailable — the coach stays unconfigured until a key is
    // entered manually.
  }
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
    // Default the raise box to the minimum legal raise (currentBet + minRaise);
    // the hero can type a larger amount to override. (Was the position-based
    // 2.5bb suggestion, which sat above the true min and confused the box.)
    draft.ui.heroRaiseTo = preflop.currentBet + preflop.minRaise;
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
    // Match preflop: default the box to the minimum legal bet/raise, overridable.
    // The suggested size lives in the Bet tip / pot presets, not the prefilled box.
    const legal = legalPostflopActions(postflop);
    draft.ui.heroRaiseTo = legal.facingBet
      ? legal.minRaiseTo
      : Math.min(legal.minBet, legal.maxBet);
  }
}

function ensureSeatProfiles(config) {
  config.seatProfiles = config.seatProfiles || {};
  config.seatModes = config.seatModes || {};
  config.seatAssignments = config.seatAssignments || {};
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

// Next live seat clockwise from the previous button (wrapping around), so the
// dealer button advances one occupied seat per hand and skips busted seats.
function nextLiveButtonSeat(prevButton, liveSeats) {
  const live = [...liveSeats].sort((a, b) => a - b);
  if (!live.length) {
    return prevButton;
  }
  return live.find((seat) => seat > prevButton) ?? live[0];
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
