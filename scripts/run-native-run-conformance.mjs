import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { createNativePreflight, cleanupNativePreflight } from "../packages/monkey-business-bend/conformance/native-preflight.mjs";
import { nativeRunFixtures as nativePreflightFixtures } from "../packages/monkey-business-bend/conformance/native-run-fixtures.mjs";

const require = createRequire(import.meta.url);
let preflight;
let child;
let interrupted;
const forward = (signal) => {
  interrupted = signal;
  if (child) child.kill(signal);
};
const onInterrupt = () => forward("SIGINT");
const onTerminate = () => forward("SIGTERM");
process.on("SIGINT", onInterrupt);
process.on("SIGTERM", onTerminate);
try {
  preflight = await createNativePreflight({ fixtures: nativePreflightFixtures });
  if (interrupted) {
    process.exitCode = interrupted === "SIGINT" ? 130 : 143;
  } else {
  child = spawn(process.execPath, [join(dirname(require.resolve("vitest/package.json")), "vitest.mjs"), "run", "packages/monkey-business/src/native-run-conformance.test.ts", "--maxWorkers=1", ...process.argv.slice(2)], {
    stdio: "inherit",
    env: {
      ...process.env,
      HAPSLAND_NATIVE_PREFLIGHT_MANIFEST: preflight.manifestPath,
      HAPSLAND_NATIVE_PREFLIGHT_SESSION: preflight.sessionId,
      HAPSLAND_NATIVE_PREFLIGHT_MANIFEST_SHA256: preflight.manifestHash,
    },
  });
  if (interrupted) child.kill(interrupted);
  const result = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => resolve({ code, signal }));
  });
  process.exitCode = result.code ?? (result.signal === "SIGINT" ? 130 : 143);
  }
} finally {
  process.off("SIGINT", onInterrupt);
  process.off("SIGTERM", onTerminate);
  if (preflight) cleanupNativePreflight(preflight);
}
