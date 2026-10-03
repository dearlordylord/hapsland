import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { runWorkloadNative } from "./workload-native-runner.mjs";
import { validateNativeFixture } from "./native-preflight.mjs";
export function runNative(fixture) {
  const manifestPath = process.env.HAPSLAND_NATIVE_PREFLIGHT_MANIFEST;
  const sessionId = process.env.HAPSLAND_NATIVE_PREFLIGHT_SESSION;
  const manifestHash = process.env.HAPSLAND_NATIVE_PREFLIGHT_MANIFEST_SHA256;
  if (!manifestPath && !sessionId && !manifestHash) return runWorkloadNative(fixture);
  if (!manifestPath || !sessionId || !manifestHash) throw new Error("Incomplete native preflight session");
  const { binaryPath } = validateNativeFixture({ manifestPath, sessionId, manifestHash, fixture });
  const result = spawnSync(binaryPath, [], { encoding: "utf8", timeout: 5000 });
  if (result.error || result.status !== 0) throw result.error ?? new Error(result.stdout + result.stderr);
  return JSON.parse(result.stdout);
}

// Test-only emission of original-input fixtures. Preserve the compiler's Nat
// representation and reduce only the resulting data lists at the host boundary.
export async function runEmitted(fixture, entrypoint = "trace") {
  const directory = mkdtempSync(join(tmpdir(), "hapsland-native-run-js-"));
  try {
    const output = join(directory, "fixture.mjs");
    const result = spawnSync("bend", [fileURLToPath(fixture), "-o", output], {
      encoding: "utf8", timeout: 5000,
    });
    if (result.error || result.status !== 0)
      throw result.error ?? new Error(result.stdout + result.stderr);
    const source = readFileSync(output, "utf8");
    const offset = source.lastIndexOf("export default {");
    if (offset < 0 || !source.includes(`function $${entrypoint}$(`))
      throw new Error("Bend fixture JavaScript layout changed");
    writeFileSync(output, source.slice(0, offset) +
      `${data.toString()}\nconsole.log(JSON.stringify(data(run_loop($${entrypoint}$()))));\n`);
    const execution = spawnSync(process.execPath, [output], { encoding: "utf8", timeout: 5000 });
    if (execution.error || execution.status !== 0)
      throw execution.error ?? new Error(execution.stdout + execution.stderr);
    return JSON.parse(execution.stdout);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function data(value) {
  if (typeof value === "bigint") return Number(value);
  if (value && typeof value === "object" && (value.$ === "Con" || value.$ === "Nil")) {
    const values = [];
    for (let cursor = value; cursor.$ === "Con"; cursor = cursor.tail)
      values.push(data(cursor.head));
    return values;
  }
  return value;
}
