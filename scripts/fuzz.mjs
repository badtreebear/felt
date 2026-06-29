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
import { appendFileSync, existsSync, rmSync } from "node:fs";

const LOG = new URL("../fuzz-report.log", import.meta.url);

const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const m = a.match(/^--([^=]+)(?:=(.*))?$/);
  return m ? [m[1], m[2] ?? true] : [a, true];
}));

const quiet = Boolean(args.quiet);
const handLimit = args.hands ? Number(args.hands) : Infinity;
const minutesLimit = args.minutes ? Number(args.minutes) : Infinity;
const STOP_FILE = new URL("../STOP-FUZZ", import.meta.url);

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

let sigintCount = 0;
process.on("SIGINT", () => {
  sigintCount += 1;
  if (sigintCount >= 2) {
    // Second Ctrl-C: don't wait for the loop to yield — hard stop now.
    console.log("\n(forced stop)");
    summary();
    process.exit(issues > 0 ? 1 : 0);
  }
  // First Ctrl-C: ask the loop to stop at its next yield point.
  stopping = true;
  console.log("\nstopping… (Ctrl-C again to force)");
});

console.log([
  "Felt fuzzer running.",
  "  Stop it any of these ways:",
  "    • Ctrl-C            (works when run via:  node scripts/fuzz-run.mjs)",
  "    • npm run fuzz:stop (drops a STOP-FUZZ file — works for ANY launch)",
  "    • --minutes=N       (self-stops after N minutes)",
  "    • --hands=N         (self-stops after N hands)",
  "",
].join("\n"));
appendFileSync(LOG, `\n=== fuzz run @ ${new Date().toISOString()} ===\n`);

let seed = (Date.now() % 1_000_000) >>> 0;
const HEARTBEAT_EVERY = 25_000;

const STOP_CHECK_EVERY = 5_000; // how often to poll the time budget / stop-file
const YIELD_EVERY = 2_000;      // yield to the event loop so Ctrl-C/timers can run

const yieldToEventLoop = () => new Promise((r) => setImmediate(r));

async function run() {
  while (!stopping && hands < handLimit) {
    const hits = playHand(seed);
    if (hits.length) {
      issues += hits.length;
      for (const h of hits) logIssue(seed, h);
    }
    hands++;
    seed = (seed + 1) >>> 0;

    if (hands % STOP_CHECK_EVERY === 0) {
      if ((Date.now() - start) / 60000 >= minutesLimit) {
        console.log(`\nreached --minutes=${minutesLimit} budget; stopping.`);
        break;
      }
      if (existsSync(STOP_FILE)) {
        console.log(`\nSTOP-FUZZ file found; stopping.`);
        try { rmSync(STOP_FILE); } catch { /* leave it if we can't remove */ }
        break;
      }
    }

    if (hands % HEARTBEAT_EVERY === 0) {
      const mins = ((Date.now() - start) / 60000).toFixed(1);
      process.stdout.write(`▶ ${hands.toLocaleString()} hands · ${issues} issues · ${mins} min\n`);
    }

    // Pause briefly so queued handlers (SIGINT from Ctrl-C, the --minutes timer)
    // get a chance to run. Without this the tight loop blocks them entirely —
    // which is exactly why Ctrl-C appeared to do nothing.
    if (hands % YIELD_EVERY === 0) {
      await yieldToEventLoop();
    }
  }

  summary();
  process.exit(issues > 0 ? 1 : 0);
}

run();
