// Known AI providers + base-URL presets for the coach, plus the allowlist gate.
//
// Locked-down model: the API key may only be sent to a known cloud provider, or
// to a localhost address (any port — Ollama / LM Studio / LiteLLM / custom local
// proxies). Arbitrary remote hosts are NOT allowed, which lets the CSP enforce
// the same list at the platform level. Every provider here exposes an
// OpenAI-compatible /chat/completions endpoint, so only the base URL differs.

export const LOCAL_HOSTS = ["localhost", "127.0.0.1", "[::1]"];

// Cloud providers — `host` drives the allowlist + CSP; `baseUrl` is the preset.
export const CLOUD_PROVIDERS = [
  { name: "OpenAI", host: "api.openai.com", baseUrl: "https://api.openai.com/v1" },
  { name: "OpenRouter", host: "openrouter.ai", baseUrl: "https://openrouter.ai/api/v1" },
  { name: "Anthropic", host: "api.anthropic.com", baseUrl: "https://api.anthropic.com/v1" },
  { name: "Google Gemini", host: "generativelanguage.googleapis.com", baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai" },
  { name: "DeepSeek", host: "api.deepseek.com", baseUrl: "https://api.deepseek.com/v1" },
  { name: "xAI Grok", host: "api.x.ai", baseUrl: "https://api.x.ai/v1" },
  { name: "Groq", host: "api.groq.com", baseUrl: "https://api.groq.com/openai/v1" },
];

// Local presets (all localhost, just different default ports).
export const LOCAL_PRESETS = [
  { name: "Ollama (local)", baseUrl: "http://localhost:11434/v1" },
  { name: "LM Studio (local)", baseUrl: "http://localhost:1234/v1" },
  { name: "LiteLLM (local)", baseUrl: "http://localhost:4000/v1" },
];

// The full dropdown list shown in Coach settings.
export const BASE_URL_PRESETS = [
  ...LOCAL_PRESETS,
  ...CLOUD_PROVIDERS.map((provider) => ({ name: provider.name, baseUrl: provider.baseUrl })),
];

// Starter value when the user picks "Custom local…" from a non-local preset.
export const CUSTOM_LOCAL_STARTER = "http://localhost:8080/v1";

export function hostFromUrl(url) {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
}

export function isLocalhostUrl(url) {
  return LOCAL_HOSTS.includes(hostFromUrl(url));
}

export function isCloudProviderUrl(url) {
  const host = hostFromUrl(url);

  if (!host) {
    return false;
  }

  return CLOUD_PROVIDERS.some((provider) => host === provider.host || host.endsWith(`.${provider.host}`));
}

// Allowed if it's a known cloud provider or any localhost address.
export function isBaseUrlAllowed(url) {
  return isLocalhostUrl(url) || isCloudProviderUrl(url);
}

export function matchesPreset(url) {
  return BASE_URL_PRESETS.some((preset) => preset.baseUrl === url);
}

// A localhost URL that isn't one of the named presets — i.e. a custom local
// port. Used to put the dropdown into free-text mode.
export function isCustomLocalUrl(url) {
  return isLocalhostUrl(url) && !matchesPreset(url);
}
