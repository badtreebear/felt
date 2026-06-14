import { describe, expect, it } from "vitest";
import {
  coachDefaults,
  coachStatus,
  isCoachConfigured,
  loadCoachConfig,
  saveCoachConfig,
} from "../src/coach/config.js";

describe("coach config", () => {
  it("loads defaults when storage is unavailable", () => {
    expect(loadCoachConfig({ storage: null })).toEqual(coachDefaults);
  });

  it("saves and reloads normalized runtime settings", () => {
    const storage = memoryStorage();
    const saved = saveCoachConfig({
      enabled: true,
      baseUrl: " http://localhost:11434/v1/ ",
      model: " llama3.1 ",
      apiKey: " secret ",
    }, { storage });

    expect(saved).toEqual({
      enabled: true,
      baseUrl: "http://localhost:11434/v1/",
      model: "llama3.1",
      apiKey: "secret",
    });
    expect(loadCoachConfig({ storage })).toEqual(saved);
  });

  it("reports state-machine status from config and reachability", () => {
    expect(isCoachConfigured(coachDefaults)).toBe(false);
    expect(coachStatus(coachDefaults, "reachable")).toBe("unconfigured");

    const configured = { ...coachDefaults, enabled: true, model: "coach-model" };

    expect(isCoachConfigured(configured)).toBe(true);
    expect(coachStatus(configured, "unreachable")).toBe("unreachable");
    expect(coachStatus(configured, "reachable")).toBe("reachable");
  });
});

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) || null,
    setItem: (key, value) => values.set(key, value),
  };
}
