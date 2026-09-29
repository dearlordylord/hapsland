import { describe, expect, it } from "vitest";
import * as Effect from "effect/Effect";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { adaptCodexDirectEvent } from "../direct-event/adapter.ts";
import { addEvent, makeGitFixture, put } from "../direct-event/test-fixtures.ts";
import { Consent } from "../runtime/consent.ts";
import { configuredRules } from "../policy/rules.ts";
import { residentPaths } from "./paths.ts";
import { ResidentServer, type JevRequestObservation } from "./server.ts";
import { CapacityLedger } from "./capacity.ts";
import { captureStable } from "../direct-event/capture.ts";

const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
};

describe("canonical Jev request boundary", () => {
  it("refuses oversized full input before issuing a Jev permit", async () => {
    const root = await makeGitFixture();
    await put(root, "a.ts", "type A = number\n");
    await put(root, "rules.jsonc", JSON.stringify({ version: 1, id: "team", rules: [{
      id: "large", question: "x".repeat(140_000),
      criteria: { false: "No", true: "Yes" }, threshold: 0.7,
      message: "Large", applicability: { includes: ["**/*.ts"] },
    }] }));
    await put(root, ".review.jsonc", JSON.stringify({ version: 1, packs: ["rules.jsonc"] }));
    const statePath = join(root, "consent");
    await Effect.runPromise(Effect.gen(function* () {
      const consent = yield* Consent.Service;
      yield* consent.enable(yield* consent.preview(root, "jev", "https://api.typesafe.ai/v1/systemone"));
    }).pipe(Effect.provide(Consent.layer({ statePath }))));
    const observation = await Effect.runPromise(adaptCodexDirectEvent(addEvent(root, ["a.ts"])));
    if (observation === undefined) throw new Error("fixture observation missing");
    const capturePath = join(root, "provider-calls.txt");
    const commands: JevRequestObservation[] = [];
    const server = new ResidentServer(residentPaths(join(root, "runtime")), undefined, {
      jevRequestObserver: (value) => { commands.push(value); },
    });
    try {
      expect(server.admit(observation, { statePath, userConfigPath: null, credential: null,
        controlled: { capturePath } }).status).toBe("accepted");
      await server.whenIdle();
      expect(commands).toEqual([]);
      expect(existsSync(capturePath)).toBe(false);
      expect(server.accountingMetrics().pendingOperationalNotices).toBe(0);
    } finally { await server.close(); }
  });
  it("dispatches a complete cross-file unit and never reads excluded C", async () => {
    const root = await makeGitFixture();
    await put(root, "a.ts", "import type { B } from './b'; interface A { b: B }");
    await put(root, "b.ts", "import type { C } from './c'; export interface B { c: C }");
    await put(root, "c.ts", "export interface C { value: string }");
    const statePath = join(root, "consent");
    await Effect.runPromise(Effect.gen(function* () {
      const consent = yield* Consent.Service;
      yield* consent.enable(yield* consent.preview(root, "jev", "https://api.typesafe.ai/v1/systemone"));
    }).pipe(Effect.provide(Consent.layer({ statePath }))));
    const observation = await Effect.runPromise(adaptCodexDirectEvent(addEvent(root, ["a.ts"])));
    if (observation === undefined) throw new Error("fixture observation missing");
    const reads: string[] = [];
    const captureSource: typeof captureStable = (sourceRoot, path, hooks, identity) =>
      captureStable(sourceRoot, path, { ...hooks, sourceRead: (name) => { reads.push(name); } }, identity);
    const capturePath = join(root, "provider-calls.txt");
    const dispatch = { statePath, userConfigPath: null, credential: null, controlled: { capturePath } };
    const server = new ResidentServer(residentPaths(join(root, "runtime")), undefined, {
      captureSource, allowCandidateCrossFileEgress: true,
    });
    try {
      expect(server.admit(observation, dispatch).status).toBe("accepted");
      await server.whenIdle();
      expect(existsSync(capturePath)).toBe(true);
      expect(reads).toContain("c.ts");
    } finally { await server.close(); }

    const gatedCalls = join(root, "gated-provider-calls.txt");
    const gatedServer = new ResidentServer(residentPaths(join(root, "gated-runtime")));
    try {
      expect(gatedServer.admit(observation, { ...dispatch, controlled: { capturePath: gatedCalls } }).status).toBe("accepted");
      await gatedServer.whenIdle();
      expect(existsSync(gatedCalls)).toBe(false);
      expect(gatedServer.accountingMetrics().pendingOperationalNotices).toBe(0);
    } finally { await gatedServer.close(); }

    await put(root, ".review.jsonc", JSON.stringify({ version: 1, excludes: ["c.ts"] }));
    reads.length = 0;
    const excludedCalls = join(root, "excluded-provider-calls.txt");
    const excludedServer = new ResidentServer(residentPaths(join(root, "excluded-runtime")), undefined, { captureSource });
    try {
      expect(excludedServer.admit(observation, { ...dispatch, controlled: { capturePath: excludedCalls } }).status).toBe("accepted");
      await excludedServer.whenIdle();
      expect(existsSync(excludedCalls)).toBe(false);
      expect(reads).not.toContain("c.ts");
    } finally { await excludedServer.close(); }
  });
  it("records an issued command that failed before provider dispatch and releases its permit", async () => {
    const root = await makeGitFixture();
    await put(root, "type.ts", "type OrderCount = number\n");
    const statePath = join(root, "consent");
    await Effect.runPromise(Effect.gen(function* () {
      const consent = yield* Consent.Service;
      yield* consent.enable(yield* consent.preview(root, "jev", "https://api.typesafe.ai/v1/systemone"));
    }).pipe(Effect.provide(Consent.layer({ statePath }))));
    const event = async () => {
      const observation = await Effect.runPromise(adaptCodexDirectEvent(addEvent(root, ["type.ts"])));
      if (observation === undefined) throw new Error("fixture observation missing");
      return observation;
    };
    const capturePath = join(root, "provider-calls.txt");
    const observations: JevRequestObservation[] = [];
    const dispatch = { statePath, userConfigPath: null, credential: null,
      controlled: { capturePath } };
    const server = new ResidentServer(residentPaths(join(root, "runtime")), undefined, {
      jevRequestObserver: (observation) => { observations.push(observation); },
    });
    try {
      expect(server.admit(await event(), { ...dispatch,
        demoBudgetPath: join(root, "missing-budget.json") }).status).toBe("accepted");
      await server.whenIdle();
      expect(observations.map((item) => [item.stage, item.outcome])).toEqual([
        ["issued", undefined], ["settled", "neverSent"],
      ]);
      expect(observations.every((item) => item.lifetime === server.lifetime &&
        item.canonicalLifetime === 1 && item.canonicalPartition > 0 &&
        item.round > 0 && item.hapslandRound === null)).toBe(true);
      expect(existsSync(capturePath)).toBe(false);
      expect(server.stats().retainedBytes).toBe(0);

      expect(server.admit(await event(), dispatch).status).toBe("accepted");
      await server.whenIdle();
      expect(observations.slice(2).map((item) => item.stage)).toEqual([
        "issued", "started", "settled",
      ]);
      expect(new Set(observations.map((item) => item.round)).size).toBe(1);
      expect(existsSync(capturePath)).toBe(true);
    } finally {
      await server.close();
    }
    const nextLifetime: JevRequestObservation[] = [];
    const restarted = new ResidentServer(residentPaths(join(root, "restarted-runtime")), undefined, {
      jevRequestObserver: (observation) => { nextLifetime.push(observation); },
    });
    try {
      expect(restarted.admit(await event(), dispatch, false, true).status).toBe("accepted");
      await restarted.whenIdle();
      expect(nextLifetime.map((item) => item.stage)).toEqual(["issued", "started", "settled"]);
      expect(nextLifetime.every((item) => item.lifetime === restarted.lifetime)).toBe(true);
      expect(nextLifetime.every((item) => (item.hapslandRound ?? 0) > 0)).toBe(true);
      expect(restarted.lifetime).not.toBe(server.lifetime);
      expect(nextLifetime[0]?.canonicalLifetime).toBe(observations[0]?.canonicalLifetime);
      expect(nextLifetime[0]?.round).toBe(observations[0]?.round);
    } finally {
      await restarted.close();
    }
  });

  it("authorizes eight effects, prepares a ninth during saturation, and reuses a settled permit", async () => {
    const root = await makeGitFixture();
    const paths = Array.from({ length: 10 }, (_, index) => `item-${index}.ts`);
    for (const [index, path] of paths.entries()) {
      await put(root, path, `type Item${index}Count = number\n`);
    }
    const statePath = join(root, "consent");
    await Effect.runPromise(Effect.gen(function* () {
      const consent = yield* Consent.Service;
      const proposal = yield* consent.preview(root, "jev", "https://api.typesafe.ai/v1/systemone");
      yield* consent.enable(proposal);
    }).pipe(Effect.provide(Consent.layer({ statePath }))));
    const observe = async (selected: readonly string[]) => {
      const observation = await Effect.runPromise(adaptCodexDirectEvent(addEvent(root, [...selected])));
      if (observation === undefined) throw new Error("fixture observation missing");
      return observation;
    };
    const dispatch = { statePath, userConfigPath: null, credential: null,
      controlled: { answers: Object.fromEntries(configuredRules.map((rule) => [rule.id,
        { _tag: "Probability" as const, probability: rule.id === "r6_bare_domain_value" ? 0.9 : 0 },
      ])) } };
    const eightEntered = deferred();
    const release = deferred();
    const ninthUnavailable = deferred();
    const observations: JevRequestObservation[] = [];
    let effectsEntered = 0;
    let preparations = 0;
    const server = new ResidentServer(residentPaths(join(root, "runtime")), undefined, {
      afterPrepare: async () => { preparations += 1; },
      controlledRequestEffect: async () => {
        effectsEntered += 1;
        if (effectsEntered === 8) eightEntered.resolve();
        if (effectsEntered <= 8) await release.promise;
      },
      jevRequestObserver: (observation) => {
        observations.push(observation);
        if (observation.stage === "unavailable") ninthUnavailable.resolve();
      },
    });
    try {
      expect(server.admit(await observe(paths.slice(0, 8)), dispatch).status).toBe("accepted");
      await eightEntered.promise;
      expect(effectsEntered).toBe(8);
      expect(observations.filter((item) => item.stage === "issued")).toHaveLength(8);
      expect(observations.filter((item) => item.stage === "started")).toHaveLength(8);

      expect(server.admit(await observe([paths[8]!]), dispatch).status).toBe("accepted");
      await ninthUnavailable.promise;
      expect(preparations).toBe(2);
      expect(effectsEntered).toBe(8);
      expect(observations.filter((item) => item.stage === "unavailable")).toHaveLength(1);

      release.resolve();
      await server.whenIdle();
      expect(observations.filter((item) => item.stage === "settled")).toHaveLength(8);
      expect(server.pendingAdviceMetadata()).toHaveLength(8);

      expect(server.admit(await observe([paths[9]!]), dispatch).status).toBe("accepted");
      await server.whenIdle();
      expect(effectsEntered).toBe(9);
      expect(observations.filter((item) => item.stage === "settled")).toHaveLength(9);
      expect(server.pendingAdviceMetadata()).toHaveLength(9);
      for (const [index, item] of observations.entries()) {
        if (item.stage !== "started" && item.stage !== "settled") continue;
        expect(observations.slice(0, index).some((prior) => prior.stage === "issued" &&
          prior.operation === item.operation && prior.request === item.request)).toBe(true);
      }
    } finally {
      release.resolve();
      await server.close();
    }
  }, 15_000);

  it("binds local canonical lifetime 1 to each resident UUID and rotates canonical rounds", () => {
    const first = new CapacityLedger(undefined, "resident-a");
    const second = new CapacityLedger(undefined, "resident-b");
    const facts = { rootValid: true, configurationValid: true,
      credentialReady: true, selected: true, currentWork: true, physicalAvailable: true };
    const issue = (ledger: CapacityLedger) => {
      const partition = "review-partition";
      const observation = ledger.admitObservation(partition);
      expect(ledger.observation(partition, observation, "startObservation")).toBe(true);
      const preparation = ledger.beginObservedPreparation(partition, observation, 100);
      if (preparation === undefined) throw new Error("preparation refused");
      expect(ledger.observation(partition, observation, "completeObservation")).toBe(true);
      const unit = ledger.completePreparation(partition, preparation.operation,
        preparation.reservation, [10])[0];
      if (unit === undefined) throw new Error("unit refused");
      expect(ledger.startReview(partition, unit.operation)).toBe(true);
      const ready = ledger.readyJevRequest(partition, unit.operation, unit.reservation, facts);
      if (ready.status !== "issued") throw new Error("request refused");
      expect(ledger.startJevRequest(partition, unit.operation, ready.request)).toBe(true);
      expect(ledger.settleJevRequest(partition, unit.operation, ready.request,
        unit.reservation, "clear", true)).toBe("settleClear");
      return ready.round;
    };
    const firstRound = issue(first);
    const otherLifetimeRound = issue(second);
    expect(first.residentLifetime).toBe("resident-a");
    expect(second.residentLifetime).toBe("resident-b");
    expect(first.canonicalLifetime).toBe(1);
    expect(second.canonicalLifetime).toBe(1);
    expect(firstRound).toBe(otherLifetimeRound);
    first.retireRound("review-partition");
    expect(issue(first)).toBeGreaterThan(firstRound);
  });
});
