export const COACH_SYSTEM_PROMPT = [
  "You are Felt's optional poker coach for an improving home-game player.",
  "Use plain language and keep ordinary answers under about 120 words.",
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

function systemMessage(snapshot) {
  return {
    role: "system",
    content: `${COACH_SYSTEM_PROMPT}\n\nCurrent hand snapshot:\n${JSON.stringify(snapshot, null, 2)}`,
  };
}
