import { IMPORT_GRAPH_SCENARIOS, projectImportExample } from "./import-graph-replay";
export { IMPORT_GRAPH_SCENARIOS, projectImportExample } from "./import-graph-replay";
import type { HtmlBuilder } from "foldkit/html";
import { GRAPH_LIMIT_CEILINGS } from "../../agent-flow-bend/import-graph-adapter";
import type { GraphLimits } from "../../agent-flow-bend/import-graph-adapter";
import { importGraphDiagram, importTreeBudgetView, type ImportGraphStage } from "./import-graph-diagram";

const stages: Record<string, ImportGraphStage | null> = { idle: null, ready: "expand", resolving: "resolve", checking: "gate", capturing: "capture", complete: "complete", incomplete: "incomplete" };
const ids = (values: readonly number[]) => values.length ? values.map((id) => `#${id}`).join(", ") : "none";
export const importGraphView = <Message>(h: HtmlBuilder<Message>, scenarioIndex: number, cursor: number,
  select: (index: number) => Message, move: (cursor: number) => Message,
  limits: GraphLimits = GRAPH_LIMIT_CEILINGS) => {
  const { scenario, history, states } = projectImportExample(scenarioIndex, cursor, limits);
  const current = history.at(-1);
  return h.section([h.Id("import-graph"), h.Class("card import-graph-section")], [
    h.h2([], ["Import exploration"]),
    h.div([h.Class("import-graph-legend")], [h.span([h.Class("native")], ["Native: resolution, permission facts, source capture"]), h.span([h.Class("bend")], ["Bend: gates, ordering, budgets, completion"]), h.span([h.Class("jev")], ["Jev: downstream outcome, not simulated"])]),
    h.div([h.Class("trace-options")], IMPORT_GRAPH_SCENARIOS.map((entry, index) => h.button([h.OnClick(select(index)), h.Class(index === scenarioIndex ? "trace selected" : "trace")], [entry.title]))),
    h.p([h.Class("description")], [`Tree cap: ${states[0]?.limits.treeBytes ?? 0} bytes`]),
    h.details([], [h.summary([], ["Scenario details"]), h.p([], [scenario.description])]),
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
