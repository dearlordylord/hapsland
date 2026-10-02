import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

// Keep proof/emission and native execution bounded at 5s. External C compilation
// has the separately authorized 15s bound after the #179 loaded-lane timeout.
export function runWorkloadNative(fixture) {
  const directory = mkdtempSync(join(tmpdir(), "hapsland-workload-native-"));
  try {
    const source = join(directory, "scenario.c");
    const binary = join(directory, "scenario");
    checked("bend", [fileURLToPath(fixture), "-o", source], 5000);
    checked("clang", ["-O0", "-Wno-unused-value", source, "-o", binary, "-lm", "-pthread"], 15000);
    return JSON.parse(checked(binary, [], 5000));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function checked(command, arguments_, timeout) {
  const result = spawnSync(command, arguments_, { encoding: "utf8", timeout });
  if (result.error || result.status !== 0) {
    throw new Error(`${command} failed (${result.error?.code ?? result.status}): ${result.stderr}`, {
      cause: result.error,
    });
  }
  return result.stdout;
}
