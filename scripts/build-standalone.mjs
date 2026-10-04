import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
let bun = process.env.HAPSLAND_BUILD_BUN;
if (!bun) {
  const pathProbe = spawnSync("bun", ["--version"], { encoding: "utf8" });
  if (pathProbe.status === 0 && pathProbe.stdout.trim() === "1.3.14") bun = "bun";
  else {
    const location = spawnSync("mise", ["where", "bun@1.3.14"], { encoding: "utf8", timeout: 10_000 });
    if (location.status === 0 && location.stdout.trim()) bun = resolve(location.stdout.trim(), "bin/bun");
  }
}
if (!bun) throw new Error("Standalone build requires Bun 1.3.14. Run mise install bun@1.3.14, or set HAPSLAND_BUILD_BUN to its executable.");
const probe = spawnSync(bun, ["--version"], { encoding: "utf8" });
if (probe.status !== 0 || probe.stdout.trim() !== "1.3.14") throw new Error("Standalone build requires exact Bun 1.3.14 (HAPSLAND_BUILD_BUN may select its executable)");
const entries = [["hapsland", "src/cli.ts"], ["hapsland-doctor", "src/package-doctor.ts"], ["hapsland-parser", "src/parser-main.ts"], ["hapsland-resident", "src/resident/main.ts"]];
const profiles = process.env.HAPSLAND_BUILD_PROFILE ? [process.env.HAPSLAND_BUILD_PROFILE] : ["linux-arm64", "darwin-arm64"];
if (profiles.some(profile => !["linux-arm64", "darwin-arm64"].includes(profile))) throw new Error("Unsupported standalone build profile");
for (const profile of profiles) {
  const target = `bun-${profile}`;
  const output = resolve(root, "dist/bin", profile); mkdirSync(output, { recursive: true });
  for (const [name, entry] of entries) {
    const result = spawnSync(bun, [resolve(root, "scripts/compile-standalone.mjs"), resolve(root, entry), target, resolve(output, name)], { cwd: root, stdio: "inherit", env: process.env });
    if (result.status !== 0 || !existsSync(resolve(output, name))) throw new Error(`Standalone ${profile}/${name} build failed`);
  }
}
