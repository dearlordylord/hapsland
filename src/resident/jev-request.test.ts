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

const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
};

describe("canonical Jev request boundary", () => {
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
      expect(existsSync(capturePath)).toBe(false);
      expect(server.stats().retainedBytes).toBe(0);

      expect(server.admit(await event(), dispatch).status).toBe("accepted");
      await server.whenIdle();
      expect(observations.slice(2).map((item) => item.stage)).toEqual([
        "issued", "started", "settled",
      ]);
      expect(existsSync(capturePath)).toBe(true);
    } finally {
      await server.close();
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
});
