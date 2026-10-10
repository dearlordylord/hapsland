import { type ProductionFlowContext } from "./context"
import { arrowPaint } from "./route-style"
import { routeGeometry, arrowHead } from "./route-geometry"

export const flowRouteKeyView = <Message>(context: Pick<ProductionFlowContext<Message>, "routes" | "h" | "nodes">) => {
  const { routes, h, nodes } = context
  return routes.map((route) => {
    const paint = arrowPaint(route.kind)
    return h.li(
      [
        h.Class(`${route.active ? "active" : ""} ${paint.command ? "command" : ""} ${paint.external ? "external" : ""}`)
      ],
      [
        `${nodes.find((node) => node.id === route.from)?.title} → ${nodes.find((node) => node.id === route.to)?.title}: ${route.active ? route.evidence : `possible: ${route.label}`}`
      ]
    )
  })
}
export const flowRoutesView = <Message>(
  context: Pick<ProductionFlowContext<Message>, "routes" | "routeMultiplicity" | "routeOffsets" | "h" | "nodes">
) => {
  const { routes, routeMultiplicity, routeOffsets, h, nodes } = context
  return routes.map((route, index) => {
    const same = routeMultiplicity.get(`${route.from}:${route.to}`) ?? 1
    const offset = (routeOffsets[index] - (same - 1) / 2) * 18
    const { path, badge, tip, toward } = routeGeometry(route, offset)
    const paint = arrowPaint(route.kind)
    const color = paint.color
    return h.g(
      [h.Class(`topology-route ${route.active ? "active" : ""} ${paint.external ? "external" : ""}`)],
      [
        h.title(
          [],
          [
            `${index + 1}. ${nodes.find((node) => node.id === route.from)?.title} → ${nodes.find((node) => node.id === route.to)?.title}: ${route.active ? route.evidence : `possible: ${route.label}`}`
          ]
        ),
        h.path(
          [
            h.D(path),
            h.Fill("none"),
            h.Stroke(color),
            h.StrokeWidth(route.active ? "4" : "2"),
            ...(paint.dashed ? [h.StrokeDasharray("7 5")] : route.linked ? [h.StrokeDasharray("2 6")] : [])
          ],
          []
        ),
        ...(paint.overlay
          ? [h.path([h.D(path), h.Fill("none"), h.Stroke("#794aa0"), h.StrokeWidth("2"), h.StrokeDasharray("7 5")], [])]
          : []),
        h.path([h.D(arrowHead(tip, toward)), h.Fill(color)], []),
        h.circle(
          [
            h.Cx(String(badge.x)),
            h.Cy(String(badge.y)),
            h.R("11"),
            h.Fill(route.active ? color : "#fff"),
            h.Stroke(color)
          ],
          []
        ),
        h.text(
          [
            h.X(String(badge.x)),
            h.Y(String(badge.y + 1)),
            h.TextAnchor("middle"),
            h.DominantBaseline("middle"),
            h.FontSize("10"),
            h.FontWeight("700"),
            h.Fill(route.active ? "#fff" : "#485b73")
          ],
          [String(index + 1)]
        )
      ]
    )
  })
}
