import type { HtmlBuilder } from "foldkit/html"
import type { ReplayStep } from "./canonical-replay"
import type { PreparationFrame } from "../../monkey-business/src/preparation"
import { recordLabel, type RecordNumbers } from "@hapsland/agent-flow-projection"

export type PreparationSnapshot = Readonly<{
  operation?: number
  frame?: PreparationFrame
  frames?: readonly PreparationFrame[]
}>
export const preparationSnapshot = (steps: readonly ReplayStep[]): PreparationSnapshot => {
  const latest = steps.at(-1)
  const frames = steps.flatMap((step) => (step.preparation ? [step.preparation] : []))
  const operation =
    latest?.commands.find((command) => command.kind === "prepare")?.operation ?? frames.at(-1)?.event.operation
  const frame = frames.findLast((item) => item.event.operation === operation)
  return {
    ...(operation === undefined ? {} : { operation }),
    ...(frame ? { frame, frames: frames.filter((item) => item.event.operation === operation) } : {})
  }
}

const nodes = [
  { id: "expand", label: "Next edge", x: 12, y: 124 },
  { id: "resolve", label: "Resolve", x: 124, y: 124 },
  { id: "gate", label: "Path gate", x: 124, y: 166 },
  { id: "capture", label: "Capture", x: 12, y: 166 },
  { id: "accept", label: "Accept / skip", x: 12, y: 208 },
  { id: "done", label: "Complete", x: 124, y: 208 }
] as const
const phases = {
  idle: "",
  ready: "expand",
  resolving: "resolve",
  checking: "gate",
  capturing: "capture",
  complete: "done",
  incomplete: "done"
} as const

/** Static possible routes; highlights come only from the selected checked graph frame. */
export const preparationMini = <Message>(
  h: HtmlBuilder<Message>,
  x: number,
  y: number,
  snapshot: PreparationSnapshot,
  numbers?: RecordNumbers
) => {
  const frame = snapshot.frame
  const phase = frame ? phases[frame.after.phase] : ""
  const incomplete = frame?.after.phase === "incomplete"
  return h.g(
    [h.Class("preparation-mini")],
    [
      h.title(
        [],
        [
          frame
            ? `${recordLabel("preparation", frame.event.operation, numbers)}, tree ${frame.event.unit + 1}: ${frame.event.fact.kind} → ${frame.command.kind}; ${frame.after.phase}. Source facts are simulated.`
            : "Artifact-building subprocess. No source facts supplied at this step."
        ]
      ),
      h.path([h.D(`M ${x + 12} ${y + 100} H ${x + 212}`), h.Stroke("#a3b3c7")], []),
      h.text(
        [
          h.Class("preparation-mini-status"),
          h.X(String(x + 12)),
          h.Y(String(y + 115)),
          h.FontSize("8"),
          h.Fill("#435670")
        ],
        [
          frame
            ? `${recordLabel("preparation", frame.event.operation, numbers)} · tree ${frame.event.unit + 1} · ${frame.after.phase}`
            : snapshot.operation === undefined
              ? "Artifact building · no facts yet"
              : `${recordLabel("preparation", snapshot.operation, numbers)} · awaiting source facts`
        ]
      ),
      ...[
        `M ${x + 100} ${y + 137} H ${x + 119}`,
        `M ${x + 168} ${y + 150} V ${y + 161}`,
        `M ${x + 124} ${y + 179} H ${x + 105}`,
        `M ${x + 56} ${y + 192} V ${y + 203}`,
        `M ${x + 100} ${y + 221} H ${x + 119}`,
        // Skips and additional edges return to exploration, within the same operation.
        `M ${x + 12} ${y + 221} H ${x + 5} V ${y + 137} H ${x + 9}`
      ].map((path) => h.path([h.D(path), h.Fill("none"), h.Stroke("#899bb2"), h.StrokeWidth("1.5")], [])),
      ...[
        [119, 137, "right"],
        [168, 161, "down"],
        [105, 179, "left"],
        [56, 203, "down"],
        [119, 221, "right"],
        [9, 137, "right"]
      ].map(([dx, dy, direction]) => {
        const px = x + Number(dx),
          py = y + Number(dy)
        const path =
          direction === "down"
            ? `M ${px - 3} ${py - 4} L ${px} ${py} L ${px + 3} ${py - 4}`
            : direction === "left"
              ? `M ${px + 4} ${py - 3} L ${px} ${py} L ${px + 4} ${py + 3}`
              : `M ${px - 4} ${py - 3} L ${px} ${py} L ${px - 4} ${py + 3}`
        return h.path([h.D(path), h.Fill("none"), h.Stroke("#899bb2"), h.StrokeWidth("1.5")], [])
      }),
      ...nodes.map((node) => {
        // Capture acceptance is an atomic decision, not an extra resident state.
        const active = phase === node.id || (node.id === "accept" && frame?.event.fact.kind === "captured")
        const label = node.id === "done" && incomplete ? "Incomplete" : node.label
        return h.g(
          [h.Class(`preparation-mini-node ${active ? "active" : ""}`)],
          [
            h.rect(
              [
                h.X(String(x + node.x)),
                h.Y(String(y + node.y)),
                h.Width("88"),
                h.Height("26"),
                h.Rx("5"),
                h.Fill(active ? (incomplete && node.id === "done" ? "#fff0e5" : "#e1edff") : "#f8faff"),
                h.Stroke(active ? "#e66035" : "#a3b3c7"),
                h.StrokeWidth(active ? "2.5" : "1")
              ],
              []
            ),
            h.text(
              [
                h.X(String(x + node.x + 44)),
                h.Y(String(y + node.y + 17)),
                h.TextAnchor("middle"),
                h.FontSize("10"),
                h.FontWeight(active ? "700" : "500"),
                h.Fill("#263c56")
              ],
              [label]
            )
          ]
        )
      }),
      h.text(
        [
          h.Class("preparation-mini-counts"),
          h.X(String(x + 12)),
          h.Y(String(y + 246)),
          h.FontSize("9"),
          h.Fill("#52647d")
        ],
        [
          frame
            ? `${frame.after.files}/${frame.event.generatedTree?.files ?? frame.after.limits.files} files read · tree ${frame.after.treeBytes % 1024 === 0 ? `${frame.after.treeBytes / 1024} KiB` : `${frame.after.treeBytes} B`}`
            : "Checked graph · detailed view below"
        ]
      )
    ]
  )
}
