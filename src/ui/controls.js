import { STREET_LABELS } from "../engine/deck.js";
import { getProfileOptions } from "../engine/player-model.js";
import { getSeatPositions } from "../engine/positions.js";
import { STREET_ORDER } from "../state.js";
import { createCoachSettingsControl } from "./coach-settings.js";

export function renderControls(container, state, actions) {
  container.replaceChildren();
  const nextScriptedLabel = scriptedContinuationLabel(state);
  const scriptedMode = Boolean(state.hand.preflop || state.hand.postflop);
  const handTerminal = isTerminalHand(state);

  const controls = document.createElement("section");
  controls.className = "controls";
  controls.setAttribute("aria-label", "Hand controls");

  controls.append(createModeControl(state, actions));

  controls.append(
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
  );

  controls.append(
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
  );

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

  controls.append(dealButton, nextButton, replayButton, newGameButton);
  controls.append(createCoachSettingsControl(state, actions));
  controls.append(createActionSpeedControl(state, actions));

  const revealLabel = document.createElement("label");
  revealLabel.className = "toggle";

  const revealInput = document.createElement("input");
  revealInput.type = "checkbox";
  revealInput.checked = state.ui.revealVillains;
  revealInput.addEventListener("change", (event) => {
    actions.setRevealVillains(event.currentTarget.checked);
  });

  const revealText = document.createElement("span");
  revealText.textContent = "Reveal villain cards";

  revealLabel.append(revealInput, revealText);
  controls.append(revealLabel);
  controls.append(createPhaseFourSettings(state, actions));

  if (state.ui.spotMode === "manual") {
    controls.append(createManualSpotControls(state, actions));
  }

  container.append(controls);
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

  const profileGrid = document.createElement("div");
  profileGrid.className = "profile-grid";
  const positions = state.hand.buttonSeat !== undefined
    ? getSeatPositions({ players: state.config.players, buttonSeat: state.hand.buttonSeat })
    : {};
  const profileOptions = getProfileOptions().map((profile) => ({
    value: profile.id,
    label: profile.label,
  }));

  for (let seat = 0; seat < state.config.players; seat += 1) {
    if (seat === state.config.heroSeat) {
      continue;
    }

    profileGrid.append(createSelectControl({
      id: `profile-seat-${seat}`,
      label: `Seat ${seat + 1} ${positions[seat] || ""}`.trim(),
      value: state.config.seatProfiles[String(seat)] || "standard",
      options: profileOptions,
      onChange: (value) => actions.setSeatProfile(seat, value),
    }));
  }

  settings.append(displayToggle, profileVisibility, profileGrid);
  return settings;
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
