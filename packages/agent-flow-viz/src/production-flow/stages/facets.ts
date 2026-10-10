import { squareFacetLine, squareFacetFontSize } from "@hapsland/agent-flow-projection/production-flow-presentation"
import { type ProductionFlowContext } from "../context"

export const stageFacetsView = <Message>(
  context: Pick<ProductionFlowContext<Message>, "h">,
  node: ProductionFlowContext<Message>["nodes"][number],
  point: { readonly x: number; readonly y: number }
) => {
  const { h } = context
  return (
    node.id === "admission" || node.id === "effect"
      ? []
      : node.id === "scheduling"
        ? node.facets.filter((_, index) => index !== 2)
        : node.id === "round"
          ? node.facets.slice(0, 2)
          : node.id === "collection"
            ? node.facets.slice(0, 2)
            : node.id === "delivery"
              ? node.facets.slice(1)
              : node.facets
  ).map((facet, index) =>
    h.text(
      [
        h.X(String(point.x + 13)),
        h.Y(String(point.y + 69 + (index + (node.id === "delivery" ? 1 : 0)) * 13)),
        h.FontSize(squareFacetFontSize(facet)),
        h.FontWeight("600"),
        h.Class("topology-facet"),
        h.Fill("#435670")
      ],
      [squareFacetLine(facet)]
    )
  )
}
