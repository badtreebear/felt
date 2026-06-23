import { isCoachConfigured, normalizeCoachConfig } from "./config.js";
import { isBaseUrlAllowed } from "./providers.js";

const DEFAULT_TIMEOUT_MS = 10000;
// A working-but-slow model shouldn't be cut off early, so chat completions get a
// generous ceiling. Failures that come back fast (under FAST_FAIL_MS) look like
// flaps (dropped connection, transient 5xx) rather than a slow model, so we retry
// those a couple of times with short backoff. Slow failures and auth/4xx errors
// are not retried — waiting/hammering wouldn't help.
const COMPLETION_TIMEOUT_MS = 45000;
const FAST_FAIL_MS = 3000;
const MAX_RETRIES = 2;
const RETRY_BACKOFF_MS = [300, 800];

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

  return requestWithRetries({
    ...options,
    timeoutMs: options.timeoutMs ?? COMPLETION_TIMEOUT_MS,
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

// Retry a request only when it fails FAST and for a reason a retry could fix
// (a flap or transient 5xx/429) — never a slow/timed-out request or an auth/4xx.
async function requestWithRetries({
  retries = MAX_RETRIES,
  sleep = defaultSleep,
  ...params
}) {
  let attempt = 0;
  let result;

  for (;;) {
    const startedAt = Date.now();
    result = await requestJson(params);

    if (result.ok) {
      return result;
    }

    const elapsed = Date.now() - startedAt;
    const retriable = elapsed < FAST_FAIL_MS && !result.timedOut && isRetriableStatus(result.httpStatus);

    if (attempt >= retries || !retriable) {
      return result;
    }

    await sleep(RETRY_BACKOFF_MS[Math.min(attempt, RETRY_BACKOFF_MS.length - 1)]);
    attempt += 1;
  }
}

// HTTP error codes worth retrying: server-side (5xx) and rate limiting (429).
// A missing code means a network-level failure (no response) — also retriable.
function isRetriableStatus(httpStatus) {
  if (httpStatus === undefined || httpStatus === null) {
    return true;
  }

  return httpStatus >= 500 || httpStatus === 429;
}

function defaultSleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
      return failure(await responseError(response, [config.apiKey]), "unreachable", { httpStatus: response.status });
    }

    return parse(response);
  } catch (error) {
    const timedOut = timeout.timedOut || error?.name === "AbortError";
    return failure(errorMessage(error), "unreachable", { timedOut });
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
    return { signal: undefined, cleanup: () => {}, timedOut: false };
  }

  const controller = new AbortControllerImpl();
  const handle = {
    signal: controller.signal,
    cleanup: () => clearTimeout(timer),
    timedOut: false,
  };
  const timer = setTimeout(() => {
    handle.timedOut = true;
    controller.abort();
  }, timeoutMs);
  return handle;
}

function errorMessage(error) {
  if (error?.name === "AbortError") {
    return "Coach request timed out.";
  }

  return error?.message || "Coach request failed.";
}

function failure(error, status, extra = {}) {
  return {
    ok: false,
    status,
    error,
    ...extra,
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
