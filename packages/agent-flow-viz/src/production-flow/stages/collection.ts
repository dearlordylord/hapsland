import { type ProductionFlowContext } from "../context"

export const stageCollectionView = <Message>(
  context: Pick<ProductionFlowContext<Message>, "resident" | "metadata" | "h">,
  node: ProductionFlowContext<Message>["nodes"][number],
  point: { readonly x: number; readonly y: number }
) => {
  const { resident, metadata, h } = context
  return node.id === "collection"
    ? (() => {
        const used = resident.collection.claims.length
        const maximum = metadata?.collectors?.capacity
        const description = `Shared background collectors: ${maximum === undefined ? `${used} used; limit not recorded` : `${used} of ${maximum}`}`
        return [
          h.g(
            [h.Class("collection-shared-collectors"), h.Role("img"), h.AriaLabel(description)],
            [
              h.title(
                [],
                [
                  description,
                  ...resident.collection.claims.map(
                    (claim) => ` · Group ${claim.group} · collector token ${claim.owner}`
                  )
                ]
              ),
              h.text(
                [h.X(String(point.x + 13)), h.Y(String(point.y + 95)), h.FontSize("9"), h.Fill("#435670")],
                [maximum === undefined ? `Collectors ${used} · max unknown` : `Collectors · shared ${used}/${maximum}`]
              ),
              ...(maximum === undefined
                ? []
                : [
                    h.rect(
                      [
                        h.X(String(point.x + 154)),
                        h.Y(String(point.y + 89)),
                        h.Width("57"),
                        h.Height("5"),
                        h.Fill("#dce5f0")
                      ],
                      []
                    ),
                    h.rect(
                      [
                        h.Class("collection-collector-fill"),
                        h.X(String(point.x + 154)),
                        h.Y(String(point.y + 89)),
                        h.Width(String(Math.min(57, maximum > 0 ? (used / maximum) * 57 : 0))),
                        h.Height("5"),
                        h.Fill("#168f83")
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
