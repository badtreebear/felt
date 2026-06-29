import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export async function load(url, context, nextLoad) {
  if (url.endsWith(".json")) {
    const json = readFileSync(fileURLToPath(url), "utf8");
    return { format: "module", shortCircuit: true, source: `export default ${json};` };
  }
  return nextLoad(url, context);
}
