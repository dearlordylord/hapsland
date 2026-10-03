import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
export { runWorkloadNative as runFreshnessNative } from "./workload-native-runner.mjs";

// Existing checked budgets are unchanged. This is compiler output adaptation
// for test-only literal data, never event scheduling or a freshness decision.
export function runFreshnessEmitted(fixture) {
  const directory = mkdtempSync(join(tmpdir(), "hapsland-freshness-js-"));
  try {
    const output = join(directory, "fixture.mjs");
    checked("bend", [fileURLToPath(fixture), "-o", output]);
    const source = readFileSync(output, "utf8");
    const offset = source.lastIndexOf("export default {");
    if (offset < 0 || !source.includes("function $trace$(")) throw new Error("Bend fixture JavaScript layout changed");
    writeFileSync(output, source.slice(0, offset) + `${rows.toString()}\nconsole.log(JSON.stringify(rows(run_loop($trace$()))));\n`);
    return JSON.parse(checked(process.execPath, [output]));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}
function checked(command, args) {
  const result = spawnSync(command, args, { encoding: "utf8", timeout: 5000 });
  if (result.error || result.status !== 0) throw result.error ?? new Error(result.stdout + result.stderr);
  return result.stdout;
}
function rows(value) {
  if (typeof value === "bigint") {
    if (value < 0n || value >= 2n ** 48n) throw new TypeError("invalid fixture Nat");
    return Number(value);
  }
  if (value && typeof value === "object" && (value.$ === "Con" || value.$ === "Nil")) {
    const result = [];
    let cursor = value;
    for (let count = 0; count < 2048 && cursor.$ === "Con"; count++, cursor = cursor.tail) result.push(rows(cursor.head));
    if (cursor.$ !== "Nil") throw new TypeError("invalid bounded fixture list");
    return result;
  }
  return value;
}
