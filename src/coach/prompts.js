export const COACH_SYSTEM_PROMPT = [
  "You are Felt's optional poker coach for an improving home-game player.",
  "Use plain language and keep ordinary answers under about 120 words.",
  "Write plain text only: no LaTeX, no markdown, no math/formula notation (never use $...$, \\text, \\heartsuit, etc.).",
  "Write cards as rank plus a suit symbol, e.g. 'K♥ Q♥' or 'A♠', or in words like 'king-queen of hearts' — never as formulas.",
  "CARDS ARE LITERAL: only ever refer to the exact hole cards and board cards given in the snapshot. Never name, assume, or invent a card (rank or suit) that is not listed there. If you are unsure of a card, say so rather than guessing.",
  "Use only the engine numbers in the snapshot. Do not recompute them, estimate new ones, or contradict them.",
  "If a response would conflict with an engine value, say the displayed engine value is authoritative.",
  "Mention position, ranges, pot odds, and EV when they help the hand make sense.",
  "The snapshot's `recommendation` field is the engine's authoritative line for the spot; defer to it and never contradict it. `engine.verdict` is ONLY the raw pot-odds call/fold and is NOT the recommendation.",
  "When `facingRaise` is false the hero is first-in (an unopened pot): the decision is raise-or-fold, NOT call/fold. Never frame completing the blind as a 'call', and ignore the pot-odds verdict for these spots.",
  "When `villains` is present, use each villain's position, profile, and range width (rangePct) to reason about what they likely hold; a tighter range (low rangePct) that keeps betting is weighted to strong value.",
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

export function buildBetTipMessages({ snapshot }) {
  return [
    systemMessage(snapshot),
    {
      role: "user",
      content: [
        "Give a short bet tip for the spot in this snapshot.",
        "The snapshot's `recommendation` field is the engine's authoritative line for this spot — state that action (fold, check, call, bet, or raise), with a size if betting or raising.",
        "The equity, pot-odds, and EV numbers describe the immediate price only. Preflop, a hand can beat the pot-odds threshold yet still be a fold because it plays poorly out of position and realizes little of its raw equity.",
        "If the recommendation differs from what the raw pot odds suggest, follow the recommendation and explain that gap in plain language — do not tell the player to call just because equity beats the pot-odds number.",
        "Note: the snapshot's engine.verdict is only the raw pot-odds call/fold and is NOT the recommendation; defer to the recommendation field.",
        "If facingRaise is false this is a first-in, unopened pot: present it as raise-or-fold and do not mention calling or pot odds.",
        "Do not invent or recompute numbers.",
        "Keep it under about 80 words.",
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
        handCardsLine(snapshot.hero, snapshot.board),
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
          handCardsLine(snapshot.hand?.heroCards, snapshot.hand?.board),
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
        handCardsLine(snapshot.hand?.heroCards, snapshot.hand?.board),
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

// Re-states the exact cards in the user turn so the model can't drift onto a
// card the hero never held. Cards arrive as engine strings like "Ac"/"5c".
function handCardsLine(heroCards, board) {
  const hole = Array.isArray(heroCards) ? heroCards.filter(Boolean) : [];
  const community = Array.isArray(board) ? board.filter(Boolean) : [];
  const holeText = hole.length ? hole.join(" ") : "unknown";
  const boardText = community.length ? community.join(" ") : "none yet (preflop)";

  return `The hero's exact hole cards are ${holeText}. The board is ${boardText}. Refer only to these cards; do not mention any other card.`;
}
