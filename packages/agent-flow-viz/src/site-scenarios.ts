import { SITE_EXAMPLE } from "./site-example";
import {
  GRAPH_LIMIT_CEILINGS,
  type GraphLimits,
  type ImportGraphEvent,
} from "../../agent-flow-bend/import-graph-adapter";
import {
  replayImportScenario,
  type ImportScenario,
  type ImportScenarioStep,
} from "./import-graph-replay";

export type SiteScenarioMode = "normal" | "exclusion" | "tree-budget";
export type NarrativeCheckpoint = {
  readonly cursor: number;
  readonly title: string;
  readonly description: string;
};
export type SiteScenario = {
  readonly id: SiteScenarioMode;
  readonly title: string;
  readonly description: string;
  readonly scenario: ImportScenario;
  readonly limits: GraphLimits;
  readonly checkpoints: readonly NarrativeCheckpoint[];
};
const entry = (label: string, event: ImportGraphEvent): ImportScenarioStep => ({
  unit: 0,
  label,
  event,
});
const next = () => entry("Explore the next reference", { kind: "next" });
const capture = (edges: readonly number[]) =>
  entry("Read the allowed definition and check its contribution", {
    kind: "captured",
    sourceBytes: 1000,
    treeBytes: 400,
    edges,
  });
const visit = (
  target: number,
  edges: readonly number[],
  allowed = true,
): ImportScenarioStep[] => [
  next(),
  entry("Resolve the referenced definition", {
    kind: "resolved",
    target,
    result: "found",
  }),
  entry(
    allowed
      ? "File settings allow this definition"
      : "Your settings exclude this definition",
    { kind: "pathChecked", allowed },
  ),
  ...(allowed ? [capture(edges)] : []),
];
export const SITE_SCENARIOS: readonly SiteScenario[] = (
  ["normal", "exclusion", "tree-budget"] as const
).map((id) => {
  const denied = id === "exclusion";
  const steps = [
    entry("Start with the changed type", {
      kind: "root",
      target: 1,
      sourceBytes: 1000,
      treeBytes: 400,
      edges: [10],
    }),
    ...visit(2, [20]),
    ...visit(3, [], !denied),
    next(),
  ];
  const title =
    id === "normal"
      ? "Default selection"
      : denied
        ? "User exclusion"
        : "Size limit";
  const description =
    "Gallery refers to ImageFile, which refers to Dimensions. This demonstration places the definitions in separate files and uses illustrative byte counts. It does not read your files or send requests.";
  return {
    id,
    title,
    description,
    scenario: {
      title,
      description,
      units: [SITE_EXAMPLE.rootName],
      targetNames: {
        1: "Gallery",
        2: "ImageFile",
        3: "Dimensions",
      },
      steps,
    },
    limits:
      id === "tree-budget"
        ? { ...GRAPH_LIMIT_CEILINGS, treeBytes: 800 }
        : GRAPH_LIMIT_CEILINGS,
    checkpoints: [
      {
        cursor: 1,
        title: "Changed type",
        description:
          "Gallery is selected for review and has been read locally.",
      },
      {
        cursor: 5,
        title: "Cover image",
        description:
          "ImageFile is allowed by the file settings and added to the code for review.",
      },
      {
        cursor: denied ? 8 : 9,
        title: "Image dimensions",
        description: denied
          ? "Dimensions is excluded before its source is read."
          : id === "tree-budget"
            ? "Dimensions is read locally, but does not fit in the code tree and is not included."
            : "Dimensions is allowed and added to the code for review.",
      },
      {
        cursor: steps.length,
        title: id === "normal" ? "Code selected" : "Traversal finished",
        description:
          id === "normal"
            ? "The code of all three definitions is available for review."
            : denied
              ? "Dimensions was excluded without reading its source. Checks requiring the complete dependency tree are skipped; other checks can still run."
              : "Dimensions was read locally but excluded from the code tree. Checks requiring the complete dependency tree are skipped; other checks can still run.",
      },
    ],
  };
});
export const replaySiteScenario = (id: SiteScenarioMode, cursor: number) => {
  const item = SITE_SCENARIOS.find((scenario) => scenario.id === id)!;
  return replayImportScenario(item.scenario, cursor, item.limits);
};
