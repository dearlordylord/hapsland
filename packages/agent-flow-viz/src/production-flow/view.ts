import { executionPoolsView } from "../execution-pools-view"
import { residentCapacityInset } from "../resident-capacity-inset"
import type { AgentScope } from "../shared-resident-view"
import type { CapacityMetadata } from "@hapsland/monkey-business"
import { type PreparationSnapshot } from "../preparation-mini"
import type { HtmlBuilder } from "foldkit/html"
import type { CanonicalProjection } from "@hapsland/canonical-policy/canonical/adapter"
import type { ReplayStep } from "../canonical-replay"
import { type RecordNumbers } from "@hapsland/agent-flow-projection"
import type { PLACE_ORDER } from "@hapsland/agent-flow-projection/production-flow-presentation"
import { flowPresentation } from "./activity"
import { flowRoutesView, flowRouteKeyView } from "./routes-view"
import { flowNodesView } from "./nodes"
import { infrastructureContactsView } from "./infrastructure"
import { flowStepDetails } from "./step-details"

export const productionFlowView = <Message>(
  h: HtmlBuilder<Message>,
  projection: CanonicalProjection,
  last: ReplayStep | undefined,
  showcase: boolean,
  inspect?: (place: (typeof PLACE_ORDER)[number]) => Message,
  preparation: PreparationSnapshot = {},
  numbers?: RecordNumbers,
  infrastructure = false,
  resident: CanonicalProjection = projection,
  metadata?: CapacityMetadata,
  partition?: number,
  selected?: { readonly group?: number; readonly round?: number },
  agents?: readonly AgentScope[],
  activitySteps?: readonly ReplayStep[]
) => {
  const context = {
    h,
    projection,
    last,
    showcase,
    inspect,
    preparation,
    numbers,
    infrastructure,
    resident,
    metadata,
    partition,
    agents,
    activitySteps,
    ...flowPresentation(projection, last, numbers, resident, metadata, selected, activitySteps)
  }
  const { requests, stepCaption, finishBranches } = context
  return h.div(
    [h.Class("production-topology")],
    [
      ...(!infrastructure
        ? [
            h.p(
              [h.Class("flow-legend")],
              [
                "Blue: state or decision · Gray: external work · Gold: Jev result · Orange: transition · Orange dotted: linked work and job with the same ID · Purple dashed: action request"
              ]
            )
          ]
        : []),
      h.div(
        [h.Class("topology-scroll")],
        [
          h.svg(
            [
              h.ViewBox("0 0 1400 830"),
              h.Role(inspect ? "group" : "img"),
              h.AriaLabel("Connected production flow from agent edit through Jev review to advice and round decision")
            ],
            [
              executionPoolsView(h, resident, agents, inspect),
              ...flowRoutesView(context),
              ...flowNodesView(context),
              ...(infrastructure ? [residentCapacityInset(h, resident, agents, inspect)] : []),
              ...(infrastructure ? infrastructureContactsView(context) : [])
            ]
          )
        ]
      ),
      ...(!infrastructure
        ? [
            ...(stepCaption === undefined ? [] : [h.p([h.Class("topology-current-step")], [stepCaption])]),
            h.details(
              [h.Class("topology-route-key")],
              [h.summary([], ["Numbered route key"]), h.ol([], flowRouteKeyView(context))]
            ),
            h.details(
              [h.Class("finish-decision")],
              [
                h.summary([], ["Finish outcomes"]),
                h.div(
                  [h.Class("finish-branches")],
                  finishBranches.map((branch) =>
                    h.div(
                      [h.Class(`finish-branch ${branch.active ? "active" : ""}`)],
                      [
                        h.span([], ["Stop collection"]),
                        h.span([h.Class("route-arrow")], ["→"]),
                        h.strong([], [branch.label])
                      ]
                    )
                  )
                )
              ]
            ),
            h.div(
              [h.Class("topology-capacities")],
              [
                h.strong([], ["Three separate limits"]),
                h.span(
                  [],
                  [
                    `Preparation running: ${projection.dispatch.running.filter((item) => item.preparation).length}/${projection.executionLimits.preparation}`
                  ]
                ),
                h.span(
                  [],
                  [`Jev in-flight: ${requests.length}/${projection.executionLimits.jevRequests} · no Jev wait queue`]
                ),
                h.span(
                  [],
                  [
                    `Review capacity ledger: ${projection.global.items}/${projection.limits.globalItems} items; ${projection.global.bytes}/${projection.limits.globalBytes} bytes`
                  ]
                )
              ]
            ),
            flowStepDetails(context)
          ]
        : [])
    ]
  )
}
