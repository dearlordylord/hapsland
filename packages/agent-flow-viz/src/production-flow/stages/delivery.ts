import { type ProductionFlowContext } from "../context"

export const stageDeliveryView = <Message>(
  context: Pick<ProductionFlowContext<Message>, "selected" | "resident" | "h">,
  node: ProductionFlowContext<Message>["nodes"][number],
  point: { readonly x: number; readonly y: number }
) => {
  const { selected, resident, h } = context
  return node.id === "delivery"
    ? (() => {
        const group = selected?.group
        const slot = resident.delivery.slots.find((slot) => slot.group === group)
        const description =
          group === undefined
            ? "Stop output slot: select a known delivery group"
            : `Stop output slot, group ${group}: ${slot ? `occupied; round ${slot.round}; ${slot.phase}` : "free; no active output slot"}`
        return [
          h.g(
            [h.Class("delivery-stop-slot"), h.Role("img"), h.AriaLabel(description)],
            [
              h.title([], [description]),
              h.text(
                [h.X(String(point.x + 13)), h.Y(String(point.y + 69)), h.FontSize("9"), h.Fill("#435670")],
                [
                  group === undefined
                    ? "Stop slot · select group in inspector"
                    : `Stop slot · G${group} ${slot ? "1/1" : "0/1"}`
                ]
              ),
              ...(group === undefined
                ? []
                : [
                    h.rect(
                      [
                        h.Class("delivery-stop-slot-cell"),
                        h.X(String(point.x + 193)),
                        h.Y(String(point.y + 60)),
                        h.Width("14"),
                        h.Height("10"),
                        h.Rx("2"),
                        h.Fill(slot ? "#168f83" : "#fff"),
                        h.Stroke("#168f83")
                      ],
                      []
                    )
                  ])
            ]
          )
        ]
      })()
    : []
}
