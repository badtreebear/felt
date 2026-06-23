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

// How often a bluff must win immediately (villain folds) for the bet to break
// even: risk / (risk + reward) = bet / (bet + pot). A pot-sized bet needs a 50%
// fold; a half-pot bet, ~33%. River/one-street read — fold equity only, no
// implied future streets. Returns 0 for a non-positive bet.
export function breakevenFoldFraction({ pot, bet }) {
  const cleanPot = cleanAmount(pot);
  const cleanBet = cleanAmount(bet);

  if (cleanBet <= 0) {
    return 0;
  }

  return cleanBet / (cleanBet + cleanPot);
}

// Polarized-river balance: the value:bluff mix that leaves a bluff-catcher
// indifferent against a bet of `bet` into `pot`. bluffFraction = bet/(pot+2*bet)
// (pot bet -> 1/3 bluffs; half pot -> 1/4); ratio is value:bluff = (pot+bet)/bet
// (pot bet -> 2:1; half pot -> 3:1). Returns null for a non-positive bet.
export function valueBluffRatio({ pot, bet }) {
  const cleanPot = cleanAmount(pot);
  const cleanBet = cleanAmount(bet);

  if (cleanBet <= 0) {
    return null;
  }

  return {
    bluffFraction: cleanBet / (cleanPot + 2 * cleanBet),
    ratio: (cleanPot + cleanBet) / cleanBet,
  };
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
