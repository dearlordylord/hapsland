import { type FlowEvidence } from "@hapsland/agent-flow-projection"
import type { CONNECTIONS } from "@hapsland/agent-flow-projection/production-flow-presentation"

type ArrowKind = FlowEvidence["source"] | "possible" | "mixed" | "mixed external"
export type Route = (typeof CONNECTIONS)[number] &
  Readonly<{ active: boolean; kind: ArrowKind; linked: boolean; evidence: string }>
const unreachable = (value: never): never => {
  throw new Error(`unknown arrow kind: ${String(value)}`)
}
export const arrowKind = (evidence: readonly FlowEvidence[]): ArrowKind => {
  if (evidence.length === 0) return "possible"
  let request = false
  let external = false
  let native = false
  for (const item of evidence) {
    switch (item.source) {
      case "request":
        request = true
        break
      case "external fact":
        external = true
        break
      case "native fact":
        native = true
        break
      case "event":
      case "decision":
      case "state":
        break
      default:
        unreachable(item.source)
    }
  }
  if (request && evidence.some((item) => item.source !== "request")) return external ? "mixed external" : "mixed"
  if (request) return "request"
  if (external) return "external fact"
  return native ? "native fact" : "state"
}
export const arrowPaint = (kind: ArrowKind) => {
  switch (kind) {
    case "possible":
      return { color: "#91a4ba", dashed: false, overlay: false, external: false, command: false }
    case "event":
    case "decision":
    case "state":
    case "native fact":
      return { color: "#e66035", dashed: false, overlay: false, external: false, command: false }
    case "external fact":
      return { color: "#8a5a00", dashed: false, overlay: false, external: true, command: false }
    case "request":
      return { color: "#794aa0", dashed: true, overlay: false, external: false, command: true }
    case "mixed":
      return { color: "#e66035", dashed: false, overlay: true, external: false, command: false }
    case "mixed external":
      return { color: "#8a5a00", dashed: false, overlay: true, external: true, command: false }
    default:
      return unreachable(kind)
  }
}
