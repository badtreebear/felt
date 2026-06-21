export const coachDefaults = Object.freeze({
  id: "",
  name: "",
  enabled: false,
  baseUrl: "http://localhost:4000/v1",
  model: "",
  apiKey: "",
});

const STORAGE_KEY = "felt.coach.config.v1";

export function normalizeCoachConfig(config = {}) {
  return {
    id: cleanId(config.id),
    name: cleanString(config.name),
    enabled: Boolean(config.enabled),
    baseUrl: cleanString(config.baseUrl) || coachDefaults.baseUrl,
    model: cleanString(config.model),
    apiKey: cleanString(config.apiKey),
  };
}

export function normalizeSavedCoachConfig(config = {}, { idFactory = createCoachConfigId } = {}) {
  const normalized = normalizeCoachConfig(config);
  return {
    id: normalized.id || idFactory(),
    name: normalized.name || coachConfigLabel(normalized),
    enabled: normalized.enabled,
    baseUrl: normalized.baseUrl,
    model: normalized.model,
  };
}

export function normalizeCoachSettings(settings = {}, { idFactory = createCoachConfigId } = {}) {
  const rawConfigs = Array.isArray(settings?.configs)
    ? settings.configs
    : legacyConfigLooksSaved(settings)
      ? [settings]
      : [];
  const usedIds = new Set();
  const configs = rawConfigs
    .map((config) => normalizeSavedCoachConfig(config, {
      idFactory: () => uniqueCoachConfigId(usedIds, idFactory),
    }))
    .filter((config) => {
      if (!config.id || usedIds.has(config.id)) {
        return false;
      }

      usedIds.add(config.id);
      return true;
    });
  const activeConfigId = cleanId(settings?.activeConfigId);
  const activeConfig = configs.find((config) => config.id === activeConfigId) || configs[0] || null;

  return {
    activeConfigId: activeConfig?.id || "",
    configs,
    activeConfig: activeConfig ? normalizeCoachConfig(activeConfig) : { ...coachDefaults },
  };
}

export function loadCoachConfig({ storage = browserStorage() } = {}) {
  return loadCoachSettings({ storage }).activeConfig;
}

export function loadCoachSettings({ storage = browserStorage() } = {}) {
  if (!storage) {
    return normalizeCoachSettings();
  }

  try {
    const raw = storage.getItem(STORAGE_KEY);
    return normalizeCoachSettings(raw ? JSON.parse(raw) : {});
  } catch {
    return normalizeCoachSettings();
  }
}

export function saveCoachConfig(config, { storage = browserStorage() } = {}) {
  const saved = normalizeSavedCoachConfig(config);
  const normalized = normalizeCoachConfig({
    ...saved,
    apiKey: config?.apiKey,
  });

  if (!storage) {
    return normalized;
  }

  try {
    // Persist everything EXCEPT the secret API key, which is kept in the OS
    // keychain (browser fallback: a separate localStorage entry) via
    // coach/key-store.js. The key stays on the returned in-memory object.
    const persisted = {
      activeConfigId: saved.id,
      configs: [saved],
    };
    storage.setItem(STORAGE_KEY, JSON.stringify(persisted));
  } catch {
    // Storage may be unavailable in embedded artifact contexts. Runtime state
    // still carries the normalized config for this session.
  }

  return normalized;
}

export function saveCoachSettings(settings, { storage = browserStorage() } = {}) {
  const normalized = normalizeCoachSettings(settings);

  if (storage) {
    try {
      storage.setItem(STORAGE_KEY, JSON.stringify({
        activeConfigId: normalized.activeConfigId,
        configs: normalized.configs,
      }));
    } catch {
      // Storage may be unavailable; runtime state still carries the settings.
    }
  }

  return normalized;
}

export function importedCoachConfigs(payload, { idFactory = createCoachConfigId } = {}) {
  const rawConfigs = Array.isArray(payload?.configs)
    ? payload.configs
    : legacyConfigLooksSaved(payload)
      ? [payload]
      : [];
  const usedIds = new Set();
  const configs = [];

  for (const config of rawConfigs) {
    const imported = normalizeSavedCoachConfig({
      ...config,
      id: uniqueCoachConfigId(usedIds, idFactory),
      apiKey: "",
    }, { idFactory });

    if (imported.id && !usedIds.has(imported.id)) {
      usedIds.add(imported.id);
      configs.push(imported);
    }
  }

  return configs;
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

export function coachConfigLabel(config) {
  const normalized = normalizeCoachConfig(config);

  if (normalized.name) {
    return normalized.name;
  }

  if (normalized.model) {
    return normalized.model;
  }

  try {
    return new URL(normalized.baseUrl).hostname || "AI config";
  } catch {
    return "AI config";
  }
}

export function createCoachConfigId() {
  const cryptoObject = globalThis?.crypto;

  if (cryptoObject?.getRandomValues) {
    const values = new Uint32Array(2);
    cryptoObject.getRandomValues(values);
    return `ai_${values[0].toString(36)}${values[1].toString(36)}`;
  }

  return `ai_${Date.now().toString(36)}${Math.floor(Math.random() * 1e9).toString(36)}`;
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

function cleanId(value) {
  return typeof value === "string" ? value.trim().replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80) : "";
}

function legacyConfigLooksSaved(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  return Boolean(
    cleanString(value.name)
    || cleanString(value.model)
    || Boolean(value.enabled)
    || (cleanString(value.baseUrl) && cleanString(value.baseUrl) !== coachDefaults.baseUrl)
  );
}

function uniqueCoachConfigId(usedIds, idFactory) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const id = cleanId(idFactory());

    if (id && !usedIds.has(id)) {
      return id;
    }
  }

  let suffix = usedIds.size + 1;
  let fallback = `ai_import_${suffix}`;

  while (usedIds.has(fallback)) {
    suffix += 1;
    fallback = `ai_import_${suffix}`;
  }

  return fallback;
}
