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

const rules = (closure: boolean) => compileRulePack({ schemaVersion: 1, id: "rust", contentVersion: "1", rules: [{
  id: "shape", question: "Does this type admit invalid states?", criteria: { false: "No", true: "Yes" }, message: "Use an enum",
  reviewTargets: [{ artifactKind: "typeShape", inputContract: TYPE_INPUT_CONTRACT,
    capabilities: closure ? ["root-declaration", "resolved-outbound-types"] : ["root-declaration"] }],
}] }, "rust-test");
const prepare = (event: unknown, closure = true) => Effect.gen(function* () {
  const observation = yield* adaptCodexAdd(event);
  if (observation === undefined) throw new Error("fixture adaptation failed");
  return yield* prepareObservation(observation, { controlledWriter: true, advicee: observation.advicee,
    settings: { backend: DEFAULT_BACKEND, destination: DEFAULT_DESTINATION }, rules: rules(closure), inputContract: TYPE_INPUT_CONTRACT });
});

describe("Rust direct review integration", () => {
  it.effect("does not bind TypeScript imports to Rust declarations", () => Effect.gen(function* () {
    const root = yield* Effect.promise(makeGitFixture);
    yield* Effect.promise(() => put(root, "a.ts", "import type { B } from './b.rs'; interface A { b: B }"));
    yield* Effect.promise(() => put(root, "b.rs", "struct B { value: u8 }"));
    const observation = yield* adaptCodexAdd(addEvent(root, ["a.ts"]));
    if (observation === undefined) throw new Error("fixture adaptation failed");
    const reads: string[] = [];
    const prepared = yield* prepareObservation(observation, { controlledWriter: true, advicee: observation.advicee,
      settings: { backend: DEFAULT_BACKEND, destination: DEFAULT_DESTINATION }, rules: configuredRules,
      captureHooks: { sourceRead: (path) => { reads.push(path); } } });
    expect(prepared.outcomes.some((outcome) => outcome.status === "ready")).toBe(false);
    expect(reads).toEqual(["a.ts", "a.ts"]);
  }));
  it.effect("denies Noul dispatch for incomplete namespace and const evidence", () => Effect.gen(function* () {
    const root = yield* Effect.promise(makeGitFixture);
    for (const source of [
      "extern crate alloc as String; struct Root { value: String }",
      "union Option { n: u8 } struct Root { x: Option }",
      "trait String {} struct Root { value: Box<dyn String> }",
      "const N: usize = 3; struct Root { bytes: [u8; N] }",
      "type Root = [u8; { hidden() }];",
    ]) {
      yield* Effect.promise(() => put(root, "model.rs", source));
      const observation = yield* adaptCodexAdd(addEvent(root, ["model.rs"]));
      if (observation === undefined) throw new Error("fixture adaptation failed");
      const prepared = yield* prepareObservation(observation, { controlledWriter: true, advicee: observation.advicee,
        settings: { backend: DEFAULT_BACKEND, destination: DEFAULT_DESTINATION }, rules: configuredRules });
      expect(prepared.outcomes.some((outcome) => outcome.status === "ready")).toBe(false);
    }
  }));
  it.effect("dispatches configured Noul questions with Rust enum evidence", () => Effect.gen(function* () {
    const root = yield* Effect.promise(makeGitFixture);
    yield* Effect.promise(() => put(root, "model.rs", "enum Delivery { Waiting, Delivered { receipt: String } }"));
    const observation = yield* adaptCodexAdd(addEvent(root, ["model.rs"]));
    if (observation === undefined) throw new Error("fixture adaptation failed");
    const prepared = yield* prepareObservation(observation, { controlledWriter: true, advicee: observation.advicee,
      settings: { backend: DEFAULT_BACKEND, destination: DEFAULT_DESTINATION }, rules: configuredRules });
    const ready = prepared.outcomes.find((outcome) => outcome.status === "ready");
    if (ready?.status !== "ready") throw new Error("Noul Rust review was not prepared");
    let calls = 0;
    const evaluated = yield* evaluatePrepared(ready.prepared).pipe(Effect.provide(controlledDecisionModelLayer({
      answers: Object.fromEntries(configuredRules.map((rule) => [rule.id, { _tag: "Probability", probability: 0.91 }])),
      onRequest: Effect.sync(() => { calls += 1; }),
    })));
    expect(evaluated.status).toBe("evaluated");
    expect(calls).toBe(1);
  }));
  it.effect("captures, projects, renders and revalidates same-file Rust evidence", () => Effect.gen(function* () {
    const root = yield* Effect.promise(makeGitFixture);
    yield* Effect.promise(() => put(root, "src/model.rs", "struct Receipt { id: String }\nenum Delivery { Waiting, Delivered(Receipt) }"));
    const prepared = yield* prepare(addEvent(root, ["src/model.rs"]));
    const delivery = prepared.outcomes.find((outcome) => outcome.status === "ready" && outcome.prepared.input.declaration.name === "Delivery");
    expect(delivery?.status).toBe("ready");
    if (delivery?.status !== "ready") throw new Error("Rust review was not prepared");
    expect(preparedProviderInput(delivery.prepared)).toMatchObject({ artifact: { kind: "enum", domain: "src/model.rs" },
      evidence: { nodes: [{ kind: "struct", name: "Receipt" }] }, inputContract: { completeness: "complete" } });
    const observation = yield* adaptCodexAdd(addEvent(root, ["src/model.rs"]));
    if (observation === undefined) throw new Error("fixture adaptation failed");
    const context = { controlledWriter: true, advicee: observation.advicee, settings: { backend: DEFAULT_BACKEND, destination: DEFAULT_DESTINATION }, rules: rules(true), inputContract: TYPE_INPUT_CONTRACT } as const;
    expect(yield* preparedUnitStillCurrent(observation, delivery.prepared, context)).toBe(true);
    yield* Effect.promise(() => put(root, "src/model.rs", "struct Receipt { id: u64 }\nenum Delivery { Waiting, Delivered(Receipt) }"));
    expect(yield* preparedUnitStillCurrent(observation, delivery.prepared, context)).toBe(false);
  }));

  it.effect("omits unsupported context and denies closure-dependent rules", () => Effect.gen(function* () {
    const root = yield* Effect.promise(makeGitFixture);
    yield* Effect.promise(() => put(root, "model.rs", "struct Root { remote: external::Type }"));
    const denied = yield* prepare(addEvent(root, ["model.rs"]));
    expect(denied.outcomes.some((outcome) => outcome.status === "ready")).toBe(false);
    const partial = yield* prepare(addEvent(root, ["model.rs"]), false);
    const ready = partial.outcomes.find((outcome) => outcome.status === "ready");
    expect(ready?.status).toBe("ready");
    if (ready?.status !== "ready") throw new Error("root-only Rust review was not prepared");
    expect(ready.prepared.input.completeness).toBe("incomplete-irrelevant");
    expect(preparedProviderInput(ready.prepared)?.evidence.edges.every((edge) => edge.kind === "omitted")).toBe(true);
  }));

  it.effect("attributes changed attributes to their exact Rust declaration", () => Effect.gen(function* () {
    const root = yield* Effect.promise(makeGitFixture);
    const source = "#[derive(Debug)]\n\n// preserved\nstruct Root { value: u8 }\nstruct Untouched;";
    yield* Effect.promise(() => put(root, "model.rs", source));
    const event = updateEvent(root, "model.rs", ["#[derive(Debug)]"], { tool_input: { command:
      "*** Begin Patch\n*** Update File: model.rs\n@@\n-#[derive(Clone)]\n+#[derive(Debug)]\n \n // preserved\n struct Root { value: u8 }\n*** End Patch" } });
    const prepared = yield* prepare(event, false);
    const ready = prepared.outcomes.filter((outcome) => outcome.status === "ready");
    expect(ready.length).toBe(1);
    if (ready[0]?.status !== "ready") throw new Error("attribute update not selected");
    expect(ready[0].prepared.input.declaration.source).toBe(source.slice(0, source.indexOf("\nstruct Untouched")));
    expect(ready[0].prepared.input.rootLocation?.start.line).toBe(1);
  }));

  it.effect("attributes an update to the changed Rust header", () => Effect.gen(function* () {
    const root = yield* Effect.promise(makeGitFixture);
    yield* Effect.promise(() => put(root, "model.rs", "struct Root { value: u16 }\nstruct Untouched;"));
    const event = updateEvent(root, "model.rs", ["struct Root { value: u16 }"], { tool_input: { command:
      "*** Begin Patch\n*** Update File: model.rs\n@@\n-struct Root { value: u8 }\n+struct Root { value: u16 }\n struct Untouched;\n*** End Patch" } });
    const prepared = yield* prepare(event);
    expect(prepared.outcomes.filter((outcome) => outcome.status === "ready").map((outcome) => outcome.status === "ready" ? outcome.prepared.input.declaration.name : undefined)).toEqual(["Root"]);
  }));
});
