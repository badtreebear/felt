import { isCoachConfigured, normalizeCoachConfig } from "./config.js";
import { isBaseUrlAllowed } from "./providers.js";

const DEFAULT_TIMEOUT_MS = 10000;

export async function testCoachConnection(config, options = {}) {
  const normalized = normalizeCoachConfig(config);

  if (!normalized.enabled || !normalized.baseUrl) {
    return failure("Coach is not configured.", "unconfigured");
  }

  const modelsResult = await requestJson({
    ...options,
    config: normalized,
    path: "/models",
    init: {
      method: "GET",
      headers: authHeaders(normalized),
    },
    parse: async (response) => ({
      ok: true,
      status: "reachable",
      models: modelIdsFromResponse(await response.json()),
    }),
  });

  if (!modelsResult.ok) {
    return modelsResult;
  }

  if (!normalized.model) {
    return {
      ok: false,
      status: "unreachable",
      error: "Choose a model before testing.",
      models: modelsResult.models,
    };
  }

  if (modelsResult.models.length && !modelsResult.models.includes(normalized.model)) {
    return {
      ok: false,
      status: "unreachable",
      error: `Model "${normalized.model}" was not returned by /models.`,
      models: modelsResult.models,
    };
  }

  const ping = await coachChatCompletion(normalized, [
    {
      role: "system",
      content: "Connection check. Reply with OK.",
    },
    {
      role: "user",
      content: "ping",
    },
  ], {
    ...options,
    maxTokens: 4,
    temperature: 0,
  });

  if (!ping.ok) {
    return {
      ...ping,
      models: modelsResult.models,
    };
  }

  return {
    ok: true,
    status: "reachable",
    models: modelsResult.models,
  };
}

export async function coachChatCompletion(config, messages, options = {}) {
  const normalized = normalizeCoachConfig(config);
  const {
    maxTokens = 180,
    temperature = 0.4,
  } = options;

  if (!isCoachConfigured(normalized)) {
    return failure("Coach is not configured.", "unconfigured");
  }

  return requestJson({
    ...options,
    config: normalized,
    path: "/chat/completions",
    init: {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...authHeaders(normalized),
      },
      body: JSON.stringify({
        model: normalized.model,
        messages,
        max_tokens: maxTokens,
        temperature,
      }),
    },
    parse: async (response) => {
      const data = await response.json();
      const content = data?.choices?.[0]?.message?.content;

      if (typeof content !== "string" || !content.trim()) {
        return failure("Coach returned an empty response.", "unreachable");
      }

      return {
        ok: true,
        status: "reachable",
        content: content.trim(),
      };
    },
  });
}

async function requestJson({
  config,
  path,
  init,
  parse,
  fetchImpl = globalThis.fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  AbortControllerImpl = globalThis.AbortController,
}) {
  if (typeof fetchImpl !== "function") {
    return failure("Fetch is unavailable in this browser.", "unreachable");
  }

  // Only send the key to a known cloud provider or a localhost address. Anything
  // else is refused (and the CSP blocks it too).
  if (!isBaseUrlAllowed(config.baseUrl)) {
    return failure(
      "This base URL isn't a known provider or a localhost address. Pick a provider from the list in Coach settings.",
      "unreachable",
    );
  }

  const timeout = timeoutSignal({ timeoutMs, AbortControllerImpl });

  try {
    const response = await fetchImpl(`${trimSlash(config.baseUrl)}${path}`, {
      ...init,
      signal: timeout.signal,
    });

    if (!response.ok) {
      return failure(await responseError(response, [config.apiKey]), "unreachable");
    }

    return parse(response);
  } catch (error) {
    return failure(errorMessage(error), "unreachable");
  } finally {
    timeout.cleanup();
  }
}

function authHeaders(config) {
  return config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {};
}

function trimSlash(value) {
  return value.replace(/\/+$/, "");
}

async function responseError(response, redactions = []) {
  try {
    const text = redact(await response.text(), redactions);
    return text ? `Coach request failed (${response.status}): ${text.slice(0, 180)}` : `Coach request failed (${response.status}).`;
  } catch {
    return `Coach request failed (${response.status}).`;
  }
}

function redact(text, redactions) {
  return redactions
    .filter(Boolean)
    .reduce((value, secret) => value.split(secret).join("[redacted]"), text || "");
}

function timeoutSignal({ timeoutMs, AbortControllerImpl }) {
  if (!AbortControllerImpl) {
    return { signal: undefined, cleanup: () => {} };
  }

  const controller = new AbortControllerImpl();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return {
    signal: controller.signal,
    cleanup: () => clearTimeout(timer),
  };
}

function errorMessage(error) {
  if (error?.name === "AbortError") {
    return "Coach request timed out.";
  }

  return error?.message || "Coach request failed.";
}

function failure(error, status) {
  return {
    ok: false,
    status,
    error,
  };
}

function modelIdsFromResponse(data) {
  const rawModels = Array.isArray(data?.data)
    ? data.data
    : Array.isArray(data?.models)
      ? data.models
      : [];

  return [...new Set(rawModels
    .map((model) => {
      if (typeof model === "string") {
        return model;
      }

      return model?.id || model?.name || model?.model;
    })
    .filter((model) => typeof model === "string" && model.trim())
    .map((model) => model.trim()))].sort((first, second) => first.localeCompare(second));
}
