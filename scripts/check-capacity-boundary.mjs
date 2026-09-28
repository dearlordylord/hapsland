import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const resident = resolve(root, "src/resident");
assert.equal(existsSync(resolve(resident, "bend-ledger.generated.js")), false,
  "retired direct ledger artifact returned");
for (const name of readdirSync(resident)) {
  if (!name.endsWith(".ts") || name.endsWith(".test.ts")) continue;
  const source = readFileSync(resolve(resident, name), "utf8");
  assert.doesNotMatch(source, /bend-ledger\.generated|bendLedger(?:Initial|Reserve|Resize|Release|Clear|Total|PartitionUsage)/,
    `${name} bypasses the canonical capacity boundary`);
}
const adapter = readFileSync(resolve(resident, "capacity.ts"), "utf8");
assert.match(adapter, /from "\.\.\/canonical\/adapter\.ts"/,
  "resident capacity must use the shared checked canonical adapter");
