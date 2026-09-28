import { monotonicNow } from "./hook-clock.ts";
import { describe, expect, it } from "vitest";
import * as Effect from "effect/Effect";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { join } from "node:path";
import { adaptCodexDirectEvent } from "../direct-event/adapter.ts";
import { addEvent, makeGitFixture, put, advicee } from "../direct-event/test-fixtures.ts";
import { configuredRules } from "../policy/rules.ts";
import { Consent } from "../runtime/consent.ts";
import { loadReviewSettings } from "../runtime/review-config.ts";
import { prepareObservation } from "../direct-event/pipeline.ts";
import { analyzerMaterializationPreflight } from "../direct-event/analyzer.ts";
import { readActivity } from "../activity/status.ts";
import { claudeHostOutputText } from "../direct-event/claude-output.ts";
import { residentPaths } from "./paths.ts";
import { residentRequest } from "./client.ts";
import {
  DELIVERY_LEASE_MS,
  decodeResidentRequest,
  type ResidentDispatchContext,
} from "./protocol.ts";
import { ResidentServer, residentUnitReservationBytes } from "./server.ts";
import {
  ADVICE_COLLECTION_WINDOW_MS,
  MAX_COMBINED_RESPONSE_BYTES,
  PENDING_ADVICE_EXPIRY_MS,
  encodedHostOutputBytes,
} from "./collection.ts";

const enable = (root: string, statePath: string) => Effect.runPromise(Effect.gen(function* () {
  const consent = yield* Consent.Service;
  const proposal = yield* consent.preview(root, "jev", "https://api.typesafe.ai/v1/systemone");
  yield* consent.enable(proposal);
}).pipe(Effect.provide(Consent.layer({ statePath }))));

const deferred = <A = void>() => {
  let resolve!: (value: A | PromiseLike<A>) => void;
  const promise = new Promise<A>((done) => { resolve = done; });
  return { promise, resolve };
};

const findingDispatch = (statePath: string): ResidentDispatchContext => ({
  statePath,
  userConfigPath: null,
  credential: null,
  controlled: {
    answers: Object.fromEntries(configuredRules.map((rule) => [
      rule.id,
      { _tag: "Probability", probability: rule.id === "r6_bare_domain_value" ? 0.9 : 0 },
    ])),
  },
});

const allFindingsDispatch = (statePath: string): ResidentDispatchContext => ({
  statePath,
  userConfigPath: null,
  credential: null,
  controlled: {
    answers: Object.fromEntries(configuredRules.map((rule) => [
      rule.id,
      { _tag: "Probability", probability: 0.9 },
    ])),
  },
});

const singleFindingDispatch = findingDispatch;

// Darwin's PATH_MAX requires shorter real paths. Linux keeps the original
// >2 KiB path so its response-envelope assertion still crosses that boundary.
const longNestedPath = process.platform === "darwin"
  ? `${Array.from({ length: 8 }, (_, index) => `segment-${index}-${"x".repeat(88)}`).join("/")}/types.ts`
  : `${Array.from({ length: 14 }, (_, index) => `segment-${index}-${"x".repeat(180)}`).join("/")}/types.ts`;

const mutuallyReferencingTypes = () => Array.from({ length: 17 }, (_, index) => {
  const typeName = (target: number) => `Type${target}${process.platform === "darwin" ? "n".repeat(100) : ""}`;
  const fields = Array.from({ length: 17 }, (_unused, target) => target === index
    ? undefined
    : `p${target}: ${typeName(target)}`).filter((value) => value !== undefined).join("; ");
  return `interface ${typeName(index)} { ${fields} }`;
}).join("\n");

const waitUntilIdle = async (server: ResidentServer): Promise<void> => {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const stats = server.stats();
    if (stats.queued === 0 && stats.running === 0 && stats.pendingEvaluations === 0) return;
    await new Promise<void>((resolveImmediate) => setImmediate(resolveImmediate));
  }
  throw new Error("resident did not become idle");
};

describe("canonical resident capacity", () => {
  it("fans one observation into two charged review outcomes under a fake clock", async () => {
    const root = await makeGitFixture();
    await put(root, "first.ts", "type FirstCount = number\n");
    await put(root, "second.ts", "type SecondCount = number\n");
    const statePath = join(root, "consent");
    await enable(root, statePath);
    const observation = await Effect.runPromise(adaptCodexDirectEvent(addEvent(root,
      ["first.ts", "second.ts"])));
    if (observation === undefined) throw new Error("missing fixture observation");
    let clock = 100;
    const server = new ResidentServer(residentPaths(join(root, "runtime")), () => clock);
    try {
      expect(server.admit(observation, allFindingsDispatch(statePath)).status).toBe("accepted");
      clock = 101;
      await server.whenIdle();
      expect(server.pendingAdviceMetadata().map((item) => item.path).sort())
        .toEqual(["first.ts", "second.ts"]);
      expect(server.stats().retainedBytes).toBeGreaterThan(0);
      expect(server.stats().rejectedCapacity).toBe(0);
    } finally {
      await server.close();
    }
    expect(server.stats().retainedBytes).toBe(0);
  });

  it("keeps two advicees in one shared capacity ledger through preparation and cleanup", async () => {
    const root = await makeGitFixture();
    await put(root, "agent-a.ts", "type AgentACount = number\n");
    await put(root, "agent-b.ts", "type AgentBCount = number\n");
    const statePath = join(root, "consent");
    await enable(root, statePath);
    const a = await Effect.runPromise(adaptCodexDirectEvent(addEvent(root, ["agent-a.ts"],
      { session_id: "agent-a", tool_use_id: "edit-a" })));
    const b = await Effect.runPromise(adaptCodexDirectEvent(addEvent(root, ["agent-b.ts"],
      { session_id: "agent-b", tool_use_id: "edit-b" })));
    if (a === undefined || b === undefined) throw new Error("missing fixture observation");
    let clock = 100;
    const server = new ResidentServer(residentPaths(join(root, "runtime")), () => clock);
    const dispatch = allFindingsDispatch(statePath);
    try {
      expect(server.admit(a, dispatch).status).toBe("accepted");
      expect(server.admit(b, dispatch).status).toBe("accepted");
      expect(server.stats().retainedBytes).toBeGreaterThan(0);
      clock = 101;
      await server.whenIdle();
      const metadata = server.pendingAdviceMetadata();
      expect(metadata).toHaveLength(2);
      expect(new Set(metadata.map((item) => item.partition)).size).toBe(2);
      expect(new Set(metadata.map((item) => item.path))).toEqual(new Set(["agent-a.ts", "agent-b.ts"]));
      expect(server.stats().rejectedCapacity).toBe(0);
    } finally {
      await server.close();
    }
    expect(server.stats().retainedBytes).toBe(0);
  });
});

describe("resident delivery lease", () => {
  it("cancels a queued and running review fanout using Bend work identities", async () => {
    const root = await makeGitFixture();
    const paths = Array.from({ length: 5 }, (_, index) => `item-${index}.ts`);
    for (const [index, path] of paths.entries()) await put(root, path, `type Item${index}Count = number\n`);
    const statePath = join(root, "consent");
    const activityPath = join(root, "activity");
    await enable(root, statePath);
    const observation = await Effect.runPromise(adaptCodexDirectEvent(addEvent(root, paths)));
    if (observation === undefined) throw new Error("missing fixture observation");
    const started = deferred();
    const gate = deferred();
    const server = new ResidentServer(residentPaths(join(root, "runtime")), () => performance.now(), {
      beforeEvaluate: async () => { started.resolve(); await gate.promise; },
    });
    const dispatch = { ...findingDispatch(statePath), activityPath };
    try {
      expect(server.admit(observation, dispatch, false, true).status).toBe("accepted");
      await started.promise;
      expect((await server.handle({ version: 1, operation: "begin-stop", lifetime: server.lifetime,
        root, advicee: observation.advicee, token: "fanout" })).status).toBe("advanced");
      const decision = await server.handle({ version: 1, operation: "collect", lifetime: server.lifetime,
        root, advicee: observation.advicee, dispatch, mode: "turn-end", composed: true,
        finish: { token: "fanout", deadlineReached: true } });
      expect(decision.status).toBe("empty");
      const activity = readActivity({ statePath: activityPath, root,
        sessionId: observation.advicee.sessionId, resident: { available: true, lifetime: server.lifetime } });
      expect(activity.roundClosures?.[0]?.reason).toBe("deadline");
      expect(activity.roundClosures?.[0]?.discarded?.queued).toBeGreaterThan(0);
      expect(activity.roundClosures?.[0]?.discarded?.running).toBeGreaterThan(0);
    } finally {
      gate.resolve();
      await server.close();
    }
  });

  it("holds the finish decision for all admitted work, then batches the findings", async () => {
    const root = await makeGitFixture();
    await put(root, "type.ts", "type OrderCount = number\n");
    await put(root, "second.ts", "type InvoiceCount = number\n");
    const statePath = join(root, "consent");
    await enable(root, statePath);
    const observation = await Effect.runPromise(adaptCodexDirectEvent(addEvent(root)));
    if (observation === undefined) throw new Error("missing fixture observation");
    const started = deferred();
    const gate = deferred();
    const server = new ResidentServer(residentPaths(join(root, "runtime")), () => performance.now(), {
      beforeEvaluate: async () => { started.resolve(); await gate.promise; },
    });
    const dispatch = findingDispatch(statePath);
    try {
      server.admit(observation, dispatch, false, true);
      await started.promise;
      await server.handle({ version: 1, operation: "begin-stop", lifetime: server.lifetime,
        root, advicee: observation.advicee, token: "finish" });
      const request = { version: 1 as const, operation: "collect" as const, lifetime: server.lifetime,
        root, advicee: observation.advicee, dispatch, mode: "turn-end" as const, composed: true as const,
        reportWorkState: true as const, finish: { token: "finish", deadlineReached: false } };
      expect((await server.handle(request)).status).toBe("pending");
      gate.resolve();
      await server.whenIdle();
      // A second admitted observation must keep already completed advice waiting.
      const next = { ...observation, advicee: { ...observation.advicee, toolUseId: "second" },
        candidates: [{ ...observation.candidates[0]!, path: "second.ts" }] };
      server.admit(next, dispatch, false, true);
      expect((await server.handle(request)).status).toBe("pending");
      await server.whenIdle();
      const decision = await server.handle(request);
      expect(decision.status).toBe("advice");
      if (decision.status === "advice") expect(decision.findingCount).toBe(2);
    } finally {
      gate.resolve();
      await server.close();
    }
  });

  it("cancels unfinished pre-decision work on block while preserving advice and fresh repair work", async () => {
    const root = await makeGitFixture();
    await put(root, "type.ts", "type OrderCount = number\n");
    await put(root, "second.ts", "type InvoiceCount = number\n");
    const statePath = join(root, "consent");
    await enable(root, statePath);
    const observation = await Effect.runPromise(adaptCodexDirectEvent(addEvent(root)));
    if (observation === undefined) throw new Error("missing fixture observation");
    const gate = deferred();
    const started = deferred();
    let hold = false;
    const server = new ResidentServer(residentPaths(join(root, "runtime")), () => performance.now(), {
      beforeEvaluate: async () => { if (hold) { started.resolve(); await gate.promise; } },
    });
    const dispatch = findingDispatch(statePath);
    try {
      server.admit(observation, dispatch, false, true);
      await server.whenIdle();
      hold = true;
      const next = { ...observation, advicee: { ...observation.advicee, toolUseId: "second" },
        candidates: [{ ...observation.candidates[0]!, path: "second.ts" }] };
      server.admit(next, dispatch, false, true);
      await started.promise;
      await server.handle({ version: 1, operation: "begin-stop", lifetime: server.lifetime,
        root, advicee: observation.advicee, token: "finish" });
      const decision = await server.handle({ version: 1, operation: "collect", lifetime: server.lifetime,
        root, advicee: observation.advicee, dispatch, mode: "turn-end", composed: true,
        finish: { token: "finish", deadlineReached: true } });
      expect(decision.status).toBe("advice");
      if (decision.status !== "advice") throw new Error("missing decision");
      expect(decision.findingCount).toBe(1);
      expect(server.stats().pendingEvaluations).toBe(0);
      expect(server.beginComposedSubmission(decision.token, "stop").status).toBe("submitting");
      server.acknowledge(decision.token); server.finalize(decision.token);
      await server.handle({ version: 1, operation: "finish-stop", lifetime: server.lifetime,
        root, advicee: observation.advicee, token: "finish", close: false });
      gate.resolve(); hold = false;
      await server.whenIdle();
      expect(server.stats().pendingFindingBatches).toBe(1);
      expect(server.admit({ ...next, advicee: { ...next.advicee, toolUseId: "repair" } }, dispatch, false, true).status).toBe("accepted");
      await server.whenIdle();
      expect(server.stats().pendingFindingBatches).toBe(2);
    } finally {
      gate.resolve();
      await server.close();
    }
  });

  it("waits for a live background write, then reoffers once without replaying output authorization", async () => {
    const root = await makeGitFixture();
    await put(root, "type.ts", "type OrderCount = number\n");
    const statePath = join(root, "consent");
    await enable(root, statePath);
    const observation = await Effect.runPromise(adaptCodexDirectEvent(addEvent(root)));
    if (observation === undefined) throw new Error("missing fixture observation");
    const server = new ResidentServer(residentPaths(join(root, "runtime")));
    const dispatch = findingDispatch(statePath);
    try {
      server.admit(observation, dispatch, false, true);
      await server.whenIdle();
      const background = await server.handle({ version: 1, operation: "collect", lifetime: server.lifetime,
        root, advicee: observation.advicee, dispatch, mode: "ordinary", composed: true });
      if (background.status !== "advice") throw new Error("missing background finding");
      expect(server.beginComposedSubmission(background.token, "background").status).toBe("submitting");
      expect(server.beginComposedSubmission(background.token, "background").status).toBe("empty");
      await server.handle({ version: 1, operation: "begin-stop", lifetime: server.lifetime,
        root, advicee: observation.advicee, token: "finish" });
      const request = { version: 1 as const, operation: "collect" as const, lifetime: server.lifetime,
        root, advicee: observation.advicee, dispatch, mode: "turn-end" as const, composed: true as const,
        finish: { token: "finish", deadlineReached: false } };
      expect((await server.handle(request)).status).toBe("pending");
      expect(server.acknowledge(background.token).status).toBe("acknowledged");
      expect(server.finalize(background.token).status).toBe("finalized");
      const decision = await server.handle(request);
      if (decision.status !== "advice") throw new Error("missing reoffer");
      expect(decision.findingCount).toBe(1);
      expect((await server.handle(request)).status).toBe("empty");
      expect(server.beginComposedSubmission(decision.token, "stop").status).toBe("submitting");
      expect(server.beginComposedSubmission(decision.token, "stop").status).toBe("empty");
      server.acknowledge(decision.token); server.finalize(decision.token);
      await server.handle({ version: 1, operation: "finish-stop", lifetime: server.lifetime,
        root, advicee: observation.advicee, token: "finish", close: false });
      await server.handle({ version: 1, operation: "begin-stop", lifetime: server.lifetime,
        root, advicee: observation.advicee, token: "second-finish" });
      expect((await server.handle({ ...request, finish: { token: "second-finish", deadlineReached: false } })).status).toBe("empty");
      expect(server.stats().pendingAdvice).toBe(0);
    } finally { await server.close(); }
  });

  it("keeps a pending finish poll pending when the last result arrives before IPC handoff", async () => {
    const root = await makeGitFixture();
    await put(root, "type.ts", "type OrderCount = number\n");
    const statePath = join(root, "consent");
    await enable(root, statePath);
    const observation = await Effect.runPromise(adaptCodexDirectEvent(addEvent(root)));
    if (observation === undefined) throw new Error("missing fixture observation");
    const gate = deferred(), started = deferred();
    let armed = true;
    const paths = residentPaths(join(root, "runtime"));
    const server = new ResidentServer(paths, () => performance.now(), {
      beforeEvaluate: async () => { started.resolve(); await gate.promise; },
      beforeResponseHandoff: async () => {
        if (!armed) return;
        armed = false;
        gate.resolve();
        await server.whenIdle();
      },
    });
    const dispatch = findingDispatch(statePath);
    try {
      await server.listen();
      server.admit(observation, dispatch, false, true);
      await started.promise;
      await server.handle({ version: 1, operation: "begin-stop", lifetime: server.lifetime,
        root, advicee: observation.advicee, token: "finish" });
      const request = { version: 1 as const, operation: "collect" as const, lifetime: server.lifetime,
        root, advicee: observation.advicee, dispatch, mode: "turn-end" as const, composed: true as const,
        reportWorkState: true as const, finish: { token: "finish", deadlineReached: false } };
      expect((await residentRequest(paths, request)).status).toBe("pending");
      expect((await residentRequest(paths, request)).status).toBe("advice");
    } finally { gate.resolve(); await server.close(); }
  });

  it("decides a settled round immediately after an abandoned notice lease expires", async () => {
    const root = await makeGitFixture();
    await put(root, "type.ts", "type OrderCount = number\n");
    const statePath = join(root, "consent");
    await enable(root, statePath);
    const observation = await Effect.runPromise(adaptCodexDirectEvent(addEvent(root)));
    if (observation === undefined) throw new Error("missing fixture observation");
    let now = 0;
    const server = new ResidentServer(residentPaths(join(root, "runtime")), () => now);
    const dispatch = { ...findingDispatch(statePath), controlled: { failure: "fixture unavailable" } };
    try {
      server.admit(observation, dispatch, false, true);
      await server.whenIdle();
      const collect = { version: 1 as const, operation: "collect" as const, lifetime: server.lifetime,
        root, advicee: observation.advicee, dispatch, mode: "turn-end" as const, composed: true as const };
      expect((await server.handle(collect)).status).toBe("advice");
      now += DELIVERY_LEASE_MS + 1;
      await server.handle({ version: 1, operation: "begin-stop", lifetime: server.lifetime,
        root, advicee: observation.advicee, token: "finish" });
      const decision = await server.handle({ ...collect, finish: { token: "finish", deadlineReached: false } });
      expect(decision.status).toBe("advice");
      if (decision.status === "advice") expect(decision.findingCount).toBe(0);
    } finally { await server.close(); }
  });

  it("requires the installed PreToolUse permit before admitting composed IPC", async () => {
    const root = await makeGitFixture();
    await put(root, "type.ts", "type OrderCount = number\n");
    const statePath = join(root, "consent");
    await enable(root, statePath);
    const observation = await Effect.runPromise(adaptCodexDirectEvent(addEvent(root)));
    if (observation === undefined) throw new Error("missing fixture observation");
    const server = new ResidentServer(residentPaths(join(root, "runtime")));
    const dispatch = findingDispatch(statePath);
    const admission = { version: 1 as const, operation: "admit" as const, lifetime: server.lifetime,
      observation, dispatch, controlledWriter: true as const, composed: true as const };
    expect((await server.handle(admission)).status).toBe("rejected-stale");
    expect((await server.handle({ version: 1, operation: "register-edit", lifetime: server.lifetime,
      root, advicee: observation.advicee, startedAt: monotonicNow() })).status).toBe("advanced");
    expect(await server.handle({ version: 1, operation: "register-edit", lifetime: server.lifetime,
      root, advicee: observation.advicee, startedAt: monotonicNow() })).toMatchObject({
      status: "rejected-stale", reason: "DuplicateTool",
    });
    expect((await server.handle({ ...admission,
      observation: { ...observation, advicee: { ...observation.advicee, subagentId: "child" } } })).status)
      .toBe("rejected-stale");
    expect((await server.handle(admission)).status).toBe("accepted");
    expect((await server.handle(admission)).status).toBe("rejected-stale");
    await server.whenIdle();
    await server.close();
  });

  it("closes a composed round, cancels queued work and fences late results", async () => {
    const root = await makeGitFixture();
    await put(root, "type.ts", "type OrderCount = number\n");
    const statePath = join(root, "consent");
    await enable(root, statePath);
    const observation = await Effect.runPromise(adaptCodexDirectEvent(addEvent(root)));
    if (observation === undefined) throw new Error("missing fixture observation");
    const started = deferred();
    const gate = deferred();
    const server = new ResidentServer(residentPaths(join(root, "runtime")), () => performance.now(), {
      beforeEvaluate: async () => { started.resolve(); await gate.promise; },
    });
    const activityPath = join(root, "activity");
    const dispatch = { ...findingDispatch(statePath), activityPath };
    expect(server.admit(observation, dispatch, false, true).status).toBe("accepted");
    await started.promise;
    expect(await server.handle({ version: 1, operation: "begin-stop", lifetime: server.lifetime,
      root, advicee: observation.advicee, token: "stop" })).toEqual({ status: "advanced" });
    await server.handle({ version: 1, operation: "finish-stop", lifetime: server.lifetime,
      root, advicee: observation.advicee, token: "stop", close: true });
    gate.resolve();
    await server.whenIdle();
    expect(server.stats().pendingAdvice).toBe(0);
    expect(server.stats().pendingEvaluations).toBe(0);
    expect(server.admit({ ...observation, advicee: { ...observation.advicee, toolUseId: "late" } }, dispatch, false, true).status)
      .toBe("rejected-stale");
    expect((await server.handle({ version: 1, operation: "collect", lifetime: server.lifetime,
      root, advicee: observation.advicee, dispatch, mode: "turn-end", composed: true })).status).toBe("empty");
    const activity = readActivity({ statePath: activityPath, root,
      sessionId: observation.advicee.sessionId, resident: { available: true, lifetime: server.lifetime } });
    expect(activity.roundClosures).toHaveLength(1);
    expect(activity.roundClosures?.[0]?.reason).toBe("no-advice");
    expect(activity.roundClosures?.[0]?.discarded.running).toBe(1);
    expect(JSON.stringify(activity.roundClosures)).not.toContain(root);
    expect(JSON.stringify(activity.roundClosures)).not.toContain("OrderCount");
    await server.close();
  });

  it("reoffers uncertain background advice once at Stop and clears every record on allow", async () => {
    const root = await makeGitFixture();
    await put(root, "type.ts", "type OrderCount = number\n");
    const statePath = join(root, "consent");
    await enable(root, statePath);
    const observation = await Effect.runPromise(adaptCodexDirectEvent(addEvent(root)));
    if (observation === undefined) throw new Error("missing fixture observation");
    const server = new ResidentServer(residentPaths(join(root, "runtime")));
    const activityPath = join(root, "activity");
    const dispatch = { ...findingDispatch(statePath), activityPath };
    server.admit(observation, dispatch, false, true);
    await server.whenIdle();
    const collect = () => server.handle({ version: 1, operation: "collect", lifetime: server.lifetime,
      root, advicee: observation.advicee, dispatch, mode: "turn-end", composed: true });
    const background = await collect();
    expect(background.status).toBe("advice");
    if (background.status !== "advice") return;
    expect((await server.handle({ version: 1, operation: "claim-background", lifetime: server.lifetime,
      root, advicee: observation.advicee, token: "background-worker" })).status).toBe("background-claimed");
    expect(server.beginComposedSubmission(background.token, "background").status).toBe("submitting");
    expect((await server.handle({ version: 1, operation: "release-background", lifetime: server.lifetime,
      root, advicee: observation.advicee, token: "background-worker" })).status).toBe("released");
    await server.handle({ version: 1, operation: "begin-stop", lifetime: server.lifetime,
      root, advicee: observation.advicee, token: "reoffer" });
    const stop = await server.handle({ version: 1, operation: "collect", lifetime: server.lifetime,
      root, advicee: observation.advicee, dispatch, mode: "turn-end", composed: true,
      finish: { token: "reoffer", deadlineReached: true } });
    expect(stop.status).toBe("advice");
    if (stop.status !== "advice") return;
    expect(server.beginComposedSubmission(stop.token, "stop").status).toBe("submitting");
    server.acknowledge(stop.token); server.finalize(stop.token);
    await server.handle({ version: 1, operation: "finish-stop", lifetime: server.lifetime,
      root, advicee: observation.advicee, token: "reoffer", close: false });
    expect((await collect()).status).toBe("empty");
    await server.handle({ version: 1, operation: "begin-stop", lifetime: server.lifetime,
      root, advicee: observation.advicee, token: "close" });
    await server.handle({ version: 1, operation: "finish-stop", lifetime: server.lifetime,
      root, advicee: observation.advicee, token: "close", close: true });
    expect(server.stats().pendingAdvice).toBe(0);
    expect(server.stats().pendingEvaluations).toBe(0);
    const activity = readActivity({ statePath: activityPath, root,
      sessionId: observation.advicee.sessionId, resident: { available: true, lifetime: server.lifetime } });
    expect(activity.roundClosures).toHaveLength(1);
    expect(activity.roundClosures?.[0]?.reason).toBe("no-advice");
    expect(activity.roundClosures?.[0]?.discarded).toMatchObject({ pendingAdvice: 1, submitted: 1, uncertain: 1 });
    expect(JSON.stringify(activity.roundClosures)).not.toContain(root);
    expect(JSON.stringify(activity.roundClosures)).not.toContain("OrderCount");
    await server.close();
  });

  it("does not reoffer a live background writer when the Stop deadline forces a decision", async () => {
    const root = await makeGitFixture();
    await put(root, "type.ts", "type OrderCount = number\n");
    const statePath = join(root, "consent");
    await enable(root, statePath);
    const observation = await Effect.runPromise(adaptCodexDirectEvent(addEvent(root)));
    if (observation === undefined) throw new Error("missing fixture observation");
    const server = new ResidentServer(residentPaths(join(root, "runtime")));
    try {
      const dispatch = findingDispatch(statePath);
      server.admit(observation, dispatch, false, true);
      await server.whenIdle();
      const background = await server.handle({ version: 1, operation: "collect", lifetime: server.lifetime,
        root, advicee: observation.advicee, dispatch, mode: "ordinary", composed: true });
      if (background.status !== "advice") throw new Error("missing background finding");
      expect(server.beginComposedSubmission(background.token, "background").status).toBe("submitting");
      expect((await server.handle({ version: 1, operation: "begin-stop", lifetime: server.lifetime,
        root, advicee: observation.advicee, token: "deadline" })).status).toBe("advanced");
      const decision = await server.handle({ version: 1, operation: "collect", lifetime: server.lifetime,
        root, advicee: observation.advicee, dispatch, mode: "turn-end", composed: true,
        finish: { token: "deadline", deadlineReached: true } });
      expect(decision.status).toBe("empty");
      expect(server.acknowledge(background.token).status).toBe("empty");
    } finally {
      await server.close();
    }
  });

  it("leases one composed finding to one concurrent collector and preserves the next opportunity", async () => {
    const root = await makeGitFixture();
    await put(root, "type.ts", "type OrderCount = number\n");
    const statePath = join(root, "consent");
    await enable(root, statePath);
    const observation = await Effect.runPromise(adaptCodexDirectEvent(addEvent(root)));
    expect(observation).toBeDefined();
    if (observation === undefined) return;
    const server = new ResidentServer(residentPaths(join(root, "runtime")));
    const dispatch = findingDispatch(statePath);
    expect(server.admit(observation, dispatch, false, true)).toEqual({ status: "accepted" });
    await server.whenIdle();
    const request = { version: 1 as const, operation: "collect" as const,
      lifetime: server.lifetime, root, advicee: observation.advicee,
      dispatch, mode: "turn-end" as const, composed: true as const, reportWorkState: true as const };
    const [background, stop] = await Promise.all([server.handle(request), server.handle(request)]);
    expect([background.status, stop.status].filter((status) => status === "advice")).toHaveLength(1);
    const winner = background.status === "advice" ? background : stop;
    if (winner.status !== "advice") return;
    await server.handle({ version: 1, operation: "prompt-marker", lifetime: server.lifetime,
      root, advicee: observation.advicee, marker: "a".repeat(64), onlyIfMissing: true });
    expect(await server.handle({ version: 1, operation: "begin-submission", lifetime: server.lifetime,
      token: winner.token, surface: "background" })).toEqual({ status: "submitting" });
    expect(server.acknowledge(winner.token)).toEqual({ status: "acknowledged" });
    expect(server.finalize(winner.token)).toEqual({ status: "finalized" });
    await server.handle({ version: 1, operation: "begin-stop", lifetime: server.lifetime,
      root, advicee: observation.advicee, token: "reoffer" });
    const reoffer = await server.handle({ ...request,
      finish: { token: "reoffer", deadlineReached: true } });
    expect(reoffer.status).toBe("advice");
    if (reoffer.status === "advice") {
      server.beginComposedSubmission(reoffer.token, "stop");
      server.acknowledge(reoffer.token); server.finalize(reoffer.token);
      await server.handle({ version: 1, operation: "finish-stop", lifetime: server.lifetime,
        root, advicee: observation.advicee, token: "reoffer", close: false });
      expect((await server.handle(request)).status).toBe("empty");
    }
  });

  it("keeps composed findings addressed across Codex and Claude in one working root", async () => {
    const root = await makeGitFixture();
    await put(root, "codex.ts", "type CodexCount = number\n");
    await put(root, "claude.ts", "type ClaudeCount = number\n");
    const statePath = join(root, "consent");
    await enable(root, statePath);
    const codex = await Effect.runPromise(adaptCodexDirectEvent(addEvent(root, ["codex.ts"], {
      session_id: "codex-session", tool_use_id: "codex-tool",
    })));
    const claudeBase = await Effect.runPromise(adaptCodexDirectEvent(addEvent(root, ["claude.ts"], {
      session_id: "claude-session", tool_use_id: "claude-tool",
    })));
    expect(codex).toBeDefined();
    expect(claudeBase).toBeDefined();
    if (codex === undefined || claudeBase === undefined) return;
    const claude = { ...claudeBase, advicee: {
      host: "claude-code" as const, hostVersion: "2.1.218" as const,
      sessionId: "claude-session", turnId: null, toolUseId: "claude-tool", subagentId: null,
    } };
    let clock = 100;
    const server = new ResidentServer(residentPaths(join(root, "runtime")), () => clock);
    const dispatch = findingDispatch(statePath);
    expect(server.admit(codex, dispatch, false, true)).toEqual({ status: "accepted" });
    expect(server.admit(claude, dispatch, false, true)).toEqual({ status: "accepted" });
    await server.whenIdle();
    clock += ADVICE_COLLECTION_WINDOW_MS;
    const collect = (adviceeValue: typeof codex.advicee | typeof claude.advicee,
      mode: "ordinary" | "turn-end") => server.handle({
      version: 1, operation: "collect", lifetime: server.lifetime, root,
      advicee: adviceeValue, dispatch, mode, composed: true,
    });
    const [codexReply, claudeReply] = await Promise.all([
      collect(codex.advicee, "ordinary"), collect(claude.advicee, "turn-end"),
    ]);
    expect(codexReply.status).toBe("advice");
    expect(claudeReply.status).toBe("advice");
    if (codexReply.status !== "advice" || claudeReply.status !== "advice") return;
    const codexText = claudeHostOutputText(codexReply.output);
    const claudeText = claudeHostOutputText(claudeReply.output);
    expect(codexText).toContain("codex.ts");
    expect(codexText).not.toContain("claude.ts");
    expect(claudeText).toContain("claude.ts");
    expect(claudeText).not.toContain("codex.ts");
    await server.handle({ version: 1, operation: "prompt-marker", lifetime: server.lifetime,
      root, advicee: codex.advicee, marker: "a".repeat(64), onlyIfMissing: true });
    expect(await server.handle({ version: 1, operation: "begin-submission", lifetime: server.lifetime,
      token: codexReply.token, surface: "background" })).toEqual({ status: "submitting" });
    await server.handle({ version: 1, operation: "prompt-marker", lifetime: server.lifetime,
      root, advicee: claude.advicee, marker: "a".repeat(64), onlyIfMissing: true });
    expect(await server.handle({ version: 1, operation: "begin-submission", lifetime: server.lifetime,
      token: claudeReply.token, surface: "stop" })).toEqual({ status: "submitting" });
  });

  it("drops Claude composed advice after credential generation rotates", async () => {
    const root = await makeGitFixture();
    await put(root, "type.ts", "type OrderCount = number\n");
    const statePath = join(root, "consent");
    const credentialStatePath = join(root, "credential-state.json");
    writeFileSync(credentialStatePath, JSON.stringify({ version: 1, generation: 1, savedUseSuspended: false }));
    await enable(root, statePath);
    const base = await Effect.runPromise(adaptCodexDirectEvent(addEvent(root)));
    expect(base).toBeDefined();
    if (base === undefined) return;
    const observation = { ...base, advicee: {
      host: "claude-code" as const, hostVersion: "2.1.218" as const,
      sessionId: "claude-session", turnId: null, toolUseId: "write-1", subagentId: null,
    } };
    const server = new ResidentServer(residentPaths(join(root, "runtime")));
    const dispatch: ResidentDispatchContext = { ...findingDispatch(statePath), credential: {
      name: "TYPESAFE_API_KEY", environmentValue: "synthetic-race-marker",
      environmentOnly: true, generation: 1, statePath: credentialStatePath,
    } };
    expect(server.admit(observation, dispatch)).toEqual({ status: "accepted" });
    await server.whenIdle();
    expect(server.pendingAdviceMetadata()).toHaveLength(1);
    writeFileSync(credentialStatePath, JSON.stringify({ version: 1, generation: 2, savedUseSuspended: false }));
    const rotated = { ...dispatch, credential: { ...dispatch.credential!, generation: 2 } };
    const result = await server.handle({ version: 1, operation: "collect", lifetime: server.lifetime,
      root, advicee: { ...observation.advicee, toolUseId: "later-tool" },
      dispatch: rotated, mode: "turn-end", composed: true });
    expect(result.status).toBe("empty");
  });

  it("fences composed output when a credential rotates after collection or before write authorization", async () => {
    const root = await makeGitFixture();
    await put(root, "type.ts", "type OrderCount = number\n");
    const statePath = join(root, "consent");
    const credentialStatePath = join(root, "credential-state.json");
    const credentialState = (generation: number) =>
      JSON.stringify({ version: 1, generation, savedUseSuspended: false });
    writeFileSync(credentialStatePath, credentialState(1));
    await enable(root, statePath);
    const observation = await Effect.runPromise(adaptCodexDirectEvent(addEvent(root)));
    if (observation === undefined) throw new Error("missing fixture observation");
    const dispatch: ResidentDispatchContext = { ...findingDispatch(statePath), credential: {
      name: "TYPESAFE_API_KEY", environmentValue: "synthetic-race-marker",
      environmentOnly: true, generation: 1, statePath: credentialStatePath,
    } };
    const paths = residentPaths(join(root, "runtime"));
    const server = new ResidentServer(paths);
    expect(server.admit(observation, dispatch, false, true)).toEqual({ status: "accepted" });
    await server.whenIdle();
    const collected = await server.handle({ version: 1, operation: "collect", lifetime: server.lifetime,
      root, advicee: observation.advicee, dispatch, mode: "turn-end", composed: true });
    if (collected.status !== "advice") throw new Error("missing fixture advice");
    writeFileSync(credentialStatePath, credentialState(2));
    expect(server.beginComposedSubmission(collected.token, "background")).toEqual({ status: "empty" });
    await server.close();

    writeFileSync(credentialStatePath, credentialState(1));
    let rotateAtHandoff = true;
    const gated = new ResidentServer(paths, undefined, { beforeResponseHandoff: async () => {
      if (!rotateAtHandoff) return;
      rotateAtHandoff = false;
      writeFileSync(credentialStatePath, credentialState(2));
    } });
    try {
      expect(gated.admit(observation, dispatch, false, true)).toEqual({ status: "accepted" });
      await gated.whenIdle();
      await gated.listen();
      const result = await residentRequest(paths, { version: 1, operation: "collect", lifetime: gated.lifetime,
        root, advicee: observation.advicee, dispatch, mode: "turn-end", composed: true });
      expect(result).toEqual({ status: "empty" });
    } finally {
      await gated.close();
    }
  });

  it("releases an unwritten Stop slot when credentials rotate at the final IPC barrier", async () => {
    const root = await makeGitFixture();
    await put(root, "type.ts", "type OrderCount = number\n");
    const statePath = join(root, "consent");
    const activityPath = join(root, "activity");
    const credentialStatePath = join(root, "credential-state.json");
    const credentialState = (generation: number) =>
      JSON.stringify({ version: 1, generation, savedUseSuspended: false });
    writeFileSync(credentialStatePath, credentialState(1));
    await enable(root, statePath);
    const observation = await Effect.runPromise(adaptCodexDirectEvent(addEvent(root)));
    if (observation === undefined) throw new Error("missing fixture observation");
    const dispatch: ResidentDispatchContext = { ...findingDispatch(statePath), activityPath, credential: {
      name: "TYPESAFE_API_KEY", environmentValue: "synthetic-race-marker",
      environmentOnly: true, generation: 1, statePath: credentialStatePath,
    } };
    const paths = residentPaths(join(root, "runtime"));
    const server = new ResidentServer(paths, undefined, { beforeResponseHandoff: async () => {
      writeFileSync(credentialStatePath, credentialState(2));
    } });
    try {
      expect(server.admit(observation, dispatch, false, true)).toEqual({ status: "accepted" });
      await server.whenIdle();
      await server.listen();
      expect(await server.handle({ version: 1, operation: "begin-stop", lifetime: server.lifetime,
        root, advicee: observation.advicee, token: "finish" })).toEqual({ status: "advanced" });
      const result = await residentRequest(paths, { version: 1, operation: "collect", lifetime: server.lifetime,
        root, advicee: observation.advicee, dispatch, mode: "turn-end", composed: true,
        finish: { token: "finish", deadlineReached: true } });
      expect(result).toEqual({ status: "empty" });
      const activity = readActivity({ statePath: activityPath, root,
        sessionId: observation.advicee.sessionId, resident: { available: true, lifetime: server.lifetime } });
      expect(activity.roundClosures?.[0]?.reservedContinuations).toBe(0);
    } finally {
      await server.close();
    }
  });

  it("releases a provisional Stop slot if the stop closes during the IPC response gate", async () => {
    const root = await makeGitFixture();
    await put(root, "type.ts", "type OrderCount = number\n");
    const statePath = join(root, "consent");
    const activityPath = join(root, "activity");
    await enable(root, statePath);
    const observation = await Effect.runPromise(adaptCodexDirectEvent(addEvent(root)));
    if (observation === undefined) throw new Error("missing fixture observation");
    const dispatch = { ...findingDispatch(statePath), activityPath };
    const paths = residentPaths(join(root, "runtime"));
    let server: ResidentServer;
    server = new ResidentServer(paths, undefined, { beforeResponseHandoff: async () => {
      expect(await server.handle({ version: 1, operation: "finish-stop", lifetime: server.lifetime,
        root, advicee: observation.advicee, token: "finish", close: false })).toEqual({ status: "advanced" });
    } });
    try {
      expect(server.admit(observation, dispatch, false, true)).toEqual({ status: "accepted" });
      await server.whenIdle();
      await server.listen();
      expect(await server.handle({ version: 1, operation: "begin-stop", lifetime: server.lifetime,
        root, advicee: observation.advicee, token: "finish" })).toEqual({ status: "advanced" });
      const result = await residentRequest(paths, { version: 1, operation: "collect", lifetime: server.lifetime,
        root, advicee: observation.advicee, dispatch, mode: "turn-end", composed: true,
        finish: { token: "finish", deadlineReached: true } });
      expect(result).toEqual({ status: "empty" });
      const activity = readActivity({ statePath: activityPath, root,
        sessionId: observation.advicee.sessionId, resident: { available: true, lifetime: server.lifetime } });
      expect(activity.roundClosures?.[0]?.reservedContinuations).toBe(0);
    } finally {
      await server.close();
    }
  });

  it("does not emit a notice-only token after final-gate finding invalidation closes Stop", async () => {
    const root = await makeGitFixture();
    await put(root, "type.ts", "type OrderCount = number\n");
    await put(root, "failure.ts", "type FailureCount = number\n");
    const statePath = join(root, "consent");
    const activityPath = join(root, "activity");
    await enable(root, statePath);
    const finding = await Effect.runPromise(adaptCodexDirectEvent(addEvent(root, ["type.ts"], {
      tool_use_id: "finding-tool", turn_id: "same-turn",
    })));
    const failure = await Effect.runPromise(adaptCodexDirectEvent(addEvent(root, ["failure.ts"], {
      tool_use_id: "failure-tool", turn_id: "same-turn",
    })));
    if (finding === undefined || failure === undefined) throw new Error("missing fixture observation");
    const dispatch = { ...findingDispatch(statePath), activityPath };
    const failedDispatch = { ...dispatch, controlled: { failure: "fixture unavailable" } };
    const paths = residentPaths(join(root, "runtime"));
    let invalidate = false;
    let now = 0;
    const server = new ResidentServer(paths, () => now, { beforeResponseHandoff: async () => {
      if (invalidate) now = PENDING_ADVICE_EXPIRY_MS + 1;
    } });
    try {
      expect(server.admit(finding, dispatch, false, true)).toEqual({ status: "accepted" });
      await server.whenIdle();
      now = Math.floor(PENDING_ADVICE_EXPIRY_MS / 2);
      expect(server.admit(failure, failedDispatch, false, true)).toEqual({ status: "accepted" });
      await server.whenIdle();
      await server.listen();
      const request = { version: 1 as const, operation: "collect" as const, lifetime: server.lifetime,
        root, advicee: finding.advicee, dispatch, mode: "turn-end" as const, composed: true as const };
      const mixed = await residentRequest(paths, request);
      expect(mixed.status).toBe("advice");
      if (mixed.status !== "advice") return;
      expect(mixed.findingCount).toBe(1);
      expect(claudeHostOutputText(mixed.output)).toMatch(/unavailable/i);
      server.releaseDelivery(mixed.token);
      expect(await server.handle({ version: 1, operation: "begin-stop", lifetime: server.lifetime,
        root, advicee: finding.advicee, token: "finish" })).toEqual({ status: "advanced" });
      invalidate = true;
      const final = await residentRequest(paths, { ...request,
        finish: { token: "finish", deadlineReached: true } });
      expect(final).toEqual({ status: "empty" });
      const activity = readActivity({ statePath: activityPath, root,
        sessionId: finding.advicee.sessionId, resident: { available: true, lifetime: server.lifetime } });
      expect(activity.roundClosures?.[0]?.reservedContinuations).toBe(0);
    } finally {
      await server.close();
    }
  });

  it("lets a later edit collect earlier advice through the same composed advicee group", async () => {
    const root = await makeGitFixture();
    await put(root, "first.ts", "type OrderCount = number\n");
    const statePath = join(root, "consent");
    await enable(root, statePath);
    const first = await Effect.runPromise(adaptCodexDirectEvent(addEvent(root, ["first.ts"], {
      tool_use_id: "first-tool", turn_id: "first-turn",
    })));
    expect(first).toBeDefined();
    if (first === undefined) return;
    const server = new ResidentServer(residentPaths(join(root, "runtime")));
    const dispatch = findingDispatch(statePath);
    expect(server.admit(first, dispatch)).toEqual({ status: "accepted" });
    await server.whenIdle();
    const later = { ...first.advicee, toolUseId: "later-tool", turnId: "later-turn" };
    const collected = await server.handle({ version: 1, operation: "collect", lifetime: server.lifetime,
      root, advicee: later, dispatch, mode: "turn-end", composed: true });
    expect(collected.status).toBe("advice");
    if (collected.status === "advice") {
      expect(claudeHostOutputText(collected.output)).toContain("first.ts");
    }
  });

  it("reoffers a lost background acknowledgement at Stop without waiting for another prompt", async () => {
    const root = await makeGitFixture();
    await put(root, "type.ts", "type OrderCount = number\n");
    const statePath = join(root, "consent");
    await enable(root, statePath);
    const observation = await Effect.runPromise(adaptCodexDirectEvent(addEvent(root)));
    expect(observation).toBeDefined();
    if (observation === undefined) return;
    let clock = 100;
    const server = new ResidentServer(residentPaths(join(root, "runtime")), () => clock);
    const dispatch = findingDispatch(statePath);
    const collect = () => server.handle({ version: 1, operation: "collect", lifetime: server.lifetime,
      root, advicee: observation.advicee, dispatch, mode: "turn-end", composed: true });
    const mark = (marker: string) => server.handle({ version: 1, operation: "prompt-marker",
      lifetime: server.lifetime, root, advicee: observation.advicee, marker });
    expect(await mark("a".repeat(64))).toEqual({ status: "advanced" });
    expect(server.admit(observation, dispatch, false, true)).toEqual({ status: "accepted" });
    await server.whenIdle();
    const first = await collect();
    expect(first.status).toBe("advice");
    if (first.status !== "advice") return;
    await server.handle({ version: 1, operation: "prompt-marker", lifetime: server.lifetime,
      root, advicee: observation.advicee, marker: "a".repeat(64), onlyIfMissing: true });
    expect(await server.handle({ version: 1, operation: "begin-submission", lifetime: server.lifetime,
      token: first.token, surface: "background" })).toEqual({ status: "submitting" });
    clock += DELIVERY_LEASE_MS;
    expect(server.beginComposedSubmission(first.token, "background")).toEqual({ status: "empty" });
    await server.handle({ version: 1, operation: "begin-stop", lifetime: server.lifetime,
      root, advicee: observation.advicee, token: "reoffer" });
    const reoffer = await server.handle({ version: 1, operation: "collect", lifetime: server.lifetime,
      root, advicee: observation.advicee, dispatch, mode: "turn-end", composed: true,
      finish: { token: "reoffer", deadlineReached: true } });
    expect(reoffer.status).toBe("advice");
    if (reoffer.status === "advice") {
      expect(server.beginComposedSubmission(reoffer.token, "stop")).toEqual({ status: "submitting" });
      server.releaseComposedSubmission(reoffer.token);
    }
    await server.handle({ version: 1, operation: "finish-stop", lifetime: server.lifetime,
      root, advicee: observation.advicee, token: "reoffer", close: false });
    expect(await mark("b".repeat(64))).toEqual({ status: "advanced" });
    expect((await collect()).status).toBe("empty");
  });

  it("releases a known failed composed write for another collector in the same turn", async () => {
    const root = await makeGitFixture();
    await put(root, "type.ts", "type OrderCount = number\n");
    const statePath = join(root, "consent");
    await enable(root, statePath);
    const observation = await Effect.runPromise(adaptCodexDirectEvent(addEvent(root)));
    expect(observation).toBeDefined();
    if (observation === undefined) return;
    const server = new ResidentServer(residentPaths(join(root, "runtime")));
    const dispatch = findingDispatch(statePath);
    expect(server.admit(observation, dispatch, false, true)).toEqual({ status: "accepted" });
    await server.whenIdle();
    const request = { version: 1 as const, operation: "collect" as const,
      lifetime: server.lifetime, root, advicee: observation.advicee, dispatch,
      mode: "turn-end" as const, composed: true as const };
    const first = await server.handle(request);
    expect(first.status).toBe("advice");
    if (first.status !== "advice") return;
    await server.handle({ version: 1, operation: "prompt-marker", lifetime: server.lifetime,
      root, advicee: observation.advicee, marker: "a".repeat(64), onlyIfMissing: true });
    expect(await server.handle({ version: 1, operation: "begin-submission", lifetime: server.lifetime,
      token: first.token, surface: "background" })).toEqual({ status: "submitting" });
    expect(await server.handle({ version: 1, operation: "release", lifetime: server.lifetime,
      token: first.token })).toEqual({ status: "released" });
    const retry = await server.handle(request);
    expect(retry.status).toBe("advice");
    if (retry.status === "advice") expect(retry.token).not.toBe(first.token);
  });

  it("drops stale composed findings at the final handoff barrier", async () => {
    const root = await makeGitFixture();
    await put(root, "type.ts", "type OrderCount = number\n");
    const statePath = join(root, "consent");
    await enable(root, statePath);
    const observation = await Effect.runPromise(adaptCodexDirectEvent(addEvent(root)));
    expect(observation).toBeDefined();
    if (observation === undefined) return;
    const server = new ResidentServer(residentPaths(join(root, "runtime")));
    const dispatch = findingDispatch(statePath);
    expect(server.admit(observation, dispatch)).toEqual({ status: "accepted" });
    await server.whenIdle();
    await put(root, "type.ts", 'type OrderCount = number & { readonly __brand: "OrderCount" }\n');
    expect(await server.handle({ version: 1, operation: "collect", lifetime: server.lifetime,
      root, advicee: observation.advicee, dispatch, mode: "turn-end", composed: true }))
      .toEqual({ status: "empty" });
    expect(server.stats().pendingAdvice).toBe(0);
  });

  it("batches distinct current units for composed collection", async () => {
    const root = await makeGitFixture();
    await put(root, "first.ts", "type FirstCount = number\n");
    await put(root, "second.ts", "type SecondCount = number\n");
    const statePath = join(root, "consent");
    await enable(root, statePath);
    const observation = await Effect.runPromise(adaptCodexDirectEvent(addEvent(root, ["first.ts", "second.ts"])));
    expect(observation).toBeDefined();
    if (observation === undefined) return;
    const server = new ResidentServer(residentPaths(join(root, "runtime")));
    const dispatch = findingDispatch(statePath);
    expect(server.admit(observation, dispatch)).toEqual({ status: "accepted" });
    await server.whenIdle();
    const collected = await server.handle({ version: 1, operation: "collect", lifetime: server.lifetime,
      root, advicee: observation.advicee, dispatch, mode: "turn-end", composed: true });
    expect(collected.status).toBe("advice");
    if (collected.status === "advice") {
      expect(collected.findingCount).toBe(2);
      expect(claudeHostOutputText(collected.output)).toContain("first.ts");
      expect(claudeHostOutputText(collected.output)).toContain("second.ts");
    }
  });

  it("reports composed backend failure as an operational notice rather than clean", async () => {
    const root = await makeGitFixture();
    await put(root, "type.ts", "type OrderCount = number\n");
    const statePath = join(root, "consent");
    await enable(root, statePath);
    const observation = await Effect.runPromise(adaptCodexDirectEvent(addEvent(root)));
    expect(observation).toBeDefined();
    if (observation === undefined) return;
    const server = new ResidentServer(residentPaths(join(root, "runtime")));
    const dispatch = { ...findingDispatch(statePath), controlled: { failure: "fixture unavailable" } };
    expect(server.admit(observation, dispatch)).toEqual({ status: "accepted" });
    await server.whenIdle();
    const collected = await server.handle({ version: 1, operation: "collect", lifetime: server.lifetime,
      root, advicee: observation.advicee, dispatch, mode: "turn-end", composed: true });
    expect(collected.status).toBe("advice");
    if (collected.status === "advice") {
      expect(collected.findingCount).toBe(0);
      expect(claudeHostOutputText(collected.output)).toMatch(/unavailable/i);
    }
  });

  it("keeps submitted advice suppressed across prompt notifications in the same round", async () => {
    const root = await makeGitFixture();
    await put(root, "type.ts", "type OrderCount = number\n");
    const statePath = join(root, "consent");
    await enable(root, statePath);
    const observation = await Effect.runPromise(adaptCodexDirectEvent(addEvent(root)));
    expect(observation).toBeDefined();
    if (observation === undefined) return;
    const server = new ResidentServer(residentPaths(join(root, "runtime")));
    const dispatch = findingDispatch(statePath);
    const collect = () => server.handle({ version: 1, operation: "collect", lifetime: server.lifetime,
      root, advicee: observation.advicee, dispatch, mode: "turn-end", composed: true, reportWorkState: true });
    const mark = (marker: string) => server.handle({ version: 1, operation: "prompt-marker",
      lifetime: server.lifetime, root, advicee: observation.advicee, marker });
    expect(await mark("a".repeat(64))).toEqual({ status: "advanced" });
    expect(server.admit(observation, dispatch, false, true)).toEqual({ status: "accepted" });
    await server.whenIdle();
    const first = await collect();
    expect(first.status).toBe("advice");
    if (first.status !== "advice") return;
    await server.handle({ version: 1, operation: "prompt-marker", lifetime: server.lifetime,
      root, advicee: observation.advicee, marker: "a".repeat(64), onlyIfMissing: true });
    expect(await server.handle({ version: 1, operation: "begin-submission", lifetime: server.lifetime,
      token: first.token, surface: "background" })).toEqual({ status: "submitting" });
    expect(await collect()).toEqual({ status: "pending" });
    expect(server.acknowledge(first.token)).toEqual({ status: "acknowledged" });
    expect(server.finalize(first.token)).toEqual({ status: "finalized" });
    expect(await collect()).toEqual({ status: "empty" });
    expect(await mark("a".repeat(64))).toEqual({ status: "advanced" });
    expect(await collect()).toEqual({ status: "empty" });
    expect(await mark("b".repeat(64))).toEqual({ status: "advanced" });
    const retry = await collect();
    expect(retry.status).toBe("empty");
  });

  it("shares prompt continuation state across host adapters while isolating advicees", async () => {
    const root = await makeGitFixture();
    const server = new ResidentServer(residentPaths(join(root, "runtime")));
    const codex = advicee({ sessionId: "codex-session" });
    const claude = { host: "claude-code" as const, hostVersion: "2.1.218" as const,
      sessionId: "claude-session", turnId: null, toolUseId: "prompt", subagentId: null };
    const marker = "a".repeat(64);
    for (const selected of [codex, claude]) {
      await server.handle({ version: 1, operation: "prompt-marker", lifetime: server.lifetime, root, advicee: selected, marker });
      const firstToken = "00000000-0000-4000-8000-000000000001";
      const secondToken = "00000000-0000-4000-8000-000000000002";
      expect(await server.handle({ version: 1, operation: "claim-background", lifetime: server.lifetime,
        root, advicee: selected, token: firstToken })).toEqual({ status: "busy" });
      expect(await server.handle({ version: 1, operation: "register-edit", lifetime: server.lifetime,
        root, advicee: selected, startedAt: monotonicNow() - 1 })).toEqual({ status: "advanced" });
      expect(await server.handle({ version: 1, operation: "claim-background", lifetime: server.lifetime,
        root, advicee: selected, token: firstToken })).toEqual({ status: "background-claimed" });
      expect(await server.handle({ version: 1, operation: "claim-background", lifetime: server.lifetime,
        root, advicee: { ...selected, toolUseId: "next-tool" }, token: secondToken }))
        .toEqual({ status: "busy" });
      expect(await server.handle({ version: 1, operation: "release-background", lifetime: server.lifetime,
        root, advicee: selected, token: firstToken })).toEqual({ status: "released" });
      expect(await server.handle({ version: 1, operation: "claim-background", lifetime: server.lifetime,
        root, advicee: selected, token: secondToken })).toEqual({ status: "background-claimed" });
      expect(await server.handle({ version: 1, operation: "prompt-marker", lifetime: server.lifetime,
        root, advicee: selected, marker })).toEqual({ status: "advanced" });
      expect(await server.handle({ version: 1, operation: "consume-stop", lifetime: server.lifetime,
        root, advicee: selected })).toEqual({ status: "continuation-allowed" });
      for (let i = 0; i < 3; i++) expect(await server.handle({ version: 1, operation: "consume-stop", lifetime: server.lifetime, root, advicee: selected })).toEqual({ status: "continuation-allowed" });
      expect(await server.handle({ version: 1, operation: "consume-stop", lifetime: server.lifetime, root, advicee: selected })).toEqual({ status: "continuation-denied" });
    }
  });

  it("requires child edit evidence to initialize Stop allowance and isolates parent and siblings", async () => {
    const root = await makeGitFixture();
    const server = new ResidentServer(residentPaths(join(root, "runtime")));
    for (const host of ["codex-cli", "claude-code"] as const) {
      const parent = host === "codex-cli" ? { host, hostVersion: "0.155.1" as const, sessionId: "session", turnId: "turn", toolUseId: "stop", subagentId: null }
        : { host, hostVersion: "2.1.218" as const, sessionId: "session", turnId: null, toolUseId: "stop", subagentId: null };
      const child = { ...parent, subagentId: "child" };
      const sibling = { ...parent, subagentId: "sibling" };
      const consume = (selected: typeof child | typeof parent) => server.handle({ version: 1,
        operation: "consume-stop", lifetime: server.lifetime, root, advicee: selected });
      const ensure = (selected: typeof child) => server.handle({ version: 1,
        operation: "prompt-marker", lifetime: server.lifetime, root, advicee: selected,
        marker: "b".repeat(64), onlyIfMissing: true });
      expect(await consume(child)).toEqual({ status: "continuation-denied" });
      expect(await ensure(child)).toEqual({ status: "advanced" });
      expect(await consume(child)).toEqual({ status: "continuation-denied" });
      expect(await server.handle({ version: 1, operation: "register-edit", lifetime: server.lifetime,
        root, advicee: { ...child, toolUseId: "child-edit" }, startedAt: monotonicNow() - 1 }))
        .toEqual({ status: "advanced" });
      for (let i = 0; i < 4; i++) expect(await consume(child)).toEqual({ status: "continuation-allowed" });
      expect(await ensure(child)).toEqual({ status: "advanced" });
      expect(await consume(child)).toEqual({ status: "continuation-denied" });
      expect(await consume(parent)).toEqual({ status: "continuation-denied" });
      expect(await consume(sibling)).toEqual({ status: "continuation-denied" });
      expect(await ensure(sibling)).toEqual({ status: "advanced" });
      expect(await consume(sibling)).toEqual({ status: "continuation-denied" });
      expect(await server.handle({ version: 1, operation: "register-edit", lifetime: server.lifetime,
        root, advicee: { ...sibling, toolUseId: "sibling-edit" }, startedAt: monotonicNow() - 1 }))
        .toEqual({ status: "advanced" });
      expect(await consume(sibling)).toEqual({ status: "continuation-allowed" });
    }
  });

  it("reports pending work only to its advicee during composed collection", async () => {
    const root = await makeGitFixture();
    await put(root, "type.ts", "type OrderCount = number\n");
    const statePath = join(root, "consent");
    await enable(root, statePath);
    const observation = await Effect.runPromise(adaptCodexDirectEvent(addEvent(root)));
    expect(observation).toBeDefined();
    if (observation === undefined) return;
    const held = deferred();
    const server = new ResidentServer(residentPaths(join(root, "runtime")), undefined, {
      afterPrepare: () => held.promise,
    });
    const dispatch = findingDispatch(statePath);
    expect(server.admit(observation, dispatch)).toEqual({ status: "accepted" });
    const collect = (adviceeValue: typeof observation.advicee, reportWorkState?: true) => server.handle({
      version: 1, operation: "collect", lifetime: server.lifetime, root,
      advicee: adviceeValue, dispatch, mode: "turn-end",
      ...(reportWorkState === true ? { reportWorkState: true as const } : {}),
    });
    expect(await collect(observation.advicee)).toEqual({ status: "empty" });
    expect(await collect(observation.advicee, true)).toEqual({ status: "pending" });
    expect(await collect({ ...observation.advicee, sessionId: "other" }, true)).toEqual({ status: "empty" });
    held.resolve();
    await server.whenIdle();
    expect((await collect(observation.advicee, true)).status).toBe("advice");
  });

  it("rejects a separate-process generation change after credential resolution at the provider boundary", async () => {
    const root = await makeGitFixture();
    await put(root, "type.ts", "type OrderCount = number\n");
    const statePath = join(root, "consent");
    const credentialStatePath = join(root, "credential-state.json");
    const capturePath = join(root, "provider-calls.txt");
    writeFileSync(credentialStatePath, JSON.stringify({ version: 1, generation: 1, savedUseSuspended: false }));
    await enable(root, statePath);
    const observation = await Effect.runPromise(adaptCodexDirectEvent(addEvent(root)));
    expect(observation).toBeDefined();
    if (observation === undefined) return;
    const changed = deferred();
    const server = new ResidentServer(residentPaths(join(root, "runtime")), undefined, {
      afterCredentialBeforeDispatch: async () => {
        const child = spawn(process.execPath, ["-e", `
          require("node:fs").writeFileSync(process.argv[1], JSON.stringify({version:1,generation:2,savedUseSuspended:false}));
        `, credentialStatePath], { stdio: "ignore" });
        await new Promise<void>((resolveExit, rejectExit) => {
          child.once("exit", () => resolveExit());
          child.once("error", rejectExit);
        });
        changed.resolve();
      },
    });
    const dispatch: ResidentDispatchContext = {
      statePath,
      userConfigPath: null,
      credential: {
        name: "TYPESAFE_API_KEY",
        environmentValue: "synthetic-race-marker",
        environmentOnly: false,
        generation: 1,
        statePath: credentialStatePath,
      },
      controlled: {
        requireCredential: true,
        capturePath,
        answers: Object.fromEntries(configuredRules.map((rule) => [
          rule.id, { _tag: "Probability", probability: 0.9 },
        ])),
      },
    };
    expect(server.admit(observation, dispatch)).toEqual({ status: "accepted" });
    await changed.promise;
    await waitUntilIdle(server);
    expect(existsSync(capturePath)).toBe(false);
    expect(server.stats()).toMatchObject({ pendingEvaluations: 0 });
  });

  it("aggregates findings from distinct production units in one event", async () => {
    const root = await makeGitFixture();
    await put(root, "a.ts", "type ACount = number\n");
    await put(root, "b.ts", "type BCount = number\n");
    const statePath = join(root, "consent");
    const activityPath = join(root, "activity");
    await enable(root, statePath);
    const observation = await Effect.runPromise(adaptCodexDirectEvent(addEvent(root, ["a.ts", "b.ts"])));
    expect(observation).toBeDefined();
    if (observation === undefined) return;
    const server = new ResidentServer(residentPaths(join(root, "runtime")));
    expect(server.admit(observation, { ...findingDispatch(statePath), activityPath }).status).toBe("accepted");
    await server.whenIdle();
    expect(readActivity({
      statePath: activityPath,
      root,
      sessionId: observation.advicee.sessionId,
      resident: { available: true, lifetime: server.lifetime },
    })).toMatchObject({ kind: "findings", findings: 2, counts: { findings: 1 } });
  });

  it("commits an idle lifetime to retiring before returning cleanup success", async () => {
    const root = await makeGitFixture();
    await put(root, "type.ts", "type OrderCount = number\n");
    const statePath = join(root, "consent");
    const observation = await Effect.runPromise(adaptCodexDirectEvent(addEvent(root)));
    expect(observation).toBeDefined();
    if (observation === undefined) return;
    const dispatch = findingDispatch(statePath);
    const server = new ResidentServer(residentPaths(join(root, "runtime")));

    expect(await server.handle({
      version: 1,
      operation: "cleanup",
      lifetime: server.lifetime,
    })).toEqual({ status: "cleaned" });
    expect(await server.handle({ version: 1, operation: "hello" }))
      .toEqual({ status: "obsolete-lifetime" });
    expect(await server.handle({
      version: 1,
      operation: "admit",
      lifetime: server.lifetime,
      observation,
      controlledWriter: true,
      dispatch,
    })).toEqual({ status: "obsolete-lifetime" });
    expect(await server.handle({
      version: 1,
      operation: "collect",
      lifetime: server.lifetime,
      root,
      advicee: advicee(),
      dispatch,
    })).toEqual({ status: "obsolete-lifetime" });
    expect(await server.handle({
      version: 1,
      operation: "acknowledge",
      lifetime: server.lifetime,
      token: "old-token",
    })).toEqual({ status: "obsolete-lifetime" });
    expect(await server.handle({
      version: 1,
      operation: "finalize",
      lifetime: server.lifetime,
      token: "old-token",
    })).toEqual({ status: "obsolete-lifetime" });
    expect(await server.handle({
      version: 1,
      operation: "stats",
      lifetime: server.lifetime,
    })).toEqual({ status: "obsolete-lifetime" });
    expect(server.stats()).toMatchObject({
      queued: 0,
      running: 0,
      pendingAdvice: 0,
      retainedBytes: 0,
      pendingEvaluations: 0,
      currentWork: 0,
    });
  });

  it("reclaims disconnected collection and unfinalized acknowledgement deterministically", async () => {
    const root = await makeGitFixture();
    await put(root, "type.ts", "type OrderCount = number\n");
    const statePath = join(root, "consent");
    const capturePath = join(root, "backend-called");
    await enable(root, statePath);
    const observation = await Effect.runPromise(adaptCodexDirectEvent(addEvent(root)));
    expect(observation).toBeDefined();
    if (observation === undefined) return;
    const dispatch: ResidentDispatchContext = {
      statePath,
      userConfigPath: null,
      credential: null,
      controlled: {
        capturePath,
        answers: Object.fromEntries(configuredRules.map((rule) => [
          rule.id,
          { _tag: "Probability", probability: rule.id === "r6_bare_domain_value" ? 0.9 : 0 },
        ])),
      },
    };
    let clock = 100;
    const server = new ResidentServer(residentPaths(join(root, "runtime")), () => clock);
    expect(server.admit(observation, dispatch).status).toBe("accepted");
    await server.whenIdle();
    expect(server.stats()).toMatchObject({ pendingAdvice: 1, running: 0 });

    const first = await server.collect(root, advicee({ turnId: "later", toolUseId: "collect-1" }), dispatch);
    expect(first.status).toBe("advice");
    if (first.status !== "advice") return;
    server.releaseDelivery(first.token);
    const afterDisconnect = await server.collect(
      root,
      advicee({ turnId: "later", toolUseId: "collect-2" }),
      dispatch,
    );
    expect(afterDisconnect.status).toBe("advice");
    if (afterDisconnect.status !== "advice") return;

    expect(server.acknowledge(afterDisconnect.token).status).toBe("acknowledged");
    clock += DELIVERY_LEASE_MS;
    const afterFailedAck = await server.collect(
      root,
      advicee({ turnId: "later", toolUseId: "collect-3" }),
      dispatch,
    );
    expect(afterFailedAck.status).toBe("advice");
    if (afterFailedAck.status !== "advice") return;
    expect(server.acknowledge(afterFailedAck.token).status).toBe("acknowledged");
    expect(server.finalize(afterFailedAck.token).status).toBe("finalized");
    expect(server.stats()).toMatchObject({
      pendingAdvice: 0,
      retainedBytes: server.accountingMetrics().successfulCacheBytes,
    });
  });

  it("releases promised outcome space after malformed backend output", async () => {
    const root = await makeGitFixture();
    await put(root, "type.ts", "type OrderCount = number\n");
    const statePath = join(root, "consent");
    await enable(root, statePath);
    const observation = await Effect.runPromise(adaptCodexDirectEvent(addEvent(root)));
    expect(observation).toBeDefined();
    if (observation === undefined) return;
    const dispatch: ResidentDispatchContext = {
      statePath,
      userConfigPath: null,
      credential: null,
      controlled: {
        answers: Object.fromEntries(configuredRules.map((rule) => [
          rule.id,
          { _tag: "Probability", probability: 9 },
        ])),
      },
    };
    const server = new ResidentServer(residentPaths(join(root, "runtime")));
    expect(server.admit(observation, dispatch).status).toBe("accepted");
    await server.whenIdle();
    expect(server.stats()).toMatchObject({ queued: 0, running: 0, pendingAdvice: 1 });
    expect(server.stats().retainedBytes).toBe(server.accountingMetrics().operationalNoticeBytes);
  });

  it("bounds 16-path/64-unit preparation and accounts accepted units exactly", async () => {
    const root = await makeGitFixture();
    const paths = Array.from({ length: 16 }, (_, index) => `types-${index}.ts`);
    for (const [fileIndex, path] of paths.entries()) {
      await put(root, path, Array.from(
        { length: 64 },
        (_, declarationIndex) => `type Shape${fileIndex}_${declarationIndex} = number`,
      ).join("\n"));
    }
    await put(root, "rules.jsonc", JSON.stringify({
      schemaVersion: 1,
      id: "team",
      contentVersion: "1",
      rules: [{
        id: "large",
        question: "Does this declaration use a primitive?",
        criteria: { false: "No", true: "Yes" },
        threshold: 0.7,
        message: "x".repeat(1024),
        applicability: { includes: ["**/*.ts"] },
      }],
    }));
    await put(root, ".review.jsonc", JSON.stringify({ version: 1, packs: ["rules.jsonc"] }));
    const statePath = join(root, "consent");
    const capturePath = join(root, "backend-calls");
    await enable(root, statePath);
    const observation = await Effect.runPromise(adaptCodexDirectEvent(addEvent(root, paths)));
    expect(observation).toBeDefined();
    if (observation === undefined) return;
    const dispatch: ResidentDispatchContext = {
      statePath,
      userConfigPath: null,
      credential: null,
      controlled: {
        capturePath,
        answers: {
          ...Object.fromEntries(configuredRules.map((rule) => [
            rule.id,
            { _tag: "Probability", probability: 0.9 },
          ])),
          "team/large": { _tag: "Probability", probability: 0.9 },
        },
      },
    };
    const server = new ResidentServer(residentPaths(join(root, "runtime")));
    const firstPathObservation = { ...observation, candidates: [observation.candidates[0]!] };
    const prepared = await Effect.runPromise(Effect.gen(function* () {
      const consent = yield* Consent.Service;
      const settings = yield* loadReviewSettings(root);
      return yield* prepareObservation(firstPathObservation, {
        controlledWriter: true,
        advicee: observation.advicee,
        consent,
        settings,
      });
    }).pipe(Effect.provide(Consent.layer({ statePath }))));
    const exactAcceptedBytes = prepared.outcomes.flatMap((outcome) =>
      outcome.status === "ready" ? [residentUnitReservationBytes(firstPathObservation, dispatch, outcome.prepared)] : [])
      .slice(0, 16)
      .reduce((total, bytes) => total + bytes, 0);
    expect(server.admit(observation, dispatch).status).toBe("accepted");
    await server.whenIdle();

    const metadata = server.pendingAdviceMetadata();
    const stats = server.stats();
    expect(metadata).toHaveLength(16);
    expect(stats).toMatchObject({ pendingAdvice: 16 });
    expect(stats.rejectedCapacity).toBeGreaterThan(0);
    expect(stats.retainedBytes).toBe(exactAcceptedBytes);
    expect(stats.retainedBytes).toBe(metadata.reduce((total, item) => total + item.retainedBytes, 0));
    expect(readFileSync(capturePath, "utf8").trim().split("\n")).toHaveLength(16);
    expect(metadata.every((item) => item.cycleComplete)).toBe(true);
    expect(metadata.map((item) => item.sequence)).toEqual(
      [...metadata.map((item) => item.sequence)].sort((left, right) => left - right),
    );
    expect(server.accountingMetrics()).toMatchObject({ maxMaterializedPreparedUnits: 64 });
    expect(server.accountingMetrics().peakLedgerBytes).toBeLessThanOrEqual(2 * 1024 * 1024);
  });

  it("reserves large valid outcomes before evaluation and rejects unreservable outcomes without a call", async () => {
    const run = async (messageBytes: number) => {
      const root = await makeGitFixture();
      await put(root, "type.ts", "type LargeFinding = number\n");
      await put(root, "rules.jsonc", JSON.stringify({
        schemaVersion: 1,
        id: "team",
        contentVersion: "1",
        rules: [{
          id: "large",
          question: "Does this declaration use a primitive?",
          criteria: { false: "No", true: "Yes" },
          threshold: 0.7,
          message: "x".repeat(messageBytes),
          applicability: { includes: ["**/*.ts"] },
        }],
      }));
      await put(root, ".review.jsonc", JSON.stringify({ version: 1, packs: ["rules.jsonc"] }));
      const statePath = join(root, "consent");
      const capturePath = join(root, "backend-calls");
      await enable(root, statePath);
      const observation = await Effect.runPromise(adaptCodexDirectEvent(addEvent(root)));
      expect(observation).toBeDefined();
      if (observation === undefined) throw new Error("fixture adaptation failed");
      const dispatch: ResidentDispatchContext = {
        statePath,
        userConfigPath: null,
        credential: null,
        controlled: {
          capturePath,
          answers: {
            ...Object.fromEntries(configuredRules.map((rule) => [
              rule.id,
              { _tag: "Probability", probability: 0 },
            ])),
            "team/large": { _tag: "Probability", probability: 1 },
          },
        },
      };
      const server = new ResidentServer(residentPaths(join(root, "runtime")));
      expect(server.admit(observation, dispatch).status).toBe("accepted");
      await server.whenIdle();
      return { root, statePath, capturePath, dispatch, server };
    };

    const retained = await run(20 * 1024);
    expect(retained.server.stats()).toMatchObject({ pendingAdvice: 1, rejectedCapacity: 0 });
    expect(readFileSync(retained.capturePath, "utf8").trim()).toBe("called");
    const delivered = await retained.server.collect(
      retained.root,
      advicee({ turnId: "later", toolUseId: "large" }),
      retained.dispatch,
    );
    expect(delivered).toMatchObject({ status: "advice", findingCount: 0 });
    if (delivered.status === "advice") {
      expect(delivered.output.hookSpecificOutput.additionalContext).toContain("exceeded the host response limit");
    }
    expect(retained.server.stats()).toMatchObject({ pendingAdvice: 2 });

    const rejected = await run(2 * 1024 * 1024);
    expect(rejected.server.stats()).toMatchObject({ pendingAdvice: 0, rejectedCapacity: 1, retainedBytes: 0 });
    expect(existsSync(rejected.capturePath)).toBe(false);
    expect(rejected.server.accountingMetrics()).toMatchObject({ maxMaterializedPreparedUnits: 0 });
    expect(rejected.server.accountingMetrics().peakLedgerBytes).toBeLessThanOrEqual(2 * 1024 * 1024);

    const transportRejected = await run(300 * 1024);
    expect(transportRejected.server.stats()).toMatchObject({ pendingAdvice: 1, rejectedCapacity: 1 });
    expect(transportRejected.server.stats().retainedBytes).toBe(
      transportRejected.server.accountingMetrics().operationalNoticeBytes,
    );
    expect(existsSync(transportRejected.capturePath)).toBe(false);
  });

  it("removes concurrent collection results by stable advice identity", async () => {
    const root = await makeGitFixture();
    await put(root, "a.ts", "type FirstShape = number\n");
    await put(root, "b.ts", "type SecondShape = number\n");
    const statePath = join(root, "consent");
    await enable(root, statePath);
    const observation = await Effect.runPromise(adaptCodexDirectEvent(addEvent(root, ["a.ts", "b.ts"])));
    expect(observation).toBeDefined();
    if (observation === undefined) return;
    const dispatch: ResidentDispatchContext = {
      statePath,
      userConfigPath: null,
      credential: null,
      controlled: {
        answers: Object.fromEntries(configuredRules.map((rule) => [
          rule.id,
          { _tag: "Probability", probability: rule.id === "r6_bare_domain_value" ? 0.9 : 0 },
        ])),
      },
    };
    const entered: Array<string> = [];
    const releases = new Map<string, () => void>();
    const server = new ResidentServer(
      residentPaths(join(root, "runtime")),
      () => 100,
      { beforeRevalidate: (id) => new Promise<void>((resolve) => {
        entered.push(id);
        releases.set(id, resolve);
      }) },
    );
    expect(server.admit(observation, dispatch).status).toBe("accepted");
    await server.whenIdle();
    const [first, second] = server.pendingAdviceMetadata();
    expect(first).toBeDefined();
    expect(second).toBeDefined();
    if (first === undefined || second === undefined) return;
    await put(root, "a.ts", "type FirstShape = string\n");

    const collectFirst = server.collect(root, advicee({ turnId: "c1", toolUseId: "c1" }), dispatch);
    while (entered.length < 1) await Promise.resolve();
    const collectSecond = server.collect(root, advicee({ turnId: "c2", toolUseId: "c2" }), dispatch);
    while (entered.length < 2) await Promise.resolve();
    expect(entered).toEqual([first.id, second.id]);

    releases.get(second.id)?.();
    const secondResult = await collectSecond;
    expect(secondResult.status).toBe("advice");
    if (secondResult.status === "advice") {
      expect(server.acknowledge(secondResult.token).status).toBe("acknowledged");
      expect(server.finalize(secondResult.token).status).toBe("finalized");
    }
    releases.get(first.id)?.();
    await expect(collectFirst).resolves.toMatchObject({ status: "empty" });
    expect(server.stats()).toMatchObject({
      pendingAdvice: 0,
      retainedBytes: server.accountingMetrics().successfulCacheBytes,
    });
  });

  it("rejects adversarial long-ID expansion before recursive unit materialization", async () => {
    const root = await makeGitFixture();
    const source = mutuallyReferencingTypes();
    await put(root, longNestedPath, source);
    const preflight = analyzerMaterializationPreflight(longNestedPath, source);
    expect(preflight?.declarations).toBe(17);
    expect(preflight?.expandedUnitBytes).toBeGreaterThan(8 * 1024 * 1024);
    const statePath = join(root, "consent");
    const capturePath = join(root, "backend-calls");
    await enable(root, statePath);
    const observation = await Effect.runPromise(adaptCodexDirectEvent(addEvent(root, [longNestedPath])));
    expect(observation).toBeDefined();
    if (observation === undefined) return;
    const dispatch: ResidentDispatchContext = {
      statePath,
      userConfigPath: null,
      credential: null,
      controlled: { capturePath },
    };
    const server = new ResidentServer(residentPaths(join(root, "runtime")));
    expect(server.admit(observation, dispatch).status).toBe("accepted");
    await server.whenIdle();
    expect(server.stats()).toMatchObject({ pendingAdvice: 0, rejectedCapacity: 1, retainedBytes: 0 });
    expect(server.accountingMetrics().maxMaterializedPreparedUnits).toBe(0);
    expect(server.accountingMetrics().peakLedgerBytes).toBeLessThanOrEqual(2 * 1024 * 1024);
    expect(existsSync(capturePath)).toBe(false);
  });

  // The response-envelope assertion needs a single relative path over 2 KiB;
  // Darwin's PATH_MAX prevents creating that fixture as a real filesystem path.
  it.skipIf(process.platform === "darwin")("retains advice when revalidation expansion cannot reserve workspace", async () => {
    const root = await makeGitFixture();
    const original = "type Type0 = number\n";
    await put(root, longNestedPath, original);
    const statePath = join(root, "consent");
    await enable(root, statePath);
    const observation = await Effect.runPromise(adaptCodexDirectEvent(addEvent(root, [longNestedPath])));
    expect(observation).toBeDefined();
    if (observation === undefined) return;
    const dispatch: ResidentDispatchContext = {
      statePath,
      userConfigPath: null,
      credential: null,
      controlled: {
        answers: Object.fromEntries(configuredRules.map((rule) => [
          rule.id,
          { _tag: "Probability", probability: 0.9 },
        ])),
      },
    };
    const server = new ResidentServer(residentPaths(join(root, "runtime")));
    expect(server.admit(observation, dispatch).status).toBe("accepted");
    await server.whenIdle();
    const before = server.stats();
    expect(before.pendingAdvice).toBe(1);

    const expansion = mutuallyReferencingTypes();
    expect(analyzerMaterializationPreflight(longNestedPath, expansion)?.expandedUnitBytes)
      .toBeGreaterThan(8 * 1024 * 1024);
    await put(root, longNestedPath, expansion);
    await expect(server.collect(
      root,
      advicee({ turnId: "pressure", toolUseId: "pressure" }),
      dispatch,
    )).resolves.toMatchObject({ status: "empty" });
    expect(server.stats()).toMatchObject({ pendingAdvice: 1, retainedBytes: before.retainedBytes });

    await put(root, longNestedPath, original);
    const recovered = await server.collect(
      root,
      advicee({ turnId: "recovered", toolUseId: "recovered" }),
      dispatch,
    );
    // The restored advice is current but its long path cannot fit the 2 KiB
    // response envelope. The bounded limitation is informational; advice stays owned.
    expect(recovered).toMatchObject({ status: "advice", findingCount: 0 });
    if (recovered.status === "advice") {
      expect(recovered.output.hookSpecificOutput.additionalContext).toContain("exceeded the host response limit");
    }
    expect(server.stats()).toMatchObject({ pendingAdvice: 2 });
    expect(server.stats().retainedBytes).toBeGreaterThan(before.retainedBytes);
  });

  it("retires A when replacement B registers before A completes", async () => {
    const root = await makeGitFixture();
    await put(root, "type.ts", "type OrderCount = number\n");
    const statePath = join(root, "consent");
    await enable(root, statePath);
    const first = await Effect.runPromise(adaptCodexDirectEvent(addEvent(root)));
    expect(first).toBeDefined();
    if (first === undefined) return;
    const dispatch = findingDispatch(statePath);
    const firstPrepared = deferred();
    const replacementPrepared = deferred();
    const releaseFirstPrepare = deferred();
    const oldEvaluationEntered = deferred();
    const releaseOldEvaluation = deferred();
    let preparation = 0;
    let heldOldEvaluation = false;
    const server = new ResidentServer(
      residentPaths(join(root, "runtime")),
      () => 100,
      {
        afterPrepare: async () => {
          preparation += 1;
          if (preparation === 1) {
            firstPrepared.resolve();
            await releaseFirstPrepare.promise;
          }
          if (preparation === 2) replacementPrepared.resolve();
        },
        beforeEvaluate: async (prepared) => {
          if (!heldOldEvaluation && prepared.input.declaration.source.includes("number")) {
            heldOldEvaluation = true;
            oldEvaluationEntered.resolve();
            await releaseOldEvaluation.promise;
          }
        },
      },
    );
    expect(server.admit(first, dispatch).status).toBe("accepted");
    await firstPrepared.promise;
    await put(root, "type.ts", "type OrderCount = string\n");
    const replacement = await Effect.runPromise(adaptCodexDirectEvent(addEvent(root, ["type.ts"], {
      tool_use_id: "replacement",
    })));
    expect(replacement).toBeDefined();
    if (replacement === undefined) return;
    expect(server.admit(replacement, dispatch).status).toBe("accepted");
    releaseFirstPrepare.resolve();
    await oldEvaluationEntered.promise;
    await replacementPrepared.promise;
    releaseOldEvaluation.resolve();
    await server.whenIdle();

    const metadata = server.pendingAdviceMetadata();
    expect(metadata).toHaveLength(1);
    expect(metadata[0]?.generation).toBe(2);
    const delivered = await server.collect(
      root,
      advicee({ turnId: "later", toolUseId: "replacement-collect" }),
      dispatch,
    );
    expect(delivered.status).toBe("advice");
  });

  it("joins equivalent pending complete inputs before another evaluation reservation", async () => {
    const root = await makeGitFixture();
    await put(root, "type.ts", "type OrderCount = number\n");
    const statePath = join(root, "consent");
    await enable(root, statePath);
    const first = await Effect.runPromise(adaptCodexDirectEvent(addEvent(root)));
    expect(first).toBeDefined();
    if (first === undefined) return;
    const server = new ResidentServer(residentPaths(join(root, "runtime")));
    const capturePath = join(root, "backend-calls");
    const dispatch: ResidentDispatchContext = {
      statePath,
      userConfigPath: null,
      credential: null,
      controlled: {
        capturePath,
        answers: Object.fromEntries(configuredRules.map((rule) => [
          rule.id,
          { _tag: "Probability", probability: 0.9 },
        ])),
      },
    };
    expect(server.admit(first, dispatch).status).toBe("accepted");
    const huge = "x".repeat(32 * 1024);
    for (let index = 0; index < 6; index += 1) {
      const duplicate = {
        ...first,
        advicee: {
          ...first.advicee,
          turnId: `${index}:${huge}`,
          toolUseId: `${index}:${huge}`,
        },
        candidates: first.candidates.map((candidate) => candidate.operation === "add"
          ? { ...candidate, addedLines: [huge] }
          : candidate),
      };
      expect(server.admit(duplicate, dispatch).status).toBe("accepted");
    }
    await server.whenIdle();
    const metadata = server.pendingAdviceMetadata();
    expect(metadata).toHaveLength(1);
    expect(new Set(metadata.map(({ generation }) => generation))).toEqual(new Set([1]));
    expect(new Set(metadata.flatMap(({ evaluationIdentities }) => evaluationIdentities)).size).toBe(1);
    expect(readFileSync(capturePath, "utf8").trim().split("\n")).toHaveLength(1);
    expect(server.accountingMetrics().pendingEvaluations).toBe(0);
    expect(server.stats().retainedBytes).toBe(
      (metadata[0]?.retainedBytes ?? 0) + server.accountingMetrics().successfulCacheBytes,
    );
    expect(server.accountingMetrics().peakLedgerBytes).toBeLessThanOrEqual(2 * 1024 * 1024);
    await expect(server.collect(
      root,
      advicee({ turnId: "after-storm", toolUseId: "after-storm" }),
      dispatch,
    )).resolves.toMatchObject({ status: "advice" });
  });

  it("uses stable advice identity when replacement arrives during collection", async () => {
    const root = await makeGitFixture();
    await put(root, "type.ts", "type OrderCount = number\n");
    const statePath = join(root, "consent");
    await enable(root, statePath);
    const first = await Effect.runPromise(adaptCodexDirectEvent(addEvent(root)));
    expect(first).toBeDefined();
    if (first === undefined) return;
    const entered = deferred();
    const release = deferred();
    let held = false;
    const server = new ResidentServer(
      residentPaths(join(root, "runtime")),
      () => 100,
      { beforeRevalidate: async () => {
        if (held) return;
        held = true;
        entered.resolve();
        await release.promise;
      } },
    );
    const dispatch = findingDispatch(statePath);
    expect(server.admit(first, dispatch).status).toBe("accepted");
    await server.whenIdle();
    const collecting = server.collect(
      root,
      advicee({ turnId: "collecting", toolUseId: "collecting" }),
      dispatch,
    );
    await entered.promise;

    await put(root, "type.ts", "type OrderCount = string\n");
    const replacement = await Effect.runPromise(adaptCodexDirectEvent(addEvent(root, ["type.ts"], {
      tool_use_id: "replacement-during-collect",
    })));
    expect(replacement).toBeDefined();
    if (replacement === undefined) return;
    expect(server.admit(replacement, dispatch).status).toBe("accepted");
    await server.whenIdle();
    release.resolve();
    await expect(collecting).resolves.toMatchObject({ status: "empty" });

    const metadata = server.pendingAdviceMetadata();
    expect(metadata).toHaveLength(1);
    expect(metadata[0]?.generation).toBe(2);
    await expect(server.collect(
      root,
      advicee({ turnId: "later", toolUseId: "replacement" }),
      dispatch,
    )).resolves.toMatchObject({ status: "advice" });
  });

  it("keeps retired advice workspace charged until active revalidation finalizes", async () => {
    const root = await makeGitFixture();
    await put(root, "type.ts", "type OrderCount = number\n");
    const statePath = join(root, "consent");
    await enable(root, statePath);
    const first = await Effect.runPromise(adaptCodexDirectEvent(addEvent(root)));
    expect(first).toBeDefined();
    if (first === undefined) return;
    const workspaceReserved = deferred();
    const releaseRevalidation = deferred();
    let held = false;
    const server = new ResidentServer(
      residentPaths(join(root, "runtime")),
      () => 100,
      { afterRevalidationWorkspaceReserved: async () => {
        if (held) return;
        held = true;
        workspaceReserved.resolve();
        await releaseRevalidation.promise;
      } },
    );
    const dispatch = findingDispatch(statePath);
    expect(server.admit(first, dispatch).status).toBe("accepted");
    await server.whenIdle();
    const baseBytes = server.stats().retainedBytes;
    const collecting = server.collect(
      root,
      advicee({ turnId: "collecting", toolUseId: "collecting" }),
      dispatch,
    );
    await workspaceReserved.promise;
    expect(server.stats().retainedBytes).toBeGreaterThan(baseBytes);

    await put(root, "type.ts", "type OrderCount = string\n");
    const replacement = await Effect.runPromise(adaptCodexDirectEvent(addEvent(root, ["type.ts"], {
      tool_use_id: "replacement-during-active-revalidation",
    })));
    expect(replacement).toBeDefined();
    if (replacement === undefined) return;
    expect(server.admit(replacement, dispatch).status).toBe("accepted");
    await server.whenIdle();
    const replacementAdvice = server.pendingAdviceMetadata();
    expect(replacementAdvice).toHaveLength(1);
    expect(replacementAdvice[0]?.generation).toBe(2);
    const replacementBytes = replacementAdvice[0]?.retainedBytes ?? 0;
    expect(server.stats().retainedBytes).toBeGreaterThan(replacementBytes);

    releaseRevalidation.resolve();
    await expect(collecting).resolves.toMatchObject({ status: "empty" });
    expect(server.stats()).toMatchObject({
      pendingAdvice: 1,
      retainedBytes: replacementBytes + server.accountingMetrics().successfulCacheBytes,
    });
    const delivered = await server.collect(
      root,
      advicee({ turnId: "later", toolUseId: "replacement" }),
      dispatch,
    );
    expect(delivered.status).toBe("advice");
    if (delivered.status !== "advice") return;
    expect(server.acknowledge(delivered.token).status).toBe("acknowledged");
    expect(server.finalize(delivered.token).status).toBe("finalized");
    expect(server.stats()).toMatchObject({
      pendingAdvice: 0,
      retainedBytes: server.accountingMetrics().successfulCacheBytes,
    });
  });

  it("does not let late A cleanup delete C after cached-clear B removes current state", async () => {
    const root = await makeGitFixture();
    const statePath = join(root, "consent");
    const capturePath = join(root, "backend-calls");
    await enable(root, statePath);
    const clearDispatch: ResidentDispatchContext = {
      statePath,
      userConfigPath: null,
      credential: null,
      controlled: { capturePath },
    };
    const finding: ResidentDispatchContext = {
      ...findingDispatch(statePath),
      controlled: {
        capturePath,
        answers: Object.fromEntries(configuredRules.map((rule) => [
          rule.id,
          { _tag: "Probability", probability: 0.9 },
        ])),
      },
    };
    const revalidationHeld = deferred();
    const releaseRevalidation = deferred();
    let holdNextRevalidation = true;
    const server = new ResidentServer(
      residentPaths(join(root, "runtime")),
      () => 100,
      {
        afterRevalidationWorkspaceReserved: async () => {
          if (!holdNextRevalidation) return;
          holdNextRevalidation = false;
          revalidationHeld.resolve();
          await releaseRevalidation.promise;
        },
      },
    );
    const admitSource = async (
      source: string,
      toolUseId: string,
      dispatch: ResidentDispatchContext,
    ) => {
      await put(root, "type.ts", source);
      const observation = await Effect.runPromise(adaptCodexDirectEvent(addEvent(root, ["type.ts"], {
        tool_use_id: toolUseId,
      })));
      expect(observation).toBeDefined();
      if (observation !== undefined) expect(server.admit(observation, dispatch).status).toBe("accepted");
      await server.whenIdle();
    };

    await admitSource("type OrderCount = boolean\n", "seed-B-clear", clearDispatch);
    expect(server.accountingMetrics().successfulCacheEntries).toBe(1);
    await admitSource("type OrderCount = number\n", "A", finding);
    expect(server.pendingAdviceMetadata()).toHaveLength(1);

    const collectingA = server.collect(
      root,
      advicee({ turnId: "held-A", toolUseId: "held-A" }),
      finding,
    );
    await revalidationHeld.promise;

    await admitSource("type OrderCount = boolean\n", "cached-B", finding);
    expect(server.pendingAdviceMetadata()).toHaveLength(0);
    await admitSource("type OrderCount = string\n", "new-C", finding);
    const currentC = server.pendingAdviceMetadata();
    expect(currentC).toHaveLength(1);
    const cGeneration = currentC[0]?.generation;

    releaseRevalidation.resolve();
    await expect(collectingA).resolves.toMatchObject({ status: "empty" });
    expect(server.pendingAdviceMetadata()).toMatchObject([{ generation: cGeneration }]);
    const deliveredC = await server.collect(
      root,
      advicee({ turnId: "C", toolUseId: "C" }),
      finding,
    );
    expect(deliveredC.status).toBe("advice");
    expect(readFileSync(capturePath, "utf8").trim().split("\n")).toHaveLength(3);
  });

  it("skips stale unit advice and returns an independently current multi-file unit", async () => {
    const root = await makeGitFixture();
    await put(root, "b.ts", "type BCount = number\n");
    await put(root, "a.ts", "type ACount = number\n");
    const statePath = join(root, "consent");
    await enable(root, statePath);
    const observation = await Effect.runPromise(adaptCodexDirectEvent(addEvent(root, ["b.ts", "a.ts"])));
    expect(observation).toBeDefined();
    if (observation === undefined) return;
    const server = new ResidentServer(residentPaths(join(root, "runtime")));
    const dispatch = findingDispatch(statePath);
    expect(server.admit(observation, dispatch).status).toBe("accepted");
    await server.whenIdle();
    expect(server.pendingAdviceMetadata()).toHaveLength(2);
    await put(root, "b.ts", "type BCount = string\n");

    const delivered = await server.collect(
      root,
      advicee({ turnId: "later", toolUseId: "multi" }),
      dispatch,
    );
    expect(delivered.status).toBe("advice");
    if (delivered.status === "advice") {
      expect(delivered.output.hookSpecificOutput.additionalContext).toContain("a.ts :: ACount");
      expect(delivered.output.hookSpecificOutput.additionalContext).not.toContain("b.ts :: BCount");
    }
    expect(server.stats().pendingAdvice).toBe(1);
  });

  it("keeps addressed advice pending when current revalidation is unavailable", async () => {
    const root = await makeGitFixture();
    await put(root, "type.ts", "type OrderCount = number\n");
    const statePath = join(root, "consent");
    await enable(root, statePath);
    const observation = await Effect.runPromise(adaptCodexDirectEvent(addEvent(root)));
    expect(observation).toBeDefined();
    if (observation === undefined) return;
    const server = new ResidentServer(residentPaths(join(root, "runtime")));
    const dispatch = findingDispatch(statePath);
    expect(server.admit(observation, dispatch).status).toBe("accepted");
    await server.whenIdle();
    await put(root, "type.ts", "interface Broken { value: Missing }\n");
    await expect(server.collect(
      root,
      advicee({ turnId: "later", toolUseId: "unavailable" }),
      dispatch,
    )).resolves.toMatchObject({ status: "empty" });
    expect(server.stats().pendingAdvice).toBe(1);
    expect(await server.collect(
      root,
      advicee({ subagentId: "other", turnId: "other", toolUseId: "other" }),
      dispatch,
    )).toMatchObject({ status: "empty" });
    expect(server.stats().pendingAdvice).toBe(1);
  });

  it("retires resident advice when complete rule input changes", async () => {
    const root = await makeGitFixture();
    await put(root, "type.ts", "type OrderCount = number\n");
    const rules = (message: string) => JSON.stringify({
      schemaVersion: 1,
      id: "team",
      contentVersion: "1",
      rules: [{
        id: "primitive",
        question: "Does this declaration use a primitive?",
        criteria: { false: "No", true: "Yes" },
        threshold: 0.7,
        message,
        applicability: { includes: ["**/*.ts"] },
      }],
    });
    await put(root, "rules.jsonc", rules("first recommendation"));
    await put(root, ".review.jsonc", JSON.stringify({ version: 1, packs: ["rules.jsonc"] }));
    const statePath = join(root, "consent");
    await enable(root, statePath);
    const observation = await Effect.runPromise(adaptCodexDirectEvent(addEvent(root)));
    expect(observation).toBeDefined();
    if (observation === undefined) return;
    const dispatch: ResidentDispatchContext = {
      ...findingDispatch(statePath),
      controlled: {
        answers: {
          ...Object.fromEntries(configuredRules.map((rule) => [
            rule.id,
            { _tag: "Probability", probability: 0.9 },
          ])),
          "team/primitive": { _tag: "Probability", probability: 0.9 },
        },
      },
    };
    const server = new ResidentServer(residentPaths(join(root, "runtime")));
    expect(server.admit(observation, dispatch).status).toBe("accepted");
    await server.whenIdle();
    expect(server.stats().pendingAdvice).toBe(1);
    await put(root, "rules.jsonc", rules("changed recommendation"));
    await expect(server.collect(
      root,
      advicee({ turnId: "later", toolUseId: "rules" }),
      dispatch,
    )).resolves.toMatchObject({ status: "empty" });
    expect(server.stats()).toMatchObject({
      pendingAdvice: 0,
      retainedBytes: server.accountingMetrics().successfulCacheBytes,
    });
  });

  it("revalidates and finalizes at the 16-item partition saturation boundary", async () => {
    const root = await makeGitFixture();
    const paths = Array.from({ length: 16 }, (_, index) => `type-${index}.ts`);
    for (const [index, path] of paths.entries()) {
      await put(root, path, `type Count${index} = number\n`);
    }
    const statePath = join(root, "consent");
    await enable(root, statePath);
    const observation = await Effect.runPromise(adaptCodexDirectEvent(addEvent(root, paths)));
    expect(observation).toBeDefined();
    if (observation === undefined) return;
    const dispatch = findingDispatch(statePath);
    const server = new ResidentServer(residentPaths(join(root, "runtime")));
    expect(server.admit(observation, dispatch).status).toBe("accepted");
    await server.whenIdle();
    const saturated = server.stats();
    expect(saturated).toMatchObject({ pendingAdvice: 16 });
    const firstBatchBytes = server.pendingAdviceMetadata().slice(0, 5)
      .reduce((total, item) => total + item.retainedBytes, 0);

    const collected = await server.collect(
      root,
      advicee({ turnId: "saturated", toolUseId: "saturated" }),
      dispatch,
    );
    expect(collected.status).toBe("advice");
    if (collected.status !== "advice") return;
    expect(server.acknowledge(collected.token).status).toBe("acknowledged");
    expect(server.finalize(collected.token).status).toBe("finalized");
    expect(server.stats()).toMatchObject({ pendingAdvice: 11 });
    expect(server.stats().retainedBytes).toBe(saturated.retainedBytes - firstBatchBytes);
  });

  // The 64 real repository parses exercise the declared global saturation limit and
  // take about five seconds on the supported arm64 host.
  it("revalidates and finalizes at the 64-item global saturation boundary", async () => {
    const root = await makeGitFixture();
    const statePath = join(root, "consent");
    await enable(root, statePath);
    const dispatch = findingDispatch(statePath);
    const server = new ResidentServer(residentPaths(join(root, "runtime")));
    for (let partition = 0; partition < 4; partition += 1) {
      const paths = Array.from({ length: 16 }, (_, index) => `p${partition}-${index}.ts`);
      for (const [index, path] of paths.entries()) {
        await put(root, path, `type Count${partition}_${index} = number\n`);
      }
      const observation = await Effect.runPromise(adaptCodexDirectEvent(addEvent(root, paths, {
        agent_id: `agent-${partition}`,
        tool_use_id: `partition-${partition}`,
      })));
      expect(observation).toBeDefined();
      if (observation === undefined) return;
      expect(server.admit(observation, dispatch).status).toBe("accepted");
      await server.whenIdle();
    }
    const saturated = server.stats();
    expect(saturated).toMatchObject({ pendingAdvice: 64 });
    const firstBatchBytes = server.pendingAdviceMetadata().filter(({ partition }) =>
      partition.includes('"subagentId":"agent-0"')).slice(0, 5)
      .reduce((total, item) => total + item.retainedBytes, 0);

    const collected = await server.collect(
      root,
      advicee({ subagentId: "agent-0", turnId: "global", toolUseId: "global" }),
      dispatch,
    );
    expect(collected.status).toBe("advice");
    if (collected.status !== "advice") return;
    expect(server.acknowledge(collected.token).status).toBe("acknowledged");
    expect(server.finalize(collected.token).status).toBe("finalized");
    expect(server.stats()).toMatchObject({ pendingAdvice: 59 });
    expect(server.stats().retainedBytes).toBe(saturated.retainedBytes - firstBatchBytes);
  }, 10_000);

  it("scans past unavailable advice to independently current advice once per collection", async () => {
    const root = await makeGitFixture();
    await put(root, "a.ts", "type ACount = number\n");
    await put(root, "b.ts", "type BCount = number\n");
    const statePath = join(root, "consent");
    await enable(root, statePath);
    const observation = await Effect.runPromise(adaptCodexDirectEvent(addEvent(root, ["a.ts", "b.ts"])));
    expect(observation).toBeDefined();
    if (observation === undefined) return;
    const dispatch = findingDispatch(statePath);
    const visits: Array<string> = [];
    const server = new ResidentServer(
      residentPaths(join(root, "runtime")),
      () => 100,
      { beforeRevalidate: async (id) => { visits.push(id); } },
    );
    expect(server.admit(observation, dispatch).status).toBe("accepted");
    await server.whenIdle();
    const before = server.pendingAdviceMetadata();
    expect(before.map(({ path }) => path)).toEqual(["a.ts", "b.ts"]);
    await put(root, "a.ts", "interface Broken { value: Missing }\n");

    const collected = await server.collect(
      root,
      advicee({ turnId: "scan", toolUseId: "scan" }),
      dispatch,
    );
    expect(collected.status).toBe("advice");
    if (collected.status !== "advice") return;
    expect(collected.output.hookSpecificOutput.additionalContext).toContain("b.ts :: BCount");
    expect(visits).toEqual(before.map(({ id }) => id));
    const after = server.pendingAdviceMetadata();
    expect(after.find(({ path }) => path === "a.ts")?.delivery).toBe("available");
    expect(after.find(({ path }) => path === "b.ts")?.delivery).toBe("leased-unacknowledged");
    expect(server.acknowledge(collected.token).status).toBe("acknowledged");
    expect(server.finalize(collected.token).status).toBe("finalized");
    expect(server.pendingAdviceMetadata()).toMatchObject([{ path: "a.ts", delivery: "available" }]);
  });

  it("reuses successful clear evaluations but never failures or malformed responses", async () => {
    const root = await makeGitFixture();
    await put(root, "type.ts", "type OrderCount = number\n");
    const statePath = join(root, "consent");
    await enable(root, statePath);
    const server = new ResidentServer(residentPaths(join(root, "runtime")));
    const clearCalls = join(root, "clear-calls");
    const clearDispatch: ResidentDispatchContext = {
      statePath,
      userConfigPath: null,
      credential: null,
      controlled: { capturePath: clearCalls },
    };
    for (const [index, toolUseId] of ["clear-1", "clear-2"].entries()) {
      if (index === 1) {
        await put(root, "type.ts", "// a different whole-file snapshot\ntype OrderCount = number\n");
      }
      const observation = await Effect.runPromise(adaptCodexDirectEvent(addEvent(root, ["type.ts"], {
        tool_use_id: toolUseId,
      })));
      expect(observation).toBeDefined();
      if (observation !== undefined) expect(server.admit(observation, clearDispatch).status).toBe("accepted");
      await server.whenIdle();
    }
    expect(readFileSync(clearCalls, "utf8").trim().split("\n")).toHaveLength(1);
    expect(server.stats().pendingAdvice).toBe(0);
    expect(server.accountingMetrics()).toMatchObject({ successfulCacheEntries: 1 });

    const malformedCalls = join(root, "malformed-calls");
    const malformedDispatch: ResidentDispatchContext = {
      ...clearDispatch,
      controlled: {
        capturePath: malformedCalls,
        answers: Object.fromEntries(configuredRules.map((rule) => [
          rule.id,
          { _tag: "Probability", probability: 9 },
        ])),
      },
    };
    await put(root, "type.ts", "type OrderCount = string\n");
    for (const toolUseId of ["malformed-1", "malformed-2"]) {
      const observation = await Effect.runPromise(adaptCodexDirectEvent(addEvent(root, ["type.ts"], {
        tool_use_id: toolUseId,
      })));
      expect(observation).toBeDefined();
      if (observation !== undefined) expect(server.admit(observation, malformedDispatch).status).toBe("accepted");
      await server.whenIdle();
    }
    expect(readFileSync(malformedCalls, "utf8").trim().split("\n")).toHaveLength(2);
    expect(server.accountingMetrics().successfulCacheEntries).toBe(1);
  });

  it("restores cached A after A to B to A without retaining delivery history", async () => {
    const root = await makeGitFixture();
    const statePath = join(root, "consent");
    const capturePath = join(root, "backend-calls");
    await enable(root, statePath);
    const dispatch: ResidentDispatchContext = {
      statePath,
      userConfigPath: null,
      credential: null,
      controlled: {
        capturePath,
        answers: Object.fromEntries(configuredRules.map((rule) => [
          rule.id,
          { _tag: "Probability", probability: 0.9 },
        ])),
      },
    };
    const server = new ResidentServer(residentPaths(join(root, "runtime")));
    const admitSource = async (source: string, toolUseId: string) => {
      await put(root, "type.ts", source);
      const observation = await Effect.runPromise(adaptCodexDirectEvent(addEvent(root, ["type.ts"], {
        tool_use_id: toolUseId,
      })));
      expect(observation).toBeDefined();
      if (observation !== undefined) expect(server.admit(observation, dispatch).status).toBe("accepted");
      await server.whenIdle();
    };
    await admitSource("type OrderCount = number\n", "A-1");
    const firstAIdentity = server.pendingAdviceMetadata()[0]?.evaluationIdentities[0];
    const deliveredA = await server.collect(root, advicee({ turnId: "A", toolUseId: "A" }), dispatch);
    expect(deliveredA.status).toBe("advice");
    if (deliveredA.status === "advice") {
      expect(server.acknowledge(deliveredA.token).status).toBe("acknowledged");
      expect(server.finalize(deliveredA.token).status).toBe("finalized");
    }
    await admitSource("type OrderCount = string\n", "B");
    expect(server.pendingAdviceMetadata()).toHaveLength(1);
    await admitSource("type OrderCount = number\n", "A-2");
    const restored = server.pendingAdviceMetadata();
    expect(restored).toHaveLength(1);
    expect(restored[0]?.evaluationIdentities).toEqual([firstAIdentity]);
    expect(readFileSync(capturePath, "utf8").trim().split("\n")).toHaveLength(2);
    expect(server.accountingMetrics()).toMatchObject({ successfulCacheEntries: 2, pendingEvaluations: 0 });
  });

  it("bounds successful reuse by entry and byte limits and reevaluates evicted input", async () => {
    const root = await makeGitFixture();
    const statePath = join(root, "consent");
    const capturePath = join(root, "backend-calls");
    await enable(root, statePath);
    const dispatch: ResidentDispatchContext = {
      statePath,
      userConfigPath: null,
      credential: null,
      controlled: { capturePath },
    };
    const server = new ResidentServer(residentPaths(join(root, "runtime")));
    const admit = async (index: number, toolUseId: string) => {
      await put(root, "type.ts", `type Shape${index} = ${index}\n`);
      const observation = await Effect.runPromise(adaptCodexDirectEvent(addEvent(root, ["type.ts"], {
        tool_use_id: toolUseId,
      })));
      expect(observation).toBeDefined();
      if (observation !== undefined) expect(server.admit(observation, dispatch).status).toBe("accepted");
      await server.whenIdle();
    };
    for (let index = 0; index < 10; index += 1) await admit(index, `unique-${index}`);
    expect(server.accountingMetrics().successfulCacheEntries).toBeLessThanOrEqual(8);
    expect(server.accountingMetrics().successfulCacheBytes).toBeLessThanOrEqual(128 * 1024);
    await admit(0, "restored-evicted");
    expect(readFileSync(capturePath, "utf8").trim().split("\n")).toHaveLength(11);
  });

  // Large near-frame identities and full revalidation batches measure at 5.0-5.2
  // seconds on the supported arm64 host, so only these stress cases get 10 seconds.
  it("charges a valid near-frame identity for every unit and rejects excess truthfully", async () => {
    const root = await makeGitFixture();
    await put(root, "type.ts", Array.from(
      { length: 8 },
      (_, index) => `type NearFrame${index} = number`,
    ).join("\n"));
    const statePath = join(root, "consent");
    const capturePath = join(root, "backend-calls");
    await enable(root, statePath);
    const base = await Effect.runPromise(adaptCodexDirectEvent(addEvent(root)));
    expect(base).toBeDefined();
    if (base === undefined) return;
    // Both identifiers are valid at the 16,384-code-unit protocol ceiling
    // while their combined UTF-8 representation is 96 KiB.
    const sessionId = "漢".repeat(16_384);
    const subagentId = "界".repeat(16_384);
    const padding = "p".repeat(56 * 1024);
    const observation = {
      ...base,
      advicee: { ...base.advicee, sessionId, subagentId },
      candidates: base.candidates.map((candidate) => candidate.operation === "add"
        ? { ...candidate, addedLines: [padding] }
        : candidate),
    };
    const dispatch: ResidentDispatchContext = {
      statePath,
      userConfigPath: null,
      credential: null,
      controlled: {
        capturePath,
        answers: Object.fromEntries(configuredRules.map((rule) => [
          rule.id,
          { _tag: "Probability", probability: 0.9 },
        ])),
      },
    };
    const server = new ResidentServer(residentPaths(join(root, "runtime")));
    const encoded = JSON.stringify({
      version: 1,
      operation: "admit",
      lifetime: server.lifetime,
      observation,
      controlledWriter: true,
      dispatch,
    });
    expect(Buffer.byteLength(encoded, "utf8")).toBeGreaterThan(150 * 1024);
    const decoded = decodeResidentRequest(encoded);
    expect(decoded?.operation).toBe("admit");
    if (decoded?.operation !== "admit") return;
    expect(server.admit(decoded.observation, decoded.dispatch).status).toBe("accepted");
    await server.whenIdle();

    const metadata = server.pendingAdviceMetadata();
    expect(metadata.length).toBeGreaterThan(0);
    expect(metadata.length).toBeLessThan(8);
    expect(server.stats().rejectedCapacity).toBeGreaterThan(0);
    expect(server.stats().retainedBytes).toBe(
      metadata.reduce((total, item) => total + item.retainedBytes, 0) +
        server.accountingMetrics().successfulCacheBytes +
        server.accountingMetrics().operationalNoticeBytes,
    );
    expect(server.stats().retainedBytes).toBeLessThanOrEqual(2 * 1024 * 1024);
    expect(server.accountingMetrics().peakLedgerBytes).toBeLessThanOrEqual(2 * 1024 * 1024);
    expect(readFileSync(capturePath, "utf8").trim().split("\n")).toHaveLength(metadata.length);

    expect(await server.collect(
      root,
      { ...observation.advicee, subagentId: `${subagentId.slice(0, -1)}z` },
      dispatch,
    )).toMatchObject({ status: "empty" });
    expect(server.pendingAdviceMetadata().map(({ id, delivery }) => ({ id, delivery }))).toEqual(
      metadata.map(({ id }) => ({ id, delivery: "available" })),
    );
    const otherRoot = await makeGitFixture();
    expect(await server.collect(otherRoot, observation.advicee, dispatch)).toMatchObject({ status: "empty" });
    expect(server.pendingAdviceMetadata().map(({ id, delivery }) => ({ id, delivery }))).toEqual(
      metadata.map(({ id }) => ({ id, delivery: "available" })),
    );
  }, 10_000);
});

describe("resident bounded advice batches", () => {
  it("delivers at most five findings from one unit and retains the unsent portion", async () => {
    const root = await makeGitFixture();
    await put(root, "type.ts", "type OrderCount = number\n");
    const statePath = join(root, "consent");
    await enable(root, statePath);
    const observation = await Effect.runPromise(adaptCodexDirectEvent(addEvent(root)));
    expect(observation).toBeDefined();
    if (observation === undefined) return;
    const dispatch = allFindingsDispatch(statePath);
    const server = new ResidentServer(residentPaths(join(root, "runtime")), () => 100);
    expect(server.admit(observation, dispatch).status).toBe("accepted");
    await server.whenIdle();
    const retainedBytes = server.stats().retainedBytes;

    const first = await server.collect(root, advicee({ turnId: "first", toolUseId: "first" }), dispatch);
    expect(first.status).toBe("advice");
    if (first.status !== "advice") return;
    expect(first.output.hookSpecificOutput.additionalContext.split("\n").slice(1)).toHaveLength(5);
    expect(server.pendingAdviceMetadata()).toMatchObject([{
      pendingFindings: 9,
      deliveryFindings: 5,
    }]);
    expect(server.acknowledge(first.token).status).toBe("acknowledged");
    expect(server.finalize(first.token).status).toBe("finalized");
    expect(server.stats()).toMatchObject({ pendingAdvice: 1, retainedBytes });
    expect(server.pendingAdviceMetadata()).toMatchObject([{
      pendingFindings: 4,
      deliveryFindings: 0,
      delivery: "available",
    }]);

    const second = await server.collect(root, advicee({ turnId: "second", toolUseId: "second" }), dispatch);
    expect(second.status).toBe("advice");
    if (second.status !== "advice") return;
    expect(second.output.hookSpecificOutput.additionalContext.split("\n").slice(1)).toHaveLength(4);
    expect(server.acknowledge(second.token).status).toBe("acknowledged");
    expect(server.finalize(second.token).status).toBe("finalized");
    expect(server.stats()).toMatchObject({
      pendingAdvice: 0,
      retainedBytes: server.accountingMetrics().successfulCacheBytes,
    });
  }, 10_000);

  it("revalidates the final selection after later candidate work completes", async () => {
    const root = await makeGitFixture();
    await put(root, "a.ts", "type ACount = number\n");
    await put(root, "b.ts", "type BCount = number\n");
    const statePath = join(root, "consent");
    await enable(root, statePath);
    const observation = await Effect.runPromise(adaptCodexDirectEvent(addEvent(root, ["a.ts", "b.ts"])));
    expect(observation).toBeDefined();
    if (observation === undefined) return;
    const dispatch = singleFindingDispatch(statePath);
    const blocked = deferred();
    const release = deferred();
    let bId = "";
    const server = new ResidentServer(residentPaths(join(root, "runtime")), () => 100, {
      beforeRevalidate: async (id) => {
        if (id !== bId) return;
        blocked.resolve();
        await release.promise;
      },
    });
    expect(server.admit(observation, dispatch).status).toBe("accepted");
    await server.whenIdle();
    const metadata = server.pendingAdviceMetadata();
    bId = metadata.find(({ path }) => path === "b.ts")?.id ?? "";
    expect(bId).not.toBe("");

    const collecting = server.collect(
      root,
      advicee({ turnId: "collect", toolUseId: "collect" }),
      dispatch,
    );
    await blocked.promise;
    // A passed the first revalidation before B blocked. The final pass must
    // observe this change rather than publishing A's now-stale finding.
    await put(root, "a.ts", "type ACount = string\n");
    release.resolve();
    const collected = await collecting;
    expect(collected.status).toBe("advice");
    if (collected.status !== "advice") return;
    expect(collected.output.hookSpecificOutput.additionalContext).not.toContain("a.ts :: ACount");
    expect(collected.output.hookSpecificOutput.additionalContext).toContain("b.ts :: BCount");
    expect(server.pendingAdviceMetadata().map(({ path }) => path)).toEqual(["b.ts"]);
  }, 10_000);

  it("filters an earlier item that reaches expiry while a later final revalidation waits", async () => {
    const root = await makeGitFixture();
    await put(root, "a.ts", "type ACount = number\n");
    await put(root, "b.ts", "type BCount = number\n");
    const statePath = join(root, "consent");
    await enable(root, statePath);
    const firstObservation = await Effect.runPromise(adaptCodexDirectEvent(addEvent(root, ["a.ts"])));
    const secondObservation = await Effect.runPromise(adaptCodexDirectEvent(addEvent(root, ["b.ts"], {
      tool_use_id: "expiry-b",
    })));
    expect(firstObservation).toBeDefined();
    expect(secondObservation).toBeDefined();
    if (firstObservation === undefined || secondObservation === undefined) return;
    let clock = 0;
    let bId = "";
    const blocked = deferred();
    const release = deferred();
    const server = new ResidentServer(residentPaths(join(root, "runtime")), () => clock, {
      beforeFinalRevalidate: async (id) => {
        if (id !== bId) return;
        blocked.resolve();
        await release.promise;
      },
    });
    const dispatch = singleFindingDispatch(statePath);
    expect(server.admit(firstObservation, dispatch).status).toBe("accepted");
    await server.whenIdle();
    clock = 1;
    expect(server.admit(secondObservation, dispatch).status).toBe("accepted");
    await server.whenIdle();
    bId = server.pendingAdviceMetadata().find(({ path }) => path === "b.ts")?.id ?? "";
    expect(bId).not.toBe("");

    clock = PENDING_ADVICE_EXPIRY_MS - 1;
    const collecting = server.collect(
      root,
      advicee({ turnId: "expiry", toolUseId: "expiry" }),
      dispatch,
    );
    await blocked.promise;
    clock = PENDING_ADVICE_EXPIRY_MS;
    release.resolve();
    const collected = await collecting;
    expect(collected.status).toBe("advice");
    if (collected.status !== "advice") return;
    expect(collected.output.hookSpecificOutput.additionalContext).not.toContain("a.ts :: ACount");
    expect(collected.output.hookSpecificOutput.additionalContext).toContain("b.ts :: BCount");
    expect(server.pendingAdviceMetadata().map(({ path }) => path)).toEqual(["b.ts"]);
  }, 10_000);

  it("filters an earlier item superseded while a later final revalidation waits", async () => {
    const root = await makeGitFixture();
    await put(root, "a.ts", "type ACount = number\n");
    await put(root, "b.ts", "type BCount = number\n");
    const statePath = join(root, "consent");
    await enable(root, statePath);
    const observation = await Effect.runPromise(adaptCodexDirectEvent(addEvent(root, ["a.ts", "b.ts"])));
    expect(observation).toBeDefined();
    if (observation === undefined) return;
    let bId = "";
    const blocked = deferred();
    const release = deferred();
    const server = new ResidentServer(residentPaths(join(root, "runtime")), () => 100, {
      beforeFinalRevalidate: async (id) => {
        if (id !== bId) return;
        blocked.resolve();
        await release.promise;
      },
    });
    const dispatch = singleFindingDispatch(statePath);
    expect(server.admit(observation, dispatch).status).toBe("accepted");
    await server.whenIdle();
    const initial = server.pendingAdviceMetadata();
    const oldAId = initial.find(({ path }) => path === "a.ts")?.id ?? "";
    bId = initial.find(({ path }) => path === "b.ts")?.id ?? "";
    expect(oldAId).not.toBe("");
    expect(bId).not.toBe("");

    const collecting = server.collect(
      root,
      advicee({ turnId: "replacement", toolUseId: "replacement" }),
      dispatch,
    );
    await blocked.promise;
    await put(root, "a.ts", "type ACount = string\n");
    const replacement = await Effect.runPromise(adaptCodexDirectEvent(addEvent(root, ["a.ts"], {
      tool_use_id: "replacement-a",
    })));
    expect(replacement).toBeDefined();
    if (replacement === undefined) return;
    expect(server.admit(replacement, dispatch).status).toBe("accepted");
    await server.whenIdle();
    expect(server.pendingAdviceMetadata().some(({ id, path }) => path === "a.ts" && id !== oldAId)).toBe(true);
    release.resolve();

    const collected = await collecting;
    expect(collected.status).toBe("advice");
    if (collected.status !== "advice") return;
    expect(collected.output.hookSpecificOutput.additionalContext).not.toContain("a.ts :: ACount");
    expect(collected.output.hookSpecificOutput.additionalContext).toContain("b.ts :: BCount");
    expect(server.pendingAdviceMetadata().some(({ id }) => id === oldAId)).toBe(false);
  });

  it("ages each dispatch cycle independently when older overflow remains", async () => {
    const root = await makeGitFixture();
    await put(root, "a.ts", "type ACount = number\n");
    await put(root, "b.ts", "type BCount = number\n");
    await put(root, "c.ts", "type CCount = number\n");
    const statePath = join(root, "consent");
    await enable(root, statePath);
    const firstObservation = await Effect.runPromise(adaptCodexDirectEvent(addEvent(root, ["a.ts"])));
    const secondObservation = await Effect.runPromise(adaptCodexDirectEvent(addEvent(root, ["b.ts", "c.ts"], {
      tool_use_id: "second-cycle",
    })));
    expect(firstObservation).toBeDefined();
    expect(secondObservation).toBeDefined();
    if (firstObservation === undefined || secondObservation === undefined) return;
    let clock = 100;
    const cEntered = deferred();
    const releaseC = deferred();
    const bPending = deferred();
    let pendingCount = 0;
    const server = new ResidentServer(residentPaths(join(root, "runtime")), () => clock, {
      beforeEvaluate: async (prepared) => {
        if (prepared.input.path !== "c.ts") return;
        cEntered.resolve();
        await releaseC.promise;
      },
      afterAdvicePending: () => {
        pendingCount += 1;
        if (pendingCount === 2) bPending.resolve();
      },
    });
    expect(server.admit(firstObservation, allFindingsDispatch(statePath)).status).toBe("accepted");
    await server.whenIdle();
    const first = await server.collect(
      root,
      advicee({ turnId: "cycle-1", toolUseId: "cycle-1" }),
      allFindingsDispatch(statePath),
    );
    expect(first.status).toBe("advice");
    if (first.status !== "advice") return;
    expect(server.acknowledge(first.token).status).toBe("acknowledged");
    expect(server.finalize(first.token).status).toBe("finalized");
    expect(server.pendingAdviceMetadata()).toMatchObject([{
      path: "a.ts",
      pendingFindings: 4,
      collectionEligible: true,
    }]);

    expect(server.admit(secondObservation, singleFindingDispatch(statePath)).status).toBe("accepted");
    await cEntered.promise;
    await bPending.promise;
    const overflow = await server.collect(
      root,
      advicee({ turnId: "overlap", toolUseId: "overlap" }),
      singleFindingDispatch(statePath),
    );
    expect(overflow.status).toBe("advice");
    if (overflow.status !== "advice") return;
    expect(overflow.output.hookSpecificOutput.additionalContext).toContain("a.ts :: ACount");
    expect(overflow.output.hookSpecificOutput.additionalContext).not.toContain("b.ts :: BCount");
    expect(server.acknowledge(overflow.token).status).toBe("acknowledged");
    expect(server.finalize(overflow.token).status).toBe("finalized");
    await expect(server.collect(
      root,
      advicee({ turnId: "too-early", toolUseId: "too-early" }),
      singleFindingDispatch(statePath),
    )).resolves.toMatchObject({ status: "empty" });

    clock += ADVICE_COLLECTION_WINDOW_MS;
    const aged = await server.collect(
      root,
      advicee({ turnId: "aged", toolUseId: "aged" }),
      singleFindingDispatch(statePath),
    );
    expect(aged.status).toBe("advice");
    if (aged.status === "advice") {
      expect(aged.output.hookSpecificOutput.additionalContext).toContain("b.ts :: BCount");
    }
    releaseC.resolve();
    await server.whenIdle();
  });

  it("uses finite-cycle completion, then exact oldest-result aging, without waiting for new work", async () => {
    const root = await makeGitFixture();
    await put(root, "a.ts", "type ACount = number\n");
    await put(root, "b.ts", "type BCount = number\n");
    await put(root, "c.ts", "type CCount = number\n");
    const statePath = join(root, "consent");
    await enable(root, statePath);
    const observation = await Effect.runPromise(adaptCodexDirectEvent(addEvent(root, ["a.ts", "b.ts", "c.ts"])));
    expect(observation).toBeDefined();
    if (observation === undefined) return;
    let clock = 10_000;
    const releases = new Map<string, () => void>();
    const entered: Array<string> = [];
    const firstTwoEntered = deferred();
    const allEntered = deferred();
    const firstAdvicePending = deferred();
    const secondAdvicePending = deferred();
    let pending = 0;
    const server = new ResidentServer(residentPaths(join(root, "runtime")), () => clock, {
      beforeEvaluate: (prepared) => new Promise<void>((resolve) => {
        entered.push(prepared.input.path);
        releases.set(prepared.input.path, resolve);
        if (entered.length === 2) firstTwoEntered.resolve();
        if (entered.length === 3) allEntered.resolve();
      }),
      afterAdvicePending: () => {
        pending += 1;
        if (pending === 1) firstAdvicePending.resolve();
        if (pending === 2) secondAdvicePending.resolve();
      },
    });
    const dispatch = findingDispatch(statePath);
    expect(server.admit(observation, dispatch).status).toBe("accepted");
    await firstTwoEntered.promise;
    releases.get("a.ts")?.();
    await firstAdvicePending.promise;
    await allEntered.promise;
    expect(server.pendingAdviceMetadata()).toMatchObject([{
      path: "a.ts",
      cycleComplete: false,
      pendingAt: 10_000,
    }]);

    await expect(server.collect(root, advicee({ turnId: "early", toolUseId: "early" }), dispatch))
      .resolves.toMatchObject({ status: "empty" });
    clock += ADVICE_COLLECTION_WINDOW_MS - 1;
    await expect(server.collect(root, advicee({ turnId: "before", toolUseId: "before" }), dispatch))
      .resolves.toMatchObject({ status: "empty" });
    releases.get("b.ts")?.();
    await secondAdvicePending.promise;
    clock += 1;
    const aged = await server.collect(root, advicee({ turnId: "at", toolUseId: "at" }), dispatch);
    expect(aged.status).toBe("advice");
    if (aged.status === "advice") {
      expect(aged.output.hookSpecificOutput.additionalContext).toContain("a.ts :: ACount");
      expect(aged.output.hookSpecificOutput.additionalContext).toContain("b.ts :: BCount");
      expect(server.acknowledge(aged.token).status).toBe("acknowledged");
      expect(server.finalize(aged.token).status).toBe("finalized");
    }
    expect(server.pendingAdviceMetadata()).toEqual([]);
    releases.get("c.ts")?.();
    await server.whenIdle();
    expect(server.pendingAdviceMetadata()).toMatchObject([{ path: "c.ts", cycleComplete: true }]);
  });

  it("returns only the ready subset for bounded turn-end collection without draining", async () => {
    const root = await makeGitFixture();
    await put(root, "a.ts", "type ACount = number\n");
    await put(root, "b.ts", "type BCount = number\n");
    const statePath = join(root, "consent");
    await enable(root, statePath);
    const observation = await Effect.runPromise(adaptCodexDirectEvent(addEvent(root, ["a.ts", "b.ts"])));
    expect(observation).toBeDefined();
    if (observation === undefined) return;
    const releases = new Map<string, () => void>();
    const bothEntered = deferred();
    const ready = deferred();
    let entered = 0;
    const server = new ResidentServer(residentPaths(join(root, "runtime")), () => 100, {
      beforeEvaluate: (prepared) => new Promise<void>((resolve) => {
        releases.set(prepared.input.path, resolve);
        entered += 1;
        if (entered === 2) bothEntered.resolve();
      }),
      afterAdvicePending: () => { ready.resolve(); },
    });
    const dispatch = findingDispatch(statePath);
    expect(server.admit(observation, dispatch).status).toBe("accepted");
    await bothEntered.promise;
    releases.get("a.ts")?.();
    await ready.promise;
    await expect(server.collect(
      root,
      advicee({ turnId: "turn-end", toolUseId: "turn-end" }),
      dispatch,
      "ordinary",
    )).resolves.toMatchObject({ status: "empty" });
    const turnEnd = await server.collect(
      root,
      advicee({ turnId: "turn-end", toolUseId: "turn-end" }),
      dispatch,
      "turn-end",
    );
    expect(turnEnd.status).toBe("advice");
    expect(server.stats()).toMatchObject({ running: 1, pendingAdvice: 1 });
    if (turnEnd.status === "advice") server.releaseDelivery(turnEnd.token);
    releases.get("b.ts")?.();
    await server.whenIdle();
  });

  it("combines five deterministic items and retains count overflow for a later reply", async () => {
    const root = await makeGitFixture();
    const paths = Array.from({ length: 6 }, (_, index) => `type-${index}.ts`);
    for (const [index, path] of paths.entries()) await put(root, path, `type Count${index} = number\n`);
    const statePath = join(root, "consent");
    await enable(root, statePath);
    const observation = await Effect.runPromise(adaptCodexDirectEvent(addEvent(root, paths)));
    expect(observation).toBeDefined();
    if (observation === undefined) return;
    const dispatch = singleFindingDispatch(statePath);
    const server = new ResidentServer(residentPaths(join(root, "runtime")), () => 500);
    expect(server.admit(observation, dispatch).status).toBe("accepted");
    await server.whenIdle();

    const first = await server.collect(root, advicee({ turnId: "batch-1", toolUseId: "batch-1" }), dispatch);
    expect(first.status).toBe("advice");
    if (first.status !== "advice") return;
    expect(encodedHostOutputBytes(first.output)).toBeLessThanOrEqual(MAX_COMBINED_RESPONSE_BYTES);
    for (let index = 0; index < 5; index += 1) {
      expect(first.output.hookSpecificOutput.additionalContext).toContain(`type-${index}.ts :: Count${index}`);
    }
    expect(first.output.hookSpecificOutput.additionalContext).not.toContain("type-5.ts :: Count5");
    expect(server.pendingAdviceMetadata().filter(({ delivery }) => delivery !== "available")).toHaveLength(5);
    server.releaseDelivery(first.token);
    expect(server.pendingAdviceMetadata().every(({ delivery }) => delivery === "available")).toBe(true);
    const retried = await server.collect(
      root,
      advicee({ turnId: "batch-retry", toolUseId: "batch-retry" }),
      dispatch,
    );
    expect(retried.status).toBe("advice");
    if (retried.status !== "advice") return;
    expect(retried.output).toEqual(first.output);
    expect(server.acknowledge(retried.token).status).toBe("acknowledged");
    expect(server.finalize(retried.token).status).toBe("finalized");
    expect(server.pendingAdviceMetadata()).toMatchObject([{ path: "type-5.ts", delivery: "available" }]);

    const second = await server.collect(root, advicee({ turnId: "batch-2", toolUseId: "batch-2" }), dispatch);
    expect(second.status).toBe("advice");
    if (second.status === "advice") {
      expect(second.output.hookSpecificOutput.additionalContext).toContain("type-5.ts :: Count5");
    }
  });

  it("expires pending advice just before, at, and after the relevance boundary", async () => {
    const run = async (age: number) => {
      const root = await makeGitFixture();
      await put(root, "type.ts", "type OrderCount = number\n");
      const statePath = join(root, "consent");
      await enable(root, statePath);
      const observation = await Effect.runPromise(adaptCodexDirectEvent(addEvent(root)));
      expect(observation).toBeDefined();
      if (observation === undefined) throw new Error("fixture adaptation failed");
      let clock = 1_000;
      const server = new ResidentServer(residentPaths(join(root, "runtime")), () => clock);
      const dispatch = findingDispatch(statePath);
      expect(server.admit(observation, dispatch).status).toBe("accepted");
      await server.whenIdle();
      clock += age;
      const collected = await server.collect(
        root,
        advicee({ turnId: `age-${age}`, toolUseId: `age-${age}` }),
        dispatch,
      );
      return { collected, server };
    };

    const before = await run(PENDING_ADVICE_EXPIRY_MS - 1);
    expect(before.collected.status).toBe("advice");
    const at = await run(PENDING_ADVICE_EXPIRY_MS);
    expect(at.collected.status).toBe("empty");
    expect(at.server.stats()).toMatchObject({
      pendingAdvice: 0,
      retainedBytes: at.server.accountingMetrics().successfulCacheBytes,
    });
    const after = await run(PENDING_ADVICE_EXPIRY_MS + 1);
    expect(after.collected.status).toBe("empty");
    expect(after.server.stats()).toMatchObject({
      pendingAdvice: 0,
      retainedBytes: after.server.accountingMetrics().successfulCacheBytes,
    });
  });
});
