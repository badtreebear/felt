import { STREET_LABELS } from "../engine/deck.js";
import { STREET_ORDER } from "../state.js";

export function renderControls(container, state, actions) {
  container.replaceChildren();

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
    }),
  );

  const dealButton = createButton({
    label: "Deal new hand",
    icon: "shuffle",
    onClick: () => actions.dealNewHand(),
  });

  const nextButton = createButton({
    label: "Next street",
    icon: "step-forward",
    onClick: actions.advanceStreet,
    disabled: state.hand.street === "showdown",
  });

  const replayButton = createButton({
    label: "Replay seed",
    icon: "rotate-ccw",
    onClick: actions.replayHand,
    disabled: !state.hand.seed,
  });

  controls.append(dealButton, nextButton, replayButton);

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

  if (state.ui.spotMode === "manual") {
    controls.append(createManualSpotControls(state, actions));
  }

  container.append(controls);
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

function createSelectControl({ id, label, value, options, onChange }) {
  const wrapper = document.createElement("label");
  wrapper.className = "field";
  wrapper.htmlFor = id;

  const text = document.createElement("span");
  text.textContent = label;

  const select = document.createElement("select");
  select.id = id;
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

function createButton({ label, icon, onClick, disabled = false }) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "button";
  button.disabled = disabled;
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
