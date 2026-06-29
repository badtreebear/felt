// Entrypoint: register the JSON-import loader, then run the audit.
import { register } from "node:module";
register("./json-loader.mjs", import.meta.url);
await import("./audit.mjs");
