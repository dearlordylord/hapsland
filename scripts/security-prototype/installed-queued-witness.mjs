// Throwaway offline witness: run the queued policy case from a freshly installed package.
import { execFile } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { createHash } from "node:crypto";

const exec = promisify(execFile);
const temporary = await mkdtemp(join(tmpdir(), "hapsland-security-installed-"));
const command = async (bin, args, cwd = process.cwd()) => exec(bin, args, { cwd, timeout: 120_000, maxBuffer: 1024 * 1024 });
const within = (promise, label) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error(`${label} timed out`)), 10_000);
  Promise.resolve(promise).then(
    (value) => { clearTimeout(timer); resolve(value); },
    (error) => { clearTimeout(timer); reject(error); },
  );
});

try {
  await command("npm", ["pack", "--ignore-scripts=true", "--pack-destination", temporary]);
  const archive = join(temporary, "hapsland-hapsland-0.1.0.tgz");
  const archiveHash = createHash("sha256").update(readFileSync(archive)).digest("hex");
  const installation = join(temporary, "installation");
  await command("npm", ["install", "--global=false", "--legacy-peer-deps", "--ignore-scripts=true", "--prefer-offline", "--omit=dev", "--bin-links=true", "--prefix", installation, archive], temporary);
  const packageRoot = join(installation, "node_modules", "@hapsland", "hapsland");
  const installed = async (path) => import(pathToFileURL(join(packageRoot, "dist", path)).href);
  const Effect = await import(pathToFileURL(join(installation, "node_modules", "effect", "dist", "Effect.js")).href);
  const Scope = await import(pathToFileURL(join(installation, "node_modules", "effect", "dist", "Scope.js")).href);
  const Exit = await import(pathToFileURL(join(installation, "node_modules", "effect", "dist", "Exit.js")).href);
  const Deferred = await import(pathToFileURL(join(installation, "node_modules", "effect", "dist", "Deferred.js")).href);
  const Layer = await import(pathToFileURL(join(installation, "node_modules", "effect", "dist", "Layer.js")).href);
  const { ResidentReviewControls, defaultReviewControls } = await installed("resident/review-controls.js");
  const { adaptCodexDirectEvent } = await installed("direct-event/adapter.js");
  const { makeResidentRuntime } = await installed("resident/server.js");
  const { residentPaths } = await installed("resident/paths.js");

  const runCase = async (kind) => {
    const root = join(temporary, `repository-${kind}`);
    await command("git", ["init", "-q", root]);
    await command("git", ["-C", root, "config", "user.email", "test@example.invalid"]);
    await command("git", ["-C", root, "config", "user.name", "Test"]);
    await writeFile(join(root, "type.ts"), "type OrderCount = number // InstalledSecurityMarker\n");
    if (kind === "initially-excluded") await writeFile(join(root, ".review.jsonc"), '{"version":1,"excludes":["type.ts"]}\n');
    const statePath = join(root, "consent");
    const capturePath = join(root, "provider-attempts");
    const event = {
      hook_event_name: "PostToolUse", tool_name: "apply_patch", session_id: "session", turn_id: "turn", tool_use_id: "tool-use", cwd: root,
      tool_input: { command: "*** Begin Patch\n*** Add File: type.ts\n+type OrderCount = number // InstalledSecurityMarker\n*** End Patch" },
      tool_response: {},
    };
    const observation = await Effect.runPromise(adaptCodexDirectEvent(event));
    if (observation === undefined) throw new Error("installed event adapter returned no observation");
    const entered = await Effect.runPromise(Deferred.make());
    const release = await Effect.runPromise(Deferred.make());
    let preparedMarker = false;
    const fixtureScope = await Effect.runPromise(Scope.make());
    const server = await Effect.runPromise(makeResidentRuntime(residentPaths(join(root, "runtime")), undefined, kind === "queued-excluded" ? {
      reviewControls: Layer.succeed(ResidentReviewControls, { ...defaultReviewControls, beforeEvaluate: (prepared) => Effect.gen(function* () {
        preparedMarker = prepared.input.declaration.source.includes("InstalledSecurityMarker");
        yield* Deferred.succeed(entered, undefined);
        yield* Deferred.await(release);
      }) }),
    } : {}).pipe(Effect.provideService(Scope.Scope, fixtureScope)));
    const admitted = await Effect.runPromise(server.admit(observation, { statePath, userConfigPath: null, credential: null, controlled: { capturePath } }));
    if (admitted.status !== "accepted") throw new Error(`installed admission ${kind} was ${admitted.status}`);
    if (kind === "queued-excluded") {
      await within(Effect.runPromise(Deferred.await(entered)), "installed preparation barrier");
      if (!preparedMarker) throw new Error("queued unit was not prepared before update");
      await writeFile(join(root, ".review.jsonc"), '{"version":1,"excludes":["type.ts"]}\n');
      await Effect.runPromise(Deferred.succeed(release, undefined));
    }
    await within(Effect.runPromise(server.whenIdle()), "installed resident idle barrier");
    await Effect.runPromise(Scope.close(fixtureScope, Exit.void));
    return existsSync(capturePath) ? readFileSync(capturePath, "utf8").trim().split("\n").filter(Boolean).length : 0;
  };

  const counts = {
    allowed: await runCase("allowed"),
    initiallyExcluded: await runCase("initially-excluded"),
    queuedExcluded: await runCase("queued-excluded"),
  };
  if (counts.allowed !== 1 || counts.initiallyExcluded !== 0 || counts.queuedExcluded !== 0) {
    throw new Error(`installed queued policy mismatch: ${JSON.stringify(counts)}`);
  }
  console.log(JSON.stringify({ status: "pass", archiveSha256: archiveHash, packageVersion: "0.1.0", node: process.version, platform: process.platform, architecture: process.arch, providerAttempts: counts }));
} finally {
  await rm(temporary, { recursive: true, force: true });
}
