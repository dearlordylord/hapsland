import { Option } from "effect"
import type { HtmlBuilder } from "foldkit/html"
import type { CanonicalProjection } from "../../../src/canonical/adapter"
import { AGENT_COLORS, type AgentScope } from "./shared-resident-view"

/** Each layer mirrors this same resident ledger; the bars do not reserve capacity. */
export const residentCapacityInset = <Message>(
  h: HtmlBuilder<Message>,
  resident: CanonicalProjection,
  agents: readonly AgentScope[] = [],
  inspect?: (stage: "admission") => Message
) => {
  const owner = (partition: number) => {
    const index = agents.findIndex((agent) => agent.partition === partition)
    return {
      name: index < 0 ? `partition ${partition}` : agents[index].agent,
      color: AGENT_COLORS[(index < 0 ? Math.max(0, partition - 1) : index) % AGENT_COLORS.length]
    }
  }
  const row = (kind: "items" | "bytes", label: string, y: number, maximum: number) => {
    let offset = 0
    return h.g(
      [
        h.Class(`resident-capacity-${kind}`),
        h.Role("img"),
        h.AriaLabel(`Resident ${kind}: ${resident.global[kind]} of ${maximum}`)
      ],
      [
        h.text([h.X("596"), h.Y(String(y)), h.FontSize("10"), h.Fill("#263c53")], [label]),
        h.text(
          [
            h.X("814"),
            h.Y(String(y)),
            h.TextAnchor("end"),
            h.FontSize("10"),
            h.FontWeight("700"),
            h.Fill("#263c53"),
            h.Class("resident-capacity-total")
          ],
          [`${resident.global[kind]} / ${maximum}`]
        ),
        h.rect([h.X("596"), h.Y(String(y + 5)), h.Width("218"), h.Height("9"), h.Rx("2"), h.Fill("#e4ecf1")], []),
        ...resident.partitions.map((partition) => {
          const identity = owner(partition.partition)
          const width = maximum > 0 ? (partition[kind] / maximum) * 218 : 0
          const x = 596 + offset
          offset += width
          return h.g(
            [
              h.Class("resident-capacity-owner"),
              h.Role("img"),
              h.AriaLabel(`${identity.name}: ${partition[kind]} ${kind}`)
            ],
            [
              h.title([], [`${identity.name} · ${partition[kind]} ${kind}`]),
              h.rect(
                [h.X(String(x)), h.Y(String(y + 5)), h.Width(String(width)), h.Height("9"), h.Fill(identity.color)],
                []
              )
            ]
          )
        })
      ]
    )
  }
  return h.g(
    [
      h.Class("resident-capacity-inset"),
      h.Role(inspect ? "button" : "group"),
      h.AriaLabel(
        `Inspect shared resident capacity: ${resident.global.items} of ${resident.limits.globalItems} items; ${resident.global.bytes} of ${resident.limits.globalBytes} bytes`
      ),
      ...(inspect
        ? [
            h.Tabindex(0),
            h.OnClick(inspect("admission")),
            h.OnKeyDownSelfPreventDefault((key) =>
              key === "Enter" || key === " " ? Option.some(inspect("admission")) : Option.none()
            )
          ]
        : [])
    ],
    [
      h.title(
        [],
        [
          "One global resident ledger shared by every agent. Each layer shows the same checked snapshot; Admission shows that agent’s own ceiling.",
          ...resident.partitions.map(
            (partition) => ` ${owner(partition.partition).name}: ${partition.items} items, ${partition.bytes} bytes.`
          )
        ]
      ),
      h.path(
        [
          h.D("M 422 40 L 705 40 L 705 52"),
          h.Fill("none"),
          h.Stroke("#168f83"),
          h.StrokeWidth("1.5"),
          h.StrokeDasharray("3 3")
        ],
        []
      ),
      h.rect(
        [
          h.X("580"),
          h.Y("52"),
          h.Width("250"),
          h.Height("116"),
          h.Rx("9"),
          h.Fill("#f7fcfa"),
          h.Stroke("#168f83"),
          h.StrokeDasharray("5 4")
        ],
        []
      ),
      h.text([h.X("596"), h.Y("72"), h.FontSize("12"), h.FontWeight("750"), h.Fill("#176d65")], ["ONE RESIDENT"]),
      h.text(
        [h.X("596"), h.Y("88"), h.FontSize("10"), h.Fill("#62758b")],
        ["Work reservations · shared by all agents"]
      ),
      row("items", "Items", 104, resident.limits.globalItems),
      row("bytes", "Bytes", 133, resident.limits.globalBytes),
      ...agents.map((agent, index) =>
        h.text(
          [
            h.X(String(596 + index * 36)),
            h.Y("160"),
            h.FontSize("10"),
            h.FontWeight("700"),
            h.Fill(owner(agent.partition).color)
          ],
          [`A${index + 1}`]
        )
      )
    ]
  )
}
