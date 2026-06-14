export const coachDefaults = Object.freeze({
  enabled: false,
  baseUrl: "http://localhost:4000/v1",
  model: "",
  apiKey: "",
});

const STORAGE_KEY = "felt.coach.config.v1";

export function normalizeCoachConfig(config = {}) {
  return {
    enabled: Boolean(config.enabled),
    baseUrl: cleanString(config.baseUrl) || coachDefaults.baseUrl,
    model: cleanString(config.model),
    apiKey: cleanString(config.apiKey),
  };
}

export function loadCoachConfig({ storage = browserStorage() } = {}) {
  if (!storage) {
    return { ...coachDefaults };
  }

  try {
    const raw = storage.getItem(STORAGE_KEY);
    return normalizeCoachConfig(raw ? JSON.parse(raw) : coachDefaults);
  } catch {
    return { ...coachDefaults };
  }
}

export function saveCoachConfig(config, { storage = browserStorage() } = {}) {
  const normalized = normalizeCoachConfig(config);

  if (!storage) {
    return normalized;
  }

  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(normalized));
  } catch {
    // Storage may be unavailable in embedded artifact contexts. Runtime state
    // still carries the normalized config for this session.
  }

  return normalized;
}

export function isCoachConfigured(config) {
  const normalized = normalizeCoachConfig(config);
  return Boolean(normalized.enabled && normalized.baseUrl && normalized.model);
}

export function coachStatus(config, reachability = "unreachable") {
  if (!isCoachConfigured(config)) {
    return "unconfigured";
  }

  return reachability === "reachable" ? "reachable" : "unreachable";
}

export function isCoachReachable(coachState) {
  return coachState?.status === "reachable" && isCoachConfigured(coachState.config);
}

function browserStorage() {
  try {
    return globalThis?.localStorage || null;
  } catch {
    return null;
  }
}

function cleanString(value) {
  return typeof value === "string" ? value.trim() : "";
}
