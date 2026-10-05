import { spawnSync } from "node:child_process";
import { createNativePreflight, validateNativeFixture, cleanupNativePreflight } from "../../packages/monkey-business-bend/conformance/native-preflight.mjs";

// Finite standalone game consumer, geometry, drawing and raster assertions.
// Window/input-device integration remains a separate interactive gate.
const roots = [
  "DefenseConsumerTests.bend",
  "DefenseProcessTests.bend",
  "DefenseMotionTests.bend",
  "DefensePresentationTests.bend",
  "DefenseTowerTests.bend",
  "DefenseStartupTests.bend",
  "DefenseDisplayTests.bend",
  "DefenseInspectionTests.bend",
  "DefenseCueTests.bend",
  "DefenseCommandScopeTests.bend",
  "DefensePreviewTests.bend",
  "DefenseMapTests.bend",
  "DefenseDrawTests.bend",
  "DefenseRasterTests.bend",
];
const requested = process.argv.slice(2);
if (requested.some(root => !roots.includes(root)) || new Set(requested).size !== requested.length)
  throw new Error("Select distinct known native fixture names");
const selected = requested.length ? requested : roots;
for (const root of selected) {
  const fixture = new URL(`./${root}`, import.meta.url);
  const preflight = createNativePreflight({ fixtures: [fixture] });
  try {
    const { binaryPath } = validateNativeFixture({ ...preflight, fixture });
    const result = spawnSync(binaryPath, [], { encoding: "utf8", timeout: 5000 });
    if (result.error || result.status !== 0) {
      throw new Error(`Standalone game ${root} failed (${result.error?.code ?? result.status}): ${result.stdout}${result.stderr}`, { cause: result.error });
    }
    process.stdout.write(result.stdout);
  } finally {
    cleanupNativePreflight(preflight);
  }
}
console.log(`Standalone game native suite: all ${selected.length} selected roots passed`);
