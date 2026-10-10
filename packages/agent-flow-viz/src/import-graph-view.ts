import type { HtmlBuilder } from "foldkit/html"
import {
  resolverGraphDiagram,
  importTreeBudgetView,
  type HistoryStep,
  type ImportGraphStage
} from "./import-graph-diagram"
import type { ImportGraphProjection } from "@hapsland/canonical-policy/canonical/graph-adapter"
import recording from "./preparation-resolver.generated.json"

export const IMPORT_GRAPH_SCENARIOS = recording.scenarios
export const importFrameCount = (index: number) => (recording.scenarios[index] ?? recording.scenarios[0]).frames.length
const stages: Record<string, ImportGraphStage | null> = {
  idle: null,
  ready: "expand",
  resolving: "resolve",
  checking: "gate",
  capturing: "capture",
  complete: "complete",
  incomplete: "incomplete"
}
/** Projections come from observed compiled resolver transitions, not a second replay. */
export const projectImportExample = (scenarioIndex: number, cursor: number) => {
  const scenario = recording.scenarios[scenarioIndex] ?? recording.scenarios[0]
  const frame = scenario.frames[Math.max(0, Math.min(cursor, scenario.frames.length - 1))]
  // The producer validates state/command using the canonical adapter before recording.
  const history = scenario.history.slice(0, frame.historyLength) as unknown as readonly HistoryStep[]
  const states = frame.graph ? [frame.graph as ImportGraphProjection] : []
  return { scenario, frame, history, states }
}
export const importGraphView = <Message>(
  h: HtmlBuilder<Message>,
  scenarioIndex: number,
  cursor: number,
  select: (index: number) => Message,
  move: (cursor: number) => Message
) => {
  const { scenario, frame, history, states } = projectImportExample(scenarioIndex, cursor)
  const targetNames: Readonly<Record<number, string>> = Object.fromEntries(
    Object.entries(scenario.targetNames).filter((entry) => typeof entry[1] === "string")
  )
  const graph = states[0],
    command = history.at(-1)?.command
  const operation = frame.request?.operation.$.split(".").at(-1)
  return h.section(
    [h.Id("import-graph"), h.Class("card import-graph-section")],
    [
      h.h2([], ["Import exploration"]),
      h.p(
        [h.Class("description")],
        [
          "Full Bend resolver · declaration expansion, import exploration and ReviewUnit construction. Each example runs the same resolver; one cursor controls the outer Machine, inner ImportGraph and file tree."
        ]
      ),
      h.p(
        [h.Class("resolver-legend")],
        [
          h.span([h.Class("resolver-legend-graph")], ["Blue · ImportGraph traversal reducer"]),
          " · ",
          h.span([h.Class("resolver-legend-local")], ["Purple · declaration expansion reducer"]),
          " · ",
          h.span([h.Class("resolver-legend-machine")], ["Green · resolver coordination and product construction"]),
          " · ",
          h.span([h.Class("resolver-legend-service")], ["Gray · external services"])
        ]
      ),
      h.div(
        [h.Class("trace-options")],
        recording.scenarios.map((entry, index) =>
          h.button(
            [h.OnClick(select(index)), h.Class(index === scenarioIndex ? "trace selected" : "trace")],
            [entry.title]
          )
        )
      ),
      h.div(
        [h.Class("trace-controls")],
        [
          h.button([h.OnClick(move(cursor - 1)), h.Disabled(cursor === 0)], ["Previous import step"]),
          h.button(
            [h.OnClick(move(cursor + 1)), h.Disabled(cursor === scenario.frames.length - 1), h.Class("primary")],
            ["Next import step"]
          ),
          h.button([h.OnClick(move(scenario.frames.length - 1))], ["Result"]),
          h.button([h.OnClick(move(0))], ["Reset import example"]),
          h.span(
            [h.Class("import-graph-progress")],
            [`Resolver step ${cursor + 1} of ${scenario.frames.length} · ${frame.stage}`]
          )
        ]
      ),
      h.label(
        [h.Class("canonical-scrubber resolver-scrubber")],
        [
          "Behavior timeline",
          h.input([
            h.Type("range"),
            h.AriaLabel("Resolver behavior timeline"),
            h.Min("0"),
            h.Max(String(scenario.frames.length - 1)),
            h.Step("1"),
            h.Value(String(cursor)),
            h.AriaValuetext(`Resolver step ${cursor + 1} of ${scenario.frames.length}: ${frame.stage}`),
            h.OnInput((raw) => move(Number(raw)))
          ])
        ]
      ),
      h.div(
        [h.Class("resolver-shell")],
        [
          h.h3([], ["Bend resolver Machine"]),
          h.p([h.Class("resolver-current-stage")], [frame.stage]),
          h.p([h.Class("resolver-step-kind")], [`Observed step: ${frame.kind}`]),
          h.p(
            [],
            [
              frame.kind === "graph"
                ? "Code: packages/agent-flow-bend/ImportGraph.bend · step(state, event)"
                : frame.kind === "local"
                  ? "Code: local-graph-draft/core.bend · step(machine)"
                  : frame.kind === "product"
                    ? "Code: whole-resolver/Core.bend · review_unit(...)"
                    : "Code: whole-resolver/Machine.bend · initial / resume / dispatch_action"
            ]
          ),
          ...(frame.trace
            ? [
                h.details(
                  [],
                  [
                    h.summary([], ["Current internal transition · input / output"]),
                    h.pre([], [JSON.stringify(frame.trace, null, 2)])
                  ]
                )
              ]
            : []),
          h.p(
            [],
            [
              frame.stage.startsWith("Inspecting")
                ? "External frontend supplies facts. Bend expands declarations and builds the product before the next encoding request."
                : frame.stage.startsWith("Measuring")
                  ? "Bend has constructed a product. External encoding supplies its byte count; Bend handles the reply."
                  : frame.stage === "FinishedResolver"
                    ? "The resolver returned the ReviewUnit. This is not a Jev request."
                    : "The current Machine stage coordinates the service shown below and its inner ImportGraph."
            ]
          ),
          h.div(
            [h.Class("resolver-service")],
            [
              h.strong([], ["External service: "]),
              frame.request?.operation.$.split(".").at(-1) ?? "No external call at this step",
              h.p([], ["Service steps and internal Bend transitions share this chronological timeline."])
            ]
          ),
          h.p(
            [h.Class("resolver-connection")],
            [
              `Machine → ImportGraph: ${history.at(-1)?.event.kind ?? "not initialized"} · ImportGraph → Machine: ${command?.kind ?? "no command"}`
            ]
          ),
          h.div(
            [h.Class("resolver-inner-graph")],
            [
              h.h3([], ["Construction, imports and completion"]),
              resolverGraphDiagram(
                h,
                graph ? (stages[graph.phase] ?? null) : null,
                operation,
                frame.stage,
                ["A.ts"],
                targetNames,
                history,
                states
              ),
              ...(graph
                ? [
                    h.p(
                      [h.Class("import-graph-facts")],
                      [
                        `A.ts · ${graph.phase}${graph.reason ? ` (${graph.reason})` : ""} · ${graph.files} files read · ${graph.treeBytes}/${graph.limits.treeBytes} B tree · ${graph.readBytes} B source`
                      ]
                    ),
                    importTreeBudgetView(h, ["A.ts"], targetNames, history, states)
                  ]
                : [h.p([], ["The inner graph has not been initialized at this boundary."])])
            ]
          )
        ]
      ),
      h.details(
        [],
        [
          h.summary([], ["Selected resolver state, request and reply"]),
          h.pre([h.Class("resolver-code")], [JSON.stringify(frame, null, 2)])
        ]
      ),
      h.details(
        [],
        [
          h.summary([], ["Example source files"]),
          ...Object.entries(scenario.files).map(([file, source]) =>
            h.details([], [h.summary([], [file]), h.pre([h.Class("resolver-code")], [source])])
          )
        ]
      ),
      ...(frame.stage === "FinishedResolver"
        ? [
            h.h3([], ["Returned ReviewUnit"]),
            h.pre([h.Class("resolver-code")], [JSON.stringify(scenario.result, null, 2)])
          ]
        : []),
      h.details(
        [],
        [
          h.summary([], ["Bend transition trace"]),
          h.ol(
            [h.Class("import-graph-log")],
            history.map((entry) =>
              h.li([], [`${entry.event.kind} → ${entry.state.phase}; ${JSON.stringify(entry.command)}`])
            )
          )
        ]
      ),
      h.details(
        [],
        [
          h.summary([], ["Implementation source"]),
          ...recording.sources.map((source) =>
            h.details(
              [],
              [
                h.summary([], [`${source.file} · SHA ${source.sha256.slice(0, 12)}`]),
                h.pre([h.Class("resolver-code")], [source.text])
              ]
            )
          )
        ]
      ),
      h.p(
        [h.Class("description")],
        [
          "Recorded execution of compiled Bend on physical example files. Native access/capture facts are supplied by the fixture. The timeline records external service boundaries, ImportGraph transitions, declaration reducer steps, resolver continuations and product-call inputs/outputs in execution order."
        ]
      )
    ]
  )
}
