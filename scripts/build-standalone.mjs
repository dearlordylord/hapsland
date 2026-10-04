import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const bun = process.env.HAPSLAND_BUILD_BUN ?? "bun";
const probe = spawnSync(bun, ["--version"], { encoding: "utf8" });
if (probe.status !== 0 || probe.stdout.trim() !== "1.3.14") throw new Error("Standalone build requires exact Bun 1.3.14 (HAPSLAND_BUILD_BUN may select its executable)");
const entries = [["hapsland", "src/cli.ts"], ["hapsland-doctor", "src/package-doctor.ts"], ["hapsland-parser", "src/parser-main.ts"], ["hapsland-resident", "src/resident/main.ts"]];
for (const profile of ["linux-arm64", "darwin-arm64"]) {
  const target = `bun-${profile}`;
  const output = resolve(root, "dist/bin", profile); mkdirSync(output, { recursive: true });
  for (const [name, entry] of entries) {
    const result = spawnSync(bun, [resolve(root, "scripts/compile-standalone.mjs"), resolve(root, entry), target, resolve(output, name)], { cwd: root, stdio: "inherit", env: process.env });
    if (result.status !== 0 || !existsSync(resolve(output, name))) throw new Error(`Standalone ${profile}/${name} build failed`);
  }
}
