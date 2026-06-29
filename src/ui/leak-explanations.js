// Natural-language coaching for live grading. Pure, DOM-free, and EV-honest: it
// only rephrases decisions the tracker already classified, so it can never
// introduce a new leak or a false positive. Each entry turns a terse `leakType`
// into a sentence that explains WHY the line leaks and what to do instead. Where
// "pot control" is the practical lesson we say so in the EXPLANATION rather than
// inventing a "pot control" leak category (that stays a decision, not a label).

// Keyed by the exact `leakType` strings emitted by preflop-leaks.js and
// postflop-leaks.js. Keep these in sync when leak categories change.
const LEAK_EXPLANATIONS = {
  // Preflop range leaks.
  "open-folded too tight": "This hand is a standard open from here — folding it leaves money on the table.",
  "missed an open": "This is a raise-first-in hand; limping or calling surrenders the initiative you should be taking.",
  "opened too wide": "This hand is outside the opening range for this seat — open tighter to avoid playing junk out of position.",
  "defended too wide": "You defended a hand the chart folds; calling this light bleeds chips against the open.",
  "3-bet too wide": "This isn't a 3-bet hand here — turning it into a 3-bet bloats the pot with a holding that wants to see a flop or fold.",
  "over-folded a defend hand": "This hand is strong enough to continue — folding it is too tight and lets opens run you over.",
  "flatted a 3-bet hand": "This hand prefers a 3-bet to a flat: 3-betting builds the pot and denies the opener equity.",
  "3-bet a call hand": "This hand plays better as a call — 3-betting it folds out the hands you beat and isolates you against stronger ones.",
  "continued too wide vs 3-bet": "Facing a 3-bet, this hand should fold — continuing this wide commits chips with a dominated range.",
  "over-folded vs 3-bet": "This hand is good enough to continue versus a 3-bet; folding it is too tight.",
  "flatted a 4-bet hand": "This hand wants to 4-bet rather than flat — flatting caps your range and plays a big pot out of position.",
  "4-bet a call hand": "This hand prefers calling the 3-bet to 4-betting; 4-betting it only folds out worse and isolates against better.",

  // Postflop EV (call / fold) leaks.
  "called -EV (paid off)": "Your equity didn't justify the price — you paid off a bet that, on average, loses chips. Folding is more profitable here.",
  "folded +EV": "You were getting the right price to continue; folding here passes up a profitable call.",

  // Postflop commitment / sizing leaks.
  "got it in light": "You committed your stack as an underdog. With no fold equity at an all-in, the chips went in behind — pot control or a fold keeps you out of this spot.",
  // overvalued is filled dynamically (it names the real board threats) — see explainLeak.
  "oversized bet (review)": "This bet is large relative to the pot. A smaller size usually achieves the same goal while risking fewer chips — worth a review.",
  "undersized value bet": "You're ahead of the calling range but bet small — size up to get more value from worse hands.",
  "small bet (review)": "A small bet here is fine as a blocker, a thin stab, or a give-up — betting bigger would only build a pot you may not want. Worth a quick review.",
};

// Coaching note for the good plays the tracker also surfaces, so positive
// feedback reads naturally too rather than echoing the raw label.
const GOOD_EXPLANATIONS = {
  "good call (+EV)": "Your equity beat the price — a profitable call.",
  "good fold": "Correct lay-down: the price didn't justify your equity.",
  "got it in good": "You got the chips in ahead — keep getting it in here.",
};

// Join named threats into a readable clause: ["flush","straight"] -> "a flush or
// a straight"; ["flush"] -> "a flush". Empty -> "".
function describeThreats(beats) {
  const labels = (Array.isArray(beats) ? beats : []).filter(Boolean);
  if (labels.length === 0) {
    return "";
  }
  const withArticle = labels.map((label) => `a ${label}`);
  if (withArticle.length === 1) {
    return withArticle[0];
  }
  if (withArticle.length === 2) {
    return `${withArticle[0]} or ${withArticle[1]}`;
  }
  return `${withArticle.slice(0, -1).join(", ")}, or ${withArticle[withArticle.length - 1]}`;
}

// Build the "overvalued your hand" explanation. When we know which made hands the
// board already enables (e.g. a flush / straight), name them so the lesson is
// concrete rather than "respect the board". Falls back to a generic version when
// the danger is wetness/texture rather than a specific beating category.
function explainOvervalued(beats) {
  const threats = describeThreats(beats);
  if (threats) {
    return `You bet big with a hand that's likely behind here — the board already makes ${threats} possible. Checking to control the pot loses fewer chips when you're beaten.`;
  }
  return "You bet big with a hand that's behind the continuing range on a dangerous board. Checking to control the pot is the higher-EV line.";
}

// Return the plain-English explanation for a leak/good label, or null when there
// is no specific coaching note (caller falls back to the terse reason). `context`
// may carry per-hand detail (e.g. `beats`: named board threats) so some leaks can
// be explained concretely rather than with a fixed sentence.
export function explainLeak(leakType, context = {}) {
  if (!leakType) {
    return null;
  }
  if (leakType === "overvalued your hand") {
    return explainOvervalued(context.beats);
  }
  return LEAK_EXPLANATIONS[leakType] || GOOD_EXPLANATIONS[leakType] || null;
}

export { LEAK_EXPLANATIONS, GOOD_EXPLANATIONS };
