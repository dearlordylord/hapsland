import { Layer, Ref } from "effect";
import { ResidentPreparationControls, PreparationControlError, defaultPreparationControls } from "./preparation-controls.ts";
import { makePreparationControls } from "../test-support/preparation-controls.ts";
import { acquireResidentFixture, type ResidentRuntime } from "./runtime-fixture.ts";
import { describe, expect, it } from "vitest";
import * as Effect from "effect/Effect";
import { join } from "node:path";
import { createConnection } from "node:net";
import { writeFileSync } from "node:fs";
import { readActivity } from "../activity/status.ts";
import { adaptClaudeDirectEvent } from "../direct-event/adapter.ts";
import { makeGitFixture, put } from "../direct-event/test-fixtures.ts";
import { configuredRules } from "../policy/rules.ts";
import { residentPaths } from "./paths.ts";

import { monotonicNow } from "./hook-clock.ts";
import { PENDING_ADVICE_EXPIRY_MS } from "./collection.ts";
import type { ResidentDispatchContext, ResidentRequest, ResidentCollectionTicket } from "./protocol.ts";

const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
};

const fixture = async () => {
  const root = await makeGitFixture();
  const path = await put(root, "type.ts", "type OrderCount = number\n");
  const statePath = join(root, "consent");
  const observation = await Effect.runPromise(adaptClaudeDirectEvent({
    hook_event_name: "PostToolUse", tool_name: "Write", cwd: root,
    session_id: "session", tool_use_id: "tool-one",
    tool_input: { file_path: path, content: "type OrderCount = number\n" },
    tool_response: { filePath: path, content: "type OrderCount = number\n", originalFile: null, userModified: false },
  }));
  if (observation === undefined) throw new Error("fixture not adapted");
  const dispatch = (probability: number, failure?: string): ResidentDispatchContext => ({
    statePath, userConfigPath: null, credential: null,
    controlled: { answers: Object.fromEntries(configuredRules.map((rule) => [
      rule.id, { _tag: "Probability", probability },
    ])), ...(failure === undefined ? {} : { failure }) },
  });
  return { root, observation, dispatch };
};

const collect = (server: ResidentRuntime, ticket: ResidentCollectionTicket,
  data: Awaited<ReturnType<typeof fixture>>, dispatch: ResidentDispatchContext,
  advicee = data.observation.advicee) => server.handle({
    requestRoute: "ticketed", operation: "collect", lifetime: server.lifetime, ticket,
    root: data.root, advicee, dispatch, composed: true,
  } satisfies ResidentRequest);

const collectOverSocket = (server: ResidentRuntime, ticket: ResidentCollectionTicket,
  data: Awaited<ReturnType<typeof fixture>>, dispatch: ResidentDispatchContext, version: number | null = 1) =>
  new Promise<{ status: string; reason?: string }>((resolve, reject) => {
    const socket = createConnection(server.paths.socket);
    let response = "";
    socket.on("error", reject);
    socket.on("data", (chunk) => { response += chunk.toString("utf8"); });
    socket.on("end", () => {
      try { resolve(JSON.parse(response.trim()) as { status: string; reason?: string }); }
      catch (error) { reject(error); }
    });
    socket.on("connect", () => socket.write(`${JSON.stringify({
      version, operation: "collect", lifetime: server.lifetime, ticket,
      root: data.root, advicee: data.observation.advicee, dispatch, composed: true,
    })}\n`));
  });

// Direct admission isolates ticket evaluation and collection from the pre-edit IPC lifecycle.
// Public permit enforcement is covered by the server and Claude delivery socket tests.
describe("Claude terminal collection", () => {
  it("rejects an invalid socket collection version without reporting a review result", async () => {
    const data = await fixture();
    const server = await acquireResidentFixture(residentPaths(join(data.root, "runtime")));
    await server.listen();
    try {
      expect(await collectOverSocket(server, { nonce: "invalid", lifetime: server.lifetime },
        data, data.dispatch(0.9), null)).toEqual({ version: 1, status: "unsupported" });
    } finally {
      await server.close();
    }
  });
  it("joins a claimed evaluation before its owner attaches the request", async () => {
    const data = await fixture();
    const controls = await Effect.runPromise(makePreparationControls());
    const primerEntered = deferred();
    const releasePrimer = deferred();
    const blockersEntered = deferred();
    const releaseBlockers = deferred();
    let evaluationCount = 0;
    const evaluatedIdentities = new Set<string>();
    const evaluatedContracts = new Set<string>();
    const server = await acquireResidentFixture(residentPaths(join(data.root, "runtime")), () => 1_000, {
      beforeEvaluate: async (prepared) => {
        evaluationCount += 1;
        evaluatedIdentities.add(prepared.identity);
        evaluatedContracts.add(prepared.input.contract);
        if (evaluationCount === 1) {
          primerEntered.resolve();
          await releasePrimer.promise;
        } else if (evaluationCount <= 3) {
          if (evaluationCount === 3) blockersEntered.resolve();
          await releaseBlockers.promise;
        }
      },
      preparationControls: controls.layer,
    });
    const activityPath = join(data.root, "joined-activity");
    const dispatch = { ...data.dispatch(0), activityPath };
    const primer = { ...data.observation, advicee: { ...data.observation.advicee, sessionId: "primer" } };
    expect(server.admit(primer, dispatch).status).toBe("accepted");
    await primerEntered.promise;
    for (const sessionId of ["blocker-a", "blocker-b"]) {
      const blocker = { ...data.observation, advicee: { ...data.observation.advicee, sessionId } };
      expect(server.admit(blocker, dispatch).status).toBe("accepted");
    }
    releasePrimer.resolve();
    await blockersEntered.promise;
    await Effect.runPromise(controls.holdNextOwner);
    const first = server.admit(data.observation, dispatch, true, true);
    if (first.status !== "accepted" || !("ticket" in first)) throw new Error("owner not admitted");
    const secondObservation = { ...data.observation,
      advicee: { ...data.observation.advicee, toolUseId: "tool-two" } };
    const second = server.admit(secondObservation, dispatch, true, true);
    if (second.status !== "accepted" || !("ticket" in second)) throw new Error("repeat not admitted");
    releaseBlockers.resolve();
    await Effect.runPromise(controls.ownerEntered);
    try {
      await Effect.runPromise(controls.claimJoined);
      expect(await collect(server, second.ticket, data, dispatch, secondObservation.advicee))
        .toEqual({ requestRoute: "ticketed", status: "pending" });
    } finally {
      await Effect.runPromise(controls.releaseOwner);
    }
    await server.whenIdle();
    expect(await collect(server, first.ticket, data, dispatch)).toEqual({ requestRoute: "ticketed", status: "empty" });
    expect(await collect(server, second.ticket, data, dispatch, secondObservation.advicee))
      .toEqual({ requestRoute: "ticketed", status: "empty" });
      expect(evaluationCount).toBe(4);
      expect(evaluatedIdentities.size).toBe(1);
      expect([...evaluatedContracts]).toEqual(["direct-event/type-shape/v1"]);
      // Primer, both blockers, and owner occupy four distinct session partitions.
      expect((await Effect.runPromise(server.accountingMetrics()))).toMatchObject({ successfulCacheEntries: 4, pendingEvaluations: 0 });
    const activity = readActivity({ statePath: activityPath, root: data.root,
      sessionId: data.observation.advicee.sessionId,
      resident: { available: true, lifetime: server.lifetime } });
    expect(activity.counts.unavailable).toBe(0);
    expect(activity.counts.clear).toBeGreaterThan(0);
  });

  it("releases an owner claim if preparation exits before attachment", async () => {
    const data = await fixture();
    const failOnce = await Effect.runPromise(Ref.make(true));
    const server = await acquireResidentFixture(residentPaths(join(data.root, "runtime")), () => 1_000, {
      preparationControls: Layer.succeed(ResidentPreparationControls, ResidentPreparationControls.of({
        ...defaultPreparationControls,
        afterReuseBoundary: Effect.fn("PreparationFailureFixture.afterReuseBoundary")(function* (phase) {
          if (yield* Ref.getAndSet(failOnce, false)) yield* Effect.fail(new PreparationControlError({ phase }));
        }),
      })),
    });
    const dispatch = data.dispatch(0);
    const first = server.admit(data.observation, dispatch, true);
    if (first.status !== "accepted" || !("ticket" in first)) throw new Error("first not admitted");
    await server.whenIdle();
    expect((await Effect.runPromise(server.accountingMetrics())).pendingEvaluations).toBe(0);
    const second = server.admit(data.observation, dispatch, true);
    if (second.status !== "accepted" || !("ticket" in second)) throw new Error("second not admitted");
    await server.whenIdle();
    expect(await collect(server, second.ticket, data, dispatch)).toEqual({ requestRoute: "ticketed", status: "empty" });
    expect((await Effect.runPromise(server.accountingMetrics()))).toMatchObject({ successfulCacheEntries: 1, pendingEvaluations: 0 });
  });

  it("waits for admitted work and leaves clear evidence in activity after completion", async () => {
    const data = await fixture();
    const gate = deferred();
    const entered = deferred();
    const server = await acquireResidentFixture(residentPaths(join(data.root, "runtime")), undefined, {
      beforeEvaluate: async () => { entered.resolve(); await gate.promise; },
    });
    const dispatch = data.dispatch(0);
    expect((await server.handle({ requestRoute: "shared", operation: "register-edit", lifetime: server.lifetime,
      root: data.root, advicee: data.observation.advicee, startedAt: monotonicNow() })).status).toBe("advanced");
    const admission = await server.handle({ requestRoute: "ticketed", operation: "admit", lifetime: server.lifetime,
      observation: data.observation, controlledWriter: true, dispatch, composed: true });
    expect(admission.status).toBe("accepted");
    if (admission.status !== "accepted" || !("ticket" in admission)) return;
    expect(await collect(server, admission.ticket, data, dispatch)).toEqual({ requestRoute: "ticketed", status: "pending" });
    await entered.promise;
    expect(await collect(server, admission.ticket, data, dispatch)).toEqual({ requestRoute: "ticketed", status: "pending" });
    gate.resolve();
    await server.whenIdle();
    expect(await collect(server, admission.ticket, data, dispatch)).toEqual({ requestRoute: "ticketed", status: "empty" });
    expect(await collect(server, admission.ticket, data, {
      ...dispatch, credential: { name: "TYPESAFE_API_KEY", environmentValue: null,
        environmentOnly: true, generation: 1, statePath: join(data.root, "credential") },
    })).toEqual({ requestRoute: "ticketed", status: "unavailable", reason: "credential" });
    expect(await collect(server, admission.ticket, data, dispatch, {
      ...data.observation.advicee, toolUseId: "another-tool",
    })).toEqual({ requestRoute: "ticketed", status: "unavailable", reason: "lost" });
    expect(await collect(server, admission.ticket, data, dispatch, {
      ...data.observation.advicee, sessionId: "another-session",
    })).toEqual({ requestRoute: "ticketed", status: "unavailable", reason: "lost" });
    expect(await collect(server, admission.ticket, { ...data, root: join(data.root, "other-root") }, dispatch))
      .toEqual({ requestRoute: "ticketed", status: "unavailable", reason: "lost" });
  });

  it("delivers findings without returning a ticket-wide terminal result", async () => {
    const data = await fixture();
    const server = await acquireResidentFixture(residentPaths(join(data.root, "runtime")));
    const dispatch = data.dispatch(0.9);
    const admission = server.admit(data.observation, dispatch, true);
    if (admission.status !== "accepted" || !("ticket" in admission)) throw new Error("not admitted");
    await server.whenIdle();
    for (let index = 0; index < 16; index += 1) {
      const advice = await collect(server, admission.ticket, data, dispatch);
      if (advice.status !== "advice") break;
      expect((await Effect.runPromise(server.acknowledge(advice.token))).status).toBe("acknowledged");
      expect((await Effect.runPromise(server.finalize(advice.token))).status).toBe("finalized");
      expect((await Effect.runPromise(server.acknowledge(advice.token))).status).toBe("empty");
      expect((await Effect.runPromise(server.finalize(advice.token))).status).toBe("empty");
    }
    expect(await collect(server, admission.ticket, data, dispatch)).toEqual({ requestRoute: "ticketed", status: "empty" });
  });

  it("reports backend failure and missing or replacement tickets conservatively", async () => {
    const data = await fixture();
    const server = await acquireResidentFixture(residentPaths(join(data.root, "runtime")));
    const dispatch = data.dispatch(0, "backend failed");
    const admission = server.admit(data.observation, dispatch, true);
    if (admission.status !== "accepted" || !("ticket" in admission)) throw new Error("not admitted");
    await server.whenIdle();
    const result = await collect(server, admission.ticket, data, dispatch);
    expect(result).toEqual({ requestRoute: "ticketed", status: "empty" });
    expect(server.stats().pendingOperationalNotices).toBeGreaterThan(0);
    expect(await collect(server, { nonce: "unknown", lifetime: server.lifetime }, data, dispatch))
      .toEqual({ requestRoute: "ticketed", status: "unavailable", reason: "lost" });
    const replacement = await acquireResidentFixture(residentPaths(join(data.root, "replacement")));
    expect(await collect(replacement, admission.ticket, data, dispatch))
      .toEqual({ requestRoute: "ticketed", status: "unavailable", reason: "lost" });
  });

  it("expires admission capabilities after a same-tool revision", async () => {
    const data = await fixture();
    let now = 1_000;
    const server = await acquireResidentFixture(residentPaths(join(data.root, "runtime")), () => now);
    const dispatch = data.dispatch(0);
    const admission = server.admit(data.observation, dispatch, true);
    if (admission.status !== "accepted" || !("ticket" in admission)) throw new Error("not admitted");
    await server.whenIdle();
    expect(await collect(server, admission.ticket, data, dispatch)).toEqual({ requestRoute: "ticketed", status: "empty" });
    const path = await put(data.root, "type.ts", "type OrderCount = string\n");
    const second = await Effect.runPromise(adaptClaudeDirectEvent({
      hook_event_name: "PostToolUse", tool_name: "Write", cwd: data.root,
      session_id: "session", tool_use_id: "tool-one",
      tool_input: { file_path: path, content: "type OrderCount = string\n" },
      tool_response: { filePath: path, content: "type OrderCount = string\n", originalFile: "type OrderCount = number\n", userModified: false },
    }));
    if (second === undefined) throw new Error("second edit not adapted");
    expect(server.admit(second, dispatch).status).toBe("accepted");
    await server.whenIdle();
    expect(await collect(server, admission.ticket, data, dispatch)).toEqual({ requestRoute: "ticketed", status: "empty" });
    now += 600_001;
    expect(await collect(server, admission.ticket, data, dispatch)).toEqual({ requestRoute: "ticketed", status: "unavailable", reason: "expired" });
  });

  it("keeps an admission capability valid until the exact fractional expiry", async () => {
    const data = await fixture();
    const admittedAt = 1_000.00095;
    let now = admittedAt;
    const server = await acquireResidentFixture(residentPaths(join(data.root, "runtime")), () => now);
    const dispatch = data.dispatch(0);
    const admission = server.admit(data.observation, dispatch, true);
    if (admission.status !== "accepted" || !("ticket" in admission)) throw new Error("not admitted");
    await server.whenIdle();
    const expiresAt = admittedAt + 600_000;
    now = expiresAt - 0.00005;
    expect(now).toBeLessThan(expiresAt);
    expect(await collect(server, admission.ticket, data, dispatch)).toEqual({ requestRoute: "ticketed", status: "empty" });
    now = expiresAt;
    expect(await collect(server, admission.ticket, data, dispatch)).toEqual({
      requestRoute: "ticketed", status: "unavailable", reason: "expired",
    });
    expect(await collect(server, admission.ticket, data, {
      ...dispatch, credential: { name: "TYPESAFE_API_KEY", environmentValue: null,
        environmentOnly: true, generation: 1, statePath: join(data.root, "credential") },
    })).toEqual({ requestRoute: "ticketed", status: "unavailable", reason: "expired" });
  });

  it("observes settled work while the collection response is gated", async () => {
    const data = await fixture();
    const evaluating = deferred();
    const evaluateGate = deferred();
    const handingOff = deferred();
    const responseGate = deferred();
    const server = await acquireResidentFixture(residentPaths(join(data.root, "runtime")), undefined, {
      beforeEvaluate: async () => { evaluating.resolve(); await evaluateGate.promise; },
      beforeResponseHandoff: async () => { handingOff.resolve(); await responseGate.promise; },
    });
    await server.listen();
    try {
      const dispatch = data.dispatch(0);
      const admission = server.admit(data.observation, dispatch, true);
      if (admission.status !== "accepted" || !("ticket" in admission)) throw new Error("not admitted");
      await evaluating.promise;
      const result = collectOverSocket(server, admission.ticket, data, dispatch);
      await handingOff.promise;
      evaluateGate.resolve();
      await server.whenIdle();
      responseGate.resolve();
      expect(await result).toEqual({ version: 1, status: "empty" });
    } finally {
      evaluateGate.resolve();
      responseGate.resolve();
      await server.close();
    }
  });

  it("keeps collection pending when findings arrive at the response gate", async () => {
    const data = await fixture();
    const evaluating = deferred();
    const evaluateGate = deferred();
    const handingOff = deferred();
    const responseGate = deferred();
    const server = await acquireResidentFixture(residentPaths(join(data.root, "runtime")), undefined, {
      beforeEvaluate: async () => { evaluating.resolve(); await evaluateGate.promise; },
      beforeResponseHandoff: async () => { handingOff.resolve(); await responseGate.promise; },
    });
    await server.listen();
    try {
      const dispatch = data.dispatch(0.9);
      const admission = server.admit(data.observation, dispatch, true);
      if (admission.status !== "accepted" || !("ticket" in admission)) throw new Error("not admitted");
      await evaluating.promise;
      const result = collectOverSocket(server, admission.ticket, data, dispatch);
      await handingOff.promise;
      evaluateGate.resolve();
      await server.whenIdle();
      responseGate.resolve();
      expect((await result).status).toBe("pending");
      expect((await collect(server, admission.ticket, data, dispatch)).status).toBe("advice");
    } finally {
      evaluateGate.resolve();
      responseGate.resolve();
      await server.close();
    }
  });

  it("does not claim a terminal outcome when the same tool revision changes before handoff", async () => {
    const data = await fixture();
    const handingOff = deferred();
    const responseGate = deferred();
    const server = await acquireResidentFixture(residentPaths(join(data.root, "runtime")), undefined, {
      beforeResponseHandoff: async () => { handingOff.resolve(); await responseGate.promise; },
    });
    await server.listen();
    try {
      const dispatch = data.dispatch(0);
      const admission = server.admit(data.observation, dispatch, true);
      if (admission.status !== "accepted" || !("ticket" in admission)) throw new Error("not admitted");
      await server.whenIdle();
      const result = collectOverSocket(server, admission.ticket, data, dispatch);
      await handingOff.promise;
      const path = await put(data.root, "type.ts", "type OrderCount = string\n");
      const second = await Effect.runPromise(adaptClaudeDirectEvent({
        hook_event_name: "PostToolUse", tool_name: "Write", cwd: data.root,
        session_id: "session", tool_use_id: "tool-one",
        tool_input: { file_path: path, content: "type OrderCount = string\n" },
        tool_response: { filePath: path, content: "type OrderCount = string\n", originalFile: "type OrderCount = number\n", userModified: false },
      }));
      if (second === undefined) throw new Error("second edit not adapted");
      expect(server.admit(second, dispatch).status).toBe("accepted");
      await server.whenIdle();
      responseGate.resolve();
      expect(await result).toEqual({ version: 1, status: "empty" });
    } finally {
      responseGate.resolve();
      await server.close();
    }
  });

  it("keeps a mixed finding and failed unit separately visible after advice finalization", async () => {
    const data = await fixture();
    const secondPath = await put(data.root, "second.ts", "type SecondCount = number\n");
    const firstCandidate = data.observation.candidates[0];
    if (firstCandidate === undefined) throw new Error("no candidate");
    const observation = { ...data.observation, candidates: [firstCandidate, {
      ...firstCandidate, path: secondPath, addedLines: ["type SecondCount = number"],
    }] };
    const server = await acquireResidentFixture(residentPaths(join(data.root, "runtime")), undefined, {
      beforeEvaluate: async (prepared) => {
        if (prepared.input.path.endsWith("second.ts")) throw new Error("controlled unit failure");
      },
    });
    const activityPath = join(data.root, "mixed-activity");
    const dispatch = { ...data.dispatch(0.9), activityPath };
    const admission = server.admit(observation, dispatch, true);
    if (admission.status !== "accepted" || !("ticket" in admission)) throw new Error("not admitted");
    await server.whenIdle();
    let delivered = false;
    for (let index = 0; index < 16; index += 1) {
      const outcome = await collect(server, admission.ticket, data, dispatch);
      if (outcome.status !== "advice") break;
      if (outcome.findingCount > 0) delivered = true;
      expect((await Effect.runPromise(server.acknowledge(outcome.token))).status).toBe("acknowledged");
      expect((await Effect.runPromise(server.finalize(outcome.token))).status).toBe("finalized");
    }
    expect(delivered).toBe(true);
    expect(await collect(server, admission.ticket, data, dispatch)).toEqual({ requestRoute: "ticketed", status: "empty" });
    const activity = readActivity({ statePath: activityPath, root: data.root,
      sessionId: data.observation.advicee.sessionId,
      resident: { available: true, lifetime: server.lifetime } });
    expect(activity.findings).toBeGreaterThan(0);
    expect(activity.counts.unavailable).toBeGreaterThan(0);
  });

  it("keeps advice pending for simultaneous collectors and failed acknowledgement", async () => {
    const data = await fixture();
    const server = await acquireResidentFixture(residentPaths(join(data.root, "runtime")), () => 1_000);
    const dispatch = data.dispatch(0.9);
    const admission = server.admit(data.observation, dispatch, true);
    if (admission.status !== "accepted" || !("ticket" in admission)) throw new Error("not admitted");
    await server.whenIdle();
    const outcomes = await Promise.all([
      collect(server, admission.ticket, data, dispatch),
      collect(server, admission.ticket, data, dispatch),
    ]);
    expect(outcomes.filter((outcome) => outcome.status === "advice")).toHaveLength(1);
    expect(outcomes.filter((outcome) => outcome.status === "pending")).toHaveLength(1);
    const advice = outcomes.find((outcome) => outcome.status === "advice");
    if (advice?.status !== "advice") throw new Error("advice was not leased");
    (await Effect.runPromise(server.releaseDelivery(advice.token)));
    expect((await collect(server, admission.ticket, data, dispatch)).status).toBe("advice");
  });

  it("leases eligible advice from another admission for the same Claude advicee", async () => {
    const data = await fixture();
    const server = await acquireResidentFixture(residentPaths(join(data.root, "runtime")));
    const dispatch = data.dispatch(0.9);
    const finding = server.admit(data.observation, dispatch, true);
    const skipped = server.admit({ ...data.observation, candidates: [{ operation: "delete", path: "type.ts", addedLines: [] }] }, dispatch, true);
    if (finding.status !== "accepted" || !("ticket" in finding) ||
        skipped.status !== "accepted" || !("ticket" in skipped)) throw new Error("not admitted");
    await server.whenIdle();
    const other = await collect(server, skipped.ticket, data, dispatch);
    expect(other.status).toBe("advice");
    expect((await collect(server, finding.ticket, data, dispatch)).status).toBe("pending");
    if (other.status === "advice") (await Effect.runPromise(server.releaseDelivery(other.token)));
    expect((await collect(server, finding.ticket, data, dispatch)).status).toBe("advice");
  });

  it("shares one identical finding with two admissions and does not return a terminal result", async () => {
    const data = await fixture();
    const server = await acquireResidentFixture(residentPaths(join(data.root, "runtime")));
    const dispatch = data.dispatch(0.9);
    const first = server.admit(data.observation, dispatch, true);
    if (first.status !== "accepted" || !("ticket" in first)) throw new Error("first not admitted");
    await server.whenIdle();
    const second = server.admit(data.observation, dispatch, true);
    if (second.status !== "accepted" || !("ticket" in second)) throw new Error("second not admitted");
    await server.whenIdle();
    let advice = await collect(server, second.ticket, data, dispatch);
    expect(advice.status).toBe("advice");
    for (let index = 0; index < 16 && advice.status === "advice"; index += 1) {
      expect((await Effect.runPromise(server.acknowledge(advice.token))).status).toBe("acknowledged");
      expect((await Effect.runPromise(server.finalize(advice.token))).status).toBe("finalized");
      advice = await collect(server, second.ticket, data, dispatch);
    }
    expect(advice).toEqual({ requestRoute: "ticketed", status: "empty" });
    expect(await collect(server, first.ticket, data, dispatch)).toEqual({ requestRoute: "ticketed", status: "empty" });
  });

  it("withdraws preselected advice when credential generation rotates at the response gate", async () => {
    const data = await fixture();
    const statePath = join(data.root, "credential-state.json");
    writeFileSync(statePath, JSON.stringify({ version: 1, generation: 1, savedUseSuspended: false }));
    const dispatch: ResidentDispatchContext = {
      ...data.dispatch(0.9),
      credential: { name: "TYPESAFE_API_KEY", environmentValue: "synthetic-test-value",
        environmentOnly: false, generation: 1, statePath },
      controlled: { ...data.dispatch(0.9).controlled, requireCredential: true },
    };
    const entered = deferred();
    const gate = deferred();
    const server = await acquireResidentFixture(residentPaths(join(data.root, "runtime")), undefined, {
      beforeResponseHandoff: async () => { entered.resolve(); await gate.promise; },
    });
    await server.listen();
    try {
      const admission = server.admit(data.observation, dispatch, true);
      if (admission.status !== "accepted" || !("ticket" in admission)) throw new Error("not admitted");
      await server.whenIdle();
      const result = collectOverSocket(server, admission.ticket, data, dispatch);
      await entered.promise;
      writeFileSync(statePath, JSON.stringify({ version: 1, generation: 2, savedUseSuspended: false }));
      gate.resolve();
      expect(await result).toEqual({ version: 1, status: "unavailable", reason: "credential" });
      expect(server.stats().pendingAdvice).toBeGreaterThan(0);
    } finally {
      gate.resolve();
      await server.close();
    }
  });

  it("rechecks credential state at terminal collection with unchanged request dispatch", async () => {
    const data = await fixture();
    const statePath = join(data.root, "credential-state.json");
    writeFileSync(statePath, JSON.stringify({ version: 1, generation: 1, savedUseSuspended: false }));
    const dispatch: ResidentDispatchContext = {
      ...data.dispatch(0),
      credential: { name: "TYPESAFE_API_KEY", environmentValue: "synthetic-test-value",
        environmentOnly: false, generation: 1, statePath },
      controlled: { ...data.dispatch(0).controlled, requireCredential: true },
    };
    const server = await acquireResidentFixture(residentPaths(join(data.root, "runtime")));
    const admission = server.admit(data.observation, dispatch, true);
    if (admission.status !== "accepted" || !("ticket" in admission)) throw new Error("not admitted");
    await server.whenIdle();
    expect(await collect(server, admission.ticket, data, dispatch)).toEqual({ requestRoute: "ticketed", status: "empty" });
    writeFileSync(statePath, JSON.stringify({ version: 1, generation: 2, savedUseSuspended: false }));
    expect(await collect(server, admission.ticket, data, dispatch)).toEqual({
      requestRoute: "ticketed", status: "unavailable", reason: "credential",
    });
  });

  it("accounts for a cached clear on a later admission", async () => {
    const data = await fixture();
    const server = await acquireResidentFixture(residentPaths(join(data.root, "runtime")));
    const dispatch = data.dispatch(0);
    const first = server.admit(data.observation, dispatch, true);
    if (first.status !== "accepted" || !("ticket" in first)) throw new Error("first not admitted");
    await server.whenIdle();
    expect(await collect(server, first.ticket, data, dispatch)).toEqual({ requestRoute: "ticketed", status: "empty" });
    const second = server.admit(data.observation, dispatch, true);
    if (second.status !== "accepted" || !("ticket" in second)) throw new Error("second not admitted");
    await server.whenIdle();
    expect(await collect(server, second.ticket, data, dispatch)).toEqual({ requestRoute: "ticketed", status: "empty" });
  });

  it("returns quietly when file policy excludes the admitted edit", async () => {
    const data = await fixture();
    await put(data.root, ".review.jsonc", '{"version":1,"excludes":["type.ts"]}\n');
    const server = await acquireResidentFixture(residentPaths(join(data.root, "runtime")));
    const dispatch = data.dispatch(0);
    const admission = server.admit(data.observation, dispatch, true);
    if (admission.status !== "accepted" || !("ticket" in admission)) throw new Error("not admitted");
    await server.whenIdle();
    expect(await collect(server, admission.ticket, data, dispatch)).toEqual({ requestRoute: "ticketed", status: "empty" });
  });

  it("keeps failure diagnostics out of ticketed Claude output", async () => {
    const data = await fixture();
    const server = await acquireResidentFixture(residentPaths(join(data.root, "runtime")));
    const failed = data.dispatch(0, "controlled backend failure");
    const first = server.admit(data.observation, failed, true);
    if (first.status !== "accepted" || !("ticket" in first)) throw new Error("first not admitted");
    await server.whenIdle();
    await put(data.root, ".review.jsonc", '{"version":1,"excludes":["type.ts"]}\n');
    const second = server.admit(data.observation, failed, true);
    if (second.status !== "accepted" || !("ticket" in second)) throw new Error("second not admitted");
    await server.whenIdle();
    expect(await collect(server, second.ticket, data, failed)).toEqual({ requestRoute: "ticketed", status: "empty" });
    expect(server.stats().pendingOperationalNotices).toBeGreaterThan(0);
    expect(await collect(server, first.ticket, data, failed)).toEqual({ requestRoute: "ticketed", status: "empty" });
    expect(await collect(server, second.ticket, data, failed)).toEqual({ requestRoute: "ticketed", status: "empty" });
  });

  it("keeps a prior admission valid when a later tool-use edits the same subject", async () => {
    const data = await fixture();
    const server = await acquireResidentFixture(residentPaths(join(data.root, "runtime")));
    const dispatch = data.dispatch(0);
    const first = server.admit(data.observation, dispatch, true);
    if (first.status !== "accepted" || !("ticket" in first)) throw new Error("first not admitted");
    await server.whenIdle();
    expect(await collect(server, first.ticket, data, dispatch)).toEqual({ requestRoute: "ticketed", status: "empty" });
    const later = { ...data.observation, advicee: { ...data.observation.advicee, toolUseId: "later-tool" } };
    expect(server.admit(later, dispatch).status).toBe("accepted");
    await server.whenIdle();
    expect(await collect(server, first.ticket, data, dispatch)).toEqual({ requestRoute: "ticketed", status: "empty" });
  });

  it("reports expired advice and evicted tickets without claiming clear", async () => {
    const data = await fixture();
    let now = 1_000;
    const server = await acquireResidentFixture(residentPaths(join(data.root, "runtime")), () => now, { maximumTickets: 1 });
    const dispatch = data.dispatch(0.9);
    const first = server.admit(data.observation, dispatch, true);
    if (first.status !== "accepted" || !("ticket" in first)) throw new Error("first not admitted");
    await server.whenIdle();
    now += PENDING_ADVICE_EXPIRY_MS + 1;
    expect(await collect(server, first.ticket, data, dispatch)).toEqual({
      requestRoute: "ticketed", status: "unavailable", reason: "expired",
    });
    const second = server.admit(data.observation, dispatch, true);
    if (second.status !== "accepted" || !("ticket" in second)) throw new Error("second not admitted");
    expect(await collect(server, first.ticket, data, dispatch)).toEqual({
      requestRoute: "ticketed", status: "unavailable", reason: "lost",
    });
  });
});
