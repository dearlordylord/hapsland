import { makePreparationControls } from "../test-support/preparation-controls.ts";
import { acquireResidentFixture, type ResidentRuntime } from "./runtime-fixture.ts";
import { describe, expect, it, vi } from "vitest";
import * as Effect from "effect/Effect";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { adaptCodexDirectEvent } from "../direct-event/adapter.ts";
import { addEvent, makeGitFixture, put } from "../direct-event/test-fixtures.ts";
import { configuredRules } from "../policy/rules.ts";
import { residentPaths } from "./paths.ts";
import { type JevRequestObservation } from "./server.ts";
import { makeCapacityLedger } from "./capacity.ts";
import { captureStable } from "../direct-event/capture.ts";
import { FUNCTION_INPUT_CONTRACT, TYPE_INPUT_CONTRACT } from "../rules/targets.ts";

const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
};

describe("canonical Jev request boundary", () => {
  it("uses configured rules for complete type and function units", async () => {
    const root = await makeGitFixture();
    await put(root, "a.ts", "export type Count = number;\nexport function count(): Count { return 1; }\n");
    await put(root, "rules.jsonc", JSON.stringify({ schemaVersion: 1, id: "team", contentVersion: "1", rules: [{
      id: "check", question: "Is this clear?", criteria: { false: "No", true: "Yes" },
      message: "Clarify", reviewTargets: [
        { artifactKind: "typeShape", inputContract: TYPE_INPUT_CONTRACT,
          capabilities: ["root-declaration", "resolved-outbound-types"] },
        { artifactKind: "function", inputContract: FUNCTION_INPUT_CONTRACT,
          capabilities: ["signature", "body"] },
      ],
    }] }));
    await put(root, ".review.jsonc", JSON.stringify({ version: 1, packs: ["rules.jsonc"] }));
    const observation = await Effect.runPromise(adaptCodexDirectEvent(addEvent(root, ["a.ts"])));
    if (observation === undefined) throw new Error("fixture observation missing");
    const seen: string[] = [];
    const capturePath = join(root, "provider-calls.txt");
    const server = await acquireResidentFixture(residentPaths(join(root, "runtime")), undefined, {
      beforeEvaluate: async (prepared) => { if (prepared.input.rules.some((rule) => rule.id === "team/check")) seen.push(prepared.input.contract); },
    });
    try {
      expect(server.admit(observation, { statePath: join(root, "consent"), userConfigPath: null,
        credential: null, controlled: { capturePath } }).status).toBe("accepted");
      await server.whenIdle();
      expect(new Set(seen)).toEqual(new Set([TYPE_INPUT_CONTRACT, FUNCTION_INPUT_CONTRACT]));
      expect(existsSync(capturePath)).toBe(true);
    } finally { await server.close(); }
  });
  it("captures an over-32 KiB same-file candidate without sending a v1 request", async () => {
    const root = await makeGitFixture();
    const source = `export type LargeName = { value: "${"x".repeat(33_000)}" };\n`;
    await put(root, "large.ts", source);
    const statePath = join(root, "consent");
    const observation = await Effect.runPromise(adaptCodexDirectEvent(addEvent(root, ["large.ts"])));
    if (observation === undefined) throw new Error("fixture observation missing");
    const reads: string[] = [];
    const captureSource: typeof captureStable = (sourceRoot, path, hooks, identity) =>
      captureStable(sourceRoot, path, { ...hooks, sourceRead: (name) => { reads.push(name); } }, identity);
    const capturePath = join(root, "provider-calls.txt");
    const commands: JevRequestObservation[] = [];
    const server = await acquireResidentFixture(residentPaths(join(root, "runtime")), undefined, {
      captureSource, jevRequestObserver: (value) => { commands.push(value); },
    });
    try {
      expect(Buffer.byteLength(source, "utf8")).toBeGreaterThan(32 * 1024);
      expect(server.admit(observation, { statePath, userConfigPath: null, credential: null,
        controlled: { capturePath } }).status).toBe("accepted");
      await server.whenIdle();
      expect(reads).toContain("large.ts");
      expect(commands).toEqual([]);
      expect(existsSync(capturePath)).toBe(false);
      expect((await Effect.runPromise(server.accountingMetrics())).pendingOperationalNotices).toBe(0);
    } finally { await server.close(); }
  });

  it("issues a Jev request for large rule text when evidence is within the tree limit", async () => {
    const root = await makeGitFixture();
    await put(root, "a.ts", "type A = number\n");
    await put(root, "rules.jsonc", JSON.stringify({ schemaVersion: 1, id: "team", contentVersion: "1", rules: [{
      id: "large", question: "x".repeat(140_000),
      criteria: { false: "No", true: "Yes" }, threshold: 0.7,
      message: "Large", reviewTargets: [{ artifactKind: "typeShape", inputContract: TYPE_INPUT_CONTRACT,
        capabilities: ["root-declaration"] }],
    }] }));
    await put(root, ".review.jsonc", JSON.stringify({ version: 1, packs: ["rules.jsonc"] }));
    const statePath = join(root, "consent");
    const observation = await Effect.runPromise(adaptCodexDirectEvent(addEvent(root, ["a.ts"])));
    if (observation === undefined) throw new Error("fixture observation missing");
    const capturePath = join(root, "provider-calls.txt");
    const commands: JevRequestObservation[] = [];
    const server = await acquireResidentFixture(residentPaths(join(root, "runtime")), undefined, {
      jevRequestObserver: (value) => { commands.push(value); },
    });
    try {
      expect(server.admit(observation, { statePath, userConfigPath: null, credential: null,
        controlled: { capturePath } }).status).toBe("accepted");
      await server.whenIdle();
      expect(commands.map((item) => item.stage)).toContain("started");
      expect(existsSync(capturePath)).toBe(true);
      expect((await Effect.runPromise(server.accountingMetrics())).pendingOperationalNotices).toBe(0);
    } finally { await server.close(); }
  });
  it("sends complete selected cross-file evidence and excludes denied supporting source", async () => {
    const root = await makeGitFixture();
    await put(root, "a.ts", "import type { B } from './b'; interface A { b: B }");
    await put(root, "b.ts", "import type { C } from './c'; export interface B { c: C }");
    await put(root, "c.ts", "export interface C { value: string }");
    const statePath = join(root, "consent");
    const observation = await Effect.runPromise(adaptCodexDirectEvent(addEvent(root, ["a.ts"])));
    if (observation === undefined) throw new Error("fixture observation missing");
    const reads: string[] = [];
    const captureSource: typeof captureStable = (sourceRoot, path, hooks, identity) =>
      captureStable(sourceRoot, path, { ...hooks, sourceRead: (name) => { reads.push(name); } }, identity);
    const capturePath = join(root, "provider-calls.txt");
    const dispatch = { statePath, userConfigPath: null, credential: null, controlled: { capturePath } };
    const server = await acquireResidentFixture(residentPaths(join(root, "runtime")), undefined, {
      captureSource,
    });
    try {
      expect(server.admit(observation, dispatch).status).toBe("accepted");
      await server.whenIdle();
      expect(existsSync(capturePath)).toBe(true);
      expect(reads).toContain("c.ts");
    } finally { await server.close(); }

    const gatedCalls = join(root, "gated-provider-calls.txt");
    const gatedServer = await acquireResidentFixture(residentPaths(join(root, "gated-runtime")));
    try {
      expect(gatedServer.admit(observation, { ...dispatch, controlled: { capturePath: gatedCalls } }).status).toBe("accepted");
      await gatedServer.whenIdle();
      expect(existsSync(gatedCalls)).toBe(true);
      expect((await Effect.runPromise(gatedServer.accountingMetrics())).pendingOperationalNotices).toBe(0);
    } finally { await gatedServer.close(); }

    await put(root, ".review.jsonc", JSON.stringify({ version: 1, excludes: ["c.ts"] }));
    reads.length = 0;
    const excludedCalls = join(root, "excluded-provider-calls.txt");
    const excludedServer = await acquireResidentFixture(residentPaths(join(root, "excluded-runtime")), undefined, { captureSource });
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
    const event = async () => {
      const observation = await Effect.runPromise(adaptCodexDirectEvent(addEvent(root, ["type.ts"])));
      if (observation === undefined) throw new Error("fixture observation missing");
      return observation;
    };
    const capturePath = join(root, "provider-calls.txt");
    const observations: JevRequestObservation[] = [];
    const dispatch = { statePath, userConfigPath: null, credential: null,
      controlled: { capturePath } };
    const server = await acquireResidentFixture(residentPaths(join(root, "runtime")), undefined, {
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
    const restarted = await acquireResidentFixture(residentPaths(join(root, "restarted-runtime")), undefined, {
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
    const controls = await Effect.runPromise(makePreparationControls());
    const server = await acquireResidentFixture(residentPaths(join(root, "runtime")), undefined, {
      preparationControls: controls.layer,
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
      expect(await Effect.runPromise(controls.preparationCount)).toBe(2);
      expect(effectsEntered).toBe(8);
      expect(observations.filter((item) => item.stage === "unavailable")).toHaveLength(1);

      release.resolve();
      await server.whenIdle();
      expect(observations.filter((item) => item.stage === "settled")).toHaveLength(8);
      expect((await Effect.runPromise(server.pendingAdviceMetadata()))).toHaveLength(8);

      expect(server.admit(await observe([paths[9]!]), dispatch).status).toBe("accepted");
      await server.whenIdle();
      expect(effectsEntered).toBe(9);
      expect(observations.filter((item) => item.stage === "settled")).toHaveLength(9);
      expect((await Effect.runPromise(server.pendingAdviceMetadata()))).toHaveLength(9);
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

  it("holds started Jev permits through round interruption until settlement, then reuses one", async () => {
    const root = await makeGitFixture();
    const paths = Array.from({ length: 11 }, (_, index) => `item-${index}.ts`);
    for (const [index, path] of paths.entries()) await put(root, path, `type Item${index}Count = number\n`);
    const statePath = join(root, "consent");
    const observe = async (index: number) => {
      const observation = await Effect.runPromise(adaptCodexDirectEvent(addEvent(root, [paths[index]!], {
        agent_id: `agent-${index}`, tool_use_id: `tool-${index}`,
      })));
      if (observation === undefined) throw new Error("fixture observation missing");
      return observation;
    };
    const dispatch = { statePath, userConfigPath: null, credential: null,
      controlled: { answers: Object.fromEntries(configuredRules.map((rule) => [rule.id,
        { _tag: "Probability" as const, probability: 0 },
      ])) } };
    const eightStarted = deferred();
    const reusedStarted = deferred();
    const saturatedUnavailable = deferred();
    const afterReuseUnavailable = deferred();
    const releases = Array.from({ length: 9 }, () => deferred());
    const interruptedRequest = deferred();
    const physicallySettled = deferred();
    let physicallyRunning = 0;
    let peakPhysicallyRunning = 0;
    const observations: JevRequestObservation[] = [];
    let effectsEntered = 0;
    let unavailableCount = 0;
    const server = await acquireResidentFixture(residentPaths(join(root, "runtime")), undefined, {
      controlledRequestEffect: async () => {
        const requestIndex = effectsEntered++;
        physicallyRunning += 1;
        peakPhysicallyRunning = Math.max(peakPhysicallyRunning, physicallyRunning);
        if (effectsEntered === 8) eightStarted.resolve();
        if (effectsEntered === 9) reusedStarted.resolve();
        await releases[requestIndex]!.promise;
        physicallyRunning -= 1;
      },
      jevRequestObserver: (observation) => {
        observations.push(observation);
        if (observation.stage === "interrupted") interruptedRequest.resolve();
        if (observation.stage === "settled") physicallySettled.resolve();
        if (observation.stage === "unavailable") {
          unavailableCount += 1;
          if (unavailableCount === 1) saturatedUnavailable.resolve();
          if (unavailableCount === 2) afterReuseUnavailable.resolve();
        }
      },
    });
    try {
      const first = await observe(0);
      for (let index = 0; index < 8; index += 1) {
        expect(server.admit(index === 0 ? first : await observe(index), dispatch, false, true).status)
          .toBe("accepted");
      }
      await eightStarted.promise;
      expect(observations.filter((item) => item.stage === "started")).toHaveLength(8);
      expect(observations.filter((item) => item.stage === "settled")).toHaveLength(0);
      expect(server.admit(await observe(8), dispatch, false, true).status).toBe("accepted");
      await saturatedUnavailable.promise;
      expect(effectsEntered).toBe(8);
      expect(observations.filter((item) => item.stage === "settled")).toHaveLength(0);

      expect(await server.handle({ requestRoute: "shared", operation: "begin-stop", lifetime: server.lifetime,
        root, advicee: first.advicee, token: "interrupt-first" })).toEqual({ status: "advanced" });
      expect(await server.handle({ requestRoute: "shared", operation: "finish-stop", lifetime: server.lifetime,
        root, advicee: first.advicee, token: "interrupt-first", close: true })).toEqual({ status: "advanced" });

      await interruptedRequest.promise;
      expect(physicallyRunning).toBe(8);
      expect(observations.filter((item) => item.stage === "settled")).toHaveLength(0);
      releases[0]!.resolve();
      // Wait for the original request's physical completion and canonical settlement.
      await physicallySettled.promise;
      expect(server.admit(await observe(9), dispatch, false, true).status).toBe("accepted");
      await reusedStarted.promise;
      const interruptionIndex = observations.findIndex((item) => item.stage === "interrupted");
      expect(interruptionIndex).toBeGreaterThanOrEqual(0);
      const interrupted = observations[interruptionIndex]!;
      const settlementIndex = observations.findIndex((item) => item.stage === "settled" &&
        item.request === interrupted.request);
      const startIndices = observations.flatMap((item, index) => item.stage === "started" ? [index] : []);
      const reusedStartIndex = startIndices[8] ?? -1;
      expect(settlementIndex).toBeGreaterThan(interruptionIndex);
      expect(reusedStartIndex).toBeGreaterThan(settlementIndex);
      expect(observations[settlementIndex]?.outcome).toBe("interrupted");
      expect(observations.filter((item) => item.stage === "settled")).toHaveLength(1);

      expect(server.admit(await observe(10), dispatch, false, true).status).toBe("accepted");
      await afterReuseUnavailable.promise;
      expect(effectsEntered).toBe(9);
      expect(peakPhysicallyRunning).toBe(8);
      expect(physicallyRunning).toBe(8);
      expect(observations.filter((item) => item.stage === "started")).toHaveLength(9);
    } finally {
      for (const release of releases) release.resolve();
      await server.whenIdle();
      await server.close();
    }
  }, 15_000);

  it("holds eight started permits until one Jev timeout settles, then reuses exactly one", async () => {
    const root = await makeGitFixture();
    const paths = Array.from({ length: 11 }, (_, index) => `item-${index}.ts`);
    for (const [index, path] of paths.entries()) await put(root, path, `type Item${index}Count = number\n`);
    const statePath = join(root, "consent");
    const observe = async (index: number) => {
      const observation = await Effect.runPromise(adaptCodexDirectEvent(addEvent(root, [paths[index]!], {
        tool_use_id: `timeout-${index}`,
      })));
      if (observation === undefined) throw new Error("fixture observation missing");
      return observation;
    };
    const prepared = await Promise.all(paths.map((_path, index) => observe(index)));
    const firstStarted = deferred();
    const eightStarted = deferred();
    const firstTimeout = deferred();
    const firstUnavailable = deferred();
    const reusedStarted = deferred();
    const secondUnavailable = deferred();
    const release = deferred();
    const observations: JevRequestObservation[] = [];
    let effectsEntered = 0;
    let unavailableCount = 0;
    const server = await acquireResidentFixture(residentPaths(join(root, "runtime")), undefined, {
      controlledRequestEffect: async () => {
        effectsEntered += 1;
        if (effectsEntered === 1) { firstStarted.resolve(); return; }
        if (effectsEntered === 8) eightStarted.resolve();
        if (effectsEntered === 9) reusedStarted.resolve();
        await release.promise;
      },
      jevRequestObserver: (item) => {
        observations.push(item);
        if (item.stage === "settled" && item.outcome === "timeout") firstTimeout.resolve();
        if (item.stage === "unavailable") {
          unavailableCount += 1;
          if (unavailableCount === 1) firstUnavailable.resolve();
          if (unavailableCount === 2) secondUnavailable.resolve();
        }
      },
    });
    const dispatch = { statePath, userConfigPath: null, credential: null,
      controlled: { delayMs: 16_000 } };
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    try {
      expect(server.admit(prepared[0]!, dispatch).status).toBe("accepted");
      await firstStarted.promise;
      await vi.advanceTimersByTimeAsync(5_000);
      expect(observations.filter((item) => item.stage === "settled")).toHaveLength(0);

      for (let index = 1; index < 8; index += 1) {
        expect(server.admit(prepared[index]!, dispatch).status).toBe("accepted");
      }
      await eightStarted.promise;
      expect(observations.filter((item) => item.stage === "started")).toHaveLength(8);
      expect(server.admit(prepared[8]!, dispatch).status).toBe("accepted");
      await firstUnavailable.promise;
      expect(effectsEntered).toBe(8);
      expect(observations.filter((item) => item.stage === "settled")).toHaveLength(0);

      await vi.advanceTimersByTimeAsync(10_000);
      await firstTimeout.promise;
      const timeoutIndex = observations.findIndex((item) => item.stage === "settled" &&
        item.outcome === "timeout");
      expect(timeoutIndex).toBeGreaterThanOrEqual(0);
      expect(observations.filter((item) => item.stage === "settled")).toHaveLength(1);

      expect(server.admit(prepared[9]!, dispatch).status).toBe("accepted");
      await reusedStarted.promise;
      const startIndices = observations.flatMap((item, index) => item.stage === "started" ? [index] : []);
      expect(startIndices[8]).toBeGreaterThan(timeoutIndex);
      expect(effectsEntered).toBe(9);
      expect(server.admit(prepared[10]!, dispatch).status).toBe("accepted");
      await secondUnavailable.promise;
      expect(effectsEntered).toBe(9);
      expect(observations.filter((item) => item.stage === "settled")).toHaveLength(1);
    } finally {
      release.resolve();
      await vi.advanceTimersByTimeAsync(16_000);
      await server.whenIdle();
      await server.close();
      vi.useRealTimers();
    }
  }, 15_000);

  it("keeps an interrupted canonical Jev permit charged until its settlement", () => {
    // Resident abort interrupts the controlled Effect promptly. Hold the
    // canonical interval open here to check the capacity boundary itself.
    const ledger = makeCapacityLedger(undefined, "interruption-barrier");
    const partition = "review-partition";
    const facts = { rootValid: true, configurationValid: true,
      credentialReady: true, selected: true, currentWork: true, physicalAvailable: true };
    const reviewUnit = (owner = partition) => {
      const observation = ledger.admitObservation(owner);
      expect(ledger.observation(owner, observation, "startObservation", ledger.roundId(owner))).toBe(true);
      const preparation = ledger.beginObservedPreparation(owner, observation, 100, ledger.roundId(owner));
      if (preparation === undefined) throw new Error("preparation refused");
      expect(ledger.observation(owner, observation, "completeObservation", ledger.roundId(owner))).toBe(true);
      const unit = ledger.completePreparation(owner, preparation.operation,
        preparation.reservation, [10], ledger.roundId(owner))[0];
      if (unit === undefined) throw new Error("unit refused");
      expect(ledger.startReview(owner, unit.operation, ledger.roundId(owner))).toBe(true);
      return unit;
    };
    const held = Array.from({ length: 8 }, () => {
      const unit = reviewUnit();
      const ready = ledger.readyJevRequest(partition, unit.operation, unit.reservation, facts, ledger.roundId(partition));
      if (ready.status !== "issued") throw new Error("Jev permit refused before saturation");
      expect(ledger.startJevRequest(partition, unit.operation, ready.request)).toBe(true);
      return { unit, request: ready.request };
    });
    const interrupted = held[0]!;
    expect(ledger.interruptJevRequest(partition, interrupted.unit.operation, interrupted.request)).toBe(true);
    ledger.retireRound(partition, ledger.roundId(partition));
    const nextPartition = partition;
    const premature = reviewUnit(nextPartition);
    expect(ledger.readyJevRequest(nextPartition, premature.operation, premature.reservation, facts, ledger.roundId(nextPartition)).status)
      .toBe("unavailable");
    expect(ledger.settleJevRequest(partition, interrupted.unit.operation, interrupted.request,
      interrupted.unit.reservation, "interrupted", false)).not.toBe("stale");
    const replacement = reviewUnit(nextPartition);
    const ready = ledger.readyJevRequest(nextPartition, replacement.operation, replacement.reservation, facts, ledger.roundId(nextPartition));
    expect(ready.status).toBe("issued");
    if (ready.status !== "issued") return;
    expect(ledger.startJevRequest(nextPartition, replacement.operation, ready.request)).toBe(true);
    const excess = reviewUnit(nextPartition);
    expect(ledger.readyJevRequest(nextPartition, excess.operation, excess.reservation, facts, ledger.roundId(nextPartition)).status)
      .toBe("unavailable");
  });

  it("binds local canonical lifetime 1 to each resident UUID and rotates canonical rounds", () => {
    const first = makeCapacityLedger(undefined, "resident-a");
    const second = makeCapacityLedger(undefined, "resident-b");
    const facts = { rootValid: true, configurationValid: true,
      credentialReady: true, selected: true, currentWork: true, physicalAvailable: true };
    const issue = (ledger: typeof first) => {
      const partition = "review-partition";
      const observation = ledger.admitObservation(partition);
      expect(ledger.observation(partition, observation, "startObservation", ledger.roundId(partition))).toBe(true);
      const preparation = ledger.beginObservedPreparation(partition, observation, 100, ledger.roundId(partition));
      if (preparation === undefined) throw new Error("preparation refused");
      expect(ledger.observation(partition, observation, "completeObservation", ledger.roundId(partition))).toBe(true);
      const unit = ledger.completePreparation(partition, preparation.operation,
        preparation.reservation, [10], ledger.roundId(partition))[0];
      if (unit === undefined) throw new Error("unit refused");
      expect(ledger.startReview(partition, unit.operation, ledger.roundId(partition))).toBe(true);
      const ready = ledger.readyJevRequest(partition, unit.operation, unit.reservation, facts, ledger.roundId(partition));
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
    first.retireRound("review-partition", first.roundId("review-partition"));
    expect(issue(first)).toBeGreaterThan(firstRound);
  });
});
