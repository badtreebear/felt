export function finalPotAfterCall(pot, toCall) {
  const cleanPot = cleanAmount(pot);
  const cleanCall = cleanAmount(toCall);

  return cleanPot + cleanCall + cleanCall;
}

export function requiredEquity(pot, toCall) {
  const cleanCall = cleanAmount(toCall);
  const finalPot = finalPotAfterCall(pot, cleanCall);

  if (cleanCall <= 0 || finalPot <= 0) {
    return 0;
  }

  return cleanCall / finalPot;
}

export function potOdds({ pot, toCall }) {
  const cleanPot = cleanAmount(pot);
  const cleanCall = cleanAmount(toCall);
  const finalPot = finalPotAfterCall(cleanPot, cleanCall);

  return {
    pot: cleanPot,
    toCall: cleanCall,
    finalPot,
    requiredEquity: requiredEquity(cleanPot, cleanCall),
    reward: cleanPot + cleanCall,
    risk: cleanCall,
  };
}

function cleanAmount(value) {
  const amount = Number(value);

  if (!Number.isFinite(amount) || amount < 0) {
    return 0;
  }

  return amount;
}
