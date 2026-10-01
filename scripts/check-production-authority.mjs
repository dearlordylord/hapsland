import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

// #137 gate: keep this standalone while direct policy imports are forbidden.
const root = resolve(import.meta.dirname, "..");
const read = (path) => readFileSync(resolve(root, path), "utf8");
const required = [
  "src/resident/capacity.ts",
  "src/resident/collection.ts",
  "src/rules/decision.ts",
  "src/configuration/decision.ts",
  "packages/agent-flow-viz/src/canonical-replay.ts",
];
for (const path of required) {
  assert.match(read(path), /from ["'][^"']*canonical\/adapter(?:\.ts)?["']/, `${path} must use the checked shared adapter`);
}
assert.doesNotMatch(read("src/resident/bend-work.ts"), /#state|bendWork[A-Z]/,
  "composed work must be a read-only canonical view");
assert.doesNotMatch(read("src/resident/composed-delivery.ts"), /BendRound|\.policy|policy:\s*Bend/,
  "composed rounds must not advance independent policy state");
const obsoleteImports = [];
const scan = (directory) => {
  for (const entry of readdirSync(resolve(root, directory), { withFileTypes: true })) {
    const path = `${directory}/${entry.name}`;
    if (entry.isDirectory()) { scan(path); continue; }
    if (!/\.(?:ts|mjs)$/.test(entry.name) || /(?:\.test\.ts|\.generated\.(?:js|d\.ts))$/.test(entry.name)) continue;
    const source = read(path);
    assert.doesNotMatch(source, /\bclass\s+(?:CapacityLedger|EvaluationReuse|ComposedDelivery)\b/,
      `${path} restores a superseded resident state class owner`);
    if (/from ["'][^"']*(?:flow\.generated|lifecycle\.generated|bend-policy\.generated)\.js["']/.test(source)) obsoleteImports.push(path);
    if (path !== "src/canonical/adapter.ts" && /from ["'][^"']*canonical\.generated\.js["']/.test(source)) obsoleteImports.push(path);
  }
};
scan("src");
scan("packages/agent-flow-viz/src");
assert.deepEqual(obsoleteImports, [], "production or visualization still consumes an obsolete direct policy path");
console.log(`checked ${required.length} shared-adapter imports and zero direct policy consumers`);
