import { describe, expect, it } from "vitest";
import * as Effect from "effect/Effect";
import { join } from "node:path";
import { readFileSync, writeFileSync } from "node:fs";
import { connect } from "node:net";
import { adaptClaudeDirectEvent } from "../direct-event/adapter.ts";
import type { DirectObservation } from "../direct-event/model.ts";
import { makeGitFixture, put } from "../direct-event/test-fixtures.ts";
import { configuredRules } from "../policy/rules.ts";
import { residentPaths } from "./paths.ts";
import { ResidentServer } from "./server.ts";
import { admitAndCollect, residentRequest } from "./client.ts";
import { monotonicNow } from "./hook-clock.ts";
import { encodeCurrentResidentRequest, type ResidentDispatchContext, type ResidentRequest, type ResidentResponse } from "./protocol.ts";

const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
};
const fixture = async () => {
  const root = await makeGitFixture();
  const userConfigPath = join(root, "user.jsonc");
  const feedback = (mode: string) => writeFileSync(userConfigPath, JSON.stringify({ version: 1, claudeFeedbackMode: mode }));
  feedback("advisory");
  const observation = async (toolUseId = "first", sessionId = "session", subagentId: string | null = null): Promise<DirectObservation> => {
    const content = `type ${toolUseId}Count = number\n`;
    const path = await put(root, `${toolUseId}.ts`, content);
    const value = await Effect.runPromise(adaptClaudeDirectEvent({
      hook_event_name: "PostToolUse", tool_name: "Write", cwd: root, session_id: sessionId,
      tool_use_id: toolUseId, ...(subagentId === null ? {} : { agent_id: subagentId }),
      tool_input: { file_path: path, content },
      tool_response: { filePath: path, content, originalFile: null, userModified: false },
    }));
    if (value === undefined) throw new Error("expected observation");
    return value;
  };
  const dispatch: ResidentDispatchContext = { statePath: join(root, "consent"), userConfigPath,
    credential: null, controlled: { answers: Object.fromEntries(configuredRules.map((rule) => [
      rule.id, { _tag: "Probability", probability: rule.id === "r6_bare_domain_value" ? 0.9 : 0 },
    ])) } };
  return { root, feedback, observation, dispatch };
};
const permit = async (server: ResidentServer, observation: DirectObservation) => {
  expect((await server.handle({ requestRoute: "shared", operation: "register-edit", lifetime: server.lifetime,
    root: observation.root, advicee: observation.advicee, startedAt: monotonicNow() - 1 })).status).toBe("advanced");
};
const request = (server: ResidentServer, observation: DirectObservation, dispatch: ResidentDispatchContext,
  waitMs = 1_200): Extract<ResidentRequest, { operation: "admit-and-collect" }> => ({
  requestRoute: "edit", operation: "admit-and-collect", lifetime: server.lifetime,
  observation, controlledWriter: true, composed: true, dispatch, waitMs,
});
const send = (server: ResidentServer, observation: DirectObservation, dispatch: ResidentDispatchContext, waitMs = 1_200) =>
  residentRequest(server.paths, request(server, observation, dispatch, waitMs), 2_500);
const ordinary = (server: ResidentServer, observation: DirectObservation, dispatch: ResidentDispatchContext) =>
  server.handle({ requestRoute: "shared", operation: "collect", lifetime: server.lifetime,
    root: observation.root, advicee: observation.advicee, dispatch, composed: true });
const text = (response: ResidentResponse) => response.status === "advice"
  ? "reason" in response.output ? response.output.reason : response.output.hookSpecificOutput.additionalContext : "";

// All synchronous responses here cross the actual socket and final handoff barrier.
describe("registry-free Claude edit response", () => {
  it.each(["advisory", "block-current-findings"])("returns current %s feedback through one RPC", async (mode) => {
    const data = await fixture(); data.feedback(mode);
    const observation = await data.observation();
    const server = new ResidentServer(residentPaths(join(data.root, "runtime")));
    await server.listen();
    try {
      await permit(server, observation);
      const outcome = await admitAndCollect(observation, data.dispatch, performance.now() + 2_500, server.paths);
      expect(outcome.status).toBe("advice");
      if (outcome.status !== "advice") throw new Error("missing advice");
      expect(outcome.advice.output).toHaveProperty(mode === "advisory" ? "hookSpecificOutput" : "decision");
      expect(outcome).not.toHaveProperty("ticket");
      const wire = JSON.stringify(outcome.advice.output);
      expect(Buffer.byteLength(wire + "\n")).toBeLessThanOrEqual(10_240);
      expect(wire).toContain("firstCount");
      expect(server.accountingMetrics()).not.toHaveProperty("tickets");
    } finally { await server.close(); }
  });

  it.each(["clear", "no-work", "failure"])("returns quietly after %s without an aggregate outcome", async (kind) => {
    const data = await fixture();
    const base = await data.observation();
    const observation = kind === "no-work" ? { ...base, candidates: [{ operation: "delete" as const, path: "first.ts", addedLines: [] as const }] } : base;
    const dispatch = { ...data.dispatch, controlled: kind === "failure" ? { failure: "controlled failure" }
      : { answers: Object.fromEntries(configuredRules.map((rule) => [rule.id, { _tag: "Probability", probability: 0 }])) } };
    const server = new ResidentServer(residentPaths(join(data.root, "runtime")));
    await server.listen();
    try {
      await permit(server, observation);
      expect(await send(server, observation, dispatch)).toEqual({ requestRoute: "edit", status: "empty" });
      await server.whenIdle();
      expect(server.stats().pendingFindingBatches).toBe(0);
    } finally { await server.close(); }
  });

  it("B's response includes A's still-current advice and keeps one exclusive delivery lease", async () => {
    const data = await fixture(); const first = await data.observation(); const second = await data.observation("second");
    const server = new ResidentServer(residentPaths(join(data.root, "runtime")));
    await server.listen();
    try {
      await permit(server, first);
      expect((await server.handle({ requestRoute: "shared", operation: "admit", lifetime: server.lifetime,
        observation: first, controlledWriter: true, composed: true, dispatch: data.dispatch })).status).toBe("accepted");
      await server.whenIdle();
      expect(server.stats().pendingFindingBatches).toBe(1);
      await permit(server, second);
      expect(server.stats().pendingFindingBatches).toBe(1);
      const response = await send(server, second, data.dispatch);
      expect(response.status).toBe("advice");
      expect(text(response)).toContain("firstCount");
      expect(server.pendingAdviceMetadata().find((item) => item.path === "first.ts")?.delivery).toBe("leased-unacknowledged");
      if (response.status !== "advice") throw new Error("missing advice");
      expect(server.beginComposedSubmission(response.token, "edit").status).toBe("submitting");
      expect(server.acknowledge(response.token).status).toBe("acknowledged");
      expect(server.finalize(response.token).status).toBe("finalized");
      expect(server.finalize(response.token).status).toBe("empty");
      await server.whenIdle();
      const later = await ordinary(server, second, data.dispatch);
      expect(text(later)).not.toContain("firstCount");
      if (response.findingCount === 1) expect(text(later)).toContain("secondCount");
    } finally { await server.close(); }
  });

  it.each(["session", "child", "root"])("never collects another %s's advice", async (scope) => {
    const data = await fixture(); const first = await data.observation();
    const other = scope === "root" ? await fixture() : data;
    const second = await other.observation("second", scope === "session" ? "other-session" : "session", scope === "child" ? "child" : null);
    const server = new ResidentServer(residentPaths(join(data.root, "runtime")));
    await server.listen();
    try {
      await permit(server, first); expect(server.admit(first, data.dispatch, true, true).status).toBe("accepted");
      await server.whenIdle(); expect(server.pendingAdviceMetadata()).toHaveLength(1); await permit(server, second);
      const response = await send(server, second, other.dispatch);
      expect(text(response)).toContain("secondCount"); expect(text(response)).not.toContain("firstCount");
      await server.whenIdle();
      expect((await ordinary(server, first, data.dispatch)).status).toBe("advice");
    } finally { await server.close(); }
  });

  it("concurrent response attempts freeze opt-in independently and compete for a common lease", async () => {
    const data = await fixture(); const first = await data.observation(); const second = await data.observation("second");
    const entered = deferred(); const release = deferred(); let evaluated = false;
    const server = new ResidentServer(residentPaths(join(data.root, "runtime")), undefined, {
      beforeEvaluate: async () => { if (!evaluated) { evaluated = true; entered.resolve(); } await release.promise; },
    });
    await server.listen();
    try {
      await permit(server, first);
      const a = send(server, first, data.dispatch);
      await entered.promise; data.feedback("block-current-findings"); await permit(server, second);
      const b = send(server, second, data.dispatch);
      release.resolve();
      const responses = await Promise.all([a, b]);
      if (responses[0]?.status === "advice") expect(responses[0].output).toHaveProperty("hookSpecificOutput");
      if (responses[1]?.status === "advice") expect(responses[1].output).toHaveProperty("decision", "block");
      expect(responses.filter((response) => response.status === "advice").reduce((n, response) =>
        n + (response.status === "advice" ? response.findingCount : 0), 0)).toBe(2);
    } finally { release.resolve(); await server.close(); }
  });

  it.each(["opt-in", "revoke", "project-narrowing", "source", "rotate", "suspend", "expiry", "round-closed"])(
    "rechecks %s after provisional selection at the final handoff", async (change) => {
      const data = await fixture(); const observation = await data.observation();
      if (change === "revoke" || change === "project-narrowing") data.feedback("block-current-findings");
      const statePath = join(data.root, "credential-state.json");
      writeFileSync(statePath, JSON.stringify({ version: 1, generation: 1, savedUseSuspended: false }));
      const dispatch: ResidentDispatchContext = change === "rotate" || change === "suspend" ? {
        ...data.dispatch, credential: { name: "TYPESAFE_API_KEY", environmentValue: "synthetic-test-value",
          environmentOnly: false, generation: 1, statePath }, controlled: { ...data.dispatch.controlled, requireCredential: true },
      } : data.dispatch;
      let enabled = false; let now = 1_000;
      const server = new ResidentServer(residentPaths(join(data.root, "runtime")), () => now, {
        beforeResponseHandoff: async () => {
          if (!enabled) return;
          if (change === "opt-in") data.feedback("block-current-findings");
          if (change === "revoke") data.feedback("advisory");
          if (change === "project-narrowing") writeFileSync(join(data.root, ".realtime-review.jsonc"),
            JSON.stringify({ version: 1, claudeFeedbackMode: "advisory" }));
          if (change === "source") writeFileSync(join(data.root, "first.ts"), "type firstCount = string\n");
          if (change === "rotate" || change === "suspend") writeFileSync(statePath, JSON.stringify({
            version: 1, generation: change === "rotate" ? 2 : 1, savedUseSuspended: change === "suspend",
          }));
          if (change === "expiry") now += 600_000;
          if (change === "round-closed") {
            await server.handle({ requestRoute: "shared", operation: "begin-stop", lifetime: server.lifetime,
              root: data.root, advicee: observation.advicee, token: "close" });
            await server.handle({ requestRoute: "shared", operation: "finish-stop", lifetime: server.lifetime,
              root: data.root, advicee: observation.advicee, token: "close", close: true });
          }
        },
      });
      await server.listen();
      try {
        await permit(server, observation); enabled = true;
        const response = await send(server, observation, dispatch);
        if (change === "opt-in") {
          expect(response.status).toBe("advice");
          if (response.status === "advice") expect(response.output).toHaveProperty("hookSpecificOutput");
        } else {
          expect(response.status).not.toBe("advice");
          if (change === "rotate" || change === "suspend") expect(response).toMatchObject({ status: "unavailable", reason: "credential" });
          if (change === "expiry") expect(response).toMatchObject({ status: "unavailable", reason: "expired" });
          if (change === "round-closed") expect(response).toMatchObject({ status: "unavailable", reason: "lost" });
        }
      } finally { await server.close(); }
    },
  );

  it("checks B's collector credentials even when selected advice belongs to still-authorized A", async () => {
    const data = await fixture(); const first = await data.observation(); const second = await data.observation("second");
    const credential = (name: string): ResidentDispatchContext => {
      const statePath = join(data.root, `${name}-credentials.json`);
      writeFileSync(statePath, JSON.stringify({ version: 1, generation: 1, savedUseSuspended: false }));
      return { ...data.dispatch, credential: { name: "TYPESAFE_API_KEY", environmentValue: "synthetic-test-value",
        environmentOnly: false, generation: 1, statePath }, controlled: { ...data.dispatch.controlled, requireCredential: true } };
    };
    const a = credential("a"); const b = credential("b"); let gated = false;
    const server = new ResidentServer(residentPaths(join(data.root, "runtime")), undefined, {
      beforeResponseHandoff: async () => {
        if (gated && b.credential !== null) writeFileSync(b.credential.statePath,
          JSON.stringify({ version: 1, generation: 2, savedUseSuspended: false }));
      },
    });
    await server.listen();
    try {
      await permit(server, first); expect(server.admit(first, a, true, true).status).toBe("accepted");
      await server.whenIdle(); await permit(server, second); gated = true;
      expect(await send(server, second, b)).toMatchObject({ status: "unavailable", reason: "credential" });
      expect(server.pendingAdviceMetadata().find((item) => item.path === "first.ts")?.delivery).toBe("available");
      expect(a.credential === null ? undefined : JSON.parse(readFileSync(a.credential.statePath, "utf8")).generation).toBe(1);
    } finally { await server.close(); }
  });

  it("a request timeout leaves resident work running for later collection", async () => {
    const data = await fixture(); const observation = await data.observation();
    const entered = deferred(); const release = deferred();
    const server = new ResidentServer(residentPaths(join(data.root, "runtime")), undefined, {
      beforeEvaluate: async () => { entered.resolve(); await release.promise; },
    });
    await server.listen();
    try {
      await permit(server, observation);
      const response = send(server, observation, data.dispatch, 20);
      await entered.promise; expect(await response).toMatchObject({ status: "pending" });
      expect(server.stats().running).toBeGreaterThan(0);
      release.resolve(); await server.whenIdle();
      expect((await ordinary(server, observation, data.dispatch)).status).toBe("advice");
    } finally { release.resolve(); await server.close(); }
  });

  it("disconnect while review is running leaves that review resident-owned", async () => {
    const data = await fixture(); const observation = await data.observation();
    const entered = deferred(); const release = deferred();
    const server = new ResidentServer(residentPaths(join(data.root, "runtime")), undefined, {
      beforeEvaluate: async () => { entered.resolve(); await release.promise; },
    });
    await server.listen();
    try {
      await permit(server, observation);
      const socket = connect(server.paths.socket);
      socket.on("error", () => undefined);
      socket.once("connect", () => socket.write(encodeCurrentResidentRequest(request(server, observation, data.dispatch)) + "\n"));
      await entered.promise;
      const closed = new Promise<void>((resolve) => socket.once("close", () => resolve()));
      socket.destroy(); await closed;
      await residentRequest(server.paths, { requestRoute: "shared", operation: "hello" });
      expect(server.stats().running).toBeGreaterThan(0);
      release.resolve(); await server.whenIdle();
      expect((await ordinary(server, observation, data.dispatch)).status).toBe("advice");
    } finally { release.resolve(); await server.close(); }
  });

  it("disconnect during revalidation releases the provisional lease without cancelling review", async () => {
    const data = await fixture(); const first = await data.observation(); const second = await data.observation("second");
    const entered = deferred(); const release = deferred(); let pause = true;
    const server = new ResidentServer(residentPaths(join(data.root, "runtime")), undefined, {
      beforeRevalidate: async () => { if (pause) { entered.resolve(); await release.promise; } },
    });
    await server.listen();
    try {
      await permit(server, first);
      const socket = connect(server.paths.socket);
      socket.on("error", () => undefined);
      socket.once("connect", () => socket.write(encodeCurrentResidentRequest(request(server, first, data.dispatch)) + "\n"));
      await entered.promise;
      const closed = new Promise<void>((resolve) => socket.once("close", () => resolve()));
      socket.destroy(); await closed;
      pause = false; release.resolve(); await server.whenIdle();
      await permit(server, second);
      const response = await send(server, second, data.dispatch);
      expect(response.status).toBe("advice");
      expect(text(response)).toContain("firstCount");
    } finally { release.resolve(); await server.close(); }
  });

  it("disconnect at final handoff releases a selected lease for another collector", async () => {
    const data = await fixture(); const observation = await data.observation();
    const entered = deferred(); const release = deferred(); let gated = false;
    const server = new ResidentServer(residentPaths(join(data.root, "runtime")), undefined, {
      beforeResponseHandoff: async () => { if (gated) { entered.resolve(); await release.promise; } },
    });
    await server.listen();
    try {
      await permit(server, observation); gated = true;
      const socket = connect(server.paths.socket);
      socket.on("error", () => undefined);
      socket.once("connect", () => socket.write(encodeCurrentResidentRequest(request(server, observation, data.dispatch)) + "\n"));
      await entered.promise;
      expect(server.pendingAdviceMetadata()[0]?.delivery).toBe("leased-unacknowledged");
      const closed = new Promise<void>((resolve) => socket.once("close", () => resolve()));
      socket.destroy(); await closed;
      // A subsequent socket response also fences processing of the close event.
      gated = false;
      await residentRequest(server.paths, { requestRoute: "shared", operation: "hello" });
      expect(server.pendingAdviceMetadata()[0]?.delivery).toBe("available");
      expect((await ordinary(server, observation, data.dispatch)).status).toBe("advice");
    } finally { release.resolve(); await server.close(); }
  });

  it("a replacement resident cannot continue a previous response attempt", async () => {
    const data = await fixture(); const observation = await data.observation();
    const paths = residentPaths(join(data.root, "runtime"));
    const previous = new ResidentServer(paths); await previous.listen();
    const oldRequest = request(previous, observation, data.dispatch);
    await previous.close();
    const replacement = new ResidentServer(paths); await replacement.listen();
    try {
      expect(await residentRequest(paths, oldRequest)).toMatchObject({ status: "unavailable", reason: "lost" });
      expect(replacement.stats().queued).toBe(0); expect(replacement.stats().running).toBe(0);
    } finally { await replacement.close(); }
  });

  it("settled quiet RPCs retain no authority that prevents lifetime cleanup", async () => {
    const data = await fixture(); const observation = await data.observation();
    const server = new ResidentServer(residentPaths(join(data.root, "runtime"))); await server.listen();
    const dispatch = { ...data.dispatch, controlled: { answers: Object.fromEntries(configuredRules.map((rule) =>
      [rule.id, { _tag: "Probability", probability: 0 }])) } };
    try {
      await permit(server, observation); expect(await send(server, observation, dispatch)).toMatchObject({ status: "empty" });
      await server.whenIdle();
      await server.handle({ requestRoute: "shared", operation: "begin-stop", lifetime: server.lifetime,
        root: data.root, advicee: observation.advicee, token: "settled" });
      await server.handle({ requestRoute: "shared", operation: "finish-stop", lifetime: server.lifetime,
        root: data.root, advicee: observation.advicee, token: "settled", close: true });
      expect(server.cleanup()).toBe("cleaned");
      expect(server.stats()).toMatchObject({ retainedBytes: 0, currentWork: 0, pendingEvaluations: 0, pendingAdvice: 0 });
    } finally { await server.close(); }
  });

  it("binds admission to the native tool permit and original resident lifetime", async () => {
    const data = await fixture(); const observation = await data.observation();
    const server = new ResidentServer(residentPaths(join(data.root, "runtime")));
    await server.listen();
    try {
      await permit(server, observation);
      if (observation.advicee.host !== "claude-code") throw new Error("expected Claude observation");
      for (const mismatched of [
        { ...observation, advicee: { ...observation.advicee, toolUseId: "wrong" } },
        { ...observation, advicee: { ...observation.advicee, sessionId: "wrong" } },
        { ...observation, advicee: { ...observation.advicee, subagentId: "wrong" } },
        { ...observation, root: join(data.root, "other-root") },
      ]) expect((await send(server, mismatched, data.dispatch)).status).toBe("rejected-stale");
      expect(await residentRequest(server.paths, { ...request(server, observation, data.dispatch), lifetime: "previous-lifetime" }))
        .toMatchObject({ status: "unavailable", reason: "lost" });
      expect(server.stats().running).toBe(0);
      expect((await send(server, observation, data.dispatch)).status).toBe("advice");
      expect((await send(server, observation, data.dispatch)).status).toBe("rejected-stale");
      expect(readFileSync(join(data.root, "first.ts"), "utf8")).toContain("firstCount");
    } finally { await server.close(); }
  });
});
