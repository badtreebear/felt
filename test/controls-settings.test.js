import { beforeEach, describe, expect, it } from "vitest";
import { renderControls } from "../src/ui/controls.js";

describe("settings cog controls", () => {
  beforeEach(() => {
    globalThis.document = new FakeDocument();
  });

  it("keeps set-and-forget settings out of the main bar while closed", () => {
    const container = document.createElement("div");

    renderControls(container, sampleState(), actionSpy());

    expect(byAriaLabel(container, "Table settings")).not.toBeNull();
    expect(byAriaLabel(container, "AI coach settings")).toBeNull();
    expect(byId(container, "players")).toBeNull();
    expect(byId(container, "street")).toBeNull();
    expect(textIncludes(container, "Reveal villain cards")).toBe(false);
  });

  it("renders gameplay and coach settings in one dismissible drawer", () => {
    const container = document.createElement("div");
    const calls = [];

    renderControls(container, sampleState({
      ui: { settingsOpen: true, spotMode: "manual" },
    }), actionSpy(calls));

    expect(byAriaLabel(container, "Table settings")).not.toBeNull();
    expect(byAriaLabel(container, "AI coach settings")).toBeNull();
    expect(byId(container, "players")).not.toBeNull();
    expect(byId(container, "street")).not.toBeNull();
    expect(byId(container, "action-speed")).not.toBeNull();
    expect(byId(container, "manual-pot")).not.toBeNull();
    expect(textIncludes(container, "Reveal villain cards")).toBe(true);
    expect(textIncludes(container, "Enable coach")).toBe(true);

    document.dispatchEvent({ type: "keydown", key: "Escape", target: document.body });

    expect(calls).toContainEqual(["setSettingsOpen", false]);
  });
});

function sampleState(overrides = {}) {
  const ui = {
    openPopover: null,
    openRangeSeat: null,
    revealVillains: false,
    showProfiles: false,
    displayUnit: "usd",
    heroRaiseTo: 2.5,
    spotMode: "dealt",
    actionDelayMs: 1000,
    settingsOpen: false,
    rosterOpen: false,
    rosterImportStatus: null,
    awaitingStart: false,
    trackerOpen: false,
    trackerImportStatus: null,
    ...(overrides.ui || {}),
  };

  return {
    config: {
      players: 6,
      heroSeat: 3,
      blinds: { sb: 0.5, bb: 1 },
      bbDollarValue: 2,
      stack: 200,
      tableStacks: {},
      seatProfiles: {},
      seatPlayers: {},
      seatModes: {},
      seatAssignments: {},
      ...(overrides.config || {}),
    },
    roster: overrides.roster || [],
    heroes: overrides.heroes || [{ id: "hero-1", name: "Jason" }],
    activeHeroId: overrides.activeHeroId || "hero-1",
    hand: {
      seed: "seed-1",
      deck: [],
      holeCards: {},
      board: [],
      boardRunout: ["As", "Kd", "7c", "2h", "9s"],
      burnCards: [],
      street: "preflop",
      pot: 24,
      toCall: 8,
      actionLog: [],
      buttonSeat: 0,
      startingStacks: {},
      preflop: null,
      postflop: null,
      trackerRecordId: "",
      trackerDecisions: [],
      ...(overrides.hand || {}),
    },
    ui,
    tracker: {
      hands: [],
      summary: null,
      selectedLeakType: "",
      status: "idle",
      ...(overrides.tracker || {}),
    },
    coach: {
      config: {
        enabled: false,
        baseUrl: "http://localhost:4000/v1",
        model: "",
        apiKey: "",
      },
      status: "unconfigured",
      settingsOpen: false,
      testStatus: "idle",
      lastError: "",
      availableModels: [],
      callCount: 0,
      chatOpen: false,
      chatInput: "",
      chatHistory: [],
      chatStatus: "idle",
      explain: {},
      review: { status: "idle", content: "", error: "" },
      ...(overrides.coach || {}),
    },
  };
}

function actionSpy(calls = []) {
  return new Proxy({}, {
    get: (_target, prop) => (...args) => {
      calls.push([String(prop), ...args]);
    },
  });
}

function byId(root, id) {
  return walk(root).find((node) => node.id === id || node.getAttribute?.("id") === id) || null;
}

function byAriaLabel(root, label) {
  return walk(root).find((node) => node.getAttribute?.("aria-label") === label) || null;
}

function textIncludes(root, text) {
  return walk(root).some((node) => node.textContent === text);
}

function walk(root) {
  const nodes = [];
  const visit = (node) => {
    nodes.push(node);
    for (const child of node.children || []) {
      visit(child);
    }
  };
  visit(root);
  return nodes;
}

class FakeDocument {
  constructor() {
    this.listeners = new Map();
    this.body = new FakeElement("body");
  }

  createElement(tagName) {
    return new FakeElement(tagName);
  }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) || new Set();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type, listener) {
    this.listeners.get(type)?.delete(listener);
  }

  dispatchEvent(event) {
    for (const listener of this.listeners.get(event.type) || []) {
      listener(event);
    }
  }
}

class FakeElement {
  constructor(tagName) {
    this.tagName = tagName.toUpperCase();
    this.children = [];
    this.parentNode = null;
    this.attributes = new Map();
    this.listeners = new Map();
    this.style = {};
    this.className = "";
    this.textContent = "";
    this.innerHTML = "";
    this.hidden = false;
    this.disabled = false;
    this.checked = false;
    this.value = "";
    this.id = "";
    this.classList = new FakeClassList(this);
  }

  get options() {
    return this.children;
  }

  append(...children) {
    for (const child of children) {
      if (!child) {
        continue;
      }

      child.parentNode = this;
      this.children.push(child);
    }
  }

  replaceChildren(...children) {
    this.children = [];
    this.append(...children);
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
    if (name === "id") {
      this.id = String(value);
    }
    if (name === "class") {
      this.className = String(value);
    }
  }

  getAttribute(name) {
    return this.attributes.get(name) || null;
  }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) || new Set();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  contains(target) {
    let node = target;
    while (node) {
      if (node === this) {
        return true;
      }
      node = node.parentNode;
    }
    return false;
  }
}

class FakeClassList {
  constructor(element) {
    this.element = element;
  }

  add(name) {
    const names = this.names();
    names.add(name);
    this.element.className = [...names].join(" ");
  }

  toggle(name, force) {
    const names = this.names();
    const shouldAdd = force ?? !names.has(name);

    if (shouldAdd) {
      names.add(name);
    } else {
      names.delete(name);
    }

    this.element.className = [...names].join(" ");
    return shouldAdd;
  }

  names() {
    return new Set(String(this.element.className || "").split(/\s+/).filter(Boolean));
  }
}
