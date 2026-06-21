export function formatAmount(value, stateOrConfig, { signed = false } = {}) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return "--";
  }

  const ui = stateOrConfig?.ui || {};
  const config = stateOrConfig?.config || stateOrConfig || {};
  const sign = signed && number > 0 ? "+" : number < 0 ? "-" : "";
  const magnitude = Math.abs(number);

  if (ui.displayUnit === "bb") {
    return `${sign}${formatNumber(magnitude)} BB`;
  }

  const bbValue = Number(config.bbDollarValue) || 2;
  return `${sign}$${formatNumber(magnitude * bbValue)}`;
}

export function formatNumber(value) {
  const rounded = Math.round(Number(value) * 100) / 100;
  return rounded.toFixed(2).replace(/\.00$/, "").replace(/(\.\d)0$/, "$1");
}
