import { describe, expect, it } from "vitest";
import {
  importedRosterEntries,
  mergeImportedRoster,
  normalizePlayer,
} from "../src/roster/store.js";

describe("roster import/export helpers", () => {
  it("merges imported players additively with numbered duplicate names and fresh ids", () => {
    const existing = [
      { id: "p_existing", name: "Matt", profile: "standard", color: "#6fbf8f", notes: [], createdAt: "2026-06-14T00:00:00.000Z" },
      { id: "p_existing_2", name: "Matt (2)", profile: "nit", color: "#d9c96f", notes: [], createdAt: "2026-06-14T00:00:00.000Z" },
    ];
    const ids = idSequence(["p_existing", "p_imported_1", "p_imported_2"]);

    const result = mergeImportedRoster(existing, [
      { id: "source_a", name: "Matt", profile: "lag", color: "#c97fd9", notes: ["late opens"], weights: [{ profile: "maniac", percent: 5 }] },
      { id: "source_b", name: "Ken", profile: "unknown", color: "#6fd9d0", notes: [] },
      { id: "bad", profile: "tag" },
    ], { idFactory: ids });

    expect(result.added).toBe(2);
    expect(result.skipped).toBe(1);
    expect(result.roster.slice(0, existing.length)).toEqual(existing);
    expect(result.roster.at(-2)).toMatchObject({
      id: "p_imported_1",
      name: "Matt (3)",
      profile: "lag",
      color: "#c97fd9",
      notes: ["late opens"],
      weights: [{ profile: "maniac", percent: 5 }],
    });
    expect(result.roster.at(-1)).toMatchObject({
      id: "p_imported_2",
      name: "Ken",
      profile: "standard",
    });
    expect(result.roster.map((player) => player.id)).not.toContain("source_a");
  });

  it("accepts array, single-player, and players-wrapper payloads", () => {
    const single = { name: "Ari", profile: "tag" };
    const wrapped = { players: [{ name: "Bea", profile: "nit" }] };

    expect(importedRosterEntries([single])).toEqual([single]);
    expect(importedRosterEntries(single)).toEqual([single]);
    expect(importedRosterEntries(wrapped)).toEqual(wrapped.players);
    expect(importedRosterEntries(null)).toEqual([]);
  });

  it("round-trips exported roster JSON into a fresh roster while regenerating ids", () => {
    const original = [
      normalizePlayer({
        id: "p_original",
        name: "Jack",
        profile: "standard",
        color: "#d98f6f",
        notes: [{ date: "2026-06-14", text: "calls wide" }],
        weights: [{ profile: "lag", percent: 5 }],
        createdAt: "2026-06-14T06:31:25.125Z",
      }),
    ];
    const exported = JSON.parse(JSON.stringify(original));
    const result = mergeImportedRoster([], exported, { idFactory: idSequence(["p_new"]) });

    expect(result.added).toBe(1);
    expect(result.roster[0]).toEqual({
      ...original[0],
      id: "p_new",
    });
  });
});

function idSequence(ids) {
  let index = 0;

  return () => ids[index++] || `p_extra_${index}`;
}
