export function formatAmount(value, stateOrConfig, { signed = false } = {}) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return "--";
  }

  const ui = stateOrConfig?.ui || {};
  const config = stateOrConfig?.config || stateOrConfig || {};
  const sign = signed && number > 0 ? "+" : number < 0 ? "-" : "";
  const magnitude = Math.abs(number);

  // Tournament mode works in chips (blinds rise, stacks are chip counts), not the
  // bb-denominated amounts the $/BB conversion assumes — show the raw chip count.
  if (stateOrConfig?.tournament?.enabled) {
    return `${sign}${formatChips(magnitude)}`;
  }

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

// Chip counts: whole-number with thousands separators (e.g. 15,000), keeping a
// fractional part only when present (engine amounts snap to 0.5).
export function formatChips(value) {
  const rounded = Math.round(Number(value) * 10) / 10;
  return rounded.toLocaleString("en-US", { maximumFractionDigits: 1 });
}
