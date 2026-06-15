export function createCoachSettingsControl(state, actions) {
  const wrapper = document.createElement("div");
  wrapper.className = "coach-settings-wrap";

  const button = document.createElement("button");
  button.type = "button";
  button.className = "button button--icon";
  button.title = "AI coach settings";
  button.setAttribute("aria-label", "AI coach settings");
  button.setAttribute("aria-expanded", String(state.coach.settingsOpen));
  button.innerHTML = '<i data-lucide="settings" aria-hidden="true"></i><span>Coach</span>';
  button.addEventListener("click", () => actions.setCoachSettingsOpen(!state.coach.settingsOpen));
  wrapper.append(button);

  if (state.coach.settingsOpen) {
    wrapper.append(createCoachSettingsPanel(state, actions));
  }

  return wrapper;
}

export function createCoachSettingsPanel(state, actions, { embedded = false } = {}) {
  const panel = document.createElement("section");
  panel.className = "coach-settings";
  panel.classList.toggle("coach-settings--embedded", embedded);
  panel.setAttribute("aria-label", "AI coach settings panel");

  const enabled = document.createElement("label");
  enabled.className = "toggle toggle--inline";

  const enabledInput = document.createElement("input");
  enabledInput.type = "checkbox";
  enabledInput.checked = Boolean(state.coach.config.enabled);
  enabledInput.addEventListener("change", (event) => {
    actions.setCoachConfig({ enabled: event.currentTarget.checked });
  });

  const enabledText = document.createElement("span");
  enabledText.textContent = "Enable coach";
  enabled.append(enabledInput, enabledText);

  const fields = document.createElement("div");
  fields.className = "coach-settings__fields";
  fields.append(
    textField({
      id: "coach-base-url",
      label: "Base URL",
      value: state.coach.config.baseUrl,
      placeholder: "http://localhost:4000/v1",
      onChange: (baseUrl) => actions.setCoachConfig({ baseUrl }),
    }),
    modelField(state, actions),
    apiKeyField(state, actions),
  );

  const testRow = document.createElement("div");
  testRow.className = "coach-settings__test";

  const testButton = document.createElement("button");
  testButton.type = "button";
  testButton.className = "button";
  testButton.disabled = state.coach.testStatus === "running" || !canTestConnection(state);
  testButton.textContent = state.coach.testStatus === "running" ? "Testing..." : "Poll and test";
  testButton.addEventListener("click", () => actions.testCoachConnection());

  const status = document.createElement("p");
  status.className = `coach-status coach-status--${state.coach.status}`;
  status.textContent = coachStatusText(state);

  testRow.append(testButton, status);
  panel.append(enabled, fields, testRow);
  return panel;
}

function modelField(state, actions) {
  const models = Array.isArray(state.coach.availableModels) ? state.coach.availableModels : [];

  if (!models.length) {
    return textField({
      id: "coach-model",
      label: "Model",
      value: state.coach.config.model,
      placeholder: "Poll models or type one",
      onChange: (model) => actions.setCoachConfig({ model }),
    });
  }

  const wrapper = document.createElement("div");
  wrapper.className = "coach-model-field";

  const label = document.createElement("label");
  label.className = "field";
  label.htmlFor = "coach-model";

  const text = document.createElement("span");
  text.textContent = "Model";

  const select = document.createElement("select");
  select.id = "coach-model";

  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "Choose model";
  select.append(placeholder);

  models.forEach((model) => {
    const option = document.createElement("option");
    option.value = model;
    option.textContent = model;
    select.append(option);
  });

  const custom = document.createElement("option");
  custom.value = "__custom";
  custom.textContent = "Custom / not listed";
  select.append(custom);

  const currentModel = state.coach.config.model || "";
  const usesCustomModel = Boolean(currentModel && !models.includes(currentModel));
  select.value = models.includes(currentModel) ? currentModel : usesCustomModel ? "__custom" : "";
  select.addEventListener("change", (event) => {
    const model = event.currentTarget.value;

    if (model === "__custom") {
      customField.hidden = false;
      customField.querySelector("input")?.focus();
    } else {
      customField.hidden = true;
      actions.setCoachConfig({ model });
    }
  });

  label.append(text, select);
  wrapper.append(label);

  const customField = textField({
    id: "coach-custom-model",
    label: "Custom model",
    value: usesCustomModel ? currentModel : "",
    placeholder: "Type model id",
    onChange: (model) => {
      if (model.trim()) {
        actions.setCoachConfig({ model });
      }
    },
  });
  customField.hidden = !usesCustomModel;
  wrapper.append(customField);

  return wrapper;
}

function textField({ id, label, value, placeholder, onChange }) {
  const wrapper = document.createElement("label");
  wrapper.className = "field";
  wrapper.htmlFor = id;

  const text = document.createElement("span");
  text.textContent = label;

  const input = document.createElement("input");
  input.id = id;
  input.type = "text";
  input.value = value;
  input.placeholder = placeholder;
  input.addEventListener("change", (event) => onChange(event.currentTarget.value));

  wrapper.append(text, input);
  return wrapper;
}

function apiKeyField(state, actions) {
  const wrapper = document.createElement("div");
  wrapper.className = "coach-settings__key-row";

  const label = document.createElement("label");
  label.className = "field";
  label.htmlFor = "coach-api-key";

  const text = document.createElement("span");
  text.textContent = "API key";

  const input = document.createElement("input");
  input.id = "coach-api-key";
  input.type = "password";
  input.value = "";
  input.placeholder = state.coach.config.apiKey ? "Saved key present" : "Optional";
  input.autocomplete = "off";
  input.addEventListener("change", (event) => {
    const apiKey = event.currentTarget.value.trim();

    if (apiKey) {
      actions.setCoachConfig({ apiKey });
      event.currentTarget.value = "";
    }
  });

  label.append(text, input);
  wrapper.append(label);

  if (state.coach.config.apiKey) {
    const clear = document.createElement("button");
    clear.type = "button";
    clear.className = "coach-settings__clear-key";
    clear.textContent = "Clear key";
    clear.addEventListener("click", () => actions.setCoachConfig({ apiKey: "" }));
    wrapper.append(clear);
  }

  return wrapper;
}

function coachStatusText(state) {
  if (!state.coach.config.enabled) {
    return "Coach disabled. Trainer is fully functional offline.";
  }

  if (!state.coach.config.model) {
    return state.coach.availableModels.length
      ? "Choose a model, then test it."
      : "Poll models, then choose or type one.";
  }

  if (state.coach.status === "reachable") {
    return `Connected to ${state.coach.config.model}.`;
  }

  if (state.coach.lastError) {
    return `Coach offline - ${state.coach.lastError}`;
  }

  return "Coach offline - trainer fully functional.";
}

function canTestConnection(state) {
  return Boolean(state.coach.config.enabled && state.coach.config.baseUrl);
}
