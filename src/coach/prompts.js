export const COACH_SYSTEM_PROMPT = [
  "You are Felt's optional poker coach for an improving home-game player.",
  "Use plain language and keep ordinary answers under about 120 words.",
  "Write plain text only: no LaTeX, no markdown, no math/formula notation (never use $...$, \\text, \\heartsuit, etc.).",
  "Write cards as rank plus a suit symbol, e.g. 'K♥ Q♥' or 'A♠', or in words like 'king-queen of hearts' — never as formulas.",
  "Use only the engine numbers in the snapshot. Do not recompute them, estimate new ones, or contradict them.",
  "If a response would conflict with an engine value, say the displayed engine value is authoritative.",
  "Mention position, ranges, pot odds, and EV when they help the hand make sense.",
  "Do not encourage gambling beyond strategy for the hand shown.",
].join(" ");

const EXPLAIN_LABELS = {
  equity: "equity",
  potOdds: "pot-odds",
  ev: "EV",
};

export function buildExplainMessages({ snapshot, topic }) {
  const label = EXPLAIN_LABELS[topic] || topic;

  return [
    systemMessage(snapshot),
    {
      role: "user",
      content: [
        `Explain this ${label} spot to an improving home-game player.`,
        "The numbers are authoritative; do not recompute them.",
      ].join(" "),
    },
  ];
}

export function buildChatMessages({ snapshot, history = [], input }) {
  return [
    systemMessage(snapshot),
    ...history.map((message) => ({
      role: message.role === "assistant" ? "assistant" : "user",
      content: String(message.content || ""),
    })),
    {
      role: "user",
      content: String(input || ""),
    },
  ];
}

export function buildHandReviewMessages({ snapshot }) {
  return [
    systemMessage(snapshot),
    {
      role: "user",
      content: [
        "Review the current hand state street by street up to this point.",
        "If the hand is still in progress, explain where it stands and the main decision pressure now.",
        "Give one concrete thing to try differently next time.",
        `Reference seed ${snapshot.seed || "unknown"} for replay.`,
        "Use the action log and engine numbers as authoritative.",
      ].join(" "),
    },
  ];
}

export function buildTrackerSummaryMessages({ snapshot }) {
  return [
    systemMessage(snapshot, "Tracker snapshot"),
    {
      role: "user",
      content: [
        "Explain my tracker leaks in plain language for an improving home-game player.",
        "Use the stats strip and leak list as authoritative.",
        "Say what each leak means, which one to fix first, and one practical adjustment.",
        "Keep it under about 250 words.",
      ].join(" "),
    },
  ];
}

export function buildTrackerLeakMessages({ snapshot }) {
  if (snapshot?.isGood) {
    return [
      systemMessage(snapshot, "Tracker good-play snapshot"),
      {
        role: "user",
        content: [
          "Explain why this tracked play was good, in plain language.",
          "Use the cards, position, action log, recommended action, and any EV numbers in the snapshot as authoritative.",
          "Say what the hero did well and the principle worth repeating in similar spots.",
          "Do not recompute odds or invent missing numbers.",
        ].join(" "),
      },
    ];
  }

  return [
    systemMessage(snapshot, "Tracker leak snapshot"),
    {
      role: "user",
      content: [
        "Explain this tracked leak or hand in plain language.",
        "Use the cards, position, action log, recommended action, and any EV numbers in the snapshot as authoritative.",
        "Explain why the shown line was a mistake and what the better line is.",
        "Do not recompute odds or invent missing numbers.",
      ].join(" "),
    },
  ];
}

function systemMessage(snapshot, heading = "Current hand snapshot") {
  return {
    role: "system",
    content: `${COACH_SYSTEM_PROMPT}\n\n${heading}:\n${JSON.stringify(snapshot, null, 2)}`,
  };
}
