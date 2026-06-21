// Secure storage for the coach API key.
//
// Desktop (Tauri) keeps the key in the OS keychain via three small Rust commands
// (set_coach_key / get_coach_key / delete_coach_key). The browser build falls
// back to localStorage. The rest of the coach config (base URL, model, enabled)
// is NOT secret and lives in coach/config.js.

import { invoke } from "@tauri-apps/api/core";

const BROWSER_KEY_PREFIX = "felt.coach.apiKey.v1.";
// Older builds embedded the key inside the coach config JSON; we migrate it out.
const LEGACY_CONFIG_KEY = "felt.coach.config.v1";
const LEGACY_BROWSER_KEY = "felt.coach.apiKey.v1";

function isTauri() {
  return typeof globalThis !== "undefined" && Boolean(globalThis.__TAURI_INTERNALS__);
}

function browserStorage() {
  try {
    return globalThis?.localStorage || null;
  } catch {
    return null;
  }
}

export async function setCoachKey(id, key) {
  if (!id) return;
  const value = typeof key === "string" ? key : "";

  if (!value) {
    return clearCoachKey(id);
  }

  if (isTauri()) {
    try {
      await invoke("set_coach_key", { id, key: value });
      return;
    } catch {
      // Fall through to the browser store if the command isn't available.
    }
  }

  browserStorage()?.setItem(BROWSER_KEY_PREFIX + id, value);
}

export async function clearCoachKey(id) {
  if (!id) return;

  if (isTauri()) {
    try {
      await invoke("delete_coach_key", { id });
    } catch {
      // Ignore — nothing to clear or command unavailable.
    }
  }

  browserStorage()?.removeItem(BROWSER_KEY_PREFIX + id);
}

export async function getCoachKey(id) {
  if (!id) return "";

  if (isTauri()) {
    try {
      const key = await invoke("get_coach_key", { id });
      if (typeof key === "string" && key) {
        return key;
      }
    } catch {
      // Fall through to the browser store.
    }
  }

  return browserStorage()?.getItem(BROWSER_KEY_PREFIX + id) || "";
}

// Used at startup: migrate any legacy plaintext key out of the old config JSON
// or old OS keychain, then return the current key from secure storage ("" if none).
export async function loadCoachKey(id) {
  if (!id) return "";

  const legacy = await takeLegacyKey();

  if (legacy) {
    await setCoachKey(id, legacy);
    return legacy;
  }

  return getCoachKey(id);
}

// If an older build left the key inside the coach config JSON or single-key store, pull it out and
// rewrite that JSON/store without it (so no plaintext key remains).
async function takeLegacyKey() {
  if (isTauri()) {
    try {
      const key = await invoke("get_legacy_coach_key");
      if (typeof key === "string" && key) {
        await invoke("delete_legacy_coach_key").catch(() => {});
        return key;
      }
    } catch {
      // Fall through
    }
  }

  const storage = browserStorage();

  if (!storage) {
    return "";
  }

  const legacyBrowserKey = storage.getItem(LEGACY_BROWSER_KEY);
  if (legacyBrowserKey) {
    storage.removeItem(LEGACY_BROWSER_KEY);
    return legacyBrowserKey;
  }

  try {
    const raw = storage.getItem(LEGACY_CONFIG_KEY);

    if (!raw) {
      return "";
    }

    const config = JSON.parse(raw);
    const key = typeof config?.apiKey === "string" ? config.apiKey : "";

    if (key) {
      delete config.apiKey;
      storage.setItem(LEGACY_CONFIG_KEY, JSON.stringify(config));
    }

    return key;
  } catch {
    return "";
  }
}
