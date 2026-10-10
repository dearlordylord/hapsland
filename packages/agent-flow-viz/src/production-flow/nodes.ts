import { stageEffectView } from "./stages/effect"
import { Option } from "effect"
import { preparationMini } from "../preparation-mini"
import { type ProductionFlowContext } from "./context"
import { PLACES, NODE_WIDTH, NODE_HEIGHT } from "./route-geometry"
import { stageFacetsView } from "./stages/facets"
import { stageCollectionView } from "./stages/collection"
import { stageDeliveryView } from "./stages/delivery"
import { stageRoundView } from "./stages/round"
import { stageAdmissionView } from "./stages/admission"

export const flowNodesView = <Message>(
  context: Pick<
    ProductionFlowContext<Message>,
    | "nodes"
    | "h"
    | "changedStages"
    | "inspect"
    | "storedResultTransition"
    | "issuedPermit"
    | "editAccepted"
    | "resident"
    | "requests"
    | "projection"
    | "partition"
    | "metadata"
    | "selected"
    | "preparation"
    | "numbers"
    | "sourceLabel"
    | "admittedSource"
    | "last"
    | "event"
    | "startedRound"
    | "clearedReviewLabel"
    | "retainMarker"
    | "markedReady"
  >
) => {
  const {
    nodes,
    h,
    changedStages,
    inspect,
    storedResultTransition,
    issuedPermit,
    editAccepted,
    resident,
    projection,
    preparation,
    numbers,
    sourceLabel,
    admittedSource,
    last,
    startedRound,
    clearedReviewLabel,
    retainMarker,
    markedReady
  } = context
  return nodes.map((node) => {
    const point = PLACES[node.id]
    const palette = node.owner.includes("NATIVE")
      ? { fill: "#edf1f6", stroke: "#7d8da2" }
      : { fill: "#e9f1ff", stroke: "#547dc0" }
    return h.g(
      [
        h.Class(`topology-node ${changedStages.includes(node.id) ? "active" : ""}`),
        ...(inspect
          ? [
              h.Role("button"),
              h.Tabindex(0),
              h.AriaLabel(`Inspect ${node.title}`),
              h.OnClick(inspect(node.id)),
              h.OnKeyDownSelfPreventDefault((key) =>
                key === "Enter" || key === " " ? Option.some(inspect(node.id)) : Option.none()
              )
            ]
          : [])
      ],
      [
        h.title(
          [],
          [
            `${node.title}: ${node.detail}${
              node.id === "admission"
                ? [
                    storedResultTransition,
                    issuedPermit?.kind === "permitIssued" ? `Permit #${issuedPermit.token} issued` : undefined,
                    editAccepted ? `Permit #${editAccepted.token} used` : undefined
                  ]
                    .filter(Boolean)
                    .map((fact) => ` · NOW: ${fact}`)
                    .join("")
                : ""
            }`
          ]
        ),
        h.rect(
          [
            h.X(String(point.x)),
            h.Y(String(point.y)),
            h.Width(String(NODE_WIDTH)),
            h.Height(String(node.id === "preparation" ? 270 : NODE_HEIGHT)),
            h.Rx("12"),
            h.Fill(palette.fill),
            h.Stroke(palette.stroke),
            h.StrokeWidth(changedStages.includes(node.id) ? "4" : "2")
          ],
          []
        ),
        h.text(
          [
            h.X(String(point.x + 13)),
            h.Y(String(point.y + 25)),
            h.FontSize("10"),
            h.FontWeight("700"),
            h.Fill("#52647d")
          ],
          [node.owner]
        ),
        h.text(
          [
            h.X(String(point.x + 13)),
            h.Y(String(point.y + 49)),
            h.FontSize("14"),
            h.FontWeight("700"),
            h.Fill("#1e3048")
          ],
          [node.title]
        ),
        ...stageFacetsView(context, node, point),
        ...stageEffectView(context, node, point),
        ...stageCollectionView(context, node, point),
        ...stageDeliveryView(context, node, point),
        ...stageRoundView(context, node, point),
        ...(node.id === "scheduling" || node.id === "jev"
          ? [
              h.text(
                [
                  h.X(String(point.x + 13)),
                  h.Y(String(point.y + (node.id === "scheduling" ? 108 : 95))),
                  h.FontSize("9"),
                  h.Fill("#435670")
                ],
                [
                  node.id === "scheduling"
                    ? `Preparing: agent ${projection.dispatch.running.filter((w) => w.preparation).length} · shared ${resident.dispatch.running.filter((w) => w.preparation).length}/${resident.executionLimits.preparation}`
                    : `Jev: agent ${projection.dispatch.requests.length} · shared ${resident.dispatch.requests.length}/${resident.executionLimits.jevRequests}`
                ]
              )
            ]
          : []),
        ...stageAdmissionView(context, node, point),
        ...(node.id === "preparation" ? [preparationMini(h, point.x, point.y, preparation, numbers)] : []),
        ...(node.id === "preparation" && sourceLabel !== undefined
          ? [
              h.text(
                [
                  h.X(String(point.x + 13)),
                  h.Y(String(point.y + 264)),
                  h.FontSize("10"),
                  h.FontWeight("700"),
                  h.Class("topology-event-fact"),
                  h.Fill("#a24625")
                ],
                [`NOW · ${sourceLabel} completed`]
              )
            ]
          : []),
        ...(node.id === "sourcePending" &&
        admittedSource?.kind === "observationAdmitted" &&
        last?.event.kind === "admitObservation"
          ? [
              h.text(
                [
                  h.X(String(point.x + 13)),
                  h.Y(String(point.y + 108)),
                  h.FontSize("9"),
                  h.FontWeight("700"),
                  h.Class("topology-event-fact"),
                  h.Fill("#a24625")
                ],
                [`NOW · Source #${admittedSource.id} admitted · Round #${last.event.round}`]
              )
            ]
          : []),
        ...(node.id === "round" && editAccepted !== undefined
          ? [
              h.text(
                [
                  h.X(String(point.x + 13)),
                  h.Y(String(point.y + 108)),
                  h.FontSize("9"),
                  h.FontWeight("700"),
                  h.Class("topology-event-fact"),
                  h.Fill("#a24625")
                ],
                [
                  startedRound?.kind === "roundStarted"
                    ? `NOW · Round #${startedRound.id} opened with edit #${editAccepted.tool}`
                    : `NOW · edit #${editAccepted.tool} joined Round #${editAccepted.round}`
                ]
              )
            ]
          : []),
        ...(node.id === "outcomes" && clearedReviewLabel !== undefined
          ? [
              h.text(
                [
                  h.X(String(point.x + 13)),
                  h.Y(String(point.y + 108)),
                  h.FontSize("10"),
                  h.FontWeight("700"),
                  h.Class("topology-event-fact"),
                  h.Fill("#a24625")
                ],
                [`NOW · ${clearedReviewLabel} clear`]
              )
            ]
          : []),
        ...(node.id === "outcomes" && retainMarker !== undefined
          ? [
              h.text(
                [
                  h.X(String(point.x + 13)),
                  h.Y(String(point.y + 108)),
                  h.FontSize("9"),
                  h.FontWeight("700"),
                  h.Class("topology-event-fact"),
                  h.Fill("#794aa0")
                ],
                [retainMarker]
              )
            ]
          : []),
        ...(node.id === "advice" && markedReady !== undefined
          ? [
              h.text(
                [
                  h.X(String(point.x + 13)),
                  h.Y(String(point.y + 108)),
                  h.FontSize("9"),
                  h.FontWeight("700"),
                  h.Class("topology-event-fact"),
                  h.Fill("#a24625")
                ],
                [`NOW · ${markedReady}`]
              )
            ]
          : []),
        ...(editAccepted === undefined
          ? []
          : node.id === "observation"
            ? [
                h.text(
                  [
                    h.X(String(point.x + 13)),
                    h.Y(String(point.y + 69)),
                    h.FontSize("10"),
                    h.FontWeight("700"),
                    h.Class("topology-event-fact"),
                    h.Fill("#a24625")
                  ],
                  [`NOW · edit #${editAccepted.tool} accepted`]
                )
              ]
            : [])
      ]
    )
  })
}
