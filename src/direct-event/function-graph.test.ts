import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { addEvent, makeGitFixture, put } from "./test-fixtures.ts";
import { adaptCodexDirectEvent } from "./adapter.ts";
import { captureStable } from "./capture.ts";
import { resolveGraphUnit } from "./graph-resolver.ts";
import { DEFAULT_DIRECT_FILE_POLICY, eligibleNamedPath } from "./selection.ts";

describe("bounded function graph candidate", () => {
  it.effect("keeps same-spelling type and function artifacts distinct", () => Effect.gen(function* () {
    const root = yield* Effect.promise(makeGitFixture);
    yield* Effect.promise(() => put(root, "a.ts",
      "type Foo = string; function Foo(): Foo { return 'x' } export function run(): Foo { return Foo() }"));
    const observation = yield* adaptCodexDirectEvent(addEvent(root, ["a.ts"]));
    if (observation === undefined) throw new Error("fixture adaptation failed");
    const selected = yield* eligibleNamedPath(root, "a.ts", DEFAULT_DIRECT_FILE_POLICY, observation.rootIdentity);
    if (selected === undefined) throw new Error("root selection failed");
    const capture = yield* captureStable(root, selected, undefined, observation.rootIdentity);
    if (capture === undefined) throw new Error("capture failed");
    const unit = yield* resolveGraphUnit("a.ts", capture, "run", {
      root, rootIdentity: observation.rootIdentity, policy: DEFAULT_DIRECT_FILE_POLICY, branch: "function",
    });
    expect(unit?.root.references.map((edge) => edge.kind === "expanded" ? edge.node.artifact.id : undefined))
      .toEqual(["a.ts:type-alias:Foo", "a.ts:function:Foo"]);
    const functionEdge = unit?.root.references[1];
    expect(functionEdge?.kind).toBe("expanded");
    if (functionEdge?.kind === "expanded") {
      expect(functionEdge.node.references).toMatchObject([{ kind: "included", target: "a.ts:type-alias:Foo" }]);
    }
  }));

  it.effect("expands a bound imported function through the Bend graph", () => Effect.gen(function* () {
    const root = yield* Effect.promise(makeGitFixture);
    yield* Effect.promise(() => put(root, "a.ts", "import { helper } from './b'; export function run(): number { return helper() }"));
    yield* Effect.promise(() => put(root, "b.ts", "export function helper(): number { return 1 }"));
    const observation = yield* adaptCodexDirectEvent(addEvent(root, ["a.ts"]));
    if (observation === undefined) throw new Error("fixture adaptation failed");
    const selected = yield* eligibleNamedPath(root, "a.ts", DEFAULT_DIRECT_FILE_POLICY, observation.rootIdentity);
    if (selected === undefined) throw new Error("root selection failed");
    const capture = yield* captureStable(root, selected, undefined, observation.rootIdentity);
    if (capture === undefined) throw new Error("capture failed");
    const unit = yield* resolveGraphUnit("a.ts", capture, "run", {
      root, rootIdentity: observation.rootIdentity, policy: DEFAULT_DIRECT_FILE_POLICY, branch: "function",
    });
    expect(unit?.root.artifact.kind).toBe("function");
    expect(unit?.root.references[0]).toMatchObject({ kind: "expanded", node: {
      artifact: { id: "b.ts:function:helper", kind: "function" },
    } });
  }));

  it.effect("rejects a type-only function call before a supporting read", () => Effect.gen(function* () {
    const root = yield* Effect.promise(makeGitFixture);
    yield* Effect.promise(() => put(root, "a.ts", "import type { helper } from './b'; export function run(): number { return helper() }"));
    yield* Effect.promise(() => put(root, "b.ts", "export function helper(): number { return 1 }"));
    const observation = yield* adaptCodexDirectEvent(addEvent(root, ["a.ts"]));
    if (observation === undefined) throw new Error("fixture adaptation failed");
    const selected = yield* eligibleNamedPath(root, "a.ts", DEFAULT_DIRECT_FILE_POLICY, observation.rootIdentity);
    if (selected === undefined) throw new Error("root selection failed");
    const capture = yield* captureStable(root, selected, undefined, observation.rootIdentity);
    if (capture === undefined) throw new Error("capture failed");
    const reads: string[] = [];
    const unit = yield* resolveGraphUnit("a.ts", capture, "run", {
      root, rootIdentity: observation.rootIdentity, policy: DEFAULT_DIRECT_FILE_POLICY, branch: "function",
      captureHooks: { sourceRead: (path) => { reads.push(path); } },
    });
    expect(unit?.root.references[0]).toMatchObject({ kind: "omitted", reason: "unsupported" });
    expect(reads).toEqual([]);
  }));
});
