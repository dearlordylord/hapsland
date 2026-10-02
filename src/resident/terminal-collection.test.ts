import { describe, expect, it } from "vitest";
import * as Effect from "effect/Effect";
import { join } from "node:path";
import { writeFileSync } from "node:fs";
import { readActivity } from "../activity/status.ts";
import { adaptClaudeDirectEvent } from "../direct-event/adapter.ts";
import { makeGitFixture, put } from "../direct-event/test-fixtures.ts";
import { configuredRules } from "../policy/rules.ts";
import { residentPaths } from "./paths.ts";
import { ResidentServer } from "./server.ts";
import { monotonicNow } from "./hook-clock.ts";
import { PENDING_ADVICE_EXPIRY_MS } from "./collection.ts";
import type { ResidentDispatchContext, ResidentRequest } from "./protocol.ts";

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

const collect = (server: ResidentServer,
  data: Awaited<ReturnType<typeof fixture>>, dispatch: ResidentDispatchContext,
  advicee = data.observation.advicee) => server.handle({
    requestRoute: "shared", operation: "collect", lifetime: server.lifetime,
    root: data.root, advicee, dispatch, composed: true, reportWorkState: true,
  } satisfies ResidentRequest);

describe("common collection and reuse invariants", () => {
  it("joins a claimed evaluation before its owner attaches the request", async () => {
    const data = await fixture();
    const ownerClaimed = deferred();
    const claimJoined = deferred();
    const releaseOwner = deferred();
    const primerEntered = deferred();
    const releasePrimer = deferred();
    const blockersEntered = deferred();
    const releaseBlockers = deferred();
    let evaluationCount = 0;
    const evaluatedIdentities = new Set<string>();
    const evaluatedContracts = new Set<string>();
    let holdOwner = false;
    const server = new ResidentServer(residentPaths(join(data.root, "runtime")), () => 1_000, {
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
      afterReuseBoundary: async (phase) => {
        if (phase === "ownerClaimed" && holdOwner) {
          holdOwner = false;
          ownerClaimed.resolve();
          await releaseOwner.promise;
        }
        if (phase === "claimJoined") claimJoined.resolve();
      },
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
    holdOwner = true;
    const first = server.admit(data.observation, dispatch, true);
    if (first.status !== "accepted") throw new Error("owner not admitted");
    const secondObservation = { ...data.observation,
      advicee: { ...data.observation.advicee, toolUseId: "tool-two" } };
    const second = server.admit(secondObservation, dispatch, true);
    if (second.status !== "accepted") throw new Error("repeat not admitted");
    releaseBlockers.resolve();
    await ownerClaimed.promise;
    try {
      await claimJoined.promise;
      expect(await collect(server, data, dispatch, secondObservation.advicee))
        .toEqual({ status: "pending" });
    } finally {
      releaseOwner.resolve();
    }
    await server.whenIdle();
    expect(await collect(server, data, dispatch)).toEqual({ status: "empty" });
    expect(await collect(server, data, dispatch, secondObservation.advicee))
      .toEqual({ status: "empty" });
      expect(evaluationCount).toBe(4);
      expect(evaluatedIdentities.size).toBe(1);
      expect([...evaluatedContracts]).toEqual(["direct-event/type-shape/v1"]);
      // Primer, both blockers, and owner occupy four distinct session partitions.
      expect(server.accountingMetrics()).toMatchObject({ successfulCacheEntries: 4, pendingEvaluations: 0 });
    const activity = readActivity({ statePath: activityPath, root: data.root,
      sessionId: data.observation.advicee.sessionId,
      resident: { available: true, lifetime: server.lifetime } });
    expect(activity.counts.unavailable).toBe(0);
    expect(activity.counts.clear).toBeGreaterThan(0);
  });

  it("releases an owner claim if preparation exits before attachment", async () => {
    const data = await fixture();
    let failOnce = true;
    const server = new ResidentServer(residentPaths(join(data.root, "runtime")), () => 1_000, {
      afterReuseBoundary: () => {
        if (failOnce) { failOnce = false; throw new Error("fixture interruption"); }
      },
    });
    const dispatch = data.dispatch(0);
    const first = server.admit(data.observation, dispatch);
    if (first.status !== "accepted") throw new Error("first not admitted");
    await server.whenIdle();
    expect(server.accountingMetrics().pendingEvaluations).toBe(0);
    const second = server.admit(data.observation, dispatch);
    if (second.status !== "accepted") throw new Error("second not admitted");
    await server.whenIdle();
    expect(await collect(server, data, dispatch)).toEqual({ status: "empty" });
    expect(server.accountingMetrics()).toMatchObject({ successfulCacheEntries: 1, pendingEvaluations: 0 });
  });

  it("delivers findings without returning a aggregate terminal result", async () => {
    const data = await fixture();
    const server = new ResidentServer(residentPaths(join(data.root, "runtime")));
    const dispatch = data.dispatch(0.9);
    const admission = server.admit(data.observation, dispatch);
    if (admission.status !== "accepted") throw new Error("not admitted");
    await server.whenIdle();
    for (let index = 0; index < 16; index += 1) {
      const advice = await collect(server, data, dispatch);
      if (advice.status !== "advice") break;
      expect(server.acknowledge(advice.token).status).toBe("acknowledged");
      expect(server.finalize(advice.token).status).toBe("finalized");
      expect(server.acknowledge(advice.token).status).toBe("empty");
      expect(server.finalize(advice.token).status).toBe("empty");
    }
    expect(await collect(server, data, dispatch)).toEqual({ status: "empty" });
  });

  it("keeps a mixed finding and failed unit separately visible after advice finalization", async () => {
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
    const activityPath = join(data.root, "mixed-activity");
    const dispatch = { ...data.dispatch(0.9), activityPath };
    const admission = server.admit(observation, dispatch);
    if (admission.status !== "accepted") throw new Error("not admitted");
    await server.whenIdle();
    let delivered = false;
    for (let index = 0; index < 16; index += 1) {
      const outcome = await collect(server, data, dispatch);
      if (outcome.status !== "advice") break;
      if (outcome.findingCount > 0) delivered = true;
      expect(server.acknowledge(outcome.token).status).toBe("acknowledged");
      expect(server.finalize(outcome.token).status).toBe("finalized");
    }
    expect(delivered).toBe(true);
    expect(await collect(server, data, dispatch)).toEqual({ status: "empty" });
    const activity = readActivity({ statePath: activityPath, root: data.root,
      sessionId: data.observation.advicee.sessionId,
      resident: { available: true, lifetime: server.lifetime } });
    expect(activity.findings).toBeGreaterThan(0);
    expect(activity.counts.unavailable).toBeGreaterThan(0);
  });

  it("keeps advice pending for simultaneous collectors and failed acknowledgement", async () => {
    const data = await fixture();
    const server = new ResidentServer(residentPaths(join(data.root, "runtime")), () => 1_000);
    const dispatch = data.dispatch(0.9);
    const admission = server.admit(data.observation, dispatch);
    if (admission.status !== "accepted") throw new Error("not admitted");
    await server.whenIdle();
    const outcomes = await Promise.all([
      collect(server, data, dispatch),
      collect(server, data, dispatch),
    ]);
    expect(outcomes.filter((outcome) => outcome.status === "advice")).toHaveLength(1);
    expect(outcomes.filter((outcome) => outcome.status === "pending")).toHaveLength(1);
    const advice = outcomes.find((outcome) => outcome.status === "advice");
    if (advice?.status !== "advice") throw new Error("advice was not leased");
    server.releaseDelivery(advice.token);
    expect((await collect(server, data, dispatch)).status).toBe("advice");
  });

  it("leases eligible advice from another admission for the same Claude advicee", async () => {
    const data = await fixture();
    const server = new ResidentServer(residentPaths(join(data.root, "runtime")));
    const dispatch = data.dispatch(0.9);
    const finding = server.admit(data.observation, dispatch);
    const skipped = server.admit({ ...data.observation, candidates: [{ operation: "delete", path: "type.ts", addedLines: [] }] }, dispatch);
    if (finding.status !== "accepted" ||
        skipped.status !== "accepted") throw new Error("not admitted");
    await server.whenIdle();
    const other = await collect(server, data, dispatch);
    expect(other.status).toBe("advice");
    expect((await collect(server, data, dispatch)).status).toBe("pending");
    if (other.status === "advice") server.releaseDelivery(other.token);
    expect((await collect(server, data, dispatch)).status).toBe("advice");
  });

  it("shares one identical finding with two admissions and does not return a terminal result", async () => {
    const data = await fixture();
    const server = new ResidentServer(residentPaths(join(data.root, "runtime")));
    const dispatch = data.dispatch(0.9);
    const first = server.admit(data.observation, dispatch);
    if (first.status !== "accepted") throw new Error("first not admitted");
    await server.whenIdle();
    const second = server.admit(data.observation, dispatch);
    if (second.status !== "accepted") throw new Error("second not admitted");
    await server.whenIdle();
    let advice = await collect(server, data, dispatch);
    expect(advice.status).toBe("advice");
    for (let index = 0; index < 16 && advice.status === "advice"; index += 1) {
      expect(server.acknowledge(advice.token).status).toBe("acknowledged");
      expect(server.finalize(advice.token).status).toBe("finalized");
      advice = await collect(server, data, dispatch);
    }
    expect(advice).toEqual({ status: "empty" });
    expect(await collect(server, data, dispatch)).toEqual({ status: "empty" });
  });

  it("accounts for a cached clear on a later admission", async () => {
    const data = await fixture();
    const server = new ResidentServer(residentPaths(join(data.root, "runtime")));
    const dispatch = data.dispatch(0);
    const first = server.admit(data.observation, dispatch);
    if (first.status !== "accepted") throw new Error("first not admitted");
    await server.whenIdle();
    expect(await collect(server, data, dispatch)).toEqual({ status: "empty" });
    const second = server.admit(data.observation, dispatch);
    if (second.status !== "accepted") throw new Error("second not admitted");
    await server.whenIdle();
    expect(await collect(server, data, dispatch)).toEqual({ status: "empty" });
  });

  it("returns quietly when file policy excludes the admitted edit", async () => {
    const data = await fixture();
    await put(data.root, ".review.jsonc", '{"version":1,"excludes":["type.ts"]}\n');
    const server = new ResidentServer(residentPaths(join(data.root, "runtime")));
    const dispatch = data.dispatch(0);
    const admission = server.admit(data.observation, dispatch);
    if (admission.status !== "accepted") throw new Error("not admitted");
    await server.whenIdle();
    expect(await collect(server, data, dispatch)).toEqual({ status: "empty" });
  });

  it("keeps failure diagnostics out of Claude output", async () => {
    const data = await fixture();
    const server = new ResidentServer(residentPaths(join(data.root, "runtime")));
    const failed = data.dispatch(0, "controlled backend failure");
    const first = server.admit(data.observation, failed);
    if (first.status !== "accepted") throw new Error("first not admitted");
    await server.whenIdle();
    await put(data.root, ".review.jsonc", '{"version":1,"excludes":["type.ts"]}\n');
    const second = server.admit(data.observation, failed);
    if (second.status !== "accepted") throw new Error("second not admitted");
    await server.whenIdle();
    expect(await collect(server, data, failed)).toEqual({ status: "empty" });
    expect(server.stats().pendingOperationalNotices).toBeGreaterThan(0);
    expect(await collect(server, data, failed)).toEqual({ status: "empty" });
    expect(await collect(server, data, failed)).toEqual({ status: "empty" });
  });
});
