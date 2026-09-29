import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { put, makeGitFixture, addEvent } from "./test-fixtures.ts";
import { adaptCodexAdd } from "./adapter.ts";
import { prepareObservation } from "./pipeline.ts";
import { DEFAULT_BACKEND, DEFAULT_DESTINATION } from "../runtime/review-config.ts";
import { configuredRules } from "../policy/rules.ts";
import { inspectGraphFile } from "./analyzer.ts";
import { captureStable } from "./capture.ts";
import { resolveGraphUnit } from "./graph-resolver.ts";
import { DEFAULT_DIRECT_FILE_POLICY, eligibleNamedPath } from "./selection.ts";
import { GRAPH_LIMIT_CEILINGS } from "../configuration/graph-limits.ts";
import { compileRulePackV2 } from "../rules/compiler.ts";
import { V2_TYPE_CONTRACT } from "../rules/v2-targets.ts";

const candidateRules = compileRulePackV2({ schemaVersion: 2, id: "graph", contentVersion: "1", rules: [{
  id: "shape", question: "Is the type clear?", criteria: { false: "No", true: "Yes" },
  message: "Clarify type", reviewTargets: [{ artifactKind: "typeShape", inputContract: V2_TYPE_CONTRACT,
    capabilities: ["root-declaration", "resolved-outbound-types"] }],
}] }, "fixture-v2");

describe("cross-file graph preparation", () => {
  it.effect("does not physically read an oversized supporting source", () => Effect.gen(function* () {
    const root = yield* Effect.promise(makeGitFixture);
    yield* Effect.promise(() => put(root, "a.ts", "import type { B } from './b'; interface A { b: B }"));
    yield* Effect.promise(() => put(root, "b.ts", `// ${"x".repeat(100)}\nexport interface B { value: string }`));
    const observation = yield* adaptCodexAdd(addEvent(root, ["a.ts"]));
    if (observation === undefined) throw new Error("fixture adaptation failed");
    const selected = yield* eligibleNamedPath(root, "a.ts", DEFAULT_DIRECT_FILE_POLICY, observation.rootIdentity);
    if (selected === undefined) throw new Error("root path was not eligible");
    const capture = yield* captureStable(root, selected, {}, observation.rootIdentity);
    if (capture === undefined) throw new Error("root capture failed");
    const reads: string[] = [];
    const unit = yield* resolveGraphUnit("a.ts", capture, "A", {
      root, rootIdentity: observation.rootIdentity, policy: DEFAULT_DIRECT_FILE_POLICY,
      limits: { ...GRAPH_LIMIT_CEILINGS, sourceBytes: 80, readBytes: 160 },
      captureHooks: { sourceRead: (path) => { reads.push(path); } },
    });
    expect(unit).toBeUndefined();
    expect(reads).toEqual([]);
  }));

  it.effect("lets Bend reserve the aggregate read cap before another supporting read", () => Effect.gen(function* () {
    const root = yield* Effect.promise(makeGitFixture);
    const a = "import type { B } from './b'; interface A { b: B }";
    const b = "import type { C } from './c'; export interface B { c: C }";
    yield* Effect.promise(() => put(root, "a.ts", a));
    yield* Effect.promise(() => put(root, "b.ts", b));
    yield* Effect.promise(() => put(root, "c.ts", "export interface C { value: string }"));
    const observation = yield* adaptCodexAdd(addEvent(root, ["a.ts"]));
    if (observation === undefined) throw new Error("fixture adaptation failed");
    const selected = yield* eligibleNamedPath(root, "a.ts", DEFAULT_DIRECT_FILE_POLICY, observation.rootIdentity);
    if (selected === undefined) throw new Error("root path was not eligible");
    const capture = yield* captureStable(root, selected, {}, observation.rootIdentity);
    if (capture === undefined) throw new Error("root capture failed");
    const reads: string[] = [];
    const unit = yield* resolveGraphUnit("a.ts", capture, "A", {
      root, rootIdentity: observation.rootIdentity, policy: DEFAULT_DIRECT_FILE_POLICY,
      limits: { ...GRAPH_LIMIT_CEILINGS, readBytes: GRAPH_LIMIT_CEILINGS.sourceBytes + 100 },
      captureHooks: { sourceRead: (path) => { reads.push(path); } },
    });
    expect(unit).toBeUndefined();
    expect(reads).toEqual(["b.ts", "b.ts"]);
  }));

  it.effect("charges local work inside a supporting file before the next import", () => Effect.gen(function* () {
    const root = yield* Effect.promise(makeGitFixture);
    yield* Effect.promise(() => put(root, "a.ts", "import type { B } from './b'; interface A { b: B }"));
    yield* Effect.promise(() => put(root, "b.ts", "import type { D } from './d'; interface C { value: string } export interface B { c: C; d: D }"));
    yield* Effect.promise(() => put(root, "d.ts", "import type { E } from './e'; export interface D { e: E }"));
    yield* Effect.promise(() => put(root, "e.ts", "export interface E { value: string }"));
    const observation = yield* adaptCodexAdd(addEvent(root, ["a.ts"]));
    if (observation === undefined) throw new Error("fixture adaptation failed");
    const selected = yield* eligibleNamedPath(root, "a.ts", DEFAULT_DIRECT_FILE_POLICY, observation.rootIdentity);
    if (selected === undefined) throw new Error("root path was not eligible");
    const capture = yield* captureStable(root, selected, {}, observation.rootIdentity);
    if (capture === undefined) throw new Error("root capture failed");
    const reads: string[] = [];
    const base = { root, rootIdentity: observation.rootIdentity, policy: DEFAULT_DIRECT_FILE_POLICY,
      captureHooks: { sourceRead: (path: string) => { reads.push(path); } } };
    const exhausted = yield* resolveGraphUnit("a.ts", capture, "A", { ...base,
      limits: { ...GRAPH_LIMIT_CEILINGS, work: 3 } });
    expect(exhausted).toBeUndefined();
    expect(reads).toEqual(["b.ts", "b.ts", "d.ts", "d.ts"]);
    reads.length = 0;
    const enough = yield* resolveGraphUnit("a.ts", capture, "A", { ...base,
      limits: { ...GRAPH_LIMIT_CEILINGS, work: 4 } });
    expect(enough?.root.references[0]?.kind).toBe("expanded");
    expect(reads).toEqual(["b.ts", "b.ts", "d.ts", "d.ts", "e.ts", "e.ts"]);
  }));

  it.effect("keeps local and import work under one immutable total", () => Effect.gen(function* () {
    const root = yield* Effect.promise(makeGitFixture);
    yield* Effect.promise(() => put(root, "a.ts", "import type { B } from './b'; interface C { value: string } interface A { c: C; b: B }"));
    yield* Effect.promise(() => put(root, "b.ts", "export interface B { value: string }"));
    const observation = yield* adaptCodexAdd(addEvent(root, ["a.ts"]));
    if (observation === undefined) throw new Error("fixture adaptation failed");
    const selected = yield* eligibleNamedPath(root, "a.ts", DEFAULT_DIRECT_FILE_POLICY, observation.rootIdentity);
    if (selected === undefined) throw new Error("root path was not eligible");
    const capture = yield* captureStable(root, selected, {}, observation.rootIdentity);
    if (capture === undefined) throw new Error("root capture failed");
    const reads: string[] = [];
    const base = { root, rootIdentity: observation.rootIdentity,
      policy: DEFAULT_DIRECT_FILE_POLICY,
      captureHooks: { sourceRead: (path: string) => { reads.push(path); } } };
    const exhausted = yield* resolveGraphUnit("a.ts", capture, "A", {
      ...base, limits: { ...GRAPH_LIMIT_CEILINGS, work: 1 },
    });
    expect(exhausted).toBeUndefined();
    expect(reads).toEqual([]);
    const sufficient = yield* resolveGraphUnit("a.ts", capture, "A", {
      ...base, limits: { ...GRAPH_LIMIT_CEILINGS, work: 2 },
    });
    expect(sufficient?.root.references.map((edge) => edge.kind)).toEqual(["expanded", "expanded"]);
    expect(reads).toEqual(["b.ts", "b.ts"]);
  }));

  it.effect("accepts a complete local unit when the graph has zero remaining work", () => Effect.gen(function* () {
    const root = yield* Effect.promise(makeGitFixture);
    yield* Effect.promise(() => put(root, "a.ts", "interface C { value: string } interface A { c: C }"));
    const observation = yield* adaptCodexAdd(addEvent(root, ["a.ts"]));
    if (observation === undefined) throw new Error("fixture adaptation failed");
    const selected = yield* eligibleNamedPath(root, "a.ts", DEFAULT_DIRECT_FILE_POLICY, observation.rootIdentity);
    if (selected === undefined) throw new Error("root path was not eligible");
    const capture = yield* captureStable(root, selected, {}, observation.rootIdentity);
    if (capture === undefined) throw new Error("root capture failed");
    const complete = yield* resolveGraphUnit("a.ts", capture, "A", { root, rootIdentity: observation.rootIdentity,
      policy: DEFAULT_DIRECT_FILE_POLICY, limits: { ...GRAPH_LIMIT_CEILINGS, work: 1 } });
    expect(complete?.root.references[0]).toMatchObject({ kind: "expanded", node: { artifact: { id: "a.ts:interface:C" } } });
  }));

  it.effect("applies the outgoing target cap per source file across A to B to C", () => Effect.gen(function* () {
    const root = yield* Effect.promise(makeGitFixture);
    yield* Effect.promise(() => put(root, "a.ts", "import type { B } from './b'; interface A { b: B }"));
    yield* Effect.promise(() => put(root, "b.ts", "import type { C } from './c'; export interface B { c: C }"));
    yield* Effect.promise(() => put(root, "c.ts", "export interface C { value: string }"));
    const observation = yield* adaptCodexAdd(addEvent(root, ["a.ts"]));
    if (observation === undefined) throw new Error("fixture adaptation failed");
    const selected = yield* eligibleNamedPath(root, "a.ts", DEFAULT_DIRECT_FILE_POLICY, observation.rootIdentity);
    if (selected === undefined) throw new Error("root path was not eligible");
    const capture = yield* captureStable(root, selected, {}, observation.rootIdentity);
    if (capture === undefined) throw new Error("root capture failed");
    const unit = yield* resolveGraphUnit("a.ts", capture, "A", { root, rootIdentity: observation.rootIdentity,
      policy: DEFAULT_DIRECT_FILE_POLICY, limits: { ...GRAPH_LIMIT_CEILINGS, outgoingEdges: 1 } });
    expect(unit?.root.references[0]).toMatchObject({ kind: "expanded", node: { artifact: { id: "b.ts:interface:B" },
      references: [{ kind: "expanded", node: { artifact: { id: "c.ts:interface:C" } } }] } });
    for (const tighter of [{ depth: 1 }, { work: 1 }, { treeBytes: 1 }] as const) {
      const denied = yield* resolveGraphUnit("a.ts", capture, "A", { root, rootIdentity: observation.rootIdentity,
        policy: DEFAULT_DIRECT_FILE_POLICY, limits: { ...GRAPH_LIMIT_CEILINGS, outgoingEdges: 1, ...tighter } });
      expect(denied).toBeUndefined();
    }
  }));

  it.effect("rejects two distinct outgoing targets from one supporting file", () => Effect.gen(function* () {
    const root = yield* Effect.promise(makeGitFixture);
    yield* Effect.promise(() => put(root, "a.ts", "import type { B } from './b'; interface A { b: B }"));
    yield* Effect.promise(() => put(root, "b.ts", "import type { C } from './c'; import type { D } from './d'; export interface B { c: C; d: D }"));
    yield* Effect.promise(() => put(root, "c.ts", "export interface C { value: string }"));
    yield* Effect.promise(() => put(root, "d.ts", "export interface D { value: string }"));
    const observation = yield* adaptCodexAdd(addEvent(root, ["a.ts"]));
    if (observation === undefined) throw new Error("fixture adaptation failed");
    const selected = yield* eligibleNamedPath(root, "a.ts", DEFAULT_DIRECT_FILE_POLICY, observation.rootIdentity);
    if (selected === undefined) throw new Error("root path was not eligible");
    const capture = yield* captureStable(root, selected, {}, observation.rootIdentity);
    if (capture === undefined) throw new Error("root capture failed");
    const reads: string[] = [];
    const unit = yield* resolveGraphUnit("a.ts", capture, "A", { root, rootIdentity: observation.rootIdentity,
      policy: DEFAULT_DIRECT_FILE_POLICY, limits: { ...GRAPH_LIMIT_CEILINGS, outgoingEdges: 1 },
      captureHooks: { sourceRead: (path) => { reads.push(path); } } });
    expect(unit).toBeUndefined();
    expect(reads).toEqual(["b.ts", "b.ts"]);
  }));

  it.effect("retains the legacy v1 namespace root behavior below 32 KiB", () => Effect.gen(function* () {
    const root = yield* Effect.promise(makeGitFixture);
    yield* Effect.promise(() => put(root, "a.ts", "namespace N { export interface A { x: string } }"));
    const observation = yield* adaptCodexAdd(addEvent(root, ["a.ts"]));
    if (observation === undefined) throw new Error("fixture adaptation failed");
    const prepared = yield* prepareObservation(observation, {
      controlledWriter: true, advicee: observation.advicee,
      settings: { backend: DEFAULT_BACKEND, destination: DEFAULT_DESTINATION }, rules: configuredRules,
    });
    expect(prepared.outcomes.some((outcome) => outcome.status === "ready" &&
      outcome.prepared.input.declaration.name === "A" && !outcome.prepared.input.candidateProjection)).toBe(true);
  }));

  it("does not select a declaration nested in a namespace as a direct graph root", () => {
    expect(inspectGraphFile("a.ts", "namespace N { export interface A { x: string } }")).toBeUndefined();
  });

  it.effect("retains the accepted v1 same-file profile below 32 KiB", () => Effect.gen(function* () {
    const root = yield* Effect.promise(makeGitFixture);
    yield* Effect.promise(() => put(root, "a.ts", `type A = "${"x".repeat(24_000)}";\n`));
    const observation = yield* adaptCodexAdd(addEvent(root, ["a.ts"]));
    if (observation === undefined) throw new Error("fixture adaptation failed");
    const prepared = yield* prepareObservation(observation, {
      controlledWriter: true, advicee: observation.advicee,
      settings: { backend: DEFAULT_BACKEND, destination: DEFAULT_DESTINATION }, rules: configuredRules,
    });
    expect(prepared.outcomes.some((outcome) => outcome.status === "ready" &&
      outcome.prepared.input.declaration.name === "A" && !outcome.prepared.input.candidateProjection)).toBe(true);
  }));

  it.effect("expands allowed imported evidence and omits excluded supporting source", () => Effect.gen(function* () {
    const root = yield* Effect.promise(makeGitFixture);
    yield* Effect.promise(() => put(root, "a.ts", "import type { B } from './b'; interface A { b: B }"));
    yield* Effect.promise(() => put(root, "b.ts", "export interface B { value: string }"));
    const observation = yield* adaptCodexAdd(addEvent(root, ["a.ts"]));
    expect(observation).toBeDefined();
    if (observation === undefined) return;
    const base = { controlledWriter: true, advicee: observation.advicee,
      settings: { backend: DEFAULT_BACKEND, destination: DEFAULT_DESTINATION }, rules: candidateRules, inputContract: V2_TYPE_CONTRACT } as const;
    const prepared = yield* prepareObservation(observation, base);
    const a = prepared.outcomes.find((outcome) => outcome.status === "ready");
    expect(a?.status).toBe("ready");
    if (a?.status !== "ready") return;
    expect(a.prepared.input.unit.root.references[0]).toMatchObject({ kind: "expanded", node: { artifact: { id: "b.ts:interface:B" } } });
    const reads: string[] = [];
    const excluded = yield* prepareObservation(observation, { ...base,
      policy: { includes: ["a.ts"], excludes: [] },
      captureHooks: { sourceRead: (path) => { reads.push(path); } },
    });
    expect(excluded.outcomes.some((outcome) => outcome.status === "ready")).toBe(false);
    expect(reads).toEqual(["a.ts", "a.ts"]);
  }));

  it.effect("does not read C when A imports B and B imports excluded C", () => Effect.gen(function* () {
    const root = yield* Effect.promise(makeGitFixture);
    yield* Effect.promise(() => put(root, "a.ts", "import type { B } from './b'; interface A { b: B }"));
    yield* Effect.promise(() => put(root, "b.ts", "import type { C } from './c'; export interface B { c: C }"));
    yield* Effect.promise(() => put(root, "c.ts", "export interface C { value: string }"));
    const observation = yield* adaptCodexAdd(addEvent(root, ["a.ts"]));
    expect(observation).toBeDefined();
    if (observation === undefined) return;
    const reads: string[] = [];
    const prepared = yield* prepareObservation(observation, {
      controlledWriter: true,
      advicee: observation.advicee,
      settings: { backend: DEFAULT_BACKEND, destination: DEFAULT_DESTINATION },
      rules: candidateRules, inputContract: V2_TYPE_CONTRACT,
      policy: { includes: ["a.ts", "b.ts"], excludes: ["c.ts"] },
      captureHooks: { sourceRead: (path) => { reads.push(path); } },
    });
    expect(prepared.outcomes.some((outcome) => outcome.status === "ready")).toBe(false);
    expect(reads).toEqual(["a.ts", "a.ts", "b.ts", "b.ts"]);
  }));

  it.effect("captures a source above the old 32 KiB limit when its evidence tree fits", () => Effect.gen(function* () {
    const root = yield* Effect.promise(makeGitFixture);
    yield* Effect.promise(() => put(root, "a.ts", `${"/".repeat(40_000)}\ninterface A { value: string }`));
    const observation = yield* adaptCodexAdd(addEvent(root, ["a.ts"]));
    expect(observation).toBeDefined();
    if (observation === undefined) return;
    const prepared = yield* prepareObservation(observation, {
      controlledWriter: true, advicee: observation.advicee,
      settings: { backend: DEFAULT_BACKEND, destination: DEFAULT_DESTINATION }, rules: candidateRules, inputContract: V2_TYPE_CONTRACT,
    });
    expect(prepared.outcomes.some((outcome) => outcome.status === "ready")).toBe(true);
  }));
  it.effect("resolves inline type imports and TypeScript sources named through .js", () => Effect.gen(function* () {
    const root = yield* Effect.promise(makeGitFixture);
    yield* Effect.promise(() => put(root, "a.ts", "import { type B as Renamed } from './b.js'; interface A { b: Renamed }"));
    yield* Effect.promise(() => put(root, "b.ts", "export interface B { value: string }"));
    const observation = yield* adaptCodexAdd(addEvent(root, ["a.ts"]));
    if (observation === undefined) throw new Error("fixture adaptation failed");
    const prepared = yield* prepareObservation(observation, {
      controlledWriter: true, advicee: observation.advicee,
      settings: { backend: DEFAULT_BACKEND, destination: DEFAULT_DESTINATION }, rules: candidateRules, inputContract: V2_TYPE_CONTRACT,
    });
    expect(prepared.outcomes.some((outcome) => outcome.status === "ready")).toBe(true);
  }));
  it.effect("closes a cross-file cycle with an included root reference", () => Effect.gen(function* () {
    const root = yield* Effect.promise(makeGitFixture);
    yield* Effect.promise(() => put(root, "a.ts", "import type { B } from './b'; export interface A { b: B }"));
    yield* Effect.promise(() => put(root, "b.ts", "import type { A } from './a'; export interface B { a: A }"));
    const observation = yield* adaptCodexAdd(addEvent(root, ["a.ts"]));
    if (observation === undefined) throw new Error("fixture adaptation failed");
    const prepared = yield* prepareObservation(observation, {
      controlledWriter: true, advicee: observation.advicee,
      settings: { backend: DEFAULT_BACKEND, destination: DEFAULT_DESTINATION }, rules: candidateRules, inputContract: V2_TYPE_CONTRACT,
    });
    const a = prepared.outcomes.find((outcome) => outcome.status === "ready");
    expect(a?.status).toBe("ready");
    if (a?.status !== "ready") return;
    const b = a.prepared.input.unit.root.references[0];
    expect(b?.kind).toBe("expanded");
    if (b?.kind === "expanded") expect(b.node.references[0]).toMatchObject({ kind: "included", target: "a.ts:interface:A" });
  }));
  it.effect("does not treat a private declaration in another file as imported evidence", () => Effect.gen(function* () {
    const root = yield* Effect.promise(makeGitFixture);
    yield* Effect.promise(() => put(root, "a.ts", "import type { B } from './b'; interface A { b: B }"));
    yield* Effect.promise(() => put(root, "b.ts", "interface B { value: string }"));
    const observation = yield* adaptCodexAdd(addEvent(root, ["a.ts"]));
    if (observation === undefined) throw new Error("fixture adaptation failed");
    const prepared = yield* prepareObservation(observation, {
      controlledWriter: true, advicee: observation.advicee,
      settings: { backend: DEFAULT_BACKEND, destination: DEFAULT_DESTINATION }, rules: candidateRules, inputContract: V2_TYPE_CONTRACT,
    });
    expect(prepared.outcomes.some((outcome) => outcome.status === "ready")).toBe(false);
  }));
  it.effect("refuses a fifth local edge even when the encoded tree fits", () => Effect.gen(function* () {
    const root = yield* Effect.promise(makeGitFixture);
    const source = "import type { External } from './unused';\n" +
      Array.from({ length: 6 }, (_, i) => `interface T${i} { next: ${i === 5 ? "string" : `T${i + 1}`} }`).join("\n");
    yield* Effect.promise(() => put(root, "a.ts", source));
    const observation = yield* adaptCodexAdd(addEvent(root, ["a.ts"]));
    if (observation === undefined) throw new Error("fixture adaptation failed");
    const prepared = yield* prepareObservation(observation, {
      controlledWriter: true, advicee: observation.advicee,
      settings: { backend: DEFAULT_BACKEND, destination: DEFAULT_DESTINATION }, rules: candidateRules, inputContract: V2_TYPE_CONTRACT,
    });
    expect(prepared.outcomes.some((outcome) => outcome.status === "ready" &&
      outcome.prepared.input.declaration.name === "T0")).toBe(false);
    expect(prepared.outcomes.some((outcome) => outcome.status === "ready" &&
      outcome.prepared.input.declaration.name === "T1")).toBe(true);
  }));
  it.effect("stops graph analysis at its deadline before reading support", () => Effect.gen(function* () {
    const root = yield* Effect.promise(makeGitFixture);
    yield* Effect.promise(() => put(root, "a.ts", "import type { B } from './b'; interface A { b: B }"));
    yield* Effect.promise(() => put(root, "b.ts", "export interface B { value: string }"));
    const observation = yield* adaptCodexAdd(addEvent(root, ["a.ts"]));
    if (observation === undefined) throw new Error("fixture adaptation failed");
    const reads: string[] = [];
    let clock = 0;
    const prepared = yield* prepareObservation(observation, {
      controlledWriter: true, advicee: observation.advicee,
      settings: { backend: DEFAULT_BACKEND, destination: DEFAULT_DESTINATION }, rules: candidateRules, inputContract: V2_TYPE_CONTRACT,
      graphNow: () => { const value = clock; clock += 5_000; return value; },
      captureHooks: { sourceRead: (path) => { reads.push(path); } },
    });
    expect(prepared.outcomes.some((outcome) => outcome.status === "ready")).toBe(false);
    expect(reads).toEqual(["a.ts", "a.ts"]);
  }));
  it.effect("shares one stable supporting capture across independently edited roots", () => Effect.gen(function* () {
    const root = yield* Effect.promise(makeGitFixture);
    yield* Effect.promise(() => put(root, "a.ts", "import type { B } from './b'; interface A { b: B }\ninterface D { b: B }"));
    yield* Effect.promise(() => put(root, "b.ts", "export interface B { value: string }"));
    const observation = yield* adaptCodexAdd(addEvent(root, ["a.ts"]));
    if (observation === undefined) throw new Error("fixture adaptation failed");
    const reads: string[] = [];
    const prepared = yield* prepareObservation(observation, {
      controlledWriter: true, advicee: observation.advicee,
      settings: { backend: DEFAULT_BACKEND, destination: DEFAULT_DESTINATION }, rules: candidateRules, inputContract: V2_TYPE_CONTRACT,
      captureHooks: { sourceRead: (path) => { reads.push(path); } },
    });
    expect(prepared.outcomes.filter((outcome) => outcome.status === "ready")).toHaveLength(2);
    expect(reads.filter((path) => path === "b.ts")).toHaveLength(2);
  }));
  it.effect("caps the whole observation at 64 graph units", () => Effect.gen(function* () {
    const root = yield* Effect.promise(makeGitFixture);
    yield* Effect.promise(() => put(root, "a.ts", Array.from({ length: 64 }, (_, i) =>
      `type T${i} = number`).join("\n")));
    yield* Effect.promise(() => put(root, "b.ts", "type Extra = number"));
    const observation = yield* adaptCodexAdd(addEvent(root, ["a.ts", "b.ts"]));
    if (observation === undefined) throw new Error("fixture adaptation failed");
    const prepared = yield* prepareObservation(observation, {
      controlledWriter: true, advicee: observation.advicee,
      settings: { backend: DEFAULT_BACKEND, destination: DEFAULT_DESTINATION }, rules: candidateRules, inputContract: V2_TYPE_CONTRACT,
    });
    expect(prepared.outcomes.filter((outcome) => outcome.status === "ready")).toHaveLength(64);
    expect(prepared.outcomes.some((outcome) => outcome.status === "ready" &&
      outcome.prepared.input.path === "b.ts")).toBe(false);
  }));
});
