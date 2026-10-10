import type { ProductionFlowContext } from "../context"
export const stageEffectView = <Message>(
  context: Pick<ProductionFlowContext<Message>, "h" | "resident" | "projection" | "partition">,
  node: ProductionFlowContext<Message>["nodes"][number],
  point: { readonly x: number; readonly y: number }
) => {
  const { h, resident, projection, partition } = context
  return node.id === "effect"
    ? [
        h.text(
          [h.X(String(point.x + 13)), h.Y(String(point.y + 69)), h.FontSize("10"), h.Fill("#435670")],
          [`Shared Jev permits: ${resident.dispatch.requests.length} / ${resident.executionLimits.jevRequests}`]
        ),
        h.text(
          [h.X(String(point.x + 13)), h.Y(String(point.y + 91)), h.FontSize("10"), h.Fill("#435670")],
          [
            `This agent: ${projection.dispatch.requests.filter((request) => request.started && (partition === undefined || request.partition === partition)).length} started`
          ]
        )
      ]
    : []
}
