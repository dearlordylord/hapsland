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
      { _tag: "Probability", probability: 0.9 },
    ])),
  },
});

const singleFindingDispatch = (statePath: string): ResidentDispatchContext => ({
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
    expect(server.stats()).toMatchObject({ pendingAdvice: 0, retainedBytes: 0 });
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

  it("keeps equivalent complete inputs in one generation", async () => {
    const root = await makeGitFixture();
    await put(root, "type.ts", "type OrderCount = number\n");
    const statePath = join(root, "consent");
    await enable(root, statePath);
    const first = await Effect.runPromise(adaptCodexDirectEvent(addEvent(root)));
    const duplicate = await Effect.runPromise(adaptCodexDirectEvent(addEvent(root, ["type.ts"], {
      tool_use_id: "duplicate",
    })));
    expect(first).toBeDefined();
    expect(duplicate).toBeDefined();
    if (first === undefined || duplicate === undefined) return;
    const server = new ResidentServer(residentPaths(join(root, "runtime")));
    const dispatch = findingDispatch(statePath);
    expect(server.admit(first, dispatch).status).toBe("accepted");
    expect(server.admit(duplicate, dispatch).status).toBe("accepted");
    await server.whenIdle();
    const metadata = server.pendingAdviceMetadata();
    expect(metadata).toHaveLength(2);
    expect(new Set(metadata.map(({ generation }) => generation))).toEqual(new Set([1]));
    expect(new Set(metadata.flatMap(({ evaluationIdentities }) => evaluationIdentities)).size).toBe(1);
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
    expect(server.stats()).toMatchObject({ pendingAdvice: 1, retainedBytes: replacementBytes });
    const delivered = await server.collect(
      root,
      recipient({ turnId: "later", toolUseId: "replacement" }),
      dispatch,
    );
    expect(delivered.status).toBe("advice");
    if (delivered.status !== "advice") return;
    expect(server.acknowledge(delivered.token).status).toBe("acknowledged");
    expect(server.finalize(delivered.token).status).toBe("finalized");
    expect(server.stats()).toMatchObject({ pendingAdvice: 0, retainedBytes: 0 });
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
    expect(server.stats()).toMatchObject({ pendingAdvice: 0, retainedBytes: 0 });
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
});

describe("resident bounded advice batches", () => {
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
      expect(server.acknowledge(aged.token).status).toBe("acknowledged");
      expect(server.finalize(aged.token).status).toBe("finalized");
    }
    expect(server.pendingAdviceMetadata()).toMatchObject([{
      path: "b.ts",
      cycleComplete: false,
      collectionEligible: true,
    }]);
    const overflow = await server.collect(
      root,
      recipient({ turnId: "overflow", toolUseId: "overflow" }),
      dispatch,
    );
    expect(overflow.status).toBe("advice");
    if (overflow.status === "advice") {
      expect(overflow.output.hookSpecificOutput.additionalContext).toContain("b.ts :: BCount");
      expect(server.acknowledge(overflow.token).status).toBe("acknowledged");
      expect(server.finalize(overflow.token).status).toBe("finalized");
    }
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
    expect(at.server.stats()).toMatchObject({ pendingAdvice: 0, retainedBytes: 0 });
    const after = await run(PENDING_ADVICE_EXPIRY_MS + 1);
    expect(after.collected.status).toBe("empty");
    expect(after.server.stats()).toMatchObject({ pendingAdvice: 0, retainedBytes: 0 });
  });
});
