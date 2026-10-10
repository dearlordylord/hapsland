import { SQUARES } from "@hapsland/agent-flow-projection/production-flow-presentation"
import { type ProductionFlowContext } from "./context"
import { NODE_WIDTH, NODE_HEIGHT } from "./route-geometry"

export const infrastructureContactsView = <Message>(context: Pick<ProductionFlowContext<Message>, "h">) => {
  const { h } = context
  return INFRASTRUCTURE_CONTACTS.map((contact) =>
    h.g(
      [
        h.Class(`topology-resource ${contact.id}`),
        h.Role("img"),
        h.AriaLabel(`${contact.title} contact at ${SQUARES[contact.stage].title}: ${contact.scope}`)
      ],
      [
        h.title(
          [],
          [
            `Infrastructure topology: ${contact.title} connects to ${SQUARES[contact.stage].title}. ${contact.scope}. This line is not an observed event.`
          ]
        ),
        h.path(
          [
            h.D(`M ${contact.x} ${contact.y} L ${contact.x} ${contact.edgeY}`),
            h.Stroke(contact.color),
            h.StrokeWidth("2.5"),
            h.StrokeDasharray("3 3"),
            h.Fill("none")
          ],
          []
        ),
        h.circle(
          [
            h.Cx(String(contact.x)),
            h.Cy(String(contact.y)),
            h.R("5"),
            h.Fill("#fff"),
            h.Stroke(contact.color),
            h.StrokeWidth("2.5")
          ],
          []
        ),
        h.rect(
          [
            h.X(String(contact.x - 112)),
            h.Y(String(contact.labelY)),
            h.Width("224"),
            h.Height("32"),
            h.Rx("5"),
            h.Fill("#fff"),
            h.Stroke(contact.color),
            h.StrokeDasharray("3 3")
          ],
          []
        ),
        h.text(
          [
            h.X(String(contact.x)),
            h.Y(String(contact.labelY + 13)),
            h.TextAnchor("middle"),
            h.FontSize("12"),
            h.FontWeight("700"),
            h.Fill(contact.color)
          ],
          [contact.title]
        ),
        h.text(
          [
            h.X(String(contact.x)),
            h.Y(String(contact.labelY + 25)),
            h.TextAnchor("middle"),
            h.FontSize("9"),
            h.Fill(contact.color)
          ],
          [contact.scope]
        )
      ]
    )
  )
}
/** A read-only projection. Every active route is keyed to a checked event or output. */
/** Topology annotations, not additional states or observed traffic. */
export const INFRASTRUCTURE_CONTACTS = [
  {
    id: "capacity",
    stage: "admission",
    x: SQUARES.admission.x + NODE_WIDTH / 2,
    y: 40,
    edgeY: SQUARES.admission.y,
    labelY: 0,
    title: "Resident capacity",
    scope: "one shared resident ledger",
    color: "#168f83"
  },
  {
    id: "jev",
    stage: "effect",
    x: SQUARES.effect.x + NODE_WIDTH / 2,
    y: 490,
    edgeY: SQUARES.effect.y + NODE_HEIGHT,
    labelY: 502,
    title: "Jev backend",
    scope: "shared permits · simulated responses",
    color: "#b17a22"
  }
] as const
