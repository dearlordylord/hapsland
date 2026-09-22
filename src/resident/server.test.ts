import { describe, expect, it } from "vitest";
import * as Effect from "effect/Effect";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { adaptCodexDirectEvent } from "../direct-event/adapter.ts";
import { addEvent, makeGitFixture, put, recipient } from "../direct-event/test-fixtures.ts";
import { configuredRules } from "../policy/rules.ts";
import { Consent } from "../runtime/consent.ts";
import { loadReviewSettings } from "../runtime/review-config.ts";
import { prepareObservation } from "../direct-event/pipeline.ts";
import { residentPaths } from "./paths.ts";
import { DELIVERY_LEASE_MS, type ResidentDispatchContext } from "./protocol.ts";
import { ResidentServer, residentUnitReservationBytes } from "./server.ts";

const enable = (root: string, statePath: string) => Effect.runPromise(Effect.gen(function* () {
  const consent = yield* Consent.Service;
  const proposal = yield* consent.preview(root, "jev", "https://api.typesafe.ai/v1/systemone");
  yield* consent.enable(proposal);
}).pipe(Effect.provide(Consent.layer({ statePath }))));

describe("resident delivery lease", () => {
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
          { _tag: "Probability", probability: 0.9 },
        ])),
      },
    };
    let clock = 100;
    const server = new ResidentServer(residentPaths(join(root, "runtime")), () => clock);
    expect(server.admit(observation, dispatch).status).toBe("accepted");
    await server.whenIdle();
    expect(server.stats()).toMatchObject({ pendingAdvice: 1, running: 0 });

    const first = await server.collect(root, recipient({ turnId: "later", toolUseId: "collect-1" }), dispatch);
    expect(first.status).toBe("advice");
    if (first.status !== "advice") return;
    server.releaseDelivery(first.token);
    const afterDisconnect = await server.collect(
      root,
      recipient({ turnId: "later", toolUseId: "collect-2" }),
      dispatch,
    );
    expect(afterDisconnect.status).toBe("advice");
    if (afterDisconnect.status !== "advice") return;

    expect(server.acknowledge(afterDisconnect.token).status).toBe("acknowledged");
    clock += DELIVERY_LEASE_MS;
    const afterFailedAck = await server.collect(
      root,
      recipient({ turnId: "later", toolUseId: "collect-3" }),
      dispatch,
    );
    expect(afterFailedAck.status).toBe("advice");
    if (afterFailedAck.status !== "advice") return;
    expect(server.acknowledge(afterFailedAck.token).status).toBe("acknowledged");
    expect(server.finalize(afterFailedAck.token).status).toBe("finalized");
    expect(server.stats()).toMatchObject({ pendingAdvice: 0, retainedBytes: 0 });
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
    expect(server.stats()).toMatchObject({ queued: 0, running: 0, pendingAdvice: 0, retainedBytes: 0 });
  });

  it("accounts each prepared unit exactly and rejects excess units independently", async () => {
    const root = await makeGitFixture();
    const paths = ["a.ts", "b.ts", "c.ts", "d.ts"];
    for (const [fileIndex, path] of paths.entries()) {
      await put(root, path, Array.from(
        { length: 16 },
        (_, declarationIndex) => `type Shape${fileIndex}_${declarationIndex} = number`,
      ).join("\n"));
    }
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
        answers: Object.fromEntries(configuredRules.map((rule) => [
          rule.id,
          { _tag: "Probability", probability: 0.9 },
        ])),
      },
    };
    const server = new ResidentServer(residentPaths(join(root, "runtime")));
    const prepared = await Effect.runPromise(Effect.gen(function* () {
      const consent = yield* Consent.Service;
      const settings = yield* loadReviewSettings(root);
      return yield* prepareObservation(observation, {
        controlledWriter: true,
        recipient: observation.recipient,
        consent,
        settings,
      });
    }).pipe(Effect.provide(Consent.layer({ statePath }))));
    const exactAcceptedBytes = prepared.outcomes.flatMap((outcome) =>
      outcome.status === "ready" ? [residentUnitReservationBytes(observation, dispatch, outcome.prepared)] : [])
      .slice(0, 16)
      .reduce((total, bytes) => total + bytes, 0);
    expect(server.admit(observation, dispatch).status).toBe("accepted");
    await server.whenIdle();

    const metadata = server.pendingAdviceMetadata();
    const stats = server.stats();
    expect(metadata).toHaveLength(16);
    expect(stats).toMatchObject({ pendingAdvice: 16, rejectedCapacity: 48 });
    expect(stats.retainedBytes).toBe(exactAcceptedBytes);
    expect(stats.retainedBytes).toBe(metadata.reduce((total, item) => total + item.retainedBytes, 0));
    expect(readFileSync(capturePath, "utf8").trim().split("\n")).toHaveLength(16);
    expect(metadata.every((item) => item.cycleComplete)).toBe(true);
    expect(metadata.map((item) => item.sequence)).toEqual(
      [...metadata.map((item) => item.sequence)].sort((left, right) => left - right),
    );
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
      recipient({ turnId: "later", toolUseId: "large" }),
      retained.dispatch,
    );
    expect(delivered.status).toBe("advice");
    if (delivered.status === "advice") {
      expect(delivered.output.hookSpecificOutput.additionalContext.length).toBeGreaterThan(16 * 1024);
    }

    const rejected = await run(2 * 1024 * 1024);
    expect(rejected.server.stats()).toMatchObject({ pendingAdvice: 0, rejectedCapacity: 1, retainedBytes: 0 });
    expect(existsSync(rejected.capturePath)).toBe(false);
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
          { _tag: "Probability", probability: 0.9 },
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

    const collectFirst = server.collect(root, recipient({ turnId: "c1", toolUseId: "c1" }), dispatch);
    while (entered.length < 1) await Promise.resolve();
    const collectSecond = server.collect(root, recipient({ turnId: "c2", toolUseId: "c2" }), dispatch);
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
    expect(server.stats()).toMatchObject({ pendingAdvice: 0, retainedBytes: 0 });
  });
});
