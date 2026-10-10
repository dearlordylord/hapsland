import { type ProductionFlowContext } from "../context"

export const stageRoundView = <Message>(
  context: Pick<ProductionFlowContext<Message>, "selected" | "projection" | "metadata" | "h" | "resident">,
  node: ProductionFlowContext<Message>["nodes"][number],
  point: { readonly x: number; readonly y: number }
) => {
  const { selected, projection, metadata, h, resident } = context
  return node.id === "round"
    ? (() => {
        if (
          selected?.round === undefined ||
          !projection.rounds.some((r) => r.id === selected.round) ||
          selected.group === undefined ||
          metadata?.continuationBudget === undefined
        )
          return [
            h.text(
              [h.X(String(point.x + 13)), h.Y(String(point.y + 95)), h.FontSize("9"), h.Fill("#435670")],
              ["Continuation budget · select round/group"]
            )
          ]
        const used =
          resident.delivery.counters.find((c) => c.group === selected.group && c.round === selected.round)?.used ?? 0
        return [
          h.text(
            [h.X(String(point.x + 13)), h.Y(String(point.y + 95)), h.FontSize("9"), h.Fill("#435670")],
            [`Selected round · ${used}/4 used`]
          ),
          ...Array.from({ length: 4 }, (_, index) =>
            h.rect(
              [
                h.X(String(point.x + 152 + index * 15)),
                h.Y(String(point.y + 88)),
                h.Width("10"),
                h.Height("8"),
                h.Fill(index < used ? "#427bc4" : "#dce5f0")
              ],
              []
            )
          )
        ]
      })()
    : []
}
