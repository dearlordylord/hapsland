import { fileURLToPath } from "node:url";
import base from "../../vitest.config.ts";

export default { ...base, test: { ...base.test,
  include: ["src/resident/server.test.ts"], maxWorkers: 1,
  setupFiles: [fileURLToPath(new URL("./server-diagnostics-setup.mjs", import.meta.url))],
} };
