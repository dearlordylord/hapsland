import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { adaptCodexDirectEvent } from "./adapter.ts";
import { prepareObservation } from "./pipeline.ts";
import { makeGitFixture, put, updateEvent } from "./test-fixtures.ts";
import { DEFAULT_BACKEND, DEFAULT_DESTINATION } from "../runtime/review-config.ts";
import { V2_TYPE_CONTRACT } from "../rules/v2-targets.ts";

describe("v2 Codex root attribution", () => {
  it.effect("selects the declaration enclosing a verified post-edit hunk", () => Effect.gen(function* () {
    const root = yield* Effect.promise(makeGitFixture);
    yield* Effect.promise(() => put(root, "a.ts", "interface A { value: string }\ninterface B { value: number }\n"));
    const event = updateEvent(root, "a.ts", ["interface B { value: number }"]);
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
    const event = updateEvent(root, "a.ts", ["// marker"]);
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
});
