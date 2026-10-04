import { join } from "node:path";

/** Node preserves existing process variables, including explicitly empty values. */
export function loadDevEnvFile(root) {
  try { process.loadEnvFile(join(root, ".env")); }
  catch (error) {
    if (error.code !== "ENOENT") throw new Error("Cannot read development .env file", { cause: error });
  }
}
