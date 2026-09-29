import { copyFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const destination = resolve(root, "dist/resident");
mkdirSync(destination, { recursive: true });
copyFileSync(resolve(root, "src/resident/bend-policy.generated.js"),
  resolve(destination, "bend-policy.generated.js"));
mkdirSync(resolve(root, "dist/canonical"), { recursive: true });
copyFileSync(resolve(root, "src/canonical/canonical.generated.js"),
  resolve(root, "dist/canonical/canonical.generated.js"));
