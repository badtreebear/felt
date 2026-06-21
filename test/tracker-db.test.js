import { beforeEach, describe, expect, it } from "vitest";
import {
  deleteByIndex,
  deleteRecord,
  get,
  getAll,
  getAllByIndex,
  put,
  resetMemoryDb,
} from "../src/store/db.js";

describe("tracker IndexedDB wrapper", () => {
  beforeEach(() => {
    resetMemoryDb();
  });

  it("round-trips records and indexes hands by hero", async () => {
    await put("heroes", { id: "h1", name: "You", color: "#fff", createdAt: "2026-06-14T00:00:00.000Z" });
    await put("hands", { id: "hand-1", heroId: "h1", seed: "alpha", ts: 1 });
    await put("hands", { id: "hand-2", heroId: "h2", seed: "beta", ts: 2 });

    expect(await get("heroes", "h1")).toMatchObject({ name: "You" });
    expect(await getAllByIndex("hands", "heroId", "h1")).toEqual([
      expect.objectContaining({ id: "hand-1", seed: "alpha" }),
    ]);
  });

  it("deletes individual records and all records for an index value", async () => {
    await put("hands", { id: "hand-1", heroId: "h1", seed: "alpha", ts: 1 });
    await put("hands", { id: "hand-2", heroId: "h1", seed: "beta", ts: 2 });
    await put("hands", { id: "hand-3", heroId: "h2", seed: "gamma", ts: 3 });

    await deleteRecord("hands", "hand-1");
    expect((await getAll("hands")).map((hand) => hand.id).sort()).toEqual(["hand-2", "hand-3"]);

    expect(await deleteByIndex("hands", "heroId", "h1")).toBe(1);
    expect((await getAll("hands")).map((hand) => hand.id)).toEqual(["hand-3"]);
  });
});
