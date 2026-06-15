import { STREET_LABELS } from "../engine/deck.js";
import { isCoachConfigured, isCoachReachable } from "../coach/config.js";
import { TRACKER_SUMMARY_TOPIC, trackerExampleTopic } from "../coach/tracker.js";
import { getProfileOptions } from "../engine/player-model.js";
import { getSeatPositions } from "../engine/positions.js";
import { baseProfilePercent } from "../roster/weights.js";
import { STREET_ORDER } from "../state.js";
import { createCoachSettingsPanel } from "./coach-settings.js";

let removeSettingsDismissal = null;

export function renderControls(container, state, actions) {
  clearSettingsDismissal();
  container.replaceChildren();
  const nextScriptedLabel = scriptedContinuationLabel(state);
  const scriptedMode = Boolean(state.hand.preflop || state.hand.postflop);
  const handTerminal = isTerminalHand(state);

  const controls = document.createElement("section");
  controls.className = "controls";
  controls.setAttribute("aria-label", "Hand controls");

  controls.append(createHeroControl(state, actions));

  const dealButton = createButton({
    label: "Deal new hand",
    icon: "shuffle",
    onClick: () => actions.dealNewHand(),
    highlight: handTerminal,
  });

  const nextButton = createButton({
    label: nextScriptedLabel || "Next street",
    icon: "step-forward",
    onClick: actions.advanceStreet,
    disabled: scriptedMode ? !nextScriptedLabel : state.hand.street === "showdown",
    highlight: Boolean(nextScriptedLabel),
    title: nextButtonTitle(state, nextScriptedLabel),
  });

  const replayButton = createButton({
    label: "Replay hand",
    icon: "rotate-ccw",
    onClick: actions.replayHand,
    disabled: !state.hand.seed,
    title: "Replay the same seed and starting stacks.",
  });

  const newGameButton = createButton({
    label: "New game",
    icon: "refresh-ccw",
    onClick: actions.newGame,
    title: "Reset every seat to the starting stack and deal a fresh game.",
  });

  const pubGameButton = createButton({
    label: "Pub game",
    icon: "users",
    onClick: actions.dealHomeGame,
    disabled: state.roster.length === 0,
    title: "Seat your known players and deal a hand.",
  });

  const trackerButton = createButton({
    label: "Tracker",
    icon: "bar-chart-3",
    onClick: () => actions.setTrackerOpen(!state.ui.trackerOpen),
    highlight: state.ui.trackerOpen,
    title: "Open the active hero's hand tracker.",
  });

  const settings = createSettingsCogControl(state, actions, { scriptedMode });

  controls.append(dealButton, nextButton, replayButton, newGameButton, pubGameButton, trackerButton, settings);

  container.append(controls);
  bindSettingsDismissal(settings, state, actions);

  if (state.ui.trackerOpen) {
    container.append(createTrackerPanel(state, actions));
  }
  container.append(createRosterManager(state, actions));
}

function createHeroControl(state, actions) {
  const active = activeHero(state);
  const wrapper = document.createElement("form");
  wrapper.className = "hero-picker";

  const field = document.createElement("label");
  field.className = "field hero-picker__select";
  field.htmlFor = "hero-picker";

  const label = document.createElement("span");
  label.textContent = "Hero";

  const select = document.createElement("select");
  select.id = "hero-picker";
  select.disabled = state.heroes.length === 0;
  select.addEventListener("change", (event) => actions.selectHero(event.currentTarget.value));

  state.heroes.forEach((hero) => {
    const option = document.createElement("option");
    option.value = hero.id;
    option.textContent = hero.name;
    select.append(option);
  });
  select.value = state.activeHeroId;
  field.append(label, select);

  const nameInput = document.createElement("input");
  nameInput.type = "text";
  nameInput.placeholder = "Hero name";
  nameInput.setAttribute("aria-label", "Hero name");

  const addButton = document.createElement("button");
  addButton.type = "submit";
  addButton.className = "hero-picker__button";
  addButton.textContent = "Add";

  const renameButton = document.createElement("button");
  renameButton.type = "button";
  renameButton.className = "hero-picker__button";
  renameButton.textContent = "Rename";
  renameButton.disabled = !active;
  renameButton.addEventListener("click", () => {
    const name = nameInput.value.trim() || window.prompt("Rename hero", active?.name || "")?.trim();

    if (name && active) {
      actions.heroRename(active.id, name);
      nameInput.value = "";
    }
  });

  const removeButton = document.createElement("button");
  removeButton.type = "button";
  removeButton.className = "hero-picker__icon";
  removeButton.innerHTML = '<i data-lucide="trash-2" aria-hidden="true"></i>';
  removeButton.title = active ? `Delete ${active.name} and their tracked hands` : "Delete hero";
  removeButton.setAttribute("aria-label", removeButton.title);
  removeButton.disabled = !active;
  removeButton.addEventListener("click", () => {
    if (active && window.confirm(`Delete ${active.name} and their tracked hands?`)) {
      actions.heroRemove(active.id);
    }
  });

  wrapper.addEventListener("submit", (event) => {
    event.preventDefault();
    const name = nameInput.value.trim();

    if (!name) {
      return;
    }

    actions.heroAdd({ name });
    nameInput.value = "";
  });

  wrapper.append(field, nameInput, addButton, renameButton, removeButton);
  return wrapper;
}

function createSettingsCogControl(state, actions, { scriptedMode }) {
  const wrapper = document.createElement("div");
  wrapper.className = "settings-cog-wrap";

  const button = createButton({
    label: "Settings",
    icon: "settings",
    onClick: () => actions.setSettingsOpen(!state.ui.settingsOpen),
    highlight: Boolean(state.ui.settingsOpen),
    title: "Table settings",
  });
  button.classList.add("button--icon");
  button.setAttribute("aria-label", "Table settings");
  button.setAttribute("aria-expanded", String(Boolean(state.ui.settingsOpen)));
  button.setAttribute("aria-haspopup", "dialog");
  wrapper.append(button);

  if (state.ui.settingsOpen) {
    wrapper.append(createSettingsPanel(state, actions, { scriptedMode }));
  }

  return wrapper;
}

function createSettingsPanel(state, actions, { scriptedMode }) {
  const panel = document.createElement("section");
  panel.className = "app-settings";
  panel.setAttribute("aria-label", "Table settings panel");

  const gameplayControls = [
    createModeControl(state, actions),
    createSelectControl({
      id: "players",
      label: "Players",
      value: String(state.config.players),
      options: Array.from({ length: 8 }, (_, index) => {
        const players = index + 2;
        return { value: String(players), label: String(players) };
      }),
      onChange: (value) => actions.setPlayers(Number(value)),
    }),
    createSelectControl({
      id: "street",
      label: "Street",
      value: state.hand.street,
      options: STREET_ORDER.map((street) => ({
        value: street,
        label: STREET_LABELS[street],
      })),
      onChange: actions.setStreet,
      disabled: scriptedMode,
    }),
    createActionSpeedControl(state, actions),
    createRevealVillainsControl(state, actions),
  ];

  if (state.ui.spotMode === "manual") {
    gameplayControls.push(createManualSpotControls(state, actions));
  }

  panel.append(
    createSettingsSection("Gameplay", gameplayControls),
    createSettingsSection("Display", [createPhaseFourSettings(state, actions)]),
    createSettingsSection("Coach", [createCoachSettingsPanel(state, actions, { embedded: true })]),
  );

  return panel;
}

function createSettingsSection(title, controls) {
  const section = document.createElement("div");
  section.className = "app-settings__section";

  const heading = document.createElement("h3");
  heading.textContent = title;

  const body = document.createElement("div");
  body.className = "app-settings__body";
  body.append(...controls);

  section.append(heading, body);
  return section;
}

function createRevealVillainsControl(state, actions) {
  const revealLabel = document.createElement("label");
  revealLabel.className = "toggle toggle--inline";

  const revealInput = document.createElement("input");
  revealInput.type = "checkbox";
  revealInput.checked = state.ui.revealVillains;
  revealInput.addEventListener("change", (event) => {
    actions.setRevealVillains(event.currentTarget.checked);
  });

  const revealText = document.createElement("span");
  revealText.textContent = "Reveal villain cards";

  revealLabel.append(revealInput, revealText);
  return revealLabel;
}

function bindSettingsDismissal(wrapper, state, actions) {
  if (!state.ui.settingsOpen) {
    return;
  }

  const closeSettings = () => actions.setSettingsOpen(false);
  const onPointerDown = (event) => {
    if (!wrapper.contains(event.target)) {
      closeSettings();
    }
  };
  const onKeyDown = (event) => {
    if (event.key === "Escape") {
      closeSettings();
    }
  };

  document.addEventListener("pointerdown", onPointerDown);
  document.addEventListener("keydown", onKeyDown);
  removeSettingsDismissal = () => {
    document.removeEventListener("pointerdown", onPointerDown);
    document.removeEventListener("keydown", onKeyDown);
    removeSettingsDismissal = null;
  };
}

function clearSettingsDismissal() {
  if (removeSettingsDismissal) {
    removeSettingsDismissal();
  }
}

function createTrackerPanel(state, actions) {
  const hero = activeHero(state);
  const section = document.createElement("section");
  section.className = "tracker-panel";
  section.setAttribute("aria-label", "Hero tracker");

  const header = document.createElement("div");
  header.className = "tracker-panel__header";

  const title = document.createElement("div");
  const eyebrow = document.createElement("p");
  eyebrow.textContent = "Tracker";
  const heading = document.createElement("h2");
  heading.textContent = hero ? hero.name : "No hero";
  title.append(eyebrow, heading);

  header.append(title, createHeroFileControls(state, actions));
  section.append(header, createStatsStrip(state.tracker.summary));

  const trackerCoach = createTrackerCoachSummary(state, actions);
  if (trackerCoach) {
    section.append(trackerCoach);
  }

  if (state.ui.trackerImportStatus?.message) {
    const status = document.createElement("p");
    status.className = "tracker-status";
    status.classList.toggle("tracker-status--error", state.ui.trackerImportStatus.kind === "error");
    status.textContent = state.ui.trackerImportStatus.message;
    section.append(status);
  }

  if (state.tracker.status === "loading") {
    const loading = document.createElement("p");
    loading.className = "tracker-empty";
    loading.textContent = "Loading tracker...";
    section.append(loading);
    return section;
  }

  if (!state.tracker.hands.length) {
    const empty = document.createElement("p");
    empty.className = "tracker-empty";
    empty.textContent = "No tracked hands yet. Play a dealt hand and this fills itself in.";
    section.append(empty);
    return section;
  }

  const leaks = state.tracker.summary?.leaks || [];

  if (!leaks.length) {
    const clean = document.createElement("p");
    clean.className = "tracker-empty";
    clean.textContent = "No preflop leaks found in the tracked hands yet.";
    section.append(clean);
    return section;
  }

  const list = document.createElement("ol");
  list.className = "tracker-leaks";

  leaks.forEach((leak) => {
    const item = document.createElement("li");
    item.className = "tracker-leak";

    const button = document.createElement("button");
    button.type = "button";
    button.className = "tracker-leak__button";
    button.setAttribute("aria-expanded", String(state.tracker.selectedLeakType === leak.leakType));
    button.addEventListener("click", () => actions.setTrackerLeak(leak.leakType));

    const name = document.createElement("strong");
    name.textContent = leak.leakType;

    const meta = document.createElement("span");
    meta.textContent = `${leak.count} spot${leak.count === 1 ? "" : "s"}${leak.recommended ? ` - usually ${leak.recommended}` : ""}`;

    button.append(name, meta);
    item.append(button);

    if (state.tracker.selectedLeakType === leak.leakType) {
      item.append(createLeakExamples(leak.examples || [], leak.leakType, state, actions));
    }

    list.append(item);
  });

  section.append(list);
  return section;
}

function createTrackerCoachSummary(state, actions) {
  if (!isCoachConfigured(state.coach.config)) {
    return null;
  }

  const wrapper = document.createElement("div");
  wrapper.className = "tracker-coach";

  if (!isCoachReachable(state.coach)) {
    const offline = document.createElement("p");
    offline.className = "tracker-coach__status";
    offline.textContent = "Coach offline - trainer fully functional.";
    wrapper.append(offline);
    return wrapper;
  }

  const explain = state.coach.explain?.[TRACKER_SUMMARY_TOPIC] || { status: "idle", content: "" };
  const button = document.createElement("button");
  button.type = "button";
  button.className = "tracker-coach__button";
  button.disabled = explain.status === "loading" || !state.tracker.summary?.handsTracked;
  button.textContent = explain.status === "loading" ? "Coach thinking..." : "Explain my leaks";
  button.addEventListener("click", () => actions.requestTrackerCoachSummary());
  wrapper.append(button);

  if (explain.content) {
    const response = document.createElement("p");
    response.className = "coach-response";
    response.textContent = explain.content;
    wrapper.append(response);
  }

  return wrapper;
}

function createHeroFileControls(state, actions) {
  const wrapper = document.createElement("div");
  wrapper.className = "tracker-file-tools";

  const exportFull = document.createElement("button");
  exportFull.type = "button";
  exportFull.className = "roster-tool-button";
  exportFull.innerHTML = '<i data-lucide="download" aria-hidden="true"></i><span>Export full</span>';
  exportFull.disabled = !state.activeHeroId;
  exportFull.addEventListener("click", () => {
    const payload = actions.heroExport({ includeHands: true });

    if (payload) {
      downloadJson(payload, `${safeFileName(payload.hero.name)}-felt-tracker.json`);
      actions.setTrackerImportStatus?.({
        kind: "success",
        message: `Exported ${payload.hands.length} tracked hand${payload.hands.length === 1 ? "" : "s"}.`,
      });
    }
  });

  const exportHero = document.createElement("button");
  exportHero.type = "button";
  exportHero.className = "roster-tool-button";
  exportHero.innerHTML = '<i data-lucide="download" aria-hidden="true"></i><span>Export hero</span>';
  exportHero.disabled = !state.activeHeroId;
  exportHero.addEventListener("click", () => {
    const payload = actions.heroExport({ includeHands: false });

    if (payload) {
      downloadJson(payload, `${safeFileName(payload.hero.name)}-felt-hero.json`);
      actions.setTrackerImportStatus?.({
        kind: "success",
        message: "Exported hero definition.",
      });
    }
  });

  const importInput = document.createElement("input");
  importInput.type = "file";
  importInput.accept = ".json,application/json";
  importInput.className = "roster-import-input";
  importInput.setAttribute("aria-label", "Import hero tracker JSON");

  const importButton = document.createElement("button");
  importButton.type = "button";
  importButton.className = "roster-tool-button";
  importButton.innerHTML = '<i data-lucide="upload" aria-hidden="true"></i><span>Import</span>';
  importButton.addEventListener("click", () => importInput.click());

  importInput.addEventListener("change", async (event) => {
    const file = event.currentTarget.files?.[0];

    if (!file) {
      return;
    }

    try {
      await actions.heroImport(JSON.parse(await file.text()));
    } catch {
      actions.setTrackerImportStatus?.({
        kind: "error",
        message: "Import failed. Choose a valid hero JSON file.",
      });
    } finally {
      event.currentTarget.value = "";
    }
  });

  wrapper.append(exportFull, exportHero, importButton, importInput);
  return wrapper;
}

function createStatsStrip(summary) {
  const stats = summary || {
    handsTracked: 0,
    vpip: null,
    pfr: null,
    threeBet: null,
    foldToCbet: null,
    wtsd: null,
    netBb: 0,
  };
  const strip = document.createElement("dl");
  strip.className = "tracker-stats";

  [
    ["Hands", String(stats.handsTracked || 0)],
    ["VPIP", formatPercent(stats.vpip)],
    ["PFR", formatPercent(stats.pfr)],
    ["3-bet", formatPercent(stats.threeBet)],
    ["Fold c-bet", formatPercent(stats.foldToCbet)],
    ["WTSD", formatPercent(stats.wtsd)],
    ["Net", `${formatSigned(stats.netBb)} bb`],
  ].forEach(([label, value]) => {
    const item = document.createElement("div");
    const term = document.createElement("dt");
    const description = document.createElement("dd");
    term.textContent = label;
    description.textContent = value;
    item.append(term, description);
    strip.append(item);
  });

  return strip;
}

function createLeakExamples(examples, leakType, state, actions) {
  const list = document.createElement("ul");
  list.className = "tracker-examples";

  examples.forEach((example) => {
    const item = document.createElement("li");

    const text = document.createElement("span");
    text.textContent = `${example.hand || "--"} in ${example.spot}: ${example.heroAction} vs ${example.recommended}`;

    const replay = document.createElement("button");
    replay.type = "button";
    replay.textContent = "Replay";
    replay.addEventListener("click", () => actions.replayTrackerHand(example.seed));

    const actionsRow = document.createElement("div");
    actionsRow.className = "tracker-example__actions";
    actionsRow.append(replay);

    const explain = createTrackerExampleCoachAction({ example, leakType, state, actions });
    if (explain) {
      actionsRow.append(explain);
    }

    item.append(text, actionsRow);

    const topic = trackerExampleTopic(example);
    const response = state.coach.explain?.[topic]?.content;
    if (response) {
      const coachResponse = document.createElement("p");
      coachResponse.className = "coach-response tracker-example__response";
      coachResponse.textContent = response;
      item.append(coachResponse);
    }

    list.append(item);
  });

  return list;
}

function createTrackerExampleCoachAction({ example, leakType, state, actions }) {
  if (!isCoachConfigured(state.coach.config)) {
    return null;
  }

  const topic = trackerExampleTopic(example);
  const explain = state.coach.explain?.[topic] || { status: "idle", content: "" };
  const button = document.createElement("button");
  button.type = "button";
  button.className = "tracker-example__explain";
  button.disabled = explain.status === "loading" || !isCoachReachable(state.coach);
  button.textContent = !isCoachReachable(state.coach)
    ? "Coach offline"
    : explain.status === "loading"
      ? "Coach thinking..."
      : "Explain this";
  button.addEventListener("click", () => actions.requestTrackerCoachLeak(leakType, example.id || example.seed));
  return button;
}

function buildTypeSelect(value, { excludeIds = [] } = {}) {
  const select = document.createElement("select");
  select.setAttribute("aria-label", "Player type");
  const excluded = new Set(excludeIds.filter(Boolean));

  getProfileOptions().filter((option) => !excluded.has(option.id)).forEach((option) => {
    const element = document.createElement("option");
    element.value = option.id;
    element.textContent = option.label;

    if (value && option.id === value) {
      element.selected = true;
    }

    select.append(element);
  });

  return select;
}

function createRosterManager(state, actions) {
  // Collapsible so it doesn't eat screen space; open state is remembered.
  const section = document.createElement("details");
  section.className = "roster-manager";
  section.open = Boolean(state.ui.rosterOpen);
  section.addEventListener("toggle", () => actions.setRosterOpen(section.open));

  const summary = document.createElement("summary");
  summary.textContent = `Known players (${state.roster.length})`;
  section.append(summary);

  const body = document.createElement("div");
  body.className = "roster-body";

  const form = document.createElement("form");
  form.className = "roster-add";

  const nameInput = document.createElement("input");
  nameInput.type = "text";
  nameInput.placeholder = "Name";
  nameInput.setAttribute("aria-label", "Player name");

  const typeSelect = buildTypeSelect();

  const addButton = document.createElement("button");
  addButton.type = "submit";
  addButton.textContent = "Add";

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const name = nameInput.value.trim();

    if (!name) {
      return;
    }

    actions.rosterAdd({ name, profile: typeSelect.value });
    nameInput.value = "";
    nameInput.focus();
  });

  form.append(nameInput, typeSelect, addButton);
  body.append(form);
  body.append(createRosterFileControls(state, actions));

  const list = document.createElement("ul");
  list.className = "roster-list";

  if (!state.roster.length) {
    const empty = document.createElement("li");
    empty.className = "roster-empty";
    empty.textContent = "No players yet. Add your regulars, then deal the pub game.";
    list.append(empty);
  } else {
    state.roster.forEach((player) => {
      const item = document.createElement("li");
      item.className = "roster-item";

      const dot = document.createElement("span");
      dot.className = "roster-dot";
      dot.style.background = player.color;

      const label = document.createElement("span");
      label.className = "roster-name";
      label.textContent = player.name;

      const select = buildTypeSelect(player.profile);
      select.className = "roster-type";
      select.title = "Change player type";
      select.addEventListener("change", () => actions.rosterSetProfile(player.id, select.value));

      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "roster-remove";
      remove.textContent = "✕";
      remove.title = `Remove ${player.name}`;
      remove.addEventListener("click", () => actions.rosterRemove(player.id));

      item.append(dot, label, select, remove, createWeightEditor(player, actions));
      list.append(item);
    });
  }

  body.append(list);

  section.append(body);
  return section;
}

function createRosterFileControls(state, actions) {
  const wrapper = document.createElement("div");
  wrapper.className = "roster-file-tools";

  const exportButton = document.createElement("button");
  exportButton.type = "button";
  exportButton.className = "roster-tool-button";
  exportButton.innerHTML = '<i data-lucide="download" aria-hidden="true"></i><span>Export JSON</span>';
  exportButton.disabled = state.roster.length === 0;
  exportButton.addEventListener("click", () => {
    const roster = actions.rosterExport ? actions.rosterExport() : state.roster;
    downloadRosterJson(roster);

    if (actions.setRosterImportStatus) {
      actions.setRosterImportStatus({
        kind: "success",
        message: `Exported ${roster.length} player${roster.length === 1 ? "" : "s"}.`,
      });
    }
  });

  const importInput = document.createElement("input");
  importInput.type = "file";
  importInput.accept = ".json,application/json";
  importInput.className = "roster-import-input";
  importInput.setAttribute("aria-label", "Import roster JSON");

  const importButton = document.createElement("button");
  importButton.type = "button";
  importButton.className = "roster-tool-button";
  importButton.innerHTML = '<i data-lucide="upload" aria-hidden="true"></i><span>Import JSON</span>';
  importButton.addEventListener("click", () => importInput.click());

  importInput.addEventListener("change", async (event) => {
    const file = event.currentTarget.files?.[0];

    if (!file) {
      return;
    }

    try {
      const parsed = JSON.parse(await file.text());
      actions.rosterImport(parsed);
    } catch {
      actions.setRosterImportStatus?.({
        kind: "error",
        message: "Import failed. Choose a valid roster JSON file.",
      });
    } finally {
      event.currentTarget.value = "";
    }
  });

  wrapper.append(exportButton, importButton, importInput);

  if (state.ui.rosterImportStatus?.message) {
    const status = document.createElement("p");
    status.className = "roster-file-status";
    status.classList.toggle("roster-file-status--error", state.ui.rosterImportStatus.kind === "error");
    status.textContent = state.ui.rosterImportStatus.message;
    wrapper.append(status);
  }

  return wrapper;
}

function downloadRosterJson(roster) {
  downloadJson(roster, "felt-roster.json");
}

function downloadJson(payload, filename) {
  const blob = new Blob([`${JSON.stringify(payload, null, 2)}\n`], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = filename;
  link.style.display = "none";
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function activeHero(state) {
  return state.heroes.find((hero) => hero.id === state.activeHeroId)
    || state.heroes[0]
    || null;
}

function formatPercent(value) {
  if (value === null || value === undefined) {
    return "--";
  }

  const number = Number(value);

  if (!Number.isFinite(number)) {
    return "--";
  }

  return `${Math.round(number * 100)}%`;
}

function formatSigned(value) {
  const number = Number(value) || 0;
  const rounded = Number.isInteger(number) ? number : number.toFixed(1).replace(/\.0$/, "");
  return number > 0 ? `+${rounded}` : String(rounded);
}

function safeFileName(value) {
  return String(value || "hero")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    || "hero";
}

function createWeightEditor(player, actions) {
  const wrapper = document.createElement("div");
  wrapper.className = "roster-blend";

  const weights = Array.isArray(player.weights) ? player.weights : [];
  const remaining = baseProfilePercent(player);
  const baseShare = document.createElement("span");
  baseShare.className = "roster-blend__base";
  baseShare.textContent = `${profileLabel(player.profile)} ${formatWeightPercent(remaining)}`;
  wrapper.append(baseShare);

  const splashes = document.createElement("div");
  splashes.className = "roster-splashes";

  weights.forEach((weight, index) => {
    const chip = document.createElement("span");
    chip.className = "roster-splash";

    const text = document.createElement("span");
    text.textContent = `${profileLabel(weight.profile)} ${formatWeightPercent(weight.percent)}`;

    const remove = document.createElement("button");
    remove.type = "button";
    remove.textContent = "x";
    remove.title = `Remove ${profileLabel(weight.profile)} splash`;
    remove.setAttribute("aria-label", remove.title);
    remove.addEventListener("click", () => {
      actions.rosterSetWeights(player.id, weights.filter((_, weightIndex) => weightIndex !== index));
    });

    chip.append(text, remove);
    splashes.append(chip);
  });

  wrapper.append(splashes);

  const add = document.createElement("div");
  add.className = "roster-splash-add";

  const select = buildTypeSelect(undefined, { excludeIds: [player.profile] });
  select.className = "roster-splash-type";
  select.title = "Splash type";

  const percent = document.createElement("input");
  percent.type = "number";
  percent.min = "1";
  percent.max = String(Math.max(0, remaining));
  percent.step = "1";
  percent.value = String(Math.min(5, Math.max(0, remaining)));
  percent.setAttribute("aria-label", "Splash percent");

  const addButton = document.createElement("button");
  addButton.type = "button";
  addButton.textContent = "+";
  addButton.title = "Add splash";
  addButton.setAttribute("aria-label", "Add weighted splash");
  addButton.disabled = remaining <= 0 || select.options.length === 0;
  addButton.addEventListener("click", () => {
    const clampedPercent = Math.min(cleanWeightPercent(percent.value), remaining);

    if (!select.value || clampedPercent <= 0) {
      return;
    }

    actions.rosterSetWeights(player.id, [
      ...weights,
      { profile: select.value, percent: clampedPercent },
    ]);
  });

  add.append(select, percent, addButton);
  wrapper.append(add);
  return wrapper;
}

function profileLabel(profileId) {
  return getProfileOptions().find((profile) => profile.id === profileId)?.label || profileId || "Standard";
}

function formatWeightPercent(value) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return "0%";
  }

  return `${Number.isInteger(number) ? number : number.toFixed(1).replace(/\.0$/, "")}%`;
}

function cleanWeightPercent(value) {
  const number = Number(value);

  if (!Number.isFinite(number) || number <= 0) {
    return 0;
  }

  return Math.round(Math.min(number, 100) * 100) / 100;
}

function createActionSpeedControl(state, actions) {
  const wrapper = document.createElement("label");
  wrapper.className = "speed-control";
  wrapper.htmlFor = "action-speed";

  const text = document.createElement("span");
  text.textContent = "Pace";

  const input = document.createElement("input");
  input.id = "action-speed";
  input.type = "range";
  input.min = "0";
  input.max = "1500";
  input.step = "100";
  input.value = String(state.ui.actionDelayMs || 0);
  input.addEventListener("input", (event) => {
    actions.setActionDelayMs(Number(event.currentTarget.value));
  });

  const value = document.createElement("output");
  value.htmlFor = "action-speed";
  value.textContent = actionSpeedLabel(state.ui.actionDelayMs || 0);

  wrapper.append(text, input, value);
  return wrapper;
}

function actionSpeedLabel(actionDelayMs) {
  const delay = Number(actionDelayMs) || 0;

  if (delay <= 0) {
    return "Instant";
  }

  return `${(delay / 1000).toFixed(1)}s`;
}

function scriptedContinuationLabel(state) {
  if (!state.hand.postflop && state.hand.preflop?.status === "complete" && state.hand.preflop.result === "wouldSeeFlop") {
    return "Continue to flop";
  }

  if (state.hand.postflop?.status === "streetComplete") {
    if (state.hand.postflop.street === "flop") {
      return "Continue to turn";
    }

    if (state.hand.postflop.street === "turn") {
      return "Continue to river";
    }
  }

  return "";
}

function nextButtonTitle(state, label) {
  if (label) {
    return "";
  }

  if (state.hand.postflop?.status === "waitingHero" || state.hand.preflop?.status === "waitingHero") {
    return "Hero action is required first.";
  }

  if (isTerminalHand(state)) {
    return "Hand complete - deal a new hand to continue.";
  }

  return state.hand.preflop || state.hand.postflop ? "Action must close before the next street." : "";
}

function isTerminalHand(state) {
  return state.hand.postflop?.status === "complete"
    || (state.hand.preflop?.status === "complete" && state.hand.preflop.result === "winner")
    || state.hand.street === "showdown";
}

function createPhaseFourSettings(state, actions) {
  const settings = document.createElement("section");
  settings.className = "phase-settings";
  settings.setAttribute("aria-label", "Preflop player settings");

  const displayToggle = document.createElement("div");
  displayToggle.className = "segmented segmented--compact";
  displayToggle.setAttribute("role", "group");
  displayToggle.setAttribute("aria-label", "Stakes display");
  displayToggle.append(
    createModeButton({
      label: "$",
      pressed: state.ui.displayUnit !== "bb",
      onClick: () => actions.setDisplayUnit("usd"),
    }),
    createModeButton({
      label: "BB",
      pressed: state.ui.displayUnit === "bb",
      onClick: () => actions.setDisplayUnit("bb"),
    }),
  );

  const profileVisibility = document.createElement("label");
  profileVisibility.className = "toggle toggle--inline";

  const profileInput = document.createElement("input");
  profileInput.type = "checkbox";
  profileInput.checked = state.ui.showProfiles;
  profileInput.addEventListener("change", (event) => {
    actions.setShowProfiles(event.currentTarget.checked);
  });

  const profileText = document.createElement("span");
  profileText.textContent = "Show villain profiles";
  profileVisibility.append(profileInput, profileText);

  const profileGrid = createSeatAssignmentGrid(state, actions);

  settings.append(displayToggle, profileVisibility, profileGrid);
  return settings;
}

export function createSeatAssignmentGrid(state, actions) {
  const profileGrid = document.createElement("div");
  profileGrid.className = "profile-grid";
  const positions = state.hand.buttonSeat !== undefined
    ? getSeatPositions({ players: state.config.players, buttonSeat: state.hand.buttonSeat })
    : {};
  const seatOptions = seatAssignmentOptions(state);

  for (let seat = 0; seat < state.config.players; seat += 1) {
    if (seat === state.config.heroSeat) {
      continue;
    }

    profileGrid.append(createSelectControl({
      id: `profile-seat-${seat}`,
      label: `Seat ${seat + 1} ${positions[seat] || ""}`.trim(),
      value: seatAssignmentValue(state, seat),
      options: seatOptions,
      onChange: (value) => actions.setSeatAssignment(seat, value),
    }));
  }

  return profileGrid;
}

function seatAssignmentOptions(state) {
  return [
    { value: "default", label: "Default" },
    ...getProfileOptions().map((profile) => ({
      value: `profile:${profile.id}`,
      label: profile.label,
    })),
    ...state.roster.map((player) => ({
      value: `player:${player.id}`,
      label: player.name,
    })),
  ];
}

function seatAssignmentValue(state, seat) {
  const key = String(seat);
  const assigned = state.config.seatAssignments?.[key];
  const playerId = state.config.seatPlayers?.[key] ?? state.config.seatPlayers?.[seat];

  if (playerId && state.roster.some((player) => player.id === playerId)) {
    return `player:${playerId}`;
  }

  if (assigned?.startsWith("profile:")) {
    return assigned;
  }

  if (assigned === "default") {
    return "default";
  }

  const profileId = state.config.seatProfiles?.[key];
  return profileId && profileId !== "standard" ? `profile:${profileId}` : "default";
}

function createModeControl(state, actions) {
  const group = document.createElement("div");
  group.className = "segmented";
  group.setAttribute("role", "group");
  group.setAttribute("aria-label", "Spot mode");

  group.append(
    createModeButton({
      label: "Dealt hand",
      pressed: state.ui.spotMode === "dealt",
      onClick: () => actions.setSpotMode("dealt"),
    }),
    createModeButton({
      label: "Manual spot",
      pressed: state.ui.spotMode === "manual",
      onClick: () => actions.setSpotMode("manual"),
    }),
  );

  return group;
}

function createModeButton({ label, pressed, onClick }) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "segmented__button";
  button.setAttribute("aria-pressed", String(pressed));
  button.textContent = label;
  button.addEventListener("click", onClick);
  return button;
}

function createManualSpotControls(state, actions) {
  const group = document.createElement("div");
  group.className = "manual-spot";
  group.setAttribute("aria-label", "Manual spot values");

  group.append(
    createNumberControl({
      id: "manual-pot",
      label: "Pot before bet",
      value: state.hand.pot,
      min: 0,
      max: 500,
      onInput: (pot) => actions.setManualSpot({ pot }),
    }),
    createNumberControl({
      id: "manual-call",
      label: "Bet faced",
      value: state.hand.toCall,
      min: 0,
      max: 500,
      onInput: (toCall) => actions.setManualSpot({ toCall }),
    }),
  );

  return group;
}

function createSelectControl({ id, label, value, options, onChange, disabled = false }) {
  const wrapper = document.createElement("label");
  wrapper.className = "field";
  wrapper.htmlFor = id;

  const text = document.createElement("span");
  text.textContent = label;

  const select = document.createElement("select");
  select.id = id;
  select.disabled = disabled;
  select.addEventListener("change", (event) => onChange(event.currentTarget.value));

  options.forEach((option) => {
    const optionElement = document.createElement("option");
    optionElement.value = option.value;
    optionElement.textContent = option.label;
    select.append(optionElement);
  });

  select.value = value;

  wrapper.append(text, select);
  return wrapper;
}

function createButton({ label, icon, onClick, disabled = false, highlight = false, title = "" }) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "button";
  button.classList.toggle("button--next-step", highlight);
  button.disabled = disabled;
  if (title) {
    button.title = title;
  }
  button.innerHTML = `<i data-lucide="${icon}" aria-hidden="true"></i><span>${label}</span>`;
  button.addEventListener("click", onClick);
  return button;
}

function createNumberControl({ id, label, value, min, max, onInput }) {
  const wrapper = document.createElement("label");
  wrapper.className = "field field--number";
  wrapper.htmlFor = id;

  const text = document.createElement("span");
  text.textContent = label;

  const input = document.createElement("input");
  input.id = id;
  input.type = "number";
  input.min = String(min);
  input.max = String(max);
  input.step = "1";
  input.value = String(value);
  input.addEventListener("input", (event) => {
    onInput(Number(event.currentTarget.value));
  });

  wrapper.append(text, input);
  return wrapper;
}
