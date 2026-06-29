// Felt grading fuzzer — standalone "run until stopped" driver.
//
// Hammers the live-grading scoring layer with random valid inputs across cash
// AND tournament blind sizes, asserting invariants. Every issue prints in full
// AND appends to fuzz-report.log, reproducible via its seed:
//     npm run fuzz -- --seed=<n>
//
// Flags:
//   --seed=<n>   replay one seed and exit (reproduce a hit)
//   --hands=<n>  stop after N hands instead of running forever
//   --quiet      heartbeat only on screen (issues still logged to file)
//
// Note: run via the npm script (`npm run fuzz`), which loads the same module
// resolver the app uses so JSON imports resolve. See package.json.

import { playHand } from "./fuzz-core.mjs";
import { appendFileSync } from "node:fs";

const LOG = new URL("../fuzz-report.log", import.meta.url);

const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const m = a.match(/^--([^=]+)(?:=(.*))?$/);
  return m ? [m[1], m[2] ?? true] : [a, true];
}));

const quiet = Boolean(args.quiet);
const handLimit = args.hands ? Number(args.hands) : Infinity;

function logIssue(seed, issue) {
  const line = `[seed ${seed}] ${issue}`;
  appendFileSync(LOG, line + "\n");
  if (!quiet) console.log("  ⚠ " + line);
}

// Single-seed replay mode.
if (args.seed !== undefined) {
  const seed = Number(args.seed);
  const issues = playHand(seed);
  if (issues.length === 0) {
    console.log(`seed ${seed}: no issues.`);
  } else {
    console.log(`seed ${seed}: ${issues.length} issue(s):`);
    for (const i of issues) console.log("  ⚠ " + i);
  }
  process.exit(issues.length ? 1 : 0);
}

let hands = 0;
let issues = 0;
const start = Date.now();
let stopping = false;

function summary() {
  const mins = ((Date.now() - start) / 60000).toFixed(1);
  console.log(`\n── fuzz summary ──`);
  console.log(`hands played: ${hands.toLocaleString()}`);
  console.log(`issues found: ${issues}`);
  console.log(`elapsed:      ${mins} min`);
  if (issues > 0) console.log(`details:      fuzz-report.log (replay: npm run fuzz -- --seed=<n>)`);
}

process.on("SIGINT", () => { stopping = true; summary(); process.exit(issues > 0 ? 1 : 0); });

console.log("Felt fuzzer running — Ctrl-C to stop.\n");
appendFileSync(LOG, `\n=== fuzz run @ ${new Date().toISOString()} ===\n`);

let seed = (Date.now() % 1_000_000) >>> 0;
const HEARTBEAT_EVERY = 25_000;

while (!stopping && hands < handLimit) {
  const hits = playHand(seed);
  if (hits.length) {
    issues += hits.length;
    for (const h of hits) logIssue(seed, h);
  }
  hands++;
  seed = (seed + 1) >>> 0;
  if (hands % HEARTBEAT_EVERY === 0) {
    const mins = ((Date.now() - start) / 60000).toFixed(1);
    process.stdout.write(`▶ ${hands.toLocaleString()} hands · ${issues} issues · ${mins} min\n`);
  }
}

summary();
process.exit(issues > 0 ? 1 : 0);
