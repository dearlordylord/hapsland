import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { NATIVE_C_EMISSION_TIMEOUT_MS, validateNativeFixture } from "./native-preflight.mjs";
import { usesNativePreflight } from "./native-preflight-fixtures.mjs";

// C emission uses the user-authorized 12s bound; JS emission and execution stay
// at 5s. External C compilation retains its separately authorized 15s bound.
export function runWorkloadNative(fixture) {
  const manifestPath = process.env.HAPSLAND_NATIVE_PREFLIGHT_MANIFEST;
  const sessionId = process.env.HAPSLAND_NATIVE_PREFLIGHT_SESSION;
  const manifestHash = process.env.HAPSLAND_NATIVE_PREFLIGHT_MANIFEST_SHA256;
  if (usesNativePreflight(fixture) && (manifestPath || sessionId || manifestHash)) {
    if (!manifestPath || !sessionId || !manifestHash) {
      throw new Error("Incomplete native preflight session");
    }
    const { binaryPath } = validateNativeFixture({ manifestPath, sessionId, manifestHash, fixture });
    return JSON.parse(checked(binaryPath, [], 5000));
  }
  const directory = mkdtempSync(join(tmpdir(), "hapsland-workload-native-"));
  try {
    const source = join(directory, "scenario.c");
    const binary = join(directory, "scenario");
    checked("bend", [fileURLToPath(fixture), "-o", source], NATIVE_C_EMISSION_TIMEOUT_MS);
    checked("clang", ["-O0", "-Wno-unused-value", source, "-o", binary, "-lm", "-pthread"], 15000);
    return JSON.parse(checked(binary, [], 5000));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

// Fresh emitted-JS execution is an independent diagnostic/validation axis. It
// never reuses a native result or substitutes for the native gate above.
export function runWorkloadEmitted(fixture) {
  const directory = mkdtempSync(join(tmpdir(), "hapsland-workload-js-"));
  try {
    const source = join(directory, "scenario.mjs");
    checked("bend", [fileURLToPath(fixture), "-o", source], 5000);
    const program = join(directory, "execute.mjs");
    writeFileSync(program, `import Fixture from ${JSON.stringify(pathToFileURL(source).href)};
const value = Fixture.json();
if (typeof value !== "string") throw new TypeError("compiler JSON String ABI changed");
process.stdout.write(value);
`);
    return JSON.parse(checked(process.execPath, [program], 5000));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function checked(command, arguments_, timeout) {
  const result = spawnSync(command, arguments_, { encoding: "utf8", timeout, maxBuffer: 16 * 1024 * 1024,
    env: { ...process.env, BEND_NO_TELEMETRY: "1" } });
  if (result.error || result.status !== 0) {
    throw new Error(`${command} failed (${result.error?.code ?? result.status}): ${result.stderr}`, {
      cause: result.error,
    });
  }
  return result.stdout;
}
