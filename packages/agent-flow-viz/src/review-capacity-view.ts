import type { HtmlBuilder } from "foldkit/html"
import type { CanonicalProjection } from "../../../src/canonical/adapter"

export const reviewCapacityView = <Message>(h: HtmlBuilder<Message>, projection: CanonicalProjection) =>
  h.div(
    [h.Class("review-capacity")],
    [
      h.h2([], ["Review capacity"]),
      h.p(
        [],
        [
          `All agents in this Hapsland process · ${projection.global.items}/${projection.limits.globalItems} work items · ${projection.global.bytes}/${projection.limits.globalBytes} reserved review bytes`
        ]
      ),
      h.div(
        [
          h.Class("capacity-bar"),
          h.Role("img"),
          h.AriaLabel(`${projection.global.bytes} of ${projection.limits.globalBytes} reserved review bytes`)
        ],
        [
          ...projection.charges.map((charge) =>
            h.span(
              [
                h.Class(`capacity-segment agent-${charge.partition}`),
                h.Style({ width: `${(charge.bytes / projection.limits.globalBytes) * 100}%` })
              ],
              [`Agent ${charge.partition}`]
            )
          ),
          h.span(
            [
              h.Class("capacity-free"),
              h.Style({
                width: `${((projection.limits.globalBytes - projection.global.bytes) / projection.limits.globalBytes) * 100}%`
              })
            ],
            ["Free"]
          )
        ]
      ),
      h.div(
        [h.Class("capacity-rows")],
        projection.partitions.map((partition) =>
          h.p(
            [],
            [
              `Agent ${partition.partition} · ${partition.items}/${projection.limits.partitionItems} work items · ${partition.bytes}/${projection.limits.partitionBytes} reserved bytes`
            ]
          )
        )
      )
    ]
  )
