import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { compileRulePack } from "../rules/compiler.ts";
import { TYPE_INPUT_CONTRACT } from "../rules/targets.ts";
import { DEFAULT_BACKEND, DEFAULT_DESTINATION } from "../runtime/review-config.ts";
import { adaptCodexAdd } from "./adapter.ts";
import { prepareObservation, preparedProviderInput, preparedUnitStillCurrent, evaluatePrepared } from "./pipeline.ts";
import { controlledDecisionModelLayer } from "../test-support/controlled-decision-model.ts";
import { configuredRules } from "../policy/rules.ts";
import { resolveRustModuleContext } from "./rust-module-context.ts";
import { captureStable } from "./capture.ts";
import { eligibleNamedPath, DEFAULT_DIRECT_FILE_POLICY } from "./selection.ts";
import { GRAPH_LIMIT_CEILINGS } from "../configuration/graph-limits.ts";
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
  it.effect("resolves Cargo-validated aliases and crate paths with one supporting capture", () => Effect.gen(function* () {
    const root = yield* Effect.promise(makeGitFixture);
    yield* Effect.promise(() => put(root, "Cargo.toml", '[package]\nname = "fixture"\nversion = "0.1.0"\nedition = "2021"\n'));
    yield* Effect.promise(() => put(root, "src/lib.rs", "mod receipt; use receipt::Receipt as R; struct Root { a: R, b: crate::receipt::Receipt }"));
    yield* Effect.promise(() => put(root, "src/receipt.rs", "pub struct Receipt { id: String }"));
    const observation = yield* adaptCodexAdd(addEvent(root, ["src/lib.rs"]));
    if (observation === undefined) throw new Error("fixture adaptation failed");
    const reads: string[] = [];
    const context = { controlledWriter: true, advicee: observation.advicee,
      settings: { backend: DEFAULT_BACKEND, destination: DEFAULT_DESTINATION }, rules: rules(true),
      captureHooks: { sourceRead: (path: string) => { reads.push(path); } } };
    const result = yield* prepareObservation(observation, context);
    const ready = result.outcomes.find((outcome) => outcome.status === "ready");
    if (ready?.status !== "ready") throw new Error("Rust cross-file unit was not ready");
    expect(preparedProviderInput(ready.prepared)).toMatchObject({ evidence: {
      nodes: [{ name: "Receipt", domain: "src/receipt.rs" }],
      edges: [{ symbol: "R", kind: "expanded" }, { symbol: "crate::receipt::Receipt", kind: "included" }],
    } });
    expect(reads.filter((path) => path === "src/receipt.rs")).toHaveLength(2);
    expect(ready.prepared.input.sourceFingerprints?.map((source) => source.path)).toEqual(["Cargo.toml", "src/lib.rs", "src/receipt.rs"]);
    expect(yield* preparedUnitStillCurrent(observation, ready.prepared, context)).toBe(true);
    yield* Effect.promise(() => put(root, "Cargo.toml", '[package]\nname = "fixture"\nversion = "0.1.0"\nedition = "2021"\n[lib]\npath = "other.rs"\n'));
    expect(yield* preparedUnitStillCurrent(observation, ready.prepared, context)).toBe(false);
  }));

  it.effect("resolves an edited child module through Cargo and its declared parent", () => Effect.gen(function* () {
    const root = yield* Effect.promise(makeGitFixture);
    yield* Effect.promise(() => put(root, "Cargo.toml", '[package]\nname = "fixture"\nversion = "0.1.0"\nedition = "2021"\n'));
    yield* Effect.promise(() => put(root, "src/lib.rs", "mod model; mod receipt;"));
    yield* Effect.promise(() => put(root, "src/model.rs", "use crate::receipt::Receipt; pub struct Root { value: Receipt }"));
    yield* Effect.promise(() => put(root, "src/receipt.rs", "pub struct Receipt { id: String }"));
    const event = addEvent(root, ["src/model.rs"]);
    const result = yield* prepare(event);
    const ready = result.outcomes.find((outcome) => outcome.status === "ready");
    if (ready?.status !== "ready") throw new Error("edited Rust module was not ready");
    expect(ready.prepared.input.sourceFingerprints?.map((source) => source.path)).toEqual(["Cargo.toml", "src/lib.rs", "src/model.rs", "src/receipt.rs"]);
    const observation = yield* adaptCodexAdd(event);
    if (observation === undefined) throw new Error("fixture adaptation failed");
    const context = { controlledWriter: true, advicee: observation.advicee,
      settings: { backend: DEFAULT_BACKEND, destination: DEFAULT_DESTINATION }, rules: rules(true) };
    yield* Effect.promise(() => put(root, "src/receipt.rs", "pub struct Receipt { id: u64 }"));
    expect(yield* preparedUnitStillCurrent(observation, ready.prepared, context)).toBe(false);
  }));

  it.effect("follows transitive declared modules with Rust's external-file layout", () => Effect.gen(function* () {
    const root = yield* Effect.promise(makeGitFixture);
    yield* Effect.promise(() => put(root, "Cargo.toml", '[package]\nname = "fixture"\nversion = "0.1.0"\nedition = "2021"\n'));
    yield* Effect.promise(() => put(root, "src/lib.rs", "mod outer; use outer::Parent; struct Root { value: Parent }"));
    yield* Effect.promise(() => put(root, "src/outer.rs", "mod leaf; use self::leaf::Leaf; pub struct Parent { value: Leaf }"));
    yield* Effect.promise(() => put(root, "src/outer/leaf.rs", "pub struct Leaf { value: String }"));
    const result = yield* prepare(addEvent(root, ["src/lib.rs"]));
    const ready = result.outcomes.find((outcome) => outcome.status === "ready");
    if (ready?.status !== "ready") throw new Error("transitive Rust unit was not ready");
    expect(preparedProviderInput(ready.prepared)?.evidence.nodes.map((node) => node.domain)).toEqual(["src/outer.rs", "src/outer/leaf.rs"]);
  }));

  it.effect("rejects unsupported Cargo authority rather than infer a crate role", () => Effect.gen(function* () {
    const root = yield* Effect.promise(makeGitFixture);
    yield* Effect.promise(() => put(root, "src/lib.rs", "mod receipt; struct Root { value: receipt::Receipt }"));
    yield* Effect.promise(() => put(root, "src/receipt.rs", "pub struct Receipt { value: u8 }"));
    const packageHeader = '[package]\nname = "fixture"\nversion = "0.1.0"\n';
    for (const manifest of [
      packageHeader + 'edition = 2021\n',
      packageHeader + 'edition = "2015"\n',
      packageHeader + 'edition = "2021"\n[lib]\nedition = "2021"\n',
      packageHeader + 'edition = "2021"\n[[bin]]\nname = 42\npath = "src/main.rs"\n',
      packageHeader + 'edition = "2021"\n[[bin]]\nname = "tool"\npath = 42\n',
      packageHeader + 'edition = "2021"\n[[bin]]\nname = "tool"\npath = "src/main.rs"\nedition = "2024"\n',
      packageHeader + 'edition = "2021"\nbuild = "custom-build.rs"\n',
      ...["test", "example", "bench"].map((kind) => packageHeader + `edition = "2021"\n[[${kind}]]\nname = "target"\npath = "other.rs"\n`),
    ]) {
      yield* Effect.promise(() => put(root, "Cargo.toml", manifest));
      const prepared = yield* prepare(addEvent(root, ["src/lib.rs"]));
      expect(prepared.outcomes.some((outcome) => outcome.status === "ready"), manifest).toBe(false);
    }
  }));

  it.effect("does not revive dormant main.rs when explicit binary targets exist", () => Effect.gen(function* () {
    const root = yield* Effect.promise(makeGitFixture);
    yield* Effect.promise(() => put(root, "Cargo.toml", '[package]\nname = "fixture"\nversion = "0.1.0"\nedition = "2021"\n[[bin]]\nname = "fixture"\npath = "custom.rs"\n'));
    yield* Effect.promise(() => put(root, "custom.rs", "fn main() {}"));
    yield* Effect.promise(() => put(root, "src/main.rs", "mod receipt; struct Root { value: receipt::Receipt }"));
    yield* Effect.promise(() => put(root, "src/receipt.rs", "pub struct Receipt { value: u8 }"));
    const prepared = yield* prepare(addEvent(root, ["src/main.rs"]));
    expect(prepared.outcomes.some((outcome) => outcome.status === "ready")).toBe(false);
  }));

  it.effect("uses an explicit custom library root without guessing its child directory", () => Effect.gen(function* () {
    const root = yield* Effect.promise(makeGitFixture);
    yield* Effect.promise(() => put(root, "Cargo.toml", '[package]\nname = "fixture"\nversion = "0.1.0"\nedition = "2024"\n[lib]\npath = "custom.rs"\n'));
    yield* Effect.promise(() => put(root, "custom.rs", "mod receipt; struct Root { value: receipt::Receipt }"));
    yield* Effect.promise(() => put(root, "receipt.rs", "pub struct Receipt { value: u8 }"));
    yield* Effect.promise(() => put(root, "custom/receipt.rs", "pub struct Receipt { trap: bool }"));
    const prepared = yield* prepare(addEvent(root, ["custom.rs"]));
    const ready = prepared.outcomes.find((outcome) => outcome.status === "ready");
    if (ready?.status !== "ready") throw new Error("custom Cargo library was not ready");
    expect(preparedProviderInput(ready.prepared)?.evidence.nodes.map((node) => node.domain)).toEqual(["receipt.rs"]);
  }));

  it.effect("requires unique Cargo and external-module evidence", () => Effect.gen(function* () {
    const root = yield* Effect.promise(makeGitFixture);
    const source = "mod receipt; struct Root { value: receipt::Receipt }";
    yield* Effect.promise(() => put(root, "src/lib.rs", source));
    yield* Effect.promise(() => put(root, "src/receipt.rs", "pub struct Receipt { value: u8 }"));
    expect((yield* prepare(addEvent(root, ["src/lib.rs"]))).outcomes.some((outcome) => outcome.status === "ready")).toBe(false);
    yield* Effect.promise(() => put(root, "Cargo.toml", '[package]\nname = "fixture"\nversion = "0.1.0"\nedition = "2021"\n'));
    yield* Effect.promise(() => put(root, "src/receipt/mod.rs", "pub struct Receipt { value: u16 }"));
    expect((yield* prepare(addEvent(root, ["src/lib.rs"]))).outcomes.some((outcome) => outcome.status === "ready")).toBe(false);
  }));

  it.effect("checks metadata exclusion and the Cargo graph reservation before reading", () => Effect.gen(function* () {
    const root = yield* Effect.promise(makeGitFixture);
    yield* Effect.promise(() => put(root, "Cargo.toml", '[package]\nname = "fixture"\nversion = "0.1.0"\nedition = "2021"\n'));
    yield* Effect.promise(() => put(root, "src/lib.rs", "mod receipt; struct Root { value: receipt::Receipt }"));
    const observation = yield* adaptCodexAdd(addEvent(root, ["src/lib.rs"]));
    if (observation === undefined) throw new Error("fixture adaptation failed");
    const selected = yield* eligibleNamedPath(root, "src/lib.rs", DEFAULT_DIRECT_FILE_POLICY, observation.rootIdentity);
    if (selected === undefined) throw new Error("root path not eligible");
    const capture = yield* captureStable(root, selected, {}, observation.rootIdentity);
    if (capture === undefined) throw new Error("capture failed");
    for (const denied of ["exclusion", "budget"] as const) {
      const reads: string[] = [];
      const resolved = yield* resolveRustModuleContext("src/lib.rs", capture, {
        root, rootIdentity: observation.rootIdentity,
        policy: denied === "exclusion" ? { includes: ["**/*"], excludes: ["Cargo.toml"] } : DEFAULT_DIRECT_FILE_POLICY,
        captureHooks: { sourceRead: (path) => { reads.push(path); } },
      }, denied === "budget" ? { ...GRAPH_LIMIT_CEILINGS, files: 1 } : GRAPH_LIMIT_CEILINGS, () => false);
      expect(resolved.options).toBeUndefined();
      expect(reads).toEqual([]);
    }
  }));

  it.effect("resolves an explicit binary target with declared string name and path", () => Effect.gen(function* () {
    const root = yield* Effect.promise(makeGitFixture);
    yield* Effect.promise(() => put(root, "Cargo.toml", '[package]\nname = "fixture"\nversion = "0.1.0"\nedition = "2018"\n[[bin]]\nname = "tool"\npath = "custom.rs"\n'));
    yield* Effect.promise(() => put(root, "custom.rs", "mod receipt; struct Root { value: receipt::Receipt } fn main() {}"));
    yield* Effect.promise(() => put(root, "receipt.rs", "pub struct Receipt { value: u8 }"));
    expect((yield* prepare(addEvent(root, ["custom.rs"]))).outcomes.some((outcome) => outcome.status === "ready")).toBe(true);
  }));

  it.effect("refuses unsupported target directories even when listed as custom library paths", () => Effect.gen(function* () {
    const root = yield* Effect.promise(makeGitFixture);
    for (const path of ["build.rs", "tests/root.rs", "examples/root.rs", "benches/root.rs"]) {
      yield* Effect.promise(() => put(root, "Cargo.toml", `[package]\nname = "fixture"\nversion = "0.1.0"\nedition = "2021"\n[lib]\npath = "${path}"\n`));
      yield* Effect.promise(() => put(root, path, "mod receipt; struct Root { value: receipt::Receipt }"));
      const prefix = path.includes("/") ? path.slice(0, path.lastIndexOf("/") + 1) : "";
      yield* Effect.promise(() => put(root, `${prefix}receipt.rs`, "pub struct Receipt { value: u8 }"));
      expect((yield* prepare(addEvent(root, [path]))).outcomes.some((outcome) => outcome.status === "ready"), path).toBe(false);
    }
  }));

  it.effect("invalidates a child review when its captured parent module link changes", () => Effect.gen(function* () {
    const root = yield* Effect.promise(makeGitFixture);
    yield* Effect.promise(() => put(root, "Cargo.toml", '[package]\nname = "fixture"\nversion = "0.1.0"\nedition = "2021"\n'));
    yield* Effect.promise(() => put(root, "src/lib.rs", "mod model; mod receipt;"));
    yield* Effect.promise(() => put(root, "src/model.rs", "use crate::receipt::Receipt; struct Root { value: Receipt }"));
    yield* Effect.promise(() => put(root, "src/receipt.rs", "pub struct Receipt { value: u8 }"));
    const observation = yield* adaptCodexAdd(addEvent(root, ["src/model.rs"]));
    if (observation === undefined) throw new Error("fixture adaptation failed");
    const context = { controlledWriter: true, advicee: observation.advicee,
      settings: { backend: DEFAULT_BACKEND, destination: DEFAULT_DESTINATION }, rules: rules(true) };
    const result = yield* prepareObservation(observation, context);
    const ready = result.outcomes.find((outcome) => outcome.status === "ready");
    if (ready?.status !== "ready") throw new Error("child review was not ready");
    yield* Effect.promise(() => put(root, "src/lib.rs", "mod receipt;"));
    expect(yield* preparedUnitStillCurrent(observation, ready.prepared, context)).toBe(false);
  }));

  it.effect("does not choose between multiple crate roots reaching one edited module", () => Effect.gen(function* () {
    const root = yield* Effect.promise(makeGitFixture);
    yield* Effect.promise(() => put(root, "Cargo.toml", '[package]\nname = "fixture"\nversion = "0.1.0"\nedition = "2021"\n'));
    for (const path of ["src/lib.rs", "src/main.rs"]) yield* Effect.promise(() => put(root, path, "mod model; mod receipt;"));
    yield* Effect.promise(() => put(root, "src/model.rs", "use crate::receipt::Receipt; struct Root { value: Receipt }"));
    yield* Effect.promise(() => put(root, "src/receipt.rs", "pub struct Receipt { value: u8 }"));
    expect((yield* prepare(addEvent(root, ["src/model.rs"]))).outcomes.some((outcome) => outcome.status === "ready")).toBe(false);
  }));

  it.effect("revalidates module-candidate uniqueness and nearest Cargo authority", () => Effect.gen(function* () {
    for (const mutation of ["duplicate-module", "nearer-manifest"] as const) {
      const root = yield* Effect.promise(makeGitFixture);
      yield* Effect.promise(() => put(root, "Cargo.toml", '[package]\nname = "fixture"\nversion = "0.1.0"\nedition = "2021"\n'));
      yield* Effect.promise(() => put(root, "src/lib.rs", "mod model; mod receipt;"));
      yield* Effect.promise(() => put(root, "src/model.rs", "use crate::receipt::Receipt; struct Root { value: Receipt }"));
      yield* Effect.promise(() => put(root, "src/receipt.rs", "pub struct Receipt { value: u8 }"));
      const observation = yield* adaptCodexAdd(addEvent(root, ["src/model.rs"]));
      if (observation === undefined) throw new Error("fixture adaptation failed");
      const context = { controlledWriter: true, advicee: observation.advicee,
        settings: { backend: DEFAULT_BACKEND, destination: DEFAULT_DESTINATION }, rules: rules(true) };
      const result = yield* prepareObservation(observation, context);
      const ready = result.outcomes.find((outcome) => outcome.status === "ready");
      if (ready?.status !== "ready") throw new Error("child review was not ready");
      if (mutation === "duplicate-module") yield* Effect.promise(() => put(root, "src/receipt/mod.rs", "pub struct Receipt { value: u16 }"));
      else yield* Effect.promise(() => put(root, "src/Cargo.toml", '[package]\nname = "shadow"\nversion = "0.1.0"\nedition = "2021"\n'));
      expect(yield* preparedUnitStillCurrent(observation, ready.prepared, context), mutation).toBe(false);
    }
  }));

});
