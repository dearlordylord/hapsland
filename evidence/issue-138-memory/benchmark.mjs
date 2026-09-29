#!/usr/bin/env node
// Offline, bounded benchmark. Run from the repository root with:
// node --experimental-strip-types evidence/issue-138-memory/benchmark.mjs
import { execFile } from "node:child_process";
import { mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { cpus, freemem, platform, arch, totalmem, tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { getHeapStatistics } from "node:v8";
import * as Effect from "effect/Effect";
import { adaptCodexDirectEvent } from "../../src/direct-event/adapter.ts";
import { captureStable } from "../../src/direct-event/capture.ts";
import { prepareObservation } from "../../src/direct-event/pipeline.ts";
import { DEFAULT_BACKEND, DEFAULT_DESTINATION } from "../../src/runtime/review-config.ts";
import { compileRulePackV2 } from "../../src/rules/compiler.ts";
import { V2_TYPE_CONTRACT } from "../../src/rules/v2-targets.ts";
import { ResidentServer } from "../../src/resident/server.ts";
import { residentPaths } from "../../src/resident/paths.ts";
import { Consent } from "../../src/runtime/consent.ts";

const execFileAsync = promisify(execFile);
const ITEMS = 8;
const SOURCE_BYTES = 256 * 1024;
const output = new URL("./aggregate.json", import.meta.url);
const timeoutMs = 10_000;

const withDeadline = async (promise, label) => {
  let timer;
  try {
    return await Promise.race([promise, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} timed out`)), timeoutMs);
    })]);
  } finally {
    clearTimeout(timer);
  }
};

const gate = (expected) => {
  let entered = 0;
  let arrive;
  let release;
  const arrived = new Promise((resolve) => { arrive = resolve; });
  const held = new Promise((resolve) => { release = resolve; });
  return {
    enter: async () => { entered += 1; if (entered === expected) arrive(); await held; },
    arrived,
    release: () => release(),
    get entered() { return entered; },
  };
};

const sampler = () => {
  const baseline = process.memoryUsage();
  const peak = { rssBytes: baseline.rss, heapUsedBytes: baseline.heapUsed, heapTotalBytes: baseline.heapTotal,
    externalBytes: baseline.external, arrayBuffersBytes: baseline.arrayBuffers };
  const take = () => {
    const current = process.memoryUsage();
    peak.rssBytes = Math.max(peak.rssBytes, current.rss);
    peak.heapUsedBytes = Math.max(peak.heapUsedBytes, current.heapUsed);
    peak.heapTotalBytes = Math.max(peak.heapTotalBytes, current.heapTotal);
    peak.externalBytes = Math.max(peak.externalBytes, current.external);
    peak.arrayBuffersBytes = Math.max(peak.arrayBuffersBytes, current.arrayBuffers);
  };
  const interval = setInterval(take, 2);
  interval.unref();
  return { baseline, peak, take, stop: () => { clearInterval(interval); take(); } };
};

const makeSource = (index) => {
  const declaration = `\nexport interface Bench${index} { value: string }\n`;
  const prefix = `/* bench-${index}\n`;
  const suffix = "*/";
  const source = prefix + "x".repeat(SOURCE_BYTES - Buffer.byteLength(prefix + suffix + declaration)) + suffix + declaration;
  if (Buffer.byteLength(source, "utf8") !== SOURCE_BYTES) throw new Error("source byte ceiling mismatch");
  return source;
};

const event = (root, index) => ({
  hook_event_name: "PostToolUse",
  tool_name: "apply_patch",
  session_id: `memory-session-${index}`,
  turn_id: `memory-turn-${index}`,
  tool_use_id: `memory-tool-${index}`,
  cwd: root,
  tool_input: { command: `*** Begin Patch\n*** Add File: bench-${index}.ts\n+export interface Bench${index} { value: string }\n*** End Patch` },
  tool_response: {},
});

const makeWorkspace = async () => {
  const root = await mkdtemp(join(tmpdir(), "haps-memory-"));
  await execFileAsync("git", ["init", "-q", root]);
  await execFileAsync("git", ["-C", root, "config", "user.email", "bench@example.invalid"]);
  await execFileAsync("git", ["-C", root, "config", "user.name", "Benchmark"]);
  for (let index = 0; index < ITEMS; index += 1) {
    await writeFile(join(root, `bench-${index}.ts`), makeSource(index));
  }
  await writeFile(join(root, "primer.md"), "offline cohort primer\n");
  const canonicalRoot = await realpath(root);
  const observations = await Promise.all(Array.from({ length: ITEMS }, async (_, index) => {
    const observation = await Effect.runPromise(adaptCodexDirectEvent(event(canonicalRoot, index)));
    if (observation === undefined) throw new Error("fixture event was not attributable");
    return observation;
  }));
  const primer = await Effect.runPromise(adaptCodexDirectEvent({
    ...event(canonicalRoot, 0), session_id: "memory-primer", turn_id: "memory-primer", tool_use_id: "memory-primer",
    tool_input: { command: "*** Begin Patch\n*** Add File: primer.md\n+offline cohort primer\n*** End Patch" },
  }));
  if (primer === undefined) throw new Error("primer event was not attributable");
  return { root: canonicalRoot, observations, primer };
};

const enableConsent = (root, statePath) => Effect.runPromise(Effect.gen(function* () {
  const consent = yield* Consent.Service;
  const proposal = yield* consent.preview(root, "jev", "https://api.typesafe.ai/v1/systemone");
  yield* consent.enable(proposal);
}).pipe(Effect.provide(Consent.layer({ statePath }))));

const residentV1 = async ({ root, observations, primer }) => {
  const statePath = join(root, "consent");
  await enableConsent(root, statePath);
  const dispatch = { statePath, userConfigPath: null, credential: null, controlled: { answers: {} } };
  const held = gate(ITEMS);
  const sample = sampler();
  let providerCalls = 0;
  const server = new ResidentServer(residentPaths(join(root, "runtime")), () => performance.now(), {
    captureSource: (workingRoot, selected, hooks, rootIdentity) => Effect.gen(function* () {
      const captured = yield* captureStable(workingRoot, selected, hooks, rootIdentity);
      if (captured !== undefined && selected.relativePath.endsWith(".ts")) {
        if (captured.byteLength !== SOURCE_BYTES) throw new Error("resident captured source size mismatch");
        yield* Effect.promise(() => held.enter());
      }
      return captured;
    }),
    controlledRequestEffect: async () => { providerCalls += 1; },
  });
  let atGate;
  let after;
  try {
    const primerAdmission = server.admit(primer, dispatch);
    if (primerAdmission.status !== "accepted") throw new Error("resident primer admission refused");
    const admission = observations.map((observation) => server.admit(observation, dispatch));
    if (admission.some((result) => result.status !== "accepted")) throw new Error("resident admission refused");
    try {
      await withDeadline(held.arrived, "resident overlap gate");
    } catch {
      throw new Error(`resident overlap gate unavailable: entered=${held.entered} running=${server.stats().running} queued=${server.stats().queued} rejected=${server.stats().rejectedCapacity}`);
    }
    sample.take();
    atGate = server.stats();
    if (atGate.running !== ITEMS || held.entered !== ITEMS) throw new Error("resident did not overlap eight captures");
    held.release();
    await withDeadline(server.whenIdle(), "resident completion");
    sample.take();
    after = server.stats();
    if (providerCalls !== 0) throw new Error("default v1 unexpectedly issued a provider request");
    return { contract: "installed-resident-v1", primerAdmissions: 1, admittedPayloads: admission.length, captureGateEntered: held.entered,
      runningAtGate: atGate.running, queuedAtGate: atGate.queued,
      ledgerBytesAtGate: atGate.retainedBytes,
      peakLedgerBytes: server.accountingMetrics().peakLedgerBytes,
      rejectedCapacity: after.rejectedCapacity, retainedBytesAfterIdle: after.retainedBytes,
      pendingAdviceAfterIdle: after.pendingAdvice, providerCalls,
      memory: { baseline: sample.baseline, peak: sample.peak } };
  } finally {
    held.release();
    await server.close();
    sample.stop();
  }
};

const v2Rules = compileRulePackV2({ schemaVersion: 2, id: "memory-benchmark", contentVersion: "1", rules: [{
  id: "shape", question: "Is this type clear?", criteria: { false: "No", true: "Yes" },
  message: "Clarify type", reviewTargets: [{ artifactKind: "typeShape", inputContract: V2_TYPE_CONTRACT,
    capabilities: ["root-declaration", "resolved-outbound-types"] }],
}] }, "memory-benchmark-v2");

const candidateV2 = async ({ observations }) => {
  const held = gate(ITEMS);
  const sample = sampler();
  try {
    const running = observations.map((observation) => Effect.runPromise(prepareObservation(observation, {
      controlledWriter: true, advicee: observation.advicee,
      settings: { backend: DEFAULT_BACKEND, destination: DEFAULT_DESTINATION },
      rules: v2Rules, inputContract: V2_TYPE_CONTRACT,
      beforeAnalyze: (_path, bytes) => Effect.promise(async () => {
        if (bytes !== SOURCE_BYTES) throw new Error("candidate captured source size mismatch");
        await held.enter();
        return true;
      }),
    })));
    await withDeadline(held.arrived, "candidate overlap gate");
    sample.take();
    held.release();
    const prepared = await withDeadline(Promise.all(running), "candidate completion");
    sample.take();
    const readyUnits = prepared.reduce((count, result) => count + result.outcomes.filter((outcome) => outcome.status === "ready").length, 0);
    if (readyUnits !== ITEMS) throw new Error("candidate did not prepare eight complete units");
    return { contract: V2_TYPE_CONTRACT, enteredPreparationGate: held.entered,
      preparedObservations: prepared.length, readyUnits,
      residentLedger: "not present in standalone prepareObservation",
      memory: { baseline: sample.baseline, peak: sample.peak } };
  } finally {
    held.release();
    sample.stop();
  }
};

const workspace = await makeWorkspace();
try {
  const resident = await residentV1(workspace);
  const candidate = await candidateV2(workspace);
  const result = {
    schemaVersion: 1,
    authority: "offline implementation measurement; not product acceptance or release support",
    sourceCommit: "55bddc26410b5bc54bea333dd94dffff4bb3a9c6",
    benchmark: { items: ITEMS, sourceBytesPerItem: SOURCE_BYTES, totalSourceBytes: ITEMS * SOURCE_BYTES,
      sampleIntervalMs: 2, noLiveJev: true, credentialUsed: false,
      sourceOutputRetained: false },
    method: {
      command: "node --experimental-strip-types evidence/issue-138-memory/benchmark.mjs",
      resident: "one small inapplicable Markdown primer starts a dispatch cycle; eight 256 KiB TypeScript captures form the next concurrent cohort and are held after stable capture",
      candidate: "eight independent 256 KiB type-shape/v2 observations pause at beforeAnalyze, then complete preparation; this standalone path has no resident ledger",
      interpretation: "single-process, one-run, 2 ms sampled process memory peaks; baseline includes loaded modules and fixture files; physical RSS is not the logical resident charge; no production egress or release support claim",
    },
    host: { platform: platform(), arch: arch(), node: process.version, cpuCount: cpus().length,
      totalMemoryBytes: totalmem(), freeMemoryBytesAtEnd: freemem(),
      v8HeapLimitBytes: getHeapStatistics().heap_size_limit },
    resident,
    candidate,
  };
  await writeFile(output, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  process.stdout.write(`${JSON.stringify({ residentRunningAtGate: resident.runningAtGate,
    residentPeakLedgerBytes: resident.peakLedgerBytes, candidateReadyUnits: candidate.readyUnits })}\n`);
} finally {
  await rm(workspace.root, { recursive: true, force: true });
}
