import { type Observation } from "@hapsland/monkey-business"
import type { HtmlBuilder } from "foldkit/html"
import { type SimulationModel } from "./model"
import { simulationPresentation } from "./view-model"
import { simulationRenderSnapshot } from "./controller"
import { simulationStatusView } from "./status-view"
import { simulationInspectionView } from "./inspection-view"
import { simulationHistoryView } from "./history-view"
import { scenarioSettingsView } from "./scenario-settings-view"

export const simulationView = <Message>(
  model: SimulationModel,
  h: HtmlBuilder<Message>,
  action: (action: string) => Message,
  changed: (field: string, raw: string) => Message,
  showDiagram = true,
  inspection?: {
    readonly projection: import("@hapsland/canonical-policy/canonical/adapter").CanonicalProjection
    readonly observations: readonly Observation[]
    readonly partition?: number
    readonly numbers?: import("@hapsland/agent-flow-projection").RecordNumbers
    readonly agents?: readonly import("../shared-resident-view").AgentScope[]
  }
) => {
  const context = {
    model,
    h,
    action,
    changed,
    showDiagram,
    inspection,
    ...simulationPresentation(simulationRenderSnapshot(), model, h, action, changed, showDiagram, inspection)
  }
  const { button } = context
  return h.section(
    [
      h.Id(showDiagram ? "monkey-business" : "agent-simulation"),
      h.AriaLabel("Resident simulation controls"),
      h.Class("chart-panel simulation-panel")
    ],
    [
      h.h2([], ["Resident controls & event history"]),
      h.p([], ["Run, adjust settings, and select a square to inspect its work."]),
      h.nav(
        [h.Class("simulation-navigation"), h.AriaLabel("Resident inspection sections")],
        [
          h.a([h.Href("#resident-stage-inspector")], ["Inspect a stage"]),
          h.a([h.Href("#resident-event-history")], ["Read event history"]),
          h.a([h.Href("#resident-scenario-settings")], ["Adjust scenario settings"])
        ]
      ),
      ...simulationStatusView(context),
      simulationInspectionView(context),
      ...simulationHistoryView(context),
      scenarioSettingsView(context),
      h.div(
        [h.Class("simulation-controls")],
        [
          button("Export replay", "export"),
          button("Download replay file", "download"),
          button("Import replay file", "import-file"),
          button("Load replay", "load")
        ]
      ),
      h.label(
        [],
        [
          "Replay JSON",
          h.textarea([h.AriaLabel("Replay JSON"), h.Value(model.replay), h.OnInput((raw) => changed("replay", raw))])
        ]
      )
    ]
  )
}
