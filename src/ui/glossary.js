// Single source of truth for the in-app glossary. Deliberately scoped to the
// maths layer and the trainer/stats terms Felt actually shows — NOT a full poker
// dictionary. The tracker stat tooltips read STAT_GLOSSARY from here too, so a
// term is defined in exactly one place.

export const MATHS_GLOSSARY = {
  "BE%": "Breakeven fold % — how often a bluff must win immediately (villain folds) to break even: bet / (bet + pot). A pot-sized bet needs 50%.",
  Equity: "Your share of the pot at showdown — how often this hand wins or chops if it ran out right now.",
  EV: "Expected value — the average chips a decision wins or loses over the long run. Positive is profitable.",
  "Pot odds": "The equity you need to call profitably: your call as a share of the final pot you'd be playing for.",
  "Value:bluff": "The balanced mix of value bets to bluffs for a bet size so a bluff-catcher is indifferent — e.g. a pot bet is about 2:1.",
};

export const STAT_GLOSSARY = {
  VPIP: "Voluntarily Put $ In Pot — how often you put money in preflop by choice (call or raise), ignoring a free big-blind check. Higher = looser.",
  PFR: "Pre-Flop Raise — how often you raise preflop. The gap between VPIP and PFR is how often you only call.",
  RFI: "Raise First In — opening with a raise when no one has entered the pot yet.",
  "3-bet": "Re-raising a preflop raiser (the third bet: blind, open raise, then your re-raise).",
  Defend: "Continuing against a raise from the blinds (or in position) by calling or 3-betting rather than folding.",
  "Fold c-bet": "Fold to continuation bet — how often you fold the flop after the preflop raiser bets into you.",
  WTSD: "Went To Showdown — how often you reach showdown once you've seen the flop.",
  Leak: "A recurring deviation from the engine's recommended play that costs EV over time.",
  Net: "Net result across all tracked hands, in big blinds (bb).",
};

// One combined, alphabetical list for the glossary panel (numeric-aware so
// "3-bet" sorts sensibly).
export const GLOSSARY_TERMS = [
  ...toTerms(MATHS_GLOSSARY),
  ...toTerms(STAT_GLOSSARY),
].sort((a, b) => a.term.localeCompare(b.term, undefined, { sensitivity: "base", numeric: true }));

function toTerms(map) {
  return Object.entries(map).map(([term, def]) => ({ term, def }));
}

// A toggled reference panel (rendered like the tracker panel): one alphabetical
// definition list with a close button.
export function createGlossaryPanel(actions) {
  const panel = document.createElement("section");
  panel.className = "glossary-panel";
  panel.setAttribute("aria-label", "Glossary");

  const header = document.createElement("div");
  header.className = "glossary-panel__header";

  const title = document.createElement("h3");
  title.textContent = "Glossary";

  const close = document.createElement("button");
  close.type = "button";
  close.className = "glossary-panel__close";
  close.title = "Close glossary";
  close.setAttribute("aria-label", "Close glossary");
  close.textContent = "X";
  close.addEventListener("click", () => actions.setGlossaryOpen(false));

  header.append(title, close);
  panel.append(header);

  const intro = document.createElement("p");
  intro.className = "glossary-panel__intro";
  intro.textContent = "The maths and trainer terms Felt uses — not a full poker dictionary.";
  panel.append(intro);

  const list = document.createElement("dl");
  list.className = "glossary-list";

  GLOSSARY_TERMS.forEach(({ term, def }) => {
    const dt = document.createElement("dt");
    dt.textContent = term;
    const dd = document.createElement("dd");
    dd.textContent = def;
    list.append(dt, dd);
  });

  panel.append(list);
  return panel;
}
