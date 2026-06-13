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
