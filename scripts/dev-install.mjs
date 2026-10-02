import * as Effect from "effect/Effect";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { stageRelease } from "../src/onboarding/distribution.ts";

const args = process.argv.slice(2);
const host = args.find(arg => arg.startsWith("--host="))?.slice("--host=".length);
const update = args.includes("--update");
const forwarded = args.filter(arg => /^--(?:claude|codex)-(?:home|executable)=/.test(arg));
if ((host !== "claude" && host !== "codex") || args.some(arg => arg !== `--host=${host}` && arg !== "--update" && !forwarded.includes(arg))) {
  throw new Error("usage: npm run dev-install -- --host=claude|codex [--update] [--claude-home=PATH|--codex-home=PATH] [--claude-executable=PATH|--codex-executable=PATH]");
}
const environment = { ...process.env, HAPSLAND_ACTIVE_DISPATCH: "1" };
delete environment.REVIEW_INSTALL_RUNTIME;
delete environment.REVIEW_INSTALL_ENTRYPOINT;
const run = (command, commandArgs, stdio = "inherit") => {
  const result = spawnSync(command, commandArgs, { stdio, encoding: "utf8", timeout: 300_000, env: environment });
  if (result.error || result.status !== 0) throw new Error(`${command} ${commandArgs[0]} failed: ${result.error?.message ?? result.stderr ?? result.status}`);
  return result.stdout;
};
run("npm", ["run", "build"]);
run("npm", ["run", "verify:release-native"]);
const destination = mkdtempSync(join(tmpdir(), "hapsland-dev-pack-"));
const packed = JSON.parse(run("npm", ["pack", "--ignore-scripts=true", "--json", "--pack-destination", destination], "pipe"));
if (!Array.isArray(packed) || packed.length !== 1 || packed[0].name !== "@hapsland/hapsland") throw new Error("pack did not produce a Hapsland archive");
const candidate = await Effect.runPromise(stageRelease({ kind: "archive", path: resolve(destination, packed[0].filename) }));
const snapshotPath = join(candidate.prefix, "snapshot.json");
const snapshot = JSON.parse(readFileSync(snapshotPath, "utf8"));
writeFileSync(snapshotPath, JSON.stringify({ ...snapshot, commit: run("git", ["rev-parse", "HEAD"], "pipe").trim(), dirty: run("git", ["status", "--porcelain"], "pipe").trim() !== "" }, null, 2) + "\n", { mode: 0o600 });
process.stdout.write(`Local candidate ${candidate.packageVersion}: ${candidate.executable}\nRetained archive: ${candidate.identity.archive ?? destination}\n`);
run(candidate.executable, update ? ["update", host, `--target=${candidate.executable}`, ...forwarded] : ["setup", host, ...forwarded]);
