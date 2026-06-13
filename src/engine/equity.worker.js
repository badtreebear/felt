import { runEquitySimulation } from "./equity.js";

self.onmessage = (event) => {
  const { id, input } = event.data;

  try {
    const result = runEquitySimulation({
      ...input,
      onProgress: (progress) => {
        self.postMessage({ id, type: "progress", result: progress });
      },
    });

    self.postMessage({ id, type: "done", result });
  } catch (error) {
    self.postMessage({
      id,
      type: "error",
      error: error instanceof Error ? error.message : String(error),
    });
  }
};
