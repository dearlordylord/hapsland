import { adviceePermitLimit } from "../../resource-details"
import { type ProductionFlowContext } from "../context"

export const stageAdmissionView = <Message>(
  context: Pick<ProductionFlowContext<Message>, "partition" | "projection" | "resident" | "metadata" | "h">,
  node: ProductionFlowContext<Message>["nodes"][number],
  point: { readonly x: number; readonly y: number }
) => {
  const { partition, projection, resident, metadata, h } = context
  return node.id === "admission"
    ? (() => {
        const usage =
          partition === undefined
            ? projection.partitions.length === 1
              ? projection.partitions[0]
              : undefined
            : resident.partitions.find((p) => p.partition === partition)
        const scopedPartition =
          partition ??
          (projection.partitions.length === 1
            ? projection.partitions[0].partition
            : projection.admissions.length === 1
              ? projection.admissions[0].partition
              : undefined)
        const scoped = scopedPartition !== undefined
        const rows = [
          { label: "Items", used: usage?.items ?? 0, max: scoped ? resident.limits.partitionItems : undefined },
          { label: "Bytes", used: usage?.bytes ?? 0, max: scoped ? resident.limits.partitionBytes : undefined },
          {
            label: "Permits · agent",
            scope: "this agent",
            kind: "local",
            used: resident.admissions
              .filter((a) => a.partition === scopedPartition)
              .reduce((n, a) => n + a.permits.length, 0),
            max: adviceePermitLimit(metadata, scopedPartition)
          },
          {
            label: "Permits · shared",
            scope: "all agents",
            kind: "global",
            used: resident.admissions.reduce((n, a) => n + a.permits.length, 0),
            max: metadata?.permits?.residentLimit
          }
        ]
        return rows.map((row, index) =>
          h.g(
            [
              ...(row.kind
                ? [
                    h.Class(`admission-permit-${row.kind}`),
                    h.Role("img"),
                    h.AriaLabel(
                      `Edit permits, ${row.scope}: ${row.max === undefined ? `${row.used} used; limit not recorded` : `${row.used} of ${row.max}`}`
                    )
                  ]
                : [])
            ],
            [
              ...(row.kind
                ? [
                    h.title(
                      [],
                      [
                        `Edit permits, ${row.scope}: ${row.max === undefined ? `${row.used} used; limit not recorded` : `${row.used} of ${row.max}`}`
                      ]
                    )
                  ]
                : []),
              h.text(
                [h.X(String(point.x + 13)), h.Y(String(point.y + 65 + index * 13)), h.FontSize("9"), h.Fill("#435670")],
                [
                  `${row.label} ${row.max === undefined ? `${row.used} · ${row.kind ? "max unknown" : "limit not recorded"}` : `${row.used}/${row.max}`}`
                ]
              ),
              ...(row.max === undefined
                ? []
                : [
                    h.rect(
                      [
                        h.X(String(point.x + 154)),
                        h.Y(String(point.y + 59 + index * 13)),
                        h.Width("57"),
                        h.Height("5"),
                        h.Fill("#dce5f0")
                      ],
                      []
                    ),
                    h.rect(
                      [
                        ...(row.kind ? [h.Class("admission-permit-fill")] : []),
                        h.X(String(point.x + 154)),
                        h.Y(String(point.y + 59 + index * 13)),
                        h.Width(String(Math.min(57, row.max > 0 ? (row.used / row.max) * 57 : 0))),
                        h.Height("5"),
                        h.Fill(row.kind === "global" ? "#168f83" : "#427bc4")
                      ],
                      []
                    )
                  ])
            ]
          )
        )
      })()
    : []
}
