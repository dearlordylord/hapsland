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
    expect(recovered.status).toBe("advice");
    if (recovered.status === "advice") {
      expect(server.acknowledge(recovered.token).status).toBe("acknowledged");
      expect(server.finalize(recovered.token).status).toBe("finalized");
    }
    expect(server.stats()).toMatchObject({ pendingAdvice: 0, retainedBytes: 0 });
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
});
