import { type Observation } from "@hapsland/monkey-business"
import { locateFlow } from "@hapsland/agent-flow-projection"

export const recordIdentity = (key: string) => {
  const [kind, id] = key.split(":")
  return `${["ready-advice", "lease-advice", "batch"].includes(kind) ? "advice" : ["work", "dispatch"].includes(kind) ? "operation" : kind}:${id}`
}
export const followsRecord = (frame: Observation, identity: string) => {
  const before = locateFlow(frame.before).filter((record) => recordIdentity(record.key) === identity)
  const after = locateFlow(frame.after).filter((record) => recordIdentity(record.key) === identity)
  if (JSON.stringify(before) !== JSON.stringify(after)) return true
  const [kind, id] = identity.split(":")
  const field = kind === "operation" ? "operation" : kind === "slot" ? "group" : kind
  return field in frame.event && String((frame.event as unknown as Record<string, unknown>)[field]) === id
}
