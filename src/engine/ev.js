import { finalPotAfterCall, requiredEquity } from "./potodds.js";

export function evCall({ equity, pot, toCall }) {
  const cleanEquity = cleanRate(equity);
  const cleanCall = cleanAmount(toCall);

  if (cleanCall <= 0) {
    return 0;
  }

  return cleanEquity * finalPotAfterCall(pot, cleanCall) - cleanCall;
}

export function evFold() {
  return 0;
}

export function callVerdict({ equity, pot, toCall }) {
  const cleanCall = cleanAmount(toCall);

  if (cleanCall <= 0) {
    return "no bet faced";
  }

  return cleanRate(equity) >= requiredEquity(pot, cleanCall) ? "call" : "fold";
}

// A5: chip-EV of an open-shove vs the alternative of folding, all in big blinds.
// Pure formula (equity + call frequency are supplied, like evCall): the caller
// runs the equity sim against the modelled calling range and counts its width.
//
// Hero shoves an effective stack of `effStackBb`. The villain calls with
// frequency `callFreq` and folds otherwise:
//   - villain folds   -> hero wins the villain's big blind: end stack S + bb
//   - villain calls    -> both all-in for S, pot 2S, hero keeps equity E: 2S*E
//   - hero folds instead -> loses the posted small blind: end stack S - sb
// Returns end-stack EVs (bb) plus the shove-minus-fold delta used to grade.
export function evShove({ effStackBb, sb = 0.5, bb = 1, callFreq, equityIfCalled }) {
  const stack = cleanAmount(effStackBb);
  const smallBlind = cleanAmount(sb);
  const bigBlind = cleanAmount(bb);
  const f = cleanRate(callFreq);
  const equity = cleanRate(equityIfCalled);

  const evShoveBb = (1 - f) * (stack + bigBlind) + f * (equity * 2 * stack);
  const evFoldBb = stack - smallBlind;

  return {
    evShoveBb,
    evFoldBb,
    deltaBb: evShoveBb - evFoldBb,
  };
}

// Convenience: "shove" when shoving is at least as good as folding.
export function shoveVerdict(args) {
  return evShove(args).deltaBb >= 0 ? "shove" : "fold";
}

function cleanRate(value) {
  const rate = Number(value);

  if (!Number.isFinite(rate)) {
    return 0;
  }

  return Math.min(1, Math.max(0, rate));
}

function cleanAmount(value) {
  const amount = Number(value);

  if (!Number.isFinite(amount) || amount < 0) {
    return 0;
  }

  return amount;
}
