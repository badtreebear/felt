// Phase 2 coverage auditor — run via `npm run audit`.
// Reports preflop chart GAPS (missing tables) and ANOMALIES (charts that look
// wrong), plus writes the full list to audit-report.log. See scripts/audit-core.mjs.
import { runAudit } from "./audit-core.mjs";
import { writeFileSync } from "node:fs";

const { total, gaps, anomalies } = runAudit();
const fillable = gaps.filter((g) => g.tier === "fillable");
const known = gaps.filter((g) => g.tier === "known");
const lines = [];
lines.push(`Felt preflop coverage audit — ${new Date().toISOString()}`);
lines.push(`spots checked: ${total}`);
lines.push(`anomalies (charts that look wrong): ${anomalies.length}`);
lines.push(`FILLABLE gaps (normal spots with no chart yet): ${fillable.length}`);
lines.push(`known-unsupported gaps (re-raised / heads-up, deliberately explained): ${known.length}`);
lines.push("");
if (anomalies.length) {
  lines.push("── ANOMALIES ──");
  for (const a of anomalies) lines.push("  ⚠ " + a);
  lines.push("");
}
if (fillable.length) {
  lines.push("── FILLABLE GAPS (worth authoring a chart) ──");
  for (const g of fillable) lines.push("  • " + g.text);
  lines.push("");
}
if (known.length) {
  lines.push("── KNOWN-UNSUPPORTED (deliberate fallback; informational) ──");
  for (const g of known) lines.push("  • " + g.text);
}

const text = lines.join("\n");
console.log(text);
writeFileSync(new URL("../audit-report.log", import.meta.url), text + "\n");
console.log(`\n(full report written to audit-report.log)`);
