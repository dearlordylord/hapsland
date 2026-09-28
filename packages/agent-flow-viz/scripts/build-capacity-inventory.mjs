import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { initialCanonical, projectCanonical } from "../../../src/canonical/adapter.ts";

// Distinct sample limits expose every connection to the four admission limits.
const limits = { globalItems: 11, globalBytes: 101, partitionItems: 7, partitionBytes: 71 };
const inventory = projectCanonical(initialCanonical(limits)).inventory;
const limitKeys = Object.keys(limits);
if (inventory.length === 0 || new Set(inventory.map(({ purpose }) => purpose)).size !== inventory.length ||
    inventory.some((entry) => limitKeys.some((key) => entry.limits[key] !== limits[key]))) {
  throw new Error("compiled Bend capacity inventory is incomplete");
}
const source = `// Generated from the checked compiled Bend inventory; run npm run build in this package.\n` +
  `export const CAPACITY_INVENTORY = ${JSON.stringify(inventory.map((entry) => ({
    purpose: entry.purpose, limits: Object.keys(entry.limits),
  })), null, 2)} as const;\n`;
const target = resolve(import.meta.dirname, "../src/capacity-inventory.generated.ts");
if (process.argv.includes("--check")) {
  if (readFileSync(target, "utf8") !== source) throw new Error("capacity inventory is stale");
} else {
  writeFileSync(target, source);
}
