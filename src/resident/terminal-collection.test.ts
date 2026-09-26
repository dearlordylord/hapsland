import { describe, expect, it } from "vitest";
import * as Effect from "effect/Effect";
import { join } from "node:path";
import { createConnection } from "node:net";
import { writeFileSync } from "node:fs";
import { adaptClaudeDirectEvent } from "../direct-event/adapter.ts";
import { makeGitFixture, put } from "../direct-event/test-fixtures.ts";
import { configuredRules } from "../policy/rules.ts";
import { Consent } from "../runtime/consent.ts";
import { residentPaths } from "./paths.ts";
import { ResidentServer } from "./server.ts";
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
  await Effect.runPromise(Effect.gen(function* () {
    const consent = yield* Consent.Service;
    const proposal = yield* consent.preview(root, "jev", "https://api.typesafe.ai/v1/systemone");
    yield* consent.enable(proposal);
  }).pipe(Effect.provide(Consent.layer({ statePath }))));
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

const collect = (server: ResidentServer, ticket: ResidentCollectionTicket,
  data: Awaited<ReturnType<typeof fixture>>, dispatch: ResidentDispatchContext,
  advicee = data.observation.advicee) => server.handle({
    version: 2, operation: "collect", lifetime: server.lifetime, ticket,
    root: data.root, advicee, dispatch,
  } satisfies ResidentRequest);

const collectOverSocket = (server: ResidentServer, ticket: ResidentCollectionTicket,
  data: Awaited<ReturnType<typeof fixture>>, dispatch: ResidentDispatchContext) =>
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
      version: 2, operation: "collect", lifetime: server.lifetime, ticket,
      root: data.root, advicee: data.observation.advicee, dispatch,
    })}\n`));
  });

describe("Claude terminal collection", () => {
  it("waits for admitted work and returns clear only after a successful zero-finding evaluation", async () => {
    const data = await fixture();
    const gate = deferred();
    const entered = deferred();
    const server = new ResidentServer(residentPaths(join(data.root, "runtime")), undefined, {
      beforeEvaluate: async () => { entered.resolve(); await gate.promise; },
    });
    const dispatch = data.dispatch(0);
    const admission = await server.handle({ version: 2, operation: "admit", lifetime: server.lifetime,
      observation: data.observation, controlledWriter: true, dispatch });
    expect(admission.status).toBe("accepted");
    if (admission.status !== "accepted" || !("ticket" in admission)) return;
    expect(await collect(server, admission.ticket, data, dispatch)).toEqual({ version: 2, status: "pending" });
    await entered.promise;
    expect(await collect(server, admission.ticket, data, dispatch)).toEqual({ version: 2, status: "pending" });
    gate.resolve();
    await server.whenIdle();
    expect(await collect(server, admission.ticket, data, dispatch)).toEqual({ version: 2, status: "clear" });
    expect(await collect(server, admission.ticket, data, {
      ...dispatch, credential: { name: "TYPESAFE_API_KEY", environmentValue: null,
        environmentOnly: true, generation: 1, statePath: join(data.root, "credential") },
    })).toEqual({ version: 2, status: "unavailable", reason: "credential" });
    expect(await collect(server, admission.ticket, data, dispatch, {
      ...data.observation.advicee, toolUseId: "another-tool",
    })).toEqual({ version: 2, status: "unavailable", reason: "lost" });
    expect(await collect(server, admission.ticket, data, dispatch, {
      ...data.observation.advicee, sessionId: "another-session",
    })).toEqual({ version: 2, status: "unavailable", reason: "lost" });
    expect(await collect(server, admission.ticket, { ...data, root: join(data.root, "other-root") }, dispatch))
      .toEqual({ version: 2, status: "unavailable", reason: "lost" });
  });

  it("delivers findings and never reinterprets them as clear", async () => {
    const data = await fixture();
    const server = new ResidentServer(residentPaths(join(data.root, "runtime")));
    const dispatch = data.dispatch(0.9);
    const admission = await server.handle({ version: 2, operation: "admit", lifetime: server.lifetime,
      observation: data.observation, controlledWriter: true, dispatch });
    if (admission.status !== "accepted" || !("ticket" in admission)) throw new Error("not admitted");
    await server.whenIdle();
    for (let index = 0; index < 16; index += 1) {
      const advice = await collect(server, admission.ticket, data, dispatch);
      if (advice.status !== "advice") break;
      expect(server.acknowledge(advice.token).status).toBe("acknowledged");
      expect(server.finalize(advice.token).status).toBe("finalized");
    }
    expect(await collect(server, admission.ticket, data, dispatch)).toEqual({ version: 2, status: "delivered" });
  });

  it("reports backend failure and missing or replacement tickets conservatively", async () => {
    const data = await fixture();
    const server = new ResidentServer(residentPaths(join(data.root, "runtime")));
    const dispatch = data.dispatch(0, "backend failed");
    const admission = await server.handle({ version: 2, operation: "admit", lifetime: server.lifetime,
      observation: data.observation, controlledWriter: true, dispatch });
    if (admission.status !== "accepted" || !("ticket" in admission)) throw new Error("not admitted");
    await server.whenIdle();
    const result = await collect(server, admission.ticket, data, dispatch);
    expect(["advice", "unavailable"]).toContain(result.status);
    expect(await collect(server, { nonce: "unknown", lifetime: server.lifetime }, data, dispatch))
      .toEqual({ version: 2, status: "unavailable", reason: "lost" });
    const replacement = new ResidentServer(residentPaths(join(data.root, "replacement")));
    expect(await collect(replacement, admission.ticket, data, dispatch))
      .toEqual({ version: 2, status: "unavailable", reason: "lost" });
  });

  it("expires tickets and invalidates a completed clear on same-tool revision supersession", async () => {
    const data = await fixture();
    let now = 1_000;
    const server = new ResidentServer(residentPaths(join(data.root, "runtime")), () => now);
    const dispatch = data.dispatch(0);
    const admission = await server.handle({ version: 2, operation: "admit", lifetime: server.lifetime,
      observation: data.observation, controlledWriter: true, dispatch });
    if (admission.status !== "accepted" || !("ticket" in admission)) throw new Error("not admitted");
    await server.whenIdle();
    expect(await collect(server, admission.ticket, data, dispatch)).toEqual({ version: 2, status: "clear" });
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
    expect(await collect(server, admission.ticket, data, dispatch)).toEqual({ version: 2, status: "unavailable", reason: "stale" });
    now += 600_001;
    expect(await collect(server, admission.ticket, data, dispatch)).toEqual({ version: 2, status: "unavailable", reason: "expired" });
  });

  it("observes a clear that completes while the collection response is gated", async () => {
    const data = await fixture();
    const evaluating = deferred();
    const evaluateGate = deferred();
    const handingOff = deferred();
    const responseGate = deferred();
    const server = new ResidentServer(residentPaths(join(data.root, "runtime")), undefined, {
      beforeEvaluate: async () => { evaluating.resolve(); await evaluateGate.promise; },
      beforeResponseHandoff: async () => { handingOff.resolve(); await responseGate.promise; },
    });
    await server.listen();
    try {
      const dispatch = data.dispatch(0);
      const admission = await server.handle({ version: 2, operation: "admit", lifetime: server.lifetime,
        observation: data.observation, controlledWriter: true, dispatch });
      if (admission.status !== "accepted" || !("ticket" in admission)) throw new Error("not admitted");
      await evaluating.promise;
      const result = collectOverSocket(server, admission.ticket, data, dispatch);
      await handingOff.promise;
      evaluateGate.resolve();
      await server.whenIdle();
      responseGate.resolve();
      expect(await result).toEqual({ version: 2, status: "clear" });
    } finally {
      evaluateGate.resolve();
      responseGate.resolve();
      await server.close();
    }
  });

  it("cannot return clear when findings arrive at the response gate", async () => {
    const data = await fixture();
    const evaluating = deferred();
    const evaluateGate = deferred();
    const handingOff = deferred();
    const responseGate = deferred();
    const server = new ResidentServer(residentPaths(join(data.root, "runtime")), undefined, {
      beforeEvaluate: async () => { evaluating.resolve(); await evaluateGate.promise; },
      beforeResponseHandoff: async () => { handingOff.resolve(); await responseGate.promise; },
    });
    await server.listen();
    try {
      const dispatch = data.dispatch(0.9);
      const admission = await server.handle({ version: 2, operation: "admit", lifetime: server.lifetime,
        observation: data.observation, controlledWriter: true, dispatch });
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

  it("invalidates an evaluated clear when the same tool revision changes before handoff", async () => {
    const data = await fixture();
    const handingOff = deferred();
    const responseGate = deferred();
    const server = new ResidentServer(residentPaths(join(data.root, "runtime")), undefined, {
      beforeResponseHandoff: async () => { handingOff.resolve(); await responseGate.promise; },
    });
    await server.listen();
    try {
      const dispatch = data.dispatch(0);
      const admission = await server.handle({ version: 2, operation: "admit", lifetime: server.lifetime,
        observation: data.observation, controlledWriter: true, dispatch });
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
      expect(await result).toEqual({ version: 2, status: "unavailable", reason: "stale" });
    } finally {
      responseGate.resolve();
      await server.close();
    }
  });

  it("keeps a mixed finding and failed unit unavailable after all advice is finalized", async () => {
    const data = await fixture();
    const secondPath = await put(data.root, "second.ts", "type SecondCount = number\n");
    const firstCandidate = data.observation.candidates[0];
    if (firstCandidate === undefined) throw new Error("no candidate");
    const observation = { ...data.observation, candidates: [firstCandidate, {
      ...firstCandidate, path: secondPath, addedLines: ["type SecondCount = number"],
    }] };
    const server = new ResidentServer(residentPaths(join(data.root, "runtime")), undefined, {
      beforeEvaluate: async (prepared) => {
        if (prepared.input.path.endsWith("second.ts")) throw new Error("controlled unit failure");
      },
    });
    const dispatch = data.dispatch(0.9);
    const admission = await server.handle({ version: 2, operation: "admit", lifetime: server.lifetime,
      observation, controlledWriter: true, dispatch });
    if (admission.status !== "accepted" || !("ticket" in admission)) throw new Error("not admitted");
    await server.whenIdle();
    let delivered = false;
    for (let index = 0; index < 16; index += 1) {
      const outcome = await collect(server, admission.ticket, data, dispatch);
      if (outcome.status !== "advice") break;
      if (outcome.findingCount > 0) delivered = true;
      expect(server.acknowledge(outcome.token).status).toBe("acknowledged");
      expect(server.finalize(outcome.token).status).toBe("finalized");
    }
    expect(delivered).toBe(true);
    expect(await collect(server, admission.ticket, data, dispatch)).toEqual({
      version: 2, status: "unavailable", reason: "backend",
    });
  });

  it("keeps advice pending for simultaneous collectors and failed acknowledgement", async () => {
    const data = await fixture();
    const server = new ResidentServer(residentPaths(join(data.root, "runtime")), () => 1_000);
    const dispatch = data.dispatch(0.9);
    const admission = await server.handle({ version: 2, operation: "admit", lifetime: server.lifetime,
      observation: data.observation, controlledWriter: true, dispatch });
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
    server.releaseDelivery(advice.token);
    expect((await collect(server, admission.ticket, data, dispatch)).status).toBe("advice");
  });

  it("does not lease another ticket's advice for the same Claude advicee", async () => {
    const data = await fixture();
    const server = new ResidentServer(residentPaths(join(data.root, "runtime")));
    const dispatch = data.dispatch(0.9);
    const finding = await server.handle({ version: 2, operation: "admit", lifetime: server.lifetime,
      observation: data.observation, controlledWriter: true, dispatch });
    const skipped = await server.handle({ version: 2, operation: "admit", lifetime: server.lifetime,
      observation: { ...data.observation, candidates: [{ operation: "delete", path: "type.ts", addedLines: [] }] },
      controlledWriter: true, dispatch });
    if (finding.status !== "accepted" || !("ticket" in finding) ||
        skipped.status !== "accepted" || !("ticket" in skipped)) throw new Error("not admitted");
    await server.whenIdle();
    const other = await collect(server, skipped.ticket, data, dispatch);
    expect(other).toEqual({ version: 2, status: "no-work" });
    expect((await collect(server, finding.ticket, data, dispatch)).status).toBe("advice");
  });

  it("shares one identical finding with two tickets and marks both delivered after finalization", async () => {
    const data = await fixture();
    const server = new ResidentServer(residentPaths(join(data.root, "runtime")));
    const dispatch = data.dispatch(0.9);
    const first = await server.handle({ version: 2, operation: "admit", lifetime: server.lifetime,
      observation: data.observation, controlledWriter: true, dispatch });
    if (first.status !== "accepted" || !("ticket" in first)) throw new Error("first not admitted");
    await server.whenIdle();
    const second = await server.handle({ version: 2, operation: "admit", lifetime: server.lifetime,
      observation: data.observation, controlledWriter: true, dispatch });
    if (second.status !== "accepted" || !("ticket" in second)) throw new Error("second not admitted");
    await server.whenIdle();
    let advice = await collect(server, second.ticket, data, dispatch);
    expect(advice.status).toBe("advice");
    for (let index = 0; index < 16 && advice.status === "advice"; index += 1) {
      expect(server.acknowledge(advice.token).status).toBe("acknowledged");
      expect(server.finalize(advice.token).status).toBe("finalized");
      advice = await collect(server, second.ticket, data, dispatch);
    }
    expect(advice).toEqual({ version: 2, status: "delivered" });
    expect(await collect(server, first.ticket, data, dispatch)).toEqual({ version: 2, status: "delivered" });
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
    const server = new ResidentServer(residentPaths(join(data.root, "runtime")), undefined, {
      beforeResponseHandoff: async () => { entered.resolve(); await gate.promise; },
    });
    await server.listen();
    try {
      const admission = await server.handle({ version: 2, operation: "admit", lifetime: server.lifetime,
        observation: data.observation, controlledWriter: true, dispatch });
      if (admission.status !== "accepted" || !("ticket" in admission)) throw new Error("not admitted");
      await server.whenIdle();
      const result = collectOverSocket(server, admission.ticket, data, dispatch);
      await entered.promise;
      writeFileSync(statePath, JSON.stringify({ version: 1, generation: 2, savedUseSuspended: false }));
      gate.resolve();
      expect(await result).toEqual({ version: 2, status: "unavailable", reason: "credential" });
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
    const server = new ResidentServer(residentPaths(join(data.root, "runtime")));
    const admission = await server.handle({ version: 2, operation: "admit", lifetime: server.lifetime,
      observation: data.observation, controlledWriter: true, dispatch });
    if (admission.status !== "accepted" || !("ticket" in admission)) throw new Error("not admitted");
    await server.whenIdle();
    expect(await collect(server, admission.ticket, data, dispatch)).toEqual({ version: 2, status: "clear" });
    writeFileSync(statePath, JSON.stringify({ version: 1, generation: 2, savedUseSuspended: false }));
    expect(await collect(server, admission.ticket, data, dispatch)).toEqual({
      version: 2, status: "unavailable", reason: "credential",
    });
  });

  it("accounts for a cached clear on a later admission", async () => {
    const data = await fixture();
    const server = new ResidentServer(residentPaths(join(data.root, "runtime")));
    const dispatch = data.dispatch(0);
    const first = await server.handle({ version: 2, operation: "admit", lifetime: server.lifetime,
      observation: data.observation, controlledWriter: true, dispatch });
    if (first.status !== "accepted" || !("ticket" in first)) throw new Error("first not admitted");
    await server.whenIdle();
    expect(await collect(server, first.ticket, data, dispatch)).toEqual({ version: 2, status: "clear" });
    const second = await server.handle({ version: 2, operation: "admit", lifetime: server.lifetime,
      observation: data.observation, controlledWriter: true, dispatch });
    if (second.status !== "accepted" || !("ticket" in second)) throw new Error("second not admitted");
    await server.whenIdle();
    expect(await collect(server, second.ticket, data, dispatch)).toEqual({ version: 2, status: "clear" });
  });

  it("returns no-work when file policy excludes the admitted edit", async () => {
    const data = await fixture();
    await put(data.root, ".review.jsonc", '{"version":1,"excludes":["type.ts"]}\n');
    const server = new ResidentServer(residentPaths(join(data.root, "runtime")));
    const dispatch = data.dispatch(0);
    const admission = await server.handle({ version: 2, operation: "admit", lifetime: server.lifetime,
      observation: data.observation, controlledWriter: true, dispatch });
    if (admission.status !== "accepted" || !("ticket" in admission)) throw new Error("not admitted");
    await server.whenIdle();
    expect(await collect(server, admission.ticket, data, dispatch)).toEqual({ version: 2, status: "no-work" });
  });

  it("leases a failure notice only to its admission and stays unavailable after finalization", async () => {
    const data = await fixture();
    const server = new ResidentServer(residentPaths(join(data.root, "runtime")));
    const failed = data.dispatch(0, "controlled backend failure");
    const first = await server.handle({ version: 2, operation: "admit", lifetime: server.lifetime,
      observation: data.observation, controlledWriter: true, dispatch: failed });
    if (first.status !== "accepted" || !("ticket" in first)) throw new Error("first not admitted");
    await server.whenIdle();
    await put(data.root, ".review.jsonc", '{"version":1,"excludes":["type.ts"]}\n');
    const second = await server.handle({ version: 2, operation: "admit", lifetime: server.lifetime,
      observation: data.observation, controlledWriter: true, dispatch: failed });
    if (second.status !== "accepted" || !("ticket" in second)) throw new Error("second not admitted");
    await server.whenIdle();
    expect((await collect(server, second.ticket, data, failed)).status).toBe("pending");
    const advice = await collect(server, first.ticket, data, failed);
    expect(advice.status).toBe("advice");
    if (advice.status !== "advice") return;
    expect(advice.findingCount).toBe(0);
    expect(server.acknowledge(advice.token).status).toBe("acknowledged");
    expect(server.finalize(advice.token).status).toBe("finalized");
    expect(await collect(server, first.ticket, data, failed)).toEqual({
      version: 2, status: "unavailable", reason: "backend",
    });
    expect((await collect(server, second.ticket, data, failed)).status).toBe("no-work");
  });

  it("keeps a prior tool-use clear valid when a later tool-use edits the same subject", async () => {
    const data = await fixture();
    const server = new ResidentServer(residentPaths(join(data.root, "runtime")));
    const dispatch = data.dispatch(0);
    const first = await server.handle({ version: 2, operation: "admit", lifetime: server.lifetime,
      observation: data.observation, controlledWriter: true, dispatch });
    if (first.status !== "accepted" || !("ticket" in first)) throw new Error("first not admitted");
    await server.whenIdle();
    expect(await collect(server, first.ticket, data, dispatch)).toEqual({ version: 2, status: "clear" });
    const later = { ...data.observation, advicee: { ...data.observation.advicee, toolUseId: "later-tool" } };
    expect(server.admit(later, dispatch).status).toBe("accepted");
    await server.whenIdle();
    expect(await collect(server, first.ticket, data, dispatch)).toEqual({ version: 2, status: "clear" });
  });

  it("reports expired advice and evicted tickets without claiming clear", async () => {
    const data = await fixture();
    let now = 1_000;
    const server = new ResidentServer(residentPaths(join(data.root, "runtime")), () => now, { maximumTickets: 1 });
    const dispatch = data.dispatch(0.9);
    const first = await server.handle({ version: 2, operation: "admit", lifetime: server.lifetime,
      observation: data.observation, controlledWriter: true, dispatch });
    if (first.status !== "accepted" || !("ticket" in first)) throw new Error("first not admitted");
    await server.whenIdle();
    now += PENDING_ADVICE_EXPIRY_MS + 1;
    expect(await collect(server, first.ticket, data, dispatch)).toEqual({
      version: 2, status: "unavailable", reason: "expired",
    });
    const second = await server.handle({ version: 2, operation: "admit", lifetime: server.lifetime,
      observation: data.observation, controlledWriter: true, dispatch });
    if (second.status !== "accepted" || !("ticket" in second)) throw new Error("second not admitted");
    expect(await collect(server, first.ticket, data, dispatch)).toEqual({
      version: 2, status: "unavailable", reason: "lost",
    });
  });
});
