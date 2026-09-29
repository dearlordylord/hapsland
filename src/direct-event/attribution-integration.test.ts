import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { adaptCodexDirectEvent } from "./adapter.ts";
import { encodedFullJevRequestBytes, prepareObservation, preparedProviderInput,
  preparedUnitStillCurrent } from "./pipeline.ts";
import { addEvent, makeGitFixture, put, updateEvent } from "./test-fixtures.ts";
import { DEFAULT_BACKEND, DEFAULT_DESTINATION } from "../runtime/review-config.ts";
import { V2_FUNCTION_CONTRACT, V2_TYPE_CONTRACT } from "../rules/v2-targets.ts";
import { compileRulePackV2 } from "../rules/compiler.ts";
import { semanticIdentity } from "./model.ts";

describe("v2 Codex root attribution", () => {
  it.effect("selects a complete named function Add root through the Bend graph", () => Effect.gen(function* () {
    const root = yield* Effect.promise(makeGitFixture);
    yield* Effect.promise(() => put(root, "a.ts", "import { helper } from './b'; export function run(): number { return helper() }"));
    yield* Effect.promise(() => put(root, "b.ts", "export function helper(): number { return 1 }"));
    const observation = yield* adaptCodexDirectEvent(addEvent(root, ["a.ts"]));
    if (observation === undefined) throw new Error("fixture adaptation failed");
    const context = {
      controlledWriter: true, advicee: observation.advicee,
      inputContract: V2_FUNCTION_CONTRACT,
      settings: { backend: DEFAULT_BACKEND, destination: DEFAULT_DESTINATION },
      rules: compileRulePackV2({ schemaVersion: 2, id: "team", contentVersion: "1", rules: [{
        id: "function", question: "Is this function clear?", criteria: { false: "No", true: "Yes" },
        message: "Clarify it", reviewTargets: [{ artifactKind: "function",
          inputContract: V2_FUNCTION_CONTRACT, capabilities: ["signature", "body"] }],
      }] }, "fixture-v2"),
    } as const;
    const prepared = yield* prepareObservation(observation, context);
    expect(prepared.observation.outcomes[0]?.status).toBe("observed");
    if (prepared.observation.outcomes[0]?.status !== "observed") return;
    expect(prepared.observation.outcomes[0].units.map((unit) => [unit.root.artifact.kind,
      unit.root.artifact.name, unit.root.references[0]?.kind])).toEqual([["function", "run", "expanded"]]);
    const ready = prepared.outcomes.find((outcome) => outcome.status === "ready");
    expect(ready?.status).toBe("ready");
    if (ready?.status === "ready") {
      expect(ready.prepared.input.rules[0]?.target?.inputContract).toBe(V2_FUNCTION_CONTRACT);
      expect(ready.prepared.input.candidateProjection).toBe(true);
      expect(ready.prepared.input.rootLocation).toBeDefined();
      const location = ready.prepared.input.rootLocation!;
      expect(semanticIdentity({ ...ready.prepared.input, rootLocation: {
        start: { line: location.start.line + 1, column: location.start.column },
        end: { line: location.end.line + 1, column: location.end.column },
      } })).not.toBe(ready.prepared.identity);
      expect(ready.prepared.input.sourceFingerprints?.map((item) => item.path)).toEqual(["a.ts", "b.ts"]);
      const rendered = preparedProviderInput(ready.prepared);
      expect(rendered).toMatchObject({
        artifact: { kind: "function", name: "run", domain: "a.ts" },
        evidence: { rootId: "a.ts:function:run", nodes: [{ id: "b.ts:function:helper" }],
          edges: [{ from: "a.ts:function:run", to: "b.ts:function:helper", kind: "expanded", order: 0 }] },
        inputContract: { id: V2_FUNCTION_CONTRACT, completeness: "complete" },
      });
      expect(encodedFullJevRequestBytes(ready.prepared)).toBeLessThan(131_072);
      yield* Effect.promise(() => put(root, "b.ts", "// changed outside declaration\nexport function helper(): number { return 1 }"));
      expect(yield* preparedUnitStillCurrent(observation, ready.prepared, context)).toBe(false);
    }
  }));

  it.effect("selects the declaration enclosing a verified post-edit hunk", () => Effect.gen(function* () {
    const root = yield* Effect.promise(makeGitFixture);
    yield* Effect.promise(() => put(root, "a.ts", "interface A { value: string }\ninterface B { value: number }\n"));
    const event = updateEvent(root, "a.ts", ["interface B { value: number }"], {
      tool_response: { success: true },
    });
    const observation = yield* adaptCodexDirectEvent(event);
    if (observation === undefined) throw new Error("fixture adaptation failed");
    const prepared = yield* prepareObservation(observation, {
      controlledWriter: true, advicee: observation.advicee,
      inputContract: V2_TYPE_CONTRACT,
      settings: { backend: DEFAULT_BACKEND, destination: DEFAULT_DESTINATION },
    });
    expect(prepared.observation.outcomes[0]?.status).toBe("observed");
    if (prepared.observation.outcomes[0]?.status !== "observed") return;
    expect(prepared.observation.outcomes[0].units.map((unit) => unit.root.artifact.name)).toEqual(["B"]);
  }));

  it.effect("does not fall back to text matching when post-image position is ambiguous", () => Effect.gen(function* () {
    const root = yield* Effect.promise(makeGitFixture);
    yield* Effect.promise(() => put(root, "a.ts", "interface A { value: string }\n// marker\ninterface B { value: number }\n// marker\n"));
    const event = updateEvent(root, "a.ts", ["// marker"], {
      tool_response: { success: true },
    });
    const observation = yield* adaptCodexDirectEvent(event);
    if (observation === undefined) throw new Error("fixture adaptation failed");
    const prepared = yield* prepareObservation(observation, {
      controlledWriter: true, advicee: observation.advicee,
      inputContract: V2_TYPE_CONTRACT,
      settings: { backend: DEFAULT_BACKEND, destination: DEFAULT_DESTINATION },
    });
    expect(prepared.observation.status).toBe("incomplete");
    if (prepared.observation.status === "incomplete") expect(prepared.observation.units).toEqual([]);
  }));

  it.effect("requires a confirmed successful Codex Update before v2 attribution", () => Effect.gen(function* () {
    const root = yield* Effect.promise(makeGitFixture);
    yield* Effect.promise(() => put(root, "a.ts", "interface B { value: number }\n"));
    const observation = yield* adaptCodexDirectEvent(updateEvent(root, "a.ts", ["interface B { value: number }"]));
    if (observation === undefined) throw new Error("fixture adaptation failed");
    const prepared = yield* prepareObservation(observation, {
      controlledWriter: true, advicee: observation.advicee,
      inputContract: V2_TYPE_CONTRACT,
      settings: { backend: DEFAULT_BACKEND, destination: DEFAULT_DESTINATION },
    });
    expect(prepared.observation.status).toBe("incomplete");
    if (prepared.observation.status === "incomplete") expect(prepared.observation.units).toEqual([]);
  }));
});
