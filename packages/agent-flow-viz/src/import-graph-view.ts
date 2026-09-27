import type { HtmlBuilder } from "foldkit/html";
import { initialImportGraph, projectImportGraph, stepImportGraph } from "../../agent-flow-bend/import-graph-adapter";
import { importGraphDiagram, type ImportGraphStage } from "./import-graph-diagram";

type Input = Parameters<typeof stepImportGraph>[1];
type ExampleStep = { readonly unit: number; readonly label: string; readonly event: Input };
const step = (label: string, event: Input, unit = 0): ExampleStep => ({ unit, label, event });
const root = (edges: number[], treeBytes = 400): ExampleStep => step("Native: allowed root A captured; ordered edge facts supplied", { kind: "root", target: 1, sourceBytes: 1000, treeBytes, edges });
const next = () => step("Bend: request next pending edge", { kind: "next" });
const resolved = (target: number) => step(`Native: edge resolves to target #${target}`, { kind: "resolved", target, result: "found" });
const allowed = () => step("Native: target path allowed; Bend decides whether to request source", { kind: "pathChecked", allowed: true });
const captured = (edges: number[] = [], treeBytes = 400, sourceBytes = 1000) => step("Native: bounded capture and ordered outgoing edges supplied", { kind: "captured", sourceBytes, treeBytes, edges });
const totalReadSteps: ExampleStep[] = [step("Native: allowed root A captured at 256 KiB", { kind: "root", target: 1, sourceBytes: 262144, treeBytes: 400, edges: [10, 20, 30, 40, 50, 60] })];
for (let target = 2; target <= 6; target++) totalReadSteps.push(next(), resolved(target), allowed(), captured([], 400, 262144));
totalReadSteps.push(next(), resolved(7), allowed());
export const IMPORT_GRAPH_SCENARIOS = [
  { title: "Excluded C; independent D completes", description: "A.ts → B.ts → C.ts. A and B are allowed; C is excluded before a read request. D.ts is a separate root with independent state.", units: ["A.ts", "D.ts"], steps: [root([10]), next(), resolved(2), allowed(), captured([20]), next(), resolved(3), step("Native: C excluded; Bend marks A incomplete without requesting C source", { kind: "pathChecked", allowed: false }), step("Native: independent allowed root D captured", { kind: "root", target: 4, sourceBytes: 600, treeBytes: 300, edges: [] }, 1), step("Bend: independent D complete and eligible for Jev", { kind: "next" }, 1)] },
  { title: "Multiple imports and cycle", description: "A has ordered edges to B and C. B points back to A. Bend preserves pending order and skips the already visited target without another read.", units: ["A.ts"], steps: [root([10, 20]), next(), resolved(2), allowed(), captured([30]), next(), resolved(3), allowed(), captured(), next(), resolved(1), next()] },
  { title: "Missing target", description: "Native resolution reports a missing target. Bend marks the unit incomplete.", units: ["A.ts"], steps: [root([10]), next(), step("Native: target missing", { kind: "resolved", target: 0, result: "missing" })] },
  { title: "Ambiguous target", description: "Native resolution cannot identify one target. Bend marks the unit incomplete.", units: ["A.ts"], steps: [root([10]), next(), step("Native: target ambiguous", { kind: "resolved", target: 0, result: "ambiguous" })] },
  { title: "Evidence tree exhausted", description: "The canonical evidence tree already occupies 20 KiB. Bend stops before requesting resolution or supporting source.", units: ["A.ts"], steps: [root([10], 20480), next()] },
  { title: "Total read budget exhausted", description: "Six captured files use the 1.5 MiB total-read budget. Bend rejects the seventh target before requesting source, even though its path is allowed.", units: ["A.ts"], steps: totalReadSteps },
  { title: "Capture read limit", description: "Native bounded capture reports a per-file read beyond 256 KiB. Bend rejects the unit.", units: ["A.ts"], steps: [root([10]), next(), resolved(2), allowed(), captured([], 400, 262145)] },
] as const;

export const projectImportExample = (scenarioIndex: number, cursor: number) => {
  const scenario = IMPORT_GRAPH_SCENARIOS[scenarioIndex] ?? IMPORT_GRAPH_SCENARIOS[0];
  const states = scenario.units.map(() => initialImportGraph());
  const history = scenario.steps.slice(0, Math.max(0, cursor)).map((entry) => {
    const result = stepImportGraph(states[entry.unit], entry.event);
    states[entry.unit] = result.state;
    return { ...entry, command: result.command, state: projectImportGraph(result.state) };
  });
  return { scenario, history, states: states.map(projectImportGraph) };
};
const stages: Record<string, ImportGraphStage | null> = { idle: null, ready: "expand", resolving: "resolve", checking: "gate", capturing: "capture", complete: "complete", incomplete: "incomplete" };
const ids = (values: readonly number[]) => values.length ? values.map((id) => `#${id}`).join(", ") : "none";
export const importGraphView = <Message>(h: HtmlBuilder<Message>, scenarioIndex: number, cursor: number,
  select: (index: number) => Message, move: (cursor: number) => Message) => {
  const { scenario, history, states } = projectImportExample(scenarioIndex, cursor);
  const current = history.at(-1);
  return h.section([h.Id("import-graph"), h.Class("card import-graph-section")], [
    h.h2([], ["Import exploration · separate Bend state machine"]),
    h.p([h.Class("description")], ["Compiled ImportGraph.bend decides traversal from source-free facts through the checked transition adapter. These are synthetic examples, independent of the full-flow replay above. Native resolution and capture are supplied facts; no filesystem or Jev calls run here."]),
    h.div([h.Class("import-graph-legend")], [h.span([h.Class("native")], ["Native: resolution, permission facts, source capture"]), h.span([h.Class("bend")], ["Bend: gates, ordering, budgets, completion"]), h.span([h.Class("jev")], ["Jev: downstream outcome, not simulated"])]),
    h.div([h.Class("trace-options")], IMPORT_GRAPH_SCENARIOS.map((entry, index) => h.button([h.OnClick(select(index)), h.Class(index === scenarioIndex ? "trace selected" : "trace")], [entry.title]))),
    h.p([h.Class("description")], [scenario.description]),
    importGraphDiagram(h, current ? stages[current.state.phase] ?? null : null, scenarioIndex, cursor,
      scenario.units[current?.unit ?? 0] ?? "selected unit"),
    h.div([h.Class("trace-controls")], [
      h.button([h.OnClick(move(cursor - 1)), h.Disabled(cursor === 0)], ["Previous import step"]),
      h.button([h.OnClick(move(cursor + 1)), h.Disabled(cursor >= scenario.steps.length), h.Class("primary")], ["Next import step"]),
      h.button([h.OnClick(move(0))], ["Reset import example"]),
      h.span([h.Class("import-graph-progress")], [`Import step ${cursor} of ${scenario.steps.length}`]),
    ]),
    h.div([h.Class("import-graph-facts")], states.map((state, index) => h.div([], [
      h.strong([], [`${scenario.units[index]} · ${state.phase}${state.reason ? ` (${state.reason})` : ""}`]),
      h.span([], [`Pending edges: ${ids(state.pending)} · visited targets: ${ids(state.visited)}`]),
      h.span([], [`Files: ${state.files}/8 · read bytes: ${state.readBytes}/1572864 · tree bytes: ${state.treeBytes}/20480 · work: ${state.work}/128`]),
      h.span([], [state.phase === "complete" ? "Jev: eligible; no request or result simulated" : state.phase === "incomplete" ? "Jev: no request for this unit" : "Jev: waiting for complete unit"]),
    ]))),
    h.p([h.Class("description")], ["The root is already allowed and captured at this boundary. Native code supplies deterministic edge order and stable declaration identities. Bend holds IDs and byte counts, never source or secrets. Supporting reads are requested only after the target permission fact passes the Bend gate."]),
    h.ol([h.Class("import-graph-log"), h.AriaLabel("Import exploration transition history")], history.map((entry, index) => h.li([h.Class(index === history.length - 1 ? "current" : "")], [`${scenario.units[entry.unit]} · ${entry.label} → ${entry.state.phase}; command ${JSON.stringify(entry.command)}`]))),
  ]);
};
