import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { pathToFileURL } from "node:url";
import {
  NATIVE_C_EMISSION_TIMEOUT_MS,
  NATIVE_CLANG_TIMEOUT_MS,
  assertNativeFixtureIdentity,
  captureNativeFixtureIdentity,
  validateNativeFixture,
} from "./native-preflight.mjs";
import { usesNativePreflight } from "./native-preflight-fixtures.mjs";

// Keep complete offline vectors inside the existing harness run for later
// comparison diagnosis. These receipts are evidence, never a compilation cache.
function retainOutput(output, identity, lane, timeouts) {
  const failureFile = process.env.HAPSLAND_TEST_FAILURES_FILE;
  if (!failureFile) return;
  const outputs = join(dirname(failureFile), "workload-outputs");
  mkdirSync(outputs, { recursive: true });
  const directory = mkdtempSync(join(outputs, `${lane}-${process.pid}-`));
  const bytes = Buffer.from(output, "utf8");
  const outputPath = join(directory, "output.json.gz");
  writeFileSync(outputPath, gzipSync(bytes));
  const receiptPath = join(directory, "receipt.json");
  writeFileSync(receiptPath, `${JSON.stringify({ lane, identity, timeouts, outputPath,
    outputBytes: bytes.length, outputSha256: createHash("sha256").update(bytes).digest("hex"),
    purpose: "Offline execution output for diagnosis; no automatic reuse or acceptance verdict",
  }, null, 2)}\n`);
  console.log(`Retained offline workload output: ${receiptPath}`);
}

// One fresh native+JS comparison has at most 85s of default phase allowances plus cleanup.
export const WORKLOAD_CONFORMANCE_TIMEOUT_MS = 100000;

// User-authorized compile allowances: C/clang 30s and emitted JS 15s.
// Explicit fixture overrides allow C emission45s and clang60s; execution stays5s.
const MAX_NATIVE_CLANG_TIMEOUT_MS = 60000;
const MAX_NATIVE_C_EMISSION_TIMEOUT_MS = 45000;
export function runWorkloadNative(fixture, { emissionTimeoutMs = NATIVE_C_EMISSION_TIMEOUT_MS, clangTimeoutMs = NATIVE_CLANG_TIMEOUT_MS } = {}) {
  if (!Number.isSafeInteger(clangTimeoutMs) || clangTimeoutMs <= 0 || clangTimeoutMs > MAX_NATIVE_CLANG_TIMEOUT_MS)
    throw new RangeError("invalid native clang timeout");
  if (!Number.isSafeInteger(emissionTimeoutMs) || emissionTimeoutMs <= 0 || emissionTimeoutMs > MAX_NATIVE_C_EMISSION_TIMEOUT_MS)
    throw new RangeError("invalid native C emission timeout");
  const manifestPath = process.env.HAPSLAND_NATIVE_PREFLIGHT_MANIFEST;
  const sessionId = process.env.HAPSLAND_NATIVE_PREFLIGHT_SESSION;
  const manifestHash = process.env.HAPSLAND_NATIVE_PREFLIGHT_MANIFEST_SHA256;
  if (usesNativePreflight(fixture) && (manifestPath || sessionId || manifestHash)) {
    if (!manifestPath || !sessionId || !manifestHash) {
      throw new Error("Incomplete native preflight session");
    }
    if (clangTimeoutMs !== NATIVE_CLANG_TIMEOUT_MS)
      throw new RangeError("native preflight session fixes the clang timeout");
    if (emissionTimeoutMs !== NATIVE_C_EMISSION_TIMEOUT_MS)
      throw new RangeError("native preflight session fixes the C emission timeout");
    const { binaryPath } = validateNativeFixture({ manifestPath, sessionId, manifestHash, fixture });
    const output = checked(binaryPath, [], 5000, "native execution");
    retainOutput(output, { fixture: fixture.href, validatedPreflight: { manifestPath, manifestHash, sessionId } }, "preflight-native", { execution: 5000 });
    return JSON.parse(output);
  }
  const identity = captureNativeFixtureIdentity(fixture);
  const directory = mkdtempSync(join(tmpdir(), "hapsland-workload-native-"));
  try {
    const source = join(directory, "scenario.c");
    const binary = join(directory, "scenario");
    checked(identity.inputs.tools.bend.path, [identity.root, "-o", source], emissionTimeoutMs, "C emission");
    checked(identity.inputs.tools.clang.path, ["-O0", "-Wno-unused-value", source, "-o", binary, "-lm", "-pthread"], clangTimeoutMs, "clang compilation");
    assertNativeFixtureIdentity(identity, fixture);
    const output = checked(binary, [], 5000, "native execution");
    assertNativeFixtureIdentity(identity, fixture);
    retainOutput(output, identity, "fresh-native", { emission: emissionTimeoutMs, clang: clangTimeoutMs, execution: 5000 });
    return JSON.parse(output);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

// Fresh emitted-JS execution is an independent diagnostic/validation axis. It
// never reuses a native result or substitutes for the native gate above, and
// it uses the same pinned Bend/source identity before running the output.
export function runWorkloadEmitted(fixture, { emissionTimeoutMs = 15000 } = {}) {
  if (!Number.isSafeInteger(emissionTimeoutMs) || emissionTimeoutMs <= 0) throw new RangeError("invalid JS emission timeout");
  const identity = captureNativeFixtureIdentity(fixture);
  const directory = mkdtempSync(join(tmpdir(), "hapsland-workload-js-"));
  try {
    const source = join(directory, "scenario.mjs");
    checked(identity.inputs.tools.bend.path, [identity.root, "-o", source], emissionTimeoutMs, "JS emission");
    assertNativeFixtureIdentity(identity, fixture);
    const program = join(directory, "execute.mjs");
    writeFileSync(program, `import Fixture from ${JSON.stringify(pathToFileURL(source).href)};
const value = Fixture.json();
if (typeof value !== "string") throw new TypeError("compiler JSON String ABI changed");
process.stdout.write(value);
`);
    const output = checked(process.execPath, [program], 5000, "JS execution");
    assertNativeFixtureIdentity(identity, fixture);
    retainOutput(output, identity, "emitted-js", { emission: emissionTimeoutMs, execution: 5000 });
    return JSON.parse(output);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function checked(command, arguments_, timeout, phase) {
  const result = spawnSync(command, arguments_, { encoding: "utf8", timeout, maxBuffer: 16 * 1024 * 1024,
    env: { ...process.env, BEND_NO_TELEMETRY: "1" } });
  if (result.error || result.status !== 0) {
    throw new Error(`${phase} (declared timeout ${timeout}ms): ${command} failed (${result.error?.code ?? result.status}): ${result.stderr}`, {
      cause: result.error,
    });
  }
  return result.stdout;
}
