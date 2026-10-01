import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { compileRulePack } from "../rules/compiler.ts";
import { TYPE_INPUT_CONTRACT } from "../rules/targets.ts";
import { DEFAULT_BACKEND, DEFAULT_DESTINATION } from "../runtime/review-config.ts";
import { adaptCodexAdd } from "./adapter.ts";
import { prepareObservation, preparedProviderInput, preparedUnitStillCurrent, evaluatePrepared } from "./pipeline.ts";
import { controlledDecisionModelLayer } from "../test-support/controlled-decision-model.ts";
import { configuredRules } from "../policy/rules.ts";
import { addEvent, makeGitFixture, put, updateEvent } from "./test-fixtures.ts";

const rules = (closure: boolean) => compileRulePack({ schemaVersion: 1, id: "bend", contentVersion: "1", rules: [{
  id: "shape", question: "Does this type admit invalid states?", criteria: { false: "No", true: "Yes" }, message: "Use a datatype",
  reviewTargets: [{ artifactKind: "typeShape", inputContract: TYPE_INPUT_CONTRACT,
    capabilities: closure ? ["root-declaration", "resolved-outbound-types"] : ["root-declaration"] }],
}] }, "bend-test");
const prepare = (event: unknown, closure = true) => Effect.gen(function* () {
  const observation = yield* adaptCodexAdd(event);
  if (observation === undefined) throw new Error("fixture adaptation failed");
  return yield* prepareObservation(observation, { controlledWriter: true, advicee: observation.advicee,
    settings: { backend: DEFAULT_BACKEND, destination: DEFAULT_DESTINATION }, rules: rules(closure), inputContract: TYPE_INPUT_CONTRACT });
});

describe("Bend direct review integration", () => {
  it.effect("does not bind TypeScript imports to Bend declarations", () => Effect.gen(function* () {
    const root = yield* Effect.promise(makeGitFixture);
    yield* Effect.promise(() => put(root, "a.ts", "import type { B } from './b.bend'; interface A { b: B }"));
    yield* Effect.promise(() => put(root, "b.bend", "import Base\ntype B is Data:\n  B{value: U32}"));
    const observation = yield* adaptCodexAdd(addEvent(root, ["a.ts"]));
    if (observation === undefined) throw new Error("fixture adaptation failed");
    const reads: string[] = [];
    const prepared = yield* prepareObservation(observation, { controlledWriter: true, advicee: observation.advicee,
      settings: { backend: DEFAULT_BACKEND, destination: DEFAULT_DESTINATION }, rules: configuredRules,
      captureHooks: { sourceRead: (path) => { reads.push(path); } } });
    expect(prepared.outcomes.some((outcome) => outcome.status === "ready")).toBe(false);
    expect(reads).toEqual(["a.ts", "a.ts"]);
  }));
  it.effect("denies Noul dispatch for incomplete dependent and imported evidence", () => Effect.gen(function* () {
    const root = yield* Effect.promise(makeGitFixture);
    for (const source of [
      "import ./other.bend as M\ntype Root is Data:\n  Root{}",
      "type Root is Data:\n  Root{value: Missing}",
      "type Root is Data:\n  Root{value: Word(32n)}",
      "type Root is Kind(a):\n  Root{}",
      "type T is Data:\n  C{}\ndef T() -> Data:\n  Data\ntype Root is Data:\n  Root{value: T}",
      "type Root is Data:\n  Root{n: Nat, value: Box<n>}",
    ]) {
      yield* Effect.promise(() => put(root, "model.bend", source));
      const observation = yield* adaptCodexAdd(addEvent(root, ["model.bend"]));
      if (observation === undefined) throw new Error("fixture adaptation failed");
      const prepared = yield* prepareObservation(observation, { controlledWriter: true, advicee: observation.advicee,
        settings: { backend: DEFAULT_BACKEND, destination: DEFAULT_DESTINATION }, rules: configuredRules });
      expect(prepared.outcomes.some((outcome) => outcome.status === "ready")).toBe(false);
    }
  }));
  it.effect("dispatches configured Noul questions with Bend datatype evidence", () => Effect.gen(function* () {
    const root = yield* Effect.promise(makeGitFixture);
    yield* Effect.promise(() => put(root, "model.bend", "import Base\ntype Delivery is Data:\n  Waiting{}\n  Delivered{receipt: String}"));
    const observation = yield* adaptCodexAdd(addEvent(root, ["model.bend"]));
    if (observation === undefined) throw new Error("fixture adaptation failed");
    const prepared = yield* prepareObservation(observation, { controlledWriter: true, advicee: observation.advicee,
      settings: { backend: DEFAULT_BACKEND, destination: DEFAULT_DESTINATION }, rules: configuredRules });
    const ready = prepared.outcomes.find((outcome) => outcome.status === "ready");
    if (ready?.status !== "ready") throw new Error("Noul Bend review was not prepared");
    let calls = 0;
    const evaluated = yield* evaluatePrepared(ready.prepared).pipe(Effect.provide(controlledDecisionModelLayer({
      answers: Object.fromEntries(configuredRules.map((rule) => [rule.id, { _tag: "Probability", probability: 0.91 }])),
      onRequest: Effect.sync(() => { calls += 1; }),
    })));
    expect(evaluated.status).toBe("evaluated");
    expect(calls).toBe(1);
  }));
  it.effect("captures, projects, renders and revalidates same-file Bend evidence", () => Effect.gen(function* () {
    const root = yield* Effect.promise(makeGitFixture);
    yield* Effect.promise(() => put(root, "src/model.bend", "import Base\ntype Receipt is Data:\n  Receipt{id: String}\ntype Delivery is Data:\n  Waiting{}\n  Delivered{receipt: Receipt}"));
    const prepared = yield* prepare(addEvent(root, ["src/model.bend"]));
    const delivery = prepared.outcomes.find((outcome) => outcome.status === "ready" && outcome.prepared.input.declaration.name === "Delivery");
    expect(delivery?.status).toBe("ready");
    if (delivery?.status !== "ready") throw new Error("Bend review was not prepared");
    expect(preparedProviderInput(delivery.prepared)).toMatchObject({ artifact: { kind: "datatype", domain: "src/model.bend" },
      evidence: { nodes: [{ kind: "datatype", name: "Receipt" }] }, inputContract: { completeness: "complete" } });
    const observation = yield* adaptCodexAdd(addEvent(root, ["src/model.bend"]));
    if (observation === undefined) throw new Error("fixture adaptation failed");
    const context = { controlledWriter: true, advicee: observation.advicee, settings: { backend: DEFAULT_BACKEND, destination: DEFAULT_DESTINATION }, rules: rules(true), inputContract: TYPE_INPUT_CONTRACT } as const;
    expect(yield* preparedUnitStillCurrent(observation, delivery.prepared, context)).toBe(true);
    yield* Effect.promise(() => put(root, "src/model.bend", "import Base\ntype Receipt is Data:\n  Receipt{id: U32}\ntype Delivery is Data:\n  Waiting{}\n  Delivered{receipt: Receipt}"));
    expect(yield* preparedUnitStillCurrent(observation, delivery.prepared, context)).toBe(false);
  }));

  it.effect("omits unsupported context and denies closure-dependent rules", () => Effect.gen(function* () {
    const root = yield* Effect.promise(makeGitFixture);
    yield* Effect.promise(() => put(root, "model.bend", "type Root is Data:\n  Root{remote: M.Remote}"));
    const denied = yield* prepare(addEvent(root, ["model.bend"]));
    expect(denied.outcomes.some((outcome) => outcome.status === "ready")).toBe(false);
    const partial = yield* prepare(addEvent(root, ["model.bend"]), false);
    const ready = partial.outcomes.find((outcome) => outcome.status === "ready");
    expect(ready?.status).toBe("ready");
    if (ready?.status !== "ready") throw new Error("root-only Bend review was not prepared");
    expect(ready.prepared.input.completeness).toBe("incomplete-irrelevant");
    expect(preparedProviderInput(ready.prepared)?.evidence.edges.every((edge) => edge.kind === "omitted")).toBe(true);
  }));

  it.effect("attributes a constructor update to the changed Bend datatype", () => Effect.gen(function* () {
    const root = yield* Effect.promise(makeGitFixture);
    yield* Effect.promise(() => put(root, "model.bend", "import Base\ntype Root is Data:\n  Root{value: U32}\ntype Untouched is Data:\n  Untouched{}"));
    const event = updateEvent(root, "model.bend", ["  Root{value: U32}"], { tool_input: { command:
      "*** Begin Patch\n*** Update File: model.bend\n@@\n-  Root{value: String}\n+  Root{value: U32}\n type Untouched is Data:\n*** End Patch" } });
    const prepared = yield* prepare(event);
    expect(prepared.outcomes.filter((outcome) => outcome.status === "ready").map((outcome) => outcome.status === "ready" ? outcome.prepared.input.declaration.name : undefined)).toEqual(["Root"]);
  }));
});
