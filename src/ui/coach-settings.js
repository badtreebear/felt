import { BASE_URL_PRESETS, CUSTOM_LOCAL_STARTER, isCustomLocalUrl, isLocalhostUrl, matchesPreset } from "../coach/providers.js";

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

  if (state.coach.settings.configs.length > 0) {
    const configSelector = document.createElement("div");
    configSelector.className = "coach-settings__selector";

    const label = document.createElement("label");
    label.className = "field";
    
    const text = document.createElement("span");
    text.textContent = "Saved config";
    
    const select = document.createElement("select");
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "Create new...";
    select.append(placeholder);

    state.coach.settings.configs.forEach((c) => {
      const option = document.createElement("option");
      option.value = c.id;
      option.textContent = c.name;
      select.append(option);
    });

    // If the active config is saved, select it, otherwise select the "Create new..."
    const hasActive = state.coach.settings.configs.some((c) => c.id === state.coach.config.id);
    select.value = hasActive ? state.coach.config.id : "";

    select.addEventListener("change", (e) => {
      const id = e.currentTarget.value;
      if (id) {
        actions.loadSavedCoachConfig(id);
      } else {
        actions.newCoachConfig();
      }
    });

    label.append(text, select);
    configSelector.append(label);
    panel.append(configSelector);
  }

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
      id: "coach-name",
      label: "Config name",
      value: state.coach.config.name,
      placeholder: "e.g. Local DeepSeek",
      onChange: (name) => actions.setCoachConfig({ name }),
    }),
    baseUrlField(state, actions),
    modelField(state, actions),
    apiKeyField(state, actions),
  );

  const insecureWarning = createInsecureUrlWarning(state.coach.config);
  if (insecureWarning) {
    panel.append(insecureWarning);
  }

  const testRow = document.createElement("div");
  testRow.className = "coach-settings__test";

  const testButton = document.createElement("button");
  testButton.type = "button";
  testButton.className = "button";
  testButton.disabled = state.coach.testStatus === "running" || !canTestConnection(state);
  testButton.textContent = state.coach.testStatus === "running" ? "Testing..." : "Poll and test";
  testButton.addEventListener("click", () => actions.testCoachConnection());

  const saveButton = document.createElement("button");
  saveButton.type = "button";
  saveButton.className = "button button--primary";
  saveButton.textContent = "Save config";
  saveButton.addEventListener("click", () => actions.saveCurrentCoachConfig());

  const buttonWrap = document.createElement("div");
  buttonWrap.className = "coach-settings__actions";
  buttonWrap.append(testButton, saveButton);

  const status = document.createElement("p");
  status.className = `coach-status coach-status--${state.coach.status}`;
  status.textContent = coachStatusText(state);

  testRow.append(buttonWrap, status);
  panel.append(enabled, fields, testRow);
  return panel;
}

const CUSTOM_LOCAL_VALUE = "__custom-local";

function baseUrlField(state, actions) {
  const baseUrl = state.coach.config.baseUrl || "";
  const customLocal = isCustomLocalUrl(baseUrl);

  const wrapper = document.createElement("div");
  wrapper.className = "coach-base-url-field";

  const label = document.createElement("label");
  label.className = "field";
  label.htmlFor = "coach-base-url";

  const text = document.createElement("span");
  text.textContent = "Base URL";

  const select = document.createElement("select");
  select.id = "coach-base-url";

  BASE_URL_PRESETS.forEach((preset) => {
    const option = document.createElement("option");
    option.value = preset.baseUrl;
    option.textContent = `${preset.name} — ${preset.baseUrl}`;
    select.append(option);
  });

  const customOption = document.createElement("option");
  customOption.value = CUSTOM_LOCAL_VALUE;
  customOption.textContent = "Custom local URL…";
  select.append(customOption);

  select.value = customLocal || !matchesPreset(baseUrl) ? CUSTOM_LOCAL_VALUE : baseUrl;
  select.addEventListener("change", (event) => {
    const value = event.currentTarget.value;

    if (value === CUSTOM_LOCAL_VALUE) {
      // Only seed a starter if we're not already editing a custom local URL,
      // so we don't clobber what the user typed.
      if (!isCustomLocalUrl(state.coach.config.baseUrl)) {
        actions.setCoachConfig({ baseUrl: CUSTOM_LOCAL_STARTER });
      }
    } else {
      actions.setCoachConfig({ baseUrl: value });
    }
  });

  label.append(text, select);
  wrapper.append(label);

  // Free-text field only for the custom-local case (localhost, any port).
  if (select.value === CUSTOM_LOCAL_VALUE) {
    wrapper.append(textField({
      id: "coach-base-url-custom",
      label: "Custom local URL",
      value: customLocal ? baseUrl : "",
      placeholder: "http://localhost:8080/v1",
      onChange: (value) => actions.setCoachConfig({ baseUrl: value }),
    }));

    if (baseUrl && !isLocalhostUrl(baseUrl)) {
      const warn = document.createElement("p");
      warn.className = "coach-settings__warning";
      warn.textContent = "Custom URLs must be a localhost address — a remote host won't connect. Pick a provider from the list for cloud endpoints.";
      wrapper.append(warn);
    }
  }

  return wrapper;
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

  // Surface a poll/connection failure even before a model is chosen, so
  // "Poll and test" never fails silently.
  if (state.coach.testStatus === "error" && state.coach.lastError) {
    return `Coach offline - ${state.coach.lastError}`;
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

function createInsecureUrlWarning(config) {
  if (!config.apiKey || !config.baseUrl) return null;
  const isLocalhost = /^https?:\/\/(localhost|127\.)/i.test(config.baseUrl);
  if (isLocalhost || config.baseUrl.startsWith("https://")) return null;

  const warning = document.createElement("p");
  warning.className = "coach-settings__warning";
  warning.textContent = "Warning: API key will be sent over an unencrypted HTTP connection. Use HTTPS or a localhost URL.";
  return warning;
}
