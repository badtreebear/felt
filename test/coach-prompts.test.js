import { describe, expect, it } from "vitest";
import {
  buildChatMessages,
  buildExplainMessages,
  buildHandReviewMessages,
  buildTrackerLeakMessages,
  buildTrackerSummaryMessages,
} from "../src/coach/prompts.js";

const snapshot = {
  seed: "prompt-seed",
  table: { players: 6, heroSeat: 3, heroPos: "CO", blinds: [0.5, 1] },
  street: "flop",
  hero: ["As", "Ks"],
  board: ["Ah", "7d", "2c"],
  pot: 24,
  toCall: 8,
  actionLog: ["preflop: CO(hero) raises to 2.5"],
  engine: {
    equity: 0.41,
    ci: 0.01,
    requiredEquity: 0.2,
    evCall: 8.4,
    verdict: "call",
  },
};

describe("coach prompts", () => {
  it("builds explain prompts with the snapshot and topic template", () => {
    const messages = buildExplainMessages({ snapshot, topic: "potOdds" });
    const combined = messages.map((message) => message.content).join("\n");

    expect(messages[0].role).toBe("system");
    expect(combined).toContain('"seed": "prompt-seed"');
    expect(combined).toContain("Explain this pot-odds spot");
    expect(combined).not.toMatch(/calculate/i);
  });

  it("resends chat history with a refreshed snapshot", () => {
    const messages = buildChatMessages({
      snapshot,
      history: [{ role: "assistant", content: "Previous answer." }],
      input: "What now?",
    });

    expect(messages.map((message) => message.role)).toEqual(["system", "assistant", "user"]);
    expect(messages[0].content).toContain('"equity": 0.41');
    expect(messages[2].content).toBe("What now?");
  });

  it("builds hand review prompts that reference the replay seed", () => {
    const messages = buildHandReviewMessages({ snapshot });
    const combined = messages.map((message) => message.content).join("\n");

    expect(combined).toContain("Review the current hand state street by street up to this point.");
    expect(combined).toContain("If the hand is still in progress");
    expect(combined).toContain("Reference seed prompt-seed");
    expect(combined).not.toMatch(/calculate/i);
  });

  it("builds tracker summary prompts with a compact coaching budget", () => {
    const messages = buildTrackerSummaryMessages({
      snapshot: {
        hero: "Jason",
        stats: { handsTracked: 12, vpip: 0.42, pfr: 0.18, netBb: -14 },
        leaks: [{ leakType: "defended too wide", count: 3, recommended: "fold" }],
      },
    });
    const combined = messages.map((message) => message.content).join("\n");

    expect(combined).toContain("Tracker snapshot");
    expect(combined).toContain("Explain my tracker leaks");
    expect(combined).toContain("under about 250 words");
    expect(combined).toContain("defended too wide");
  });

  it("builds specific tracker leak prompts without asking the model to recompute numbers", () => {
    const messages = buildTrackerLeakMessages({
      snapshot: {
        leak: { leakType: "called -EV", count: 1, recommended: "fold" },
        decision: { heroAction: "call", recommended: "fold", evCall: -3.2 },
      },
    });
    const combined = messages.map((message) => message.content).join("\n");

    expect(combined).toContain("Tracker leak snapshot");
    expect(combined).toContain("Explain this tracked leak or hand");
    expect(combined).toContain("Do not recompute odds");
    expect(combined).toContain('"evCall": -3.2');
  });
});
