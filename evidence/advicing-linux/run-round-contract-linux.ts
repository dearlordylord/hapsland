// Linux production-resident contract probes. No native agent runtime is launched.
// Hook subprocess inputs are fixture events; Jev uses the controlled Effect model.
import { spawn, execFileSync } from "node:child_process";
import { readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as Effect from "effect/Effect";
import { configuredRules } from "../../src/policy/rules.ts";
import { Consent } from "../../src/runtime/consent.ts";
import { adaptCodexDirectEvent } from "../../src/direct-event/adapter.ts";
import { addEvent, makeGitFixture, put } from "../../src/direct-event/test-fixtures.ts";
import type { DirectObservation, DirectAdvicee } from "../../src/direct-event/model.ts";
import { ResidentServer } from "../../src/resident/server.ts";
import { residentPaths } from "../../src/resident/paths.ts";
import { monotonicNow } from "../../src/resident/hook-clock.ts";
import type { ResidentDispatchContext, ResidentResponse } from "../../src/resident/protocol.ts";
import { readActivity } from "../../src/activity/status.ts";

if (process.platform !== "linux") throw new Error("Linux probe required");
const project = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const cli = join(project, "src/cli.ts");
const output = process.argv[2] ?? join(project, "evidence/advicing-linux/linux-round-contract.json");
const requireThat = (condition: unknown, label: string): void => { if (!condition) throw new Error(label); };
const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
};
const within = async <A>(promise: Promise<A>, milliseconds = 10_000): Promise<A> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try { return await Promise.race([promise, new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("fixture synchronization deadline exceeded")), milliseconds);
  })]); } finally { if (timer !== undefined) clearTimeout(timer); }
};
const pause = (milliseconds: number) => new Promise<void>((done) => setTimeout(done, milliseconds));
type Host = "codex-cli" | "claude-code";
type CaseResult = { host: Host; case: string; passed: boolean; elapsedMs: number; evidence?: unknown; failure?: string };
const results: CaseResult[] = [];
const scratchRoots = new Set<string>();

const findingControl = { answers: Object.fromEntries(configuredRules.map((rule) => [rule.id,
  { _tag: "Probability" as const, probability: rule.id === "r6_bare_domain_value" ? 0.9 : 0 }])) };
const fixture = async (host: Host, controlled: ResidentDispatchContext["controlled"] = findingControl,
  options: ConstructorParameters<typeof ResidentServer>[2] = {}) => {
  const root = await makeGitFixture();
  scratchRoots.add(root);
  const statePath = join(root, ".probe-consent");
  const activityPath = join(root, ".probe-activity");
  const capturePath = join(root, ".probe-call-count");
  await Effect.runPromise(Effect.gen(function* () {
    const consent = yield* Consent.Service;
    const proposal = yield* consent.preview(root, "jev", "https://api.typesafe.ai/v1/systemone");
    yield* consent.enable(proposal);
  }).pipe(Effect.provide(Consent.layer({ statePath }))));
  const paths = residentPaths(join(root, ".probe-resident"));
  const server = new ResidentServer(paths, () => performance.now(), options);
  await server.listen();
  const dispatch: ResidentDispatchContext = { statePath, activityPath, credential: null,
    userConfigPath: null, controlled: { ...controlled, capturePath } };
  let current: DirectAdvicee | undefined;
  let sequence = 0;
  const admit = async (files: Record<string, string>) => {
    for (const [path, source] of Object.entries(files)) await put(root, path, source);
    const base = await Effect.runPromise(adaptCodexDirectEvent(addEvent(root, Object.keys(files), {
      tool_use_id: `fixture-edit-${++sequence}`,
    })));
    if (base === undefined) throw new Error("fixture adaptation failed");
    const advicee: DirectAdvicee = host === "codex-cli" ? base.advicee : {
      host, hostVersion: "2.1.218", sessionId: base.advicee.sessionId,
      turnId: null, toolUseId: base.advicee.toolUseId, subagentId: null,
    };
    const observation: DirectObservation = { ...base, advicee };
    current = advicee;
    const permit = await server.handle({ version: 1, operation: "register-edit", lifetime: server.lifetime,
      root, advicee, startedAt: monotonicNow(), activityPath });
    requireThat(permit.status === "advanced", "prospective permit was rejected");
    const admitted = await server.handle({ version: 1, operation: "admit", lifetime: server.lifetime,
      observation, dispatch, controlledWriter: true, composed: true });
    requireThat(admitted.status === "accepted", "composed admission was rejected");
    return observation;
  };
  const calls = async () => (await readFile(capturePath, "utf8").catch(() => "")).split("\n").filter(Boolean).length;
  const collect = (mode: "ordinary" | "turn-end" = "turn-end") => {
    if (current === undefined) throw new Error("fixture has no advicee");
    return server.handle({ version: 1, operation: "collect", lifetime: server.lifetime,
      root, advicee: current, dispatch, mode, composed: true, reportWorkState: true });
  };
  const stop = async (active = false) => {
    if (current === undefined) throw new Error("fixture has no advicee");
    const event = { hook_event_name: "Stop", session_id: current.sessionId, cwd: root,
      ...(host === "codex-cli" ? { turn_id: "fixture-runtime-turn" } : {}), stop_hook_active: active };
    const env = { ...process.env, REVIEW_STATE_PATH: statePath, REVIEW_ACTIVITY_PATH: activityPath,
      REVIEW_RESIDENT_DIR: paths.directory, REVIEW_CONTROL_JSON: JSON.stringify(dispatch.controlled) };
    for (const key of ["OPENAI_API_KEY", "ANTHROPIC_API_KEY", "TYPESAFE_API_KEY"]) delete env[key];
    const started = performance.now();
    return new Promise<{ blocked: boolean; unavailableNotice: boolean; elapsedMs: number; outputKeys: string[] }>((done, reject) => {
      const child = spawn(process.execPath, [cli, "--controlled-reviewer", "--composed-stop-hook", `--composed-host=${host}`],
        { cwd: project, env, stdio: ["pipe", "pipe", "pipe"] });
      let raw = "";
      const timer = setTimeout(() => { child.kill("SIGKILL"); reject(new Error("Stop subprocess exceeded six seconds")); }, 6_000);
      child.stdout.on("data", (chunk) => { raw += chunk; });
      child.stderr.resume();
      child.once("error", reject);
      child.once("close", (code) => {
        clearTimeout(timer);
        if (code !== 0) return reject(new Error("Stop subprocess failed"));
        let parsed: Record<string, unknown>;
        try { parsed = JSON.parse(raw); } catch { return reject(new Error("Stop output was not JSON")); }
        done({ blocked: parsed.decision === "block", unavailableNotice: typeof parsed.systemMessage === "string" && /unavailable/i.test(parsed.systemMessage),
          elapsedMs: Math.round(performance.now() - started), outputKeys: Object.keys(parsed).sort() });
      });
      child.stdin.end(JSON.stringify(event));
    });
  };
  const activity = () => readActivity({ statePath: activityPath, root, sessionId: current?.sessionId ?? "session",
    resident: { available: true, lifetime: server.lifetime } });
  const cleanup = async () => { await server.close(); await rm(root, { recursive: true, force: true }); scratchRoots.delete(root); };
  return { root, server, admit, calls, collect, stop, activity, cleanup };
};

const runCase = async (host: Host, name: string, body: () => Promise<unknown>) => {
  const started = performance.now();
  console.error(JSON.stringify({ host, case: name, phase: "start" }));
  try { const evidence = await body(); results.push({ host, case: name, passed: true, elapsedMs: Math.round(performance.now() - started), evidence }); }
  catch (cause) { results.push({ host, case: name, passed: false, elapsedMs: Math.round(performance.now() - started),
    failure: cause instanceof Error ? cause.message : "unknown probe failure" }); }
};
const finding = (name = "OrderCount") => `type ${name} = number\n`;
const asAdvice = (response: ResidentResponse) => {
  if (response.status !== "advice") throw new Error("expected advice lease");
  return response;
};

for (const host of ["codex-cli", "claude-code"] as const) {
  await runCase(host, "deadline-cancels-running-review", async () => {
    const entered = deferred();
    const f = await fixture(host, { ...findingControl, delayMs: 8_000 }, { beforeEvaluate: async () => entered.resolve() });
    try {
      await f.admit({ "first.ts": finding("FirstCount"), "second.ts": finding("SecondCount"), "third.ts": finding("ThirdCount") }); await within(entered.promise);
      const stop = await f.stop(); await f.server.whenIdle();
      requireThat(!stop.blocked, "deadline unexpectedly continued");
      const stats = f.server.stats();
      requireThat(stats.queued === 0 && stats.running === 0 && stats.pendingAdvice === 0 && stats.pendingEvaluations === 0 && stats.retainedBytes === 0 &&
        stats.successfulCacheEntries === 0 && stats.currentWork === 0, "deadline retained review resources");
      const closure = f.activity().roundClosures?.at(-1);
      requireThat(closure?.reason === "deadline" && closure.discarded.running > 0 && closure.discarded.queued > 0, "deadline summary missing cancellation");
      return { stop, closure, resourcesEmpty: true };
    } finally { await f.cleanup(); }
  });
  await runCase(host, "backend-unavailable-not-clean", async () => {
    const f = await fixture(host, { failure: "fixture unavailable" });
    try {
      await f.admit({ "type.ts": finding() }); await f.server.whenIdle();
      const stop = await f.stop();
      requireThat(!stop.blocked && stop.unavailableNotice, "backend failure was not explicit");
      requireThat(f.activity().counts.clear === 0, "backend failure was marked clear");
      requireThat(f.activity().roundClosures?.at(-1)?.reason === "unavailable", "backend closure reason was not unavailable");
      return { stop, activity: f.activity().kind, closure: f.activity().roundClosures?.at(-1) };
    } finally { await f.cleanup(); }
  });
  await runCase(host, "stale-finding-discarded", async () => {
    const f = await fixture(host);
    try {
      await f.admit({ "type.ts": finding() }); await f.server.whenIdle();
      requireThat(f.server.pendingAdviceMetadata().length === 1, "stale fixture had no finding to discard");
      await put(f.root, "type.ts", 'type OrderCount = number & { readonly __brand: "OrderCount" }\n');
      const stop = await f.stop();
      requireThat(!stop.blocked && f.server.stats().pendingAdvice === 0, "stale finding escaped revalidation");
      return { stop, staleAdviceDiscarded: true };
    } finally { await f.cleanup(); }
  });
  await runCase(host, "multi-unit-one-stop-batch", async () => {
    const f = await fixture(host);
    try {
      await f.admit({ "first.ts": finding("FirstCount"), "second.ts": finding("SecondCount") }); await f.server.whenIdle();
      requireThat(f.server.pendingAdviceMetadata().length === 2, "multi-unit fixture did not produce two records");
      const selected = asAdvice(await f.collect());
      requireThat(selected.findingCount === 2, "multi-unit collection did not include both findings");
      f.server.releaseDelivery(selected.token);
      const stop = await f.stop();
      requireThat(stop.blocked, "multi-unit findings did not continue");
      const finish = await f.stop(true);
      requireThat(!finish.blocked, "same findings were repeated at second Stop");
      return { stop, finish, findingRecords: 2, closure: f.activity().roundClosures?.at(-1) };
    } finally { await f.cleanup(); }
  });
  for (const acknowledged of [false, true]) await runCase(host, acknowledged ? "submitted-background-reoffered-once" : "lost-background-ack-reoffered-once", async () => {
    const entered = deferred(), release = deferred(); let gateUsed = false;
    const f = await fixture(host, undefined, { beforeRevalidate: async () => {
      if (!gateUsed) { gateUsed = true; entered.resolve(); await release.promise; }
    } });
    try {
      await f.admit({ "type.ts": finding() }); await f.server.whenIdle();
      const callsBefore = await f.calls();
      const backgroundPending = f.collect("ordinary"); await within(entered.promise);
      const competing = await f.collect();
      requireThat(competing.status === "pending", "unreserved background lease was stolen");
      release.resolve();
      const background = asAdvice(await backgroundPending);
      requireThat(f.server.beginComposedSubmission(background.token, "background").status === "submitting", "background authorization failed");
      if (acknowledged) { f.server.acknowledge(background.token); f.server.finalize(background.token); }
      const stop = await f.stop(); requireThat(stop.blocked, "Stop did not reoffer background advice");
      requireThat(f.server.acknowledge(background.token).status !== "acknowledged", "old background token regained ownership");
      const finish = await f.stop(true); requireThat(!finish.blocked, "Stop reoffered same finding twice");
      requireThat(await f.calls() === callsBefore, "reoffer reran Jev evaluation");
      return { competingCollection: competing.status, backgroundAcknowledged: acknowledged, stop, finish,
        evaluationCallsUnchanged: true, closure: f.activity().roundClosures?.at(-1) };
    } finally { release.resolve(); await f.cleanup(); }
  });
  await runCase(host, "repair-findings-four-continuations-and-new-round", async () => {
    const f = await fixture(host);
    try {
      const stops = [];
      for (let index = 0; index < 5; index++) {
        await f.admit({ "type.ts": finding(`Count${index}`) }); await f.server.whenIdle();
        stops.push(await f.stop(index > 0));
      }
      requireThat(stops.slice(0, 4).every((stop) => stop.blocked) && !stops[4]!.blocked, "four-continuation cap was violated");
      const closed = f.activity().roundClosures?.at(-1);
      requireThat(closed?.reason === "limit" && closed.reservedContinuations === 4, "limit closure summary mismatch");
      requireThat(f.server.stats().pendingAdvice === 0, "limit left pending advice");
      await pause(5);
      await f.admit({ "type.ts": finding("NewRoundCount") }); await f.server.whenIdle();
      const nextRound = await f.stop(); requireThat(nextRound.blocked, "new round did not receive a fresh count");
      return { stops, closure: closed, newRound: nextRound, simulatedRepairEdits: 4 };
    } finally { await f.cleanup(); }
  });
}
for (const root of scratchRoots) await rm(root, { recursive: true, force: true });
const report = { schema: "hapsland-105-linux-round-contract-v1", recordedAt: new Date().toISOString(),
  candidateCommit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: project, encoding: "utf8" }).trim(),
  platform: process.platform, architecture: process.arch, node: process.version,
  boundary: "Production resident, Effect controlled DecisionModel, real Stop CLI subprocess and local IPC; fixture runtime events; no native agent or live Jev",
  limitations: ["Does not establish model visibility or actual agent repair", "Repair edits are explicitly driven by this harness", "Lost acknowledgement is injected by omitting protocol acknowledgement", "No cold-start, process restart, or native parallel-tool scheduling proof"],
  passed: results.every((result) => result.passed), results };
await writeFile(output, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
console.log(JSON.stringify({ output, passed: report.passed, cases: results.length, failed: results.filter((result) => !result.passed).map((result) => ({ host: result.host, case: result.case, failure: result.failure })) }));
if (!report.passed) process.exitCode = 1;
