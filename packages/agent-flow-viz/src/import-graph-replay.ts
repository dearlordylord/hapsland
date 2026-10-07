import { BRANCHING_TREE_BUDGET } from "../../monkey-business/src/preparation"
import {
  GRAPH_LIMIT_CEILINGS,
  initialImportGraph,
  projectImportGraph,
  stepImportGraph
} from "@hapsland/canonical-policy/canonical/graph-adapter"
import type { GraphLimits } from "@hapsland/canonical-policy/canonical/graph-adapter"

type Input = Parameters<typeof stepImportGraph>[1]
type ExampleStep = { readonly unit: number; readonly label: string; readonly event: Input }
const step = (label: string, event: Input, unit = 0): ExampleStep => ({ unit, label, event })
const root = (edges: number[], treeBytes = 400): ExampleStep =>
  step("Native: allowed root A captured; ordered edge facts supplied", {
    kind: "root",
    target: 1,
    sourceBytes: 1000,
    treeBytes,
    edges
  })
const next = () => step("Replay: supply Next event for pending exploration", { kind: "next" })
const resolved = (target: number) =>
  step(`Native: edge resolves to target #${target}`, { kind: "resolved", target, result: "found" })
const allowed = () =>
  step("Native: target path allowed; Bend decides whether to request source", { kind: "pathChecked", allowed: true })
const captured = (edges: number[] = [], treeBytes = 400, sourceBytes = 1000) =>
  step("Native: bounded capture and ordered outgoing edges supplied", {
    kind: "captured",
    sourceBytes,
    treeBytes,
    edges
  })
export const IMPORT_GRAPH_SCENARIOS = [
  {
    title: "C path gate",
    description:
      "The fixture supplies A.ts as root, an A→B→C edge chain, and a path-denied fact for C. The trace shows which facts Bend reaches under the effective limits.",
    units: ["A.ts"],
    targetNames: { 1: "A.ts", 2: "B.ts", 3: "C.ts" },
    steps: [
      root([10]),
      next(),
      resolved(2),
      allowed(),
      captured([20]),
      next(),
      resolved(3),
      step("Native: C permission fact denied", { kind: "pathChecked", allowed: false }),
      next()
    ]
  },
  BRANCHING_TREE_BUDGET
] as const

export type ImportScenarioStep = { readonly unit: number; readonly label: string; readonly event: Input }
export type ImportScenario = {
  readonly title: string
  readonly description: string
  readonly units: readonly string[]
  readonly targetNames: Readonly<Record<number, string>>
  readonly steps: readonly ImportScenarioStep[]
}

export const replayImportScenario = (
  scenario: ImportScenario,
  cursor: number,
  limits: GraphLimits = GRAPH_LIMIT_CEILINGS
) => {
  const states = scenario.units.map(() => initialImportGraph(limits))
  const history = scenario.steps.slice(0, Math.max(0, cursor)).map((entry) => {
    const state = states[entry.unit]
    if (state === undefined) throw new TypeError("unknown import scenario unit")
    const result = stepImportGraph(state, entry.event)
    states[entry.unit] = result.state
    return { ...entry, command: result.command, state: projectImportGraph(result.state) }
  })
  return { scenario, history, states: states.map(projectImportGraph) }
}
export const projectImportExample = (
  scenarioIndex: number,
  cursor: number,
  limits: GraphLimits = GRAPH_LIMIT_CEILINGS
) => replayImportScenario(IMPORT_GRAPH_SCENARIOS[scenarioIndex] ?? IMPORT_GRAPH_SCENARIOS[0], cursor, limits)
