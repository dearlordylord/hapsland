import type { HtmlBuilder } from "foldkit/html";
import { GRAPH_LIMIT_CEILINGS, initialImportGraph, projectImportGraph, stepImportGraph } from "../../agent-flow-bend/import-graph-adapter";
import type { GraphLimits } from "../../agent-flow-bend/import-graph-adapter";
import { importGraphDiagram, importTreeBudgetView, type ImportGraphStage } from "./import-graph-diagram";

type Input = Parameters<typeof stepImportGraph>[1];
type ExampleStep = { readonly unit: number; readonly label: string; readonly event: Input };
const step = (label: string, event: Input, unit = 0): ExampleStep => ({ unit, label, event });
const root = (edges: number[], treeBytes = 400): ExampleStep => step("Native: allowed root A captured; ordered edge facts supplied", { kind: "root", target: 1, sourceBytes: 1000, treeBytes, edges });
const next = () => step("Replay: supply Next event for pending exploration", { kind: "next" });
const resolved = (target: number) => step(`Native: edge resolves to target #${target}`, { kind: "resolved", target, result: "found" });
const allowed = () => step("Native: target path allowed; Bend decides whether to request source", { kind: "pathChecked", allowed: true });
const captured = (edges: number[] = [], treeBytes = 400, sourceBytes = 1000) => step("Native: bounded capture and ordered outgoing edges supplied", { kind: "captured", sourceBytes, treeBytes, edges });
export const IMPORT_GRAPH_SCENARIOS = [
  { title: "C path gate", description: "The fixture supplies A.ts as root, an A→B→C edge chain, and a path-denied fact for C. The trace shows which facts Bend reaches under the effective limits.", units: ["A.ts"], targetNames: { 1: "A.ts", 2: "B.ts", 3: "C.ts" }, steps: [root([10]), next(), resolved(2), allowed(), captured([20]), next(), resolved(3), step("Native: C permission fact denied", { kind: "pathChecked", allowed: false }), next()] },
  { title: "Branching tree budget", description: "The fixture supplies A→B,C,X; B→D,E; C→F,G, with X path-denied. Encoded contributions are A/B/C 5 KiB each, D 4 KiB, E/G 2 KiB each, and F 1 KiB. The trace shows Bend's acceptance and terminal reason under the effective limits.", units: ["A.ts"], targetNames: { 1: "A.ts", 2: "B.ts", 3: "C.ts", 4: "D.ts", 5: "E.ts", 6: "F.ts", 7: "G.ts", 8: "X.ts" }, steps: [
    root([10, 20, 70], 5120),
    next(), resolved(2), allowed(), captured([30, 40], 5120),
    next(), resolved(3), allowed(), captured([50, 60], 5120),
    next(), resolved(8), step("Native: X.ts permission fact denied", { kind: "pathChecked", allowed: false }),
    next(), resolved(4), allowed(), captured([], 4096),
    next(), resolved(5), allowed(), step("Native: E capture reports 1,000 B source and 2 KiB tree", { kind: "captured", sourceBytes: 1000, treeBytes: 2048, edges: [] }),
    next(), resolved(6), allowed(), captured([], 1024),
    next(), resolved(7), allowed(), step("Native: G capture reports 1,000 B source and 2 KiB tree", { kind: "captured", sourceBytes: 1000, treeBytes: 2048, edges: [] }),
    next(),
  ] },
] as const;

export const projectImportExample = (scenarioIndex: number, cursor: number, limits: GraphLimits = GRAPH_LIMIT_CEILINGS) => {
  const scenario = IMPORT_GRAPH_SCENARIOS[scenarioIndex] ?? IMPORT_GRAPH_SCENARIOS[0];
  const states = scenario.units.map(() => initialImportGraph(limits));
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
  select: (index: number) => Message, move: (cursor: number) => Message,
  limits: GraphLimits = GRAPH_LIMIT_CEILINGS) => {
  const { scenario, history, states } = projectImportExample(scenarioIndex, cursor, limits);
  const current = history.at(-1);
  return h.section([h.Id("import-graph"), h.Class("card import-graph-section")], [
    h.h2([], ["Import exploration · separate Bend state machine"]),
    h.p([h.Class("description")], ["Compiled ImportGraph.bend decides traversal from source-free facts through the checked transition adapter. These are synthetic examples, independent of the full-flow replay above. Native resolution and capture are supplied facts; rule selection, filesystem calls, and Jev calls do not run here."]),
    h.div([h.Class("import-graph-legend")], [h.span([h.Class("native")], ["Native: resolution, permission facts, source capture"]), h.span([h.Class("bend")], ["Bend: gates, ordering, budgets, completion"]), h.span([h.Class("jev")], ["Jev: downstream outcome, not simulated"])]),
    h.div([h.Class("trace-options")], IMPORT_GRAPH_SCENARIOS.map((entry, index) => h.button([h.OnClick(select(index)), h.Class(index === scenarioIndex ? "trace selected" : "trace")], [entry.title]))),
    h.p([h.Class("description")], [`${scenario.description} Effective tree cap: ${states[0]?.limits.treeBytes ?? 0} bytes.`]),
    importGraphDiagram(h, current ? stages[current.state.phase] ?? null : null, scenario.units,
      scenario.targetNames, history, states,
      scenario.units[current?.unit ?? 0] ?? "selected unit"),
    h.div([h.Class("trace-controls")], [
      h.button([h.OnClick(move(cursor - 1)), h.Disabled(cursor === 0)], ["Previous import step"]),
      h.button([h.OnClick(move(cursor + 1)), h.Disabled(cursor >= scenario.steps.length), h.Class("primary")], ["Next import step"]),
      h.button([h.OnClick(move(0))], ["Reset import example"]),
      h.span([h.Class("import-graph-progress")], [`Import step ${cursor} of ${scenario.steps.length}`]),
    ]),
    importTreeBudgetView(h, scenario.units, scenario.targetNames, history, states),
    h.div([h.Class("import-graph-facts")], states.map((state, index) => h.div([], [
      h.strong([], [`${scenario.units[index]} · ${state.phase}${state.reason ? ` (${state.reason})` : ""}`]),
      h.span([], [`Pending edges: ${ids(state.pending)} · visited targets: ${ids(state.visited)}`]),
      h.span([], [`Files read: ${state.files}/${state.limits.files} · read bytes: ${state.readBytes}/${state.limits.readBytes} · accepted tree bytes: ${state.treeBytes}/${state.limits.treeBytes} · work: ${state.work}/${state.limits.work}`]),
      h.span([], [`Import skipped for remaining tree budget: ${state.skippedTree ? "yes" : "no"}`]),
      h.span([], [`Import skipped for denied permission: ${state.skippedExcluded ? "yes" : "no"}`]),
      h.span([], [`Import skipped for unavailable source or another cap: ${state.skippedOther ? "yes" : "no"}`]),
      h.span([], [state.phase === "complete" ? "Rule selection: full graph available; no Jev request simulated" :
        state.phase === "incomplete" ? ["Deadline", "ProtocolViolation"].includes(state.reason ?? "")
          ? "Rule selection: stopped; no Jev request"
          : "Rule selection: omitted evidence must be checked for each rule; no Jev request simulated" :
          "Rule selection: waiting for remaining import checks"]),
    ]))),
    h.p([h.Class("description")], ["The root is already allowed and captured at this boundary. Native code supplies deterministic edge order and stable declaration identities. Bend holds IDs and byte counts, never source or secrets. Supporting reads are requested only after the target permission fact passes the Bend gate."]),
    h.h3([], ["Bend transition trace"]),
    h.ol([h.Class("import-graph-log"), h.AriaLabel("Import exploration transition history")], history.map((entry, index) => h.li([h.Class(index === history.length - 1 ? "current" : "")], [`${scenario.units[entry.unit]} · ${entry.label} → ${entry.state.phase}; command ${JSON.stringify(entry.command)}`]))),
  ]);
};
