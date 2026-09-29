import { describe, expect, it } from "@effect/vitest";
import { readFile } from "node:fs/promises";
import * as Effect from "effect/Effect";
import { adaptCodexDirectEvent } from "./adapter.ts";
import { prepareObservation } from "./pipeline.ts";
import { addEvent, makeGitFixture, put } from "./test-fixtures.ts";
import { DEFAULT_BACKEND, DEFAULT_DESTINATION } from "../runtime/review-config.ts";
import { compileRulePackV2 } from "../rules/compiler.ts";
import { V2_FUNCTION_CONTRACT, V2_TYPE_CONTRACT } from "../rules/v2-targets.ts";

type Case = {
  id: string;
  branch: "type-shape/v2" | "function/v1";
  event: { kind: "Add" | "Update"; patch: string };
  selectedRoot: { name: string };
  expectedCompleteness: string;
  expectedBand: "<0.30" | ">0.70" | null;
  sources: ReadonlyArray<{ path: string }>;
};

const corpus = new URL("../../evidence/issue-138-adoption/", import.meta.url);
const manifest = JSON.parse(await readFile(new URL("manifest.json", corpus), "utf8")) as { cases: ReadonlyArray<Case> };
const offlineManifest = JSON.parse(await readFile(new URL("offline-manifest.json", corpus), "utf8")) as {
  cases: ReadonlyArray<{
    id: string;
    branch: Case["branch"];
    event: Case["event"];
    sources: Case["sources"];
  }>;
};
const rules = compileRulePackV2({
  schemaVersion: 2, id: "corpus-probe", contentVersion: "1", rules: [
    {
      id: "type", question: "Is the shape meaningful?", criteria: { false: "No", true: "Yes" },
      message: "Review type", reviewTargets: [{ artifactKind: "typeShape", inputContract: V2_TYPE_CONTRACT,
        capabilities: ["root-declaration", "resolved-outbound-types"] }],
    },
    {
      id: "function", question: "Is the body accounted for?", criteria: { false: "No", true: "Yes" },
      message: "Review function", reviewTargets: [{ artifactKind: "function", inputContract: V2_FUNCTION_CONTRACT,
        capabilities: ["signature", "body", "resolved-local-calls"] }],
    },
  ],
}, "fixture:adoption-corpus");

describe("proposed adoption corpus native completeness", () => {
  for (const fixture of manifest.cases) {
    it.effect(fixture.id, () => Effect.gen(function* () {
      const root = yield* Effect.promise(makeGitFixture);
      for (const source of fixture.sources) {
        const name = source.path.split("/").at(-1);
        if (name === undefined || name === "root.before.ts") continue;
        const content = yield* Effect.promise(() => readFile(new URL(source.path, corpus), "utf8"));
        yield* Effect.promise(() => put(root, name, content));
      }
      const raw = addEvent(root, ["root.ts"], {
        tool_input: { command: fixture.event.patch },
        tool_response: { success: true },
      });
      const observation = yield* adaptCodexDirectEvent(raw);
      expect(observation).toBeDefined();
      if (observation === undefined) return;
      const prepared = yield* prepareObservation(observation, {
        controlledWriter: true, advicee: observation.advicee,
        inputContract: fixture.branch === "type-shape/v2" ? V2_TYPE_CONTRACT : V2_FUNCTION_CONTRACT,
        settings: { backend: DEFAULT_BACKEND, destination: DEFAULT_DESTINATION },
        rules,
      });
      const selected = prepared.observation.outcomes.filter((outcome) => outcome.status === "observed")
        .flatMap((outcome) => outcome.units.map((unit) => unit.root.artifact.name));
      if (fixture.expectedBand === null) {
        expect(selected).not.toContain(fixture.selectedRoot.name);
      } else {
        expect(fixture.expectedCompleteness).toBe("complete-candidate");
        expect(selected).toEqual([fixture.selectedRoot.name]);
        expect(prepared.outcomes.filter((outcome) => outcome.status === "ready")).toHaveLength(1);
      }
    }));
  }
  for (const id of ["TI09", "FI09", "TI13", "FI13"]) {
    it.effect(id, () => Effect.gen(function* () {
      const fixture = offlineManifest.cases.find((item) => item.id === id);
      if (fixture === undefined) throw new Error(`missing offline fixture ${id}`);
      const root = yield* Effect.promise(makeGitFixture);
      for (const source of fixture.sources) {
        const name = source.path.split("/").at(-1);
        if (name === undefined || name === "root.before.ts") continue;
        const content = yield* Effect.promise(() => readFile(new URL(source.path, corpus), "utf8"));
        yield* Effect.promise(() => put(root, name, content));
      }
      const observation = yield* adaptCodexDirectEvent(addEvent(root, ["root.ts"], {
        tool_input: { command: fixture.event.patch },
        tool_response: { success: true },
      }));
      expect(observation).toBeDefined();
      if (observation === undefined) return;
      const prepared = yield* prepareObservation(observation, {
        controlledWriter: true, advicee: observation.advicee,
        inputContract: fixture.branch === "type-shape/v2" ? V2_TYPE_CONTRACT : V2_FUNCTION_CONTRACT,
        settings: { backend: DEFAULT_BACKEND, destination: DEFAULT_DESTINATION },
        rules,
      });
      const selected = prepared.observation.outcomes.filter((outcome) => outcome.status === "observed")
        .flatMap((outcome) => outcome.units.map((unit) => unit.root.artifact.name));
      expect(selected).toEqual(id.endsWith("09") ? [] : ["A", "B"]);
    }));
  }
});
