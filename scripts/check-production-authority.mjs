import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

// #137 gate: keep this standalone until the legacy resident consumers are retired.
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
const legacyImports = [];
for (const directory of ["src/resident", "packages/agent-flow-viz/src"]) {
  for (const name of readdirSync(resolve(root, directory))) {
    if (!/\.(?:ts|mjs)$/.test(name) || /(?:\.test\.ts|\.generated\.(?:js|d\.ts))$/.test(name)) continue;
    const path = `${directory}/${name}`;
    const source = read(path);
    if (/from ["'][^"']*(?:flow\.generated|lifecycle\.generated|bend-policy\.generated)\.js["']/.test(source)) legacyImports.push(path);
    if (path !== "src/canonical/adapter.ts" && /from ["'][^"']*canonical\.generated\.js["']/.test(source)) legacyImports.push(path);
  }
}
assert.deepEqual(legacyImports, [], "production or visualization still consumes an obsolete direct policy path");
console.log(`checked ${required.length} shared-adapter imports and zero direct policy consumers`);
