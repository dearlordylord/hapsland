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
          { _tag: "Probability", probability: rule.id === "r6_bare_domain_value" ? 0.9 : 0 },
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
    expect(delivered.status).toBe("empty");
    expect(retained.server.stats()).toMatchObject({ pendingAdvice: 1 });

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
    // The restored advice is current but its long path cannot fit the 2 KiB
    // response envelope. A zero-item batch is not delivery, so it stays owned.
    expect(recovered.status).toBe("empty");
    expect(server.stats()).toMatchObject({ pendingAdvice: 1, retainedBytes: before.retainedBytes });
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
    const firstBatchBytes = server.pendingAdviceMetadata().slice(0, 5)
      .reduce((total, item) => total + item.retainedBytes, 0);

    const collected = await server.collect(
      root,
      recipient({ turnId: "saturated", toolUseId: "saturated" }),
      dispatch,
    );
    expect(collected.status).toBe("advice");
    if (collected.status !== "advice") return;
    expect(server.acknowledge(collected.token).status).toBe("acknowledged");
    expect(server.finalize(collected.token).status).toBe("finalized");
    expect(server.stats()).toMatchObject({ pendingAdvice: 11 });
    expect(server.stats().retainedBytes).toBe(saturated.retainedBytes - firstBatchBytes);
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
    const firstBatchBytes = server.pendingAdviceMetadata().filter(({ partition }) =>
      partition.includes('"agentId":"agent-0"')).slice(0, 5)
      .reduce((total, item) => total + item.retainedBytes, 0);

    const collected = await server.collect(
      root,
      recipient({ agentId: "agent-0", turnId: "global", toolUseId: "global" }),
      dispatch,
    );
    expect(collected.status).toBe("advice");
    if (collected.status !== "advice") return;
    expect(server.acknowledge(collected.token).status).toBe("acknowledged");
    expect(server.finalize(collected.token).status).toBe("finalized");
    expect(server.stats()).toMatchObject({ pendingAdvice: 59 });
    expect(server.stats().retainedBytes).toBe(saturated.retainedBytes - firstBatchBytes);
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
    const agentId = "界".repeat(16_384);
    const padding = "p".repeat(56 * 1024);
    const observation = {
      ...base,
      recipient: { ...base.recipient, sessionId, agentId },
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
      { ...observation.recipient, agentId: `${agentId.slice(0, -1)}z` },
      dispatch,
    )).toMatchObject({ status: "empty" });
    expect(server.pendingAdviceMetadata().map(({ id, delivery }) => ({ id, delivery }))).toEqual(
      metadata.map(({ id }) => ({ id, delivery: "available" })),
    );
    const otherRoot = await makeGitFixture();
    expect(await server.collect(otherRoot, observation.recipient, dispatch)).toMatchObject({ status: "empty" });
    expect(server.pendingAdviceMetadata().map(({ id, delivery }) => ({ id, delivery }))).toEqual(
      metadata.map(({ id }) => ({ id, delivery: "available" })),
    );
  });
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

    const first = await server.collect(root, recipient({ turnId: "first", toolUseId: "first" }), dispatch);
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

    const second = await server.collect(root, recipient({ turnId: "second", toolUseId: "second" }), dispatch);
    expect(second.status).toBe("advice");
    if (second.status !== "advice") return;
    expect(second.output.hookSpecificOutput.additionalContext.split("\n").slice(1)).toHaveLength(4);
    expect(server.acknowledge(second.token).status).toBe("acknowledged");
    expect(server.finalize(second.token).status).toBe("finalized");
    expect(server.stats()).toMatchObject({
      pendingAdvice: 0,
      retainedBytes: server.accountingMetrics().successfulCacheBytes,
    });
  });

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
      recipient({ turnId: "collect", toolUseId: "collect" }),
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
  });

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
      recipient({ turnId: "expiry", toolUseId: "expiry" }),
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
  });

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
      recipient({ turnId: "replacement", toolUseId: "replacement" }),
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
      recipient({ turnId: "cycle-1", toolUseId: "cycle-1" }),
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
      recipient({ turnId: "overlap", toolUseId: "overlap" }),
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
      recipient({ turnId: "too-early", toolUseId: "too-early" }),
      singleFindingDispatch(statePath),
    )).resolves.toMatchObject({ status: "empty" });

    clock += ADVICE_COLLECTION_WINDOW_MS;
    const aged = await server.collect(
      root,
      recipient({ turnId: "aged", toolUseId: "aged" }),
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

    await expect(server.collect(root, recipient({ turnId: "early", toolUseId: "early" }), dispatch))
      .resolves.toMatchObject({ status: "empty" });
    clock += ADVICE_COLLECTION_WINDOW_MS - 1;
    await expect(server.collect(root, recipient({ turnId: "before", toolUseId: "before" }), dispatch))
      .resolves.toMatchObject({ status: "empty" });
    releases.get("b.ts")?.();
    await secondAdvicePending.promise;
    clock += 1;
    const aged = await server.collect(root, recipient({ turnId: "at", toolUseId: "at" }), dispatch);
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
      recipient({ turnId: "turn-end", toolUseId: "turn-end" }),
      dispatch,
      "ordinary",
    )).resolves.toMatchObject({ status: "empty" });
    const turnEnd = await server.collect(
      root,
      recipient({ turnId: "turn-end", toolUseId: "turn-end" }),
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

    const first = await server.collect(root, recipient({ turnId: "batch-1", toolUseId: "batch-1" }), dispatch);
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
      recipient({ turnId: "batch-retry", toolUseId: "batch-retry" }),
      dispatch,
    );
    expect(retried.status).toBe("advice");
    if (retried.status !== "advice") return;
    expect(retried.output).toEqual(first.output);
    expect(server.acknowledge(retried.token).status).toBe("acknowledged");
    expect(server.finalize(retried.token).status).toBe("finalized");
    expect(server.pendingAdviceMetadata()).toMatchObject([{ path: "type-5.ts", delivery: "available" }]);

    const second = await server.collect(root, recipient({ turnId: "batch-2", toolUseId: "batch-2" }), dispatch);
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
        recipient({ turnId: `age-${age}`, toolUseId: `age-${age}` }),
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
