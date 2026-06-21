import { describe, expect, it } from "vitest";
import { applySeatAssignment } from "../src/roster/seat-assignments.js";
import { resolveSeatProfilesForHand } from "../src/roster/weights.js";

describe("per-seat player assignments", () => {
  it("seats a known player and sets the base profile for the seat", () => {
    const roster = [{ id: "p_matt", name: "Matt", profile: "lag" }];
    const result = applySeatAssignment(baseConfig(), roster, 0, "player:p_matt");

    expect(result.seatPlayers).toEqual({ 0: "p_matt" });
    expect(result.seatProfiles).toEqual({ 0: "lag" });
    expect(result.seatAssignments).toEqual({ 0: "player:p_matt" });
  });

  it("selecting an anonymous type clears the known player for that seat", () => {
    const config = {
      ...baseConfig(),
      seatPlayers: { 0: "p_matt" },
      seatProfiles: { 0: "lag" },
      seatModes: { 0: "maniac" },
      seatAssignments: { 0: "player:p_matt" },
    };
    const result = applySeatAssignment(config, [], 0, "profile:nit");

    expect(result.seatPlayers).toEqual({});
    expect(result.seatProfiles).toEqual({ 0: "nit" });
    expect(result.seatModes).toEqual({});
    expect(result.seatAssignments).toEqual({ 0: "profile:nit" });
  });

  it("selecting default clears both known player and explicit profile", () => {
    const config = {
      ...baseConfig(),
      seatPlayers: { 2: "p_ken" },
      seatProfiles: { 2: "nit" },
      seatModes: { 2: "lag" },
      seatAssignments: { 2: "player:p_ken" },
    };
    const result = applySeatAssignment(config, [], 2, "default");

    expect(result.seatPlayers).toEqual({});
    expect(result.seatProfiles).toEqual({});
    expect(result.seatModes).toEqual({});
    expect(result.seatAssignments).toEqual({ 2: "default" });
  });

  it("known-player assignments persist into per-hand weighted resolution", () => {
    const roster = [{
      id: "p_jack",
      name: "Jack",
      profile: "standard",
      weights: [{ profile: "lag", percent: 100 }],
    }];
    const assigned = applySeatAssignment(baseConfig(), roster, 0, "player:p_jack");
    const config = {
      ...baseConfig(),
      ...assigned,
    };

    expect(resolveSeatProfilesForHand({ config, roster, seed: "first" }).seatProfiles[0]).toBe("lag");
    expect(resolveSeatProfilesForHand({ config, roster, seed: "second" }).seatProfiles[0]).toBe("lag");
    expect(config.seatPlayers).toEqual({ 0: "p_jack" });
  });
});

function baseConfig() {
  return {
    players: 3,
    heroSeat: 1,
    seatPlayers: {},
    seatProfiles: {},
    seatModes: {},
    seatAssignments: {},
  };
}
