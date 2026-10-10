import type { AgentScope } from "../shared-resident-view"
import type { CapacityMetadata } from "@hapsland/monkey-business"
import { type PreparationSnapshot } from "../preparation-mini"
import type { HtmlBuilder } from "foldkit/html"
import type { CanonicalProjection } from "@hapsland/canonical-policy/canonical/adapter"
import type { ReplayStep } from "../canonical-replay"
import { type RecordNumbers } from "@hapsland/agent-flow-projection"
import type { PLACE_ORDER } from "@hapsland/agent-flow-projection/production-flow-presentation"
import type { flowPresentation } from "./activity"

export type ProductionFlowContext<Message> = ReturnType<typeof flowPresentation> & {
  readonly h: HtmlBuilder<Message>
  readonly projection: CanonicalProjection
  readonly last: ReplayStep | undefined
  readonly showcase: boolean
  readonly inspect?: (place: (typeof PLACE_ORDER)[number]) => Message
  readonly preparation: PreparationSnapshot
  readonly numbers?: RecordNumbers
  readonly infrastructure: boolean
  readonly resident: CanonicalProjection
  readonly metadata?: CapacityMetadata
  readonly partition?: number
  readonly selected?: { readonly group?: number; readonly round?: number }
  readonly agents?: readonly AgentScope[]
  readonly activitySteps?: readonly ReplayStep[]
}
