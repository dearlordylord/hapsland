import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { retainOutput, runWorkloadNative } from "./workload-native-runner.mjs";
import {
  assertNativeFixtureIdentity,
  captureNativeFixtureIdentity,
  NATIVE_C_EMISSION_TIMEOUT_MS,
  NATIVE_CLANG_TIMEOUT_MS,
} from "./native-preflight.mjs";
import { nativeRunFixtures } from "./native-run-fixtures.mjs";

const NATIVE_RUN_C_EMISSION_TIMEOUT_MS = 90000;
const NATIVE_RUN_CLANG_TIMEOUT_MS = 120000;
const NATIVE_RUN_EXECUTION_TIMEOUT_MS = 15000;
const NATIVE_RUN_JS_EMISSION_TIMEOUT_MS = 30000;
const NATIVE_RUN_JS_EXECUTION_TIMEOUT_MS = 5000;
const aggregateFixture = nativeRunFixtures[0];
if (nativeRunFixtures.length !== 1 || aggregateFixture === undefined)
  throw new Error("Native Run conformance requires exactly one aggregate fixture");

export function runNativeScenarios() {
  const manifestPath = process.env.HAPSLAND_NATIVE_PREFLIGHT_MANIFEST;
  const sessionId = process.env.HAPSLAND_NATIVE_PREFLIGHT_SESSION;
  const manifestHash = process.env.HAPSLAND_NATIVE_PREFLIGHT_MANIFEST_SHA256;
  const hasPreflight = Boolean(manifestPath || sessionId || manifestHash);
  return runWorkloadNative(aggregateFixture, {
    emissionTimeoutMs: hasPreflight ? NATIVE_C_EMISSION_TIMEOUT_MS : NATIVE_RUN_C_EMISSION_TIMEOUT_MS,
    clangTimeoutMs: hasPreflight ? NATIVE_CLANG_TIMEOUT_MS : NATIVE_RUN_CLANG_TIMEOUT_MS,
    executionTimeoutMs: NATIVE_RUN_EXECUTION_TIMEOUT_MS,
  });
}

// Test-only emission of original-input fixtures. Preserve the compiler's Nat
// representation and reduce only the resulting data lists at the host boundary.
export async function runEmittedScenarios() {
  const identity = captureNativeFixtureIdentity(aggregateFixture);
  const directory = mkdtempSync(join(tmpdir(), "hapsland-native-run-js-"));
  try {
    const output = join(directory, "fixture.mjs");
    const result = spawnSync("bend", [fileURLToPath(aggregateFixture), "-o", output], {
      encoding: "utf8", timeout: NATIVE_RUN_JS_EMISSION_TIMEOUT_MS,
    });
    if (result.error || result.status !== 0)
      throw result.error ?? new Error(result.stdout + result.stderr);
    const source = readFileSync(output, "utf8");
    const offset = source.lastIndexOf("export default {");
    if (offset < 0 || !source.includes("function $trace$("))
      throw new Error("Bend fixture JavaScript layout changed");
    writeFileSync(output, source.slice(0, offset) +
      `${data.toString()}\nconsole.log(JSON.stringify(data(run_loop($trace$()))));\n`);
    const execution = spawnSync(process.execPath, [output], { encoding: "utf8", timeout: NATIVE_RUN_JS_EXECUTION_TIMEOUT_MS });
    if (execution.error || execution.status !== 0)
      throw execution.error ?? new Error(execution.stdout + execution.stderr);
    assertNativeFixtureIdentity(identity, aggregateFixture);
    retainOutput(execution.stdout, identity, "emitted-js", {
      emission: NATIVE_RUN_JS_EMISSION_TIMEOUT_MS,
      execution: NATIVE_RUN_JS_EXECUTION_TIMEOUT_MS,
    });
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
