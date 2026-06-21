import { describe, expect, it, vi } from "vitest";
import { coachChatCompletion, testCoachConnection } from "../src/coach/client.js";

const config = {
  enabled: true,
  baseUrl: "http://localhost:4000/v1",
  model: "coach-model",
  apiKey: "secret-key",
};

describe("coach client", () => {
  it("does not fetch when the coach is unconfigured", async () => {
    const fetchImpl = vi.fn();
    const result = await testCoachConnection({ ...config, enabled: false }, { fetchImpl });

    expect(result.ok).toBe(false);
    expect(result.status).toBe("unconfigured");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("tests an OpenAI-compatible /models endpoint without putting the key in the URL", async () => {
    const fetchImpl = vi.fn(async (url) => {
      if (url.endsWith("/models")) {
        return okResponse({ data: [{ id: "coach-model" }] });
      }

      return okResponse({
        choices: [{ message: { content: "OK" } }],
      });
    });
    const result = await testCoachConnection(config, { fetchImpl });

    expect(result).toEqual({
      ok: true,
      status: "reachable",
      models: ["coach-model"],
    });
    expect(fetchImpl).toHaveBeenCalledWith("http://localhost:4000/v1/models", expect.objectContaining({
      method: "GET",
      headers: { Authorization: "Bearer secret-key" },
    }));
    expect(fetchImpl.mock.calls[0][0]).not.toContain("secret-key");
    expect(fetchImpl.mock.calls[1][0]).toBe("http://localhost:4000/v1/chat/completions");
    expect(JSON.parse(fetchImpl.mock.calls[1][1].body).model).toBe("coach-model");
  });

  it("polls models but fails until a model is selected", async () => {
    const fetchImpl = vi.fn(async () => okResponse({ data: [{ id: "alpha" }, { id: "beta" }] }));
    const result = await testCoachConnection({ ...config, model: "" }, { fetchImpl });

    expect(result.ok).toBe(false);
    expect(result.error).toBe("Choose a model before testing.");
    expect(result.models).toEqual(["alpha", "beta"]);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("fails when the selected model is absent from a non-empty model list", async () => {
    const fetchImpl = vi.fn(async () => okResponse({ data: [{ id: "other-model" }] }));
    const result = await testCoachConnection(config, { fetchImpl });

    expect(result.ok).toBe(false);
    expect(result.error).toContain("was not returned by /models");
    expect(result.models).toEqual(["other-model"]);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("returns chat-completion content on success", async () => {
    const fetchImpl = vi.fn(async () => okResponse({
      choices: [{ message: { content: "Call is profitable because your equity clears the engine threshold." } }],
    }));
    const result = await coachChatCompletion(config, [{ role: "user", content: "Explain EV." }], { fetchImpl });

    expect(result).toEqual({
      ok: true,
      status: "reachable",
      content: "Call is profitable because your equity clears the engine threshold.",
    });
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body).model).toBe("coach-model");
  });

  it("redacts configured secrets from non-2xx error text", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: false,
      status: 401,
      text: async () => "bad key secret-key",
    }));
    const result = await testCoachConnection(config, { fetchImpl });

    expect(result.ok).toBe(false);
    expect(result.error).toContain("[redacted]");
    expect(result.error).not.toContain("secret-key");
  });

  it("turns aborts into a graceful timeout failure", async () => {
    const abort = new Error("aborted");
    abort.name = "AbortError";
    const fetchImpl = vi.fn(async () => {
      throw abort;
    });
    const result = await coachChatCompletion(config, [{ role: "user", content: "Hi" }], { fetchImpl });

    expect(result).toEqual({
      ok: false,
      status: "unreachable",
      error: "Coach request timed out.",
    });
  });
});

function okResponse(body) {
  return {
    ok: true,
    status: 200,
    json: async () => body,
  };
}
