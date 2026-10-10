import { type Observation } from "@hapsland/monkey-business"
import type { HtmlBuilder } from "foldkit/html"
import type { simulationPresentation } from "./view-model"
import { type SimulationModel } from "./model"

export type SimulationViewContext<Message> = ReturnType<typeof simulationPresentation<Message>> & {
  readonly model: SimulationModel
  readonly h: HtmlBuilder<Message>
  readonly action: (action: string) => Message
  readonly changed: (field: string, raw: string) => Message
  readonly showDiagram: boolean
  readonly inspection?: {
    readonly projection: import("@hapsland/canonical-policy/canonical/adapter").CanonicalProjection
    readonly observations: readonly Observation[]
    readonly partition?: number
    readonly numbers?: import("@hapsland/agent-flow-projection").RecordNumbers
    readonly agents?: readonly import("../shared-resident-view").AgentScope[]
  }
}
