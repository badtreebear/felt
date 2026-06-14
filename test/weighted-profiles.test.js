import { describe, expect, it } from "vitest";
import { createRng } from "../src/engine/deck.js";
import { loadRoster, saveRoster } from "../src/roster/store.js";
import {
  normalizeWeights,
  resolveSeatProfilesForHand,
  resolveWeightedProfile,
} from "../src/roster/weights.js";

describe("weighted known-player profiles", () => {
  it("normalizes splashes by dropping invalid entries and clamping total weight", () => {
    expect(normalizeWeights([
      { profile: "lag", percent: 60 },
      { profile: "standard", percent: 20 },
      { profile: "unknown", percent: 10 },
      { profile: "nit", percent: -5 },
      { profile: "maniac", percent: 50 },
    ], { baseProfile: "standard" })).toEqual([
      { profile: "lag", percent: 60 },
      { profile: "maniac", percent: 40 },
    ]);
  });

  it("resolves one concrete profile from the weighted buckets", () => {
    const player = {
      profile: "standard",
      weights: [
        { profile: "lag", percent: 5 },
        { profile: "maniac", percent: 1 },
      ],
    };

    expect(resolveWeightedProfile(player, () => 0.049)).toBe("lag");
    expect(resolveWeightedProfile(player, () => 0.055)).toBe("maniac");
    expect(resolveWeightedProfile(player, () => 0.99)).toBe("standard");
    expect(resolveWeightedProfile({ profile: "nit" }, () => 0)).toBe("nit");
  });

  it("uses seeded RNGs repeatably", () => {
    const player = {
      profile: "standard",
      weights: [{ profile: "lag", percent: 33 }],
    };

    expect(resolveWeightedProfile(player, createRng("hand-a:2")))
      .toBe(resolveWeightedProfile(player, createRng("hand-a:2")));
  });

  it("resolves seated known players without mutating the input config", () => {
    const config = {
      players: 3,
      heroSeat: 1,
      seatPlayers: { 0: "p1", 2: "p2" },
      seatProfiles: { 0: "standard", 2: "station" },
    };
    const roster = [
      { id: "p1", name: "Ari", profile: "standard", weights: [{ profile: "lag", percent: 100 }] },
      { id: "p2", name: "Bea", profile: "nit" },
    ];

    const first = resolveSeatProfilesForHand({ config, roster, seed: "replay-seed" });
    const replay = resolveSeatProfilesForHand({ config, roster, seed: "replay-seed" });

    expect(first).toEqual(replay);
    expect(first.seatProfiles).toEqual({ 0: "lag", 2: "nit" });
    expect(first.seatModes).toEqual({ 0: "lag", 2: "nit" });
    expect(config.seatProfiles).toEqual({ 0: "standard", 2: "station" });
  });

  it("round-trips normalized weights through roster storage", () => {
    const restoreStorage = installMemoryLocalStorage();

    try {
      const saved = saveRoster([{
        id: "p1",
        name: "Matty",
        profile: "standard",
        color: "#6fbf8f",
        notes: [],
        weights: [
          { profile: "lag", percent: 25 },
          { profile: "nonsense", percent: 50 },
        ],
      }]);

      expect(saved[0].weights).toEqual([{ profile: "lag", percent: 25 }]);
      expect(loadRoster()).toEqual(saved);
    } finally {
      restoreStorage();
    }
  });
});

function installMemoryLocalStorage() {
  const original = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  const memory = new Map();

  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem(key) {
        return memory.has(key) ? memory.get(key) : null;
      },
      setItem(key, value) {
        memory.set(key, String(value));
      },
      removeItem(key) {
        memory.delete(key);
      },
      clear() {
        memory.clear();
      },
    },
  });

  return () => {
    if (original) {
      Object.defineProperty(globalThis, "localStorage", original);
      return;
    }

    delete globalThis.localStorage;
  };
}
