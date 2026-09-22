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
import { analyzerMaterializationPreflight } from "../direct-event/analyzer.ts";
import { residentPaths } from "./paths.ts";
import { DELIVERY_LEASE_MS, type ResidentDispatchContext } from "./protocol.ts";
import { ResidentServer, residentUnitReservationBytes } from "./server.ts";

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
      { _tag: "Probability", probability: 0.9 },
    ])),
  },
});

const longNestedPath = `${Array.from({ length: 14 }, (_, index) =>
  `segment-${index}-${"x".repeat(180)}`).join("/")}/types.ts`;

const mutuallyReferencingTypes = () => Array.from({ length: 17 }, (_, index) => {
  const fields = Array.from({ length: 17 }, (_unused, target) => target === index
    ? undefined
    : `p${target}: Type${target}`).filter((value) => value !== undefined).join("; ");
  return `interface Type${index} { ${fields} }`;
}).join("\n");

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
    expect(server.stats()).toMatchObject({ queued: 0, running: 0, pendingAdvice: 0, retainedBytes: 0 });
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
        recipient: observation.recipient,
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
    expect(rejected.server.accountingMetrics()).toMatchObject({ maxMaterializedPreparedUnits: 0 });
    expect(rejected.server.accountingMetrics().peakLedgerBytes).toBeLessThanOrEqual(2 * 1024 * 1024);

    const transportRejected = await run(300 * 1024);
    expect(transportRejected.server.stats()).toMatchObject({ pendingAdvice: 0, rejectedCapacity: 1, retainedBytes: 0 });
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

  it("retains advice when revalidation expansion cannot reserve workspace", async () => {
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
      recipient({ turnId: "pressure", toolUseId: "pressure" }),
      dispatch,
    )).resolves.toMatchObject({ status: "empty" });
    expect(server.stats()).toMatchObject({ pendingAdvice: 1, retainedBytes: before.retainedBytes });

    await put(root, longNestedPath, original);
    const recovered = await server.collect(
      root,
      recipient({ turnId: "recovered", toolUseId: "recovered" }),
      dispatch,
    );
    expect(recovered.status).toBe("advice");
    if (recovered.status === "advice") {
      expect(server.acknowledge(recovered.token).status).toBe("acknowledged");
      expect(server.finalize(recovered.token).status).toBe("finalized");
    }
    expect(server.stats()).toMatchObject({
      pendingAdvice: 0,
      retainedBytes: server.accountingMetrics().successfulCacheBytes,
    });
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
      recipient({ turnId: "later", toolUseId: "replacement-collect" }),
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
        recipient: {
          ...first.recipient,
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
      recipient({ turnId: "after-storm", toolUseId: "after-storm" }),
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
      recipient({ turnId: "collecting", toolUseId: "collecting" }),
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
      recipient({ turnId: "later", toolUseId: "replacement" }),
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
      recipient({ turnId: "collecting", toolUseId: "collecting" }),
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
      recipient({ turnId: "later", toolUseId: "replacement" }),
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
      recipient({ turnId: "held-A", toolUseId: "held-A" }),
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
      recipient({ turnId: "C", toolUseId: "C" }),
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
      recipient({ turnId: "later", toolUseId: "multi" }),
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
      recipient({ turnId: "later", toolUseId: "unavailable" }),
      dispatch,
    )).resolves.toMatchObject({ status: "empty" });
    expect(server.stats().pendingAdvice).toBe(1);
    expect(await server.collect(
      root,
      recipient({ agentId: "other", turnId: "other", toolUseId: "other" }),
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
      recipient({ turnId: "later", toolUseId: "rules" }),
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
    const firstRetainedBytes = server.pendingAdviceMetadata()[0]?.retainedBytes;
    expect(firstRetainedBytes).toBeDefined();

    const collected = await server.collect(
      root,
      recipient({ turnId: "saturated", toolUseId: "saturated" }),
      dispatch,
    );
    expect(collected.status).toBe("advice");
    if (collected.status !== "advice") return;
    expect(server.acknowledge(collected.token).status).toBe("acknowledged");
    expect(server.finalize(collected.token).status).toBe("finalized");
    expect(server.stats()).toMatchObject({ pendingAdvice: 15 });
    expect(server.stats().retainedBytes).toBe(saturated.retainedBytes - (firstRetainedBytes ?? 0));
  });

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
    const firstRetainedBytes = server.pendingAdviceMetadata()[0]?.retainedBytes;
    expect(firstRetainedBytes).toBeDefined();

    const collected = await server.collect(
      root,
      recipient({ agentId: "agent-0", turnId: "global", toolUseId: "global" }),
      dispatch,
    );
    expect(collected.status).toBe("advice");
    if (collected.status !== "advice") return;
    expect(server.acknowledge(collected.token).status).toBe("acknowledged");
    expect(server.finalize(collected.token).status).toBe("finalized");
    expect(server.stats()).toMatchObject({ pendingAdvice: 63 });
    expect(server.stats().retainedBytes).toBe(saturated.retainedBytes - (firstRetainedBytes ?? 0));
  });

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
      recipient({ turnId: "scan", toolUseId: "scan" }),
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
    const deliveredA = await server.collect(root, recipient({ turnId: "A", toolUseId: "A" }), dispatch);
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
});
