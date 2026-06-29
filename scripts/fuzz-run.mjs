// Entrypoint: register the JSON-import loader, then run the fuzzer. This lets
// the standalone fuzzer load app modules that use Vite-style bare JSON imports.
import { register } from "node:module";
register("./json-loader.mjs", import.meta.url);
await import("./fuzz.mjs");
