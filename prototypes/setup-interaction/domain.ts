// THROWAWAY: synthetic setup only. No production imports, storage or network.
export const phases = [
  "Select",
  "Hooks",
  "Applying",
  "Credential",
  "SaveApproval",
  "Saving",
  "CheckApproval",
  "Checking",
  "Done",
  "Cancelled"
] as const
export type Phase = (typeof phases)[number]
export type Destination = "project" | "user" | "native" | "skip"
export type Context = {
  revision: number
  hosts: string[]
  index: number
  results: Record<string, string>
  destination: Destination
  source: string
  digest: string
  check: string
}
export type Model = Context & { phase: Phase }
export type Action =
  | { kind: "select"; hosts: string[] }
  | { kind: "approve"; yes: boolean }
  | { kind: "destination"; destination: Destination }
  | { kind: "keep" }
  | { kind: "back" | "cancel" }
  | { kind: "observed"; commandId: number; outcome: string }
export type Event = { revision: number; action: Action }
export const initial = (source = "none"): Model => ({
  phase: "Select",
  revision: 0,
  hosts: [],
  index: 0,
  results: {},
  destination: "skip",
  source,
  digest: "",
  check: "not requested"
})
export const hookDigest = (hosts: string[], index: number) => `synthetic-hooks:${hosts[index] ?? "none"}`
export const saveDigest = (destination: Destination) => `synthetic-save:${destination}`
export const move = (m: Model, phase: Phase, patch: Partial<Context> = {}): Model => ({
  ...m,
  ...patch,
  phase,
  revision: m.revision + 1
})
export const activeHost = (m: Model) => m.hosts[m.index] ?? "none"
export const pending = (m: Model) => ["Applying", "Saving", "Checking"].includes(m.phase)
export type Command = { id: number; type: "apply" | "save" | "check"; target: string; digest: string }
export const command = (m: Model): Command | undefined => {
  if (m.phase === "Applying") return { id: m.revision, type: "apply", target: activeHost(m), digest: m.digest }
  if (m.phase === "Saving") return { id: m.revision, type: "save", target: m.destination, digest: m.digest }
  if (m.phase === "Checking")
    return { id: m.revision, type: "check", target: "fake backend", digest: "separate consent" }
  return undefined
}
export const allowedObservation = (m: Model, e: Event) =>
  e.revision === m.revision && e.action.kind === "observed" && e.action.commandId === m.revision
export const nextHost = (m: Model, outcome: string): Model => {
  const results = { ...m.results, [activeHost(m)]: outcome }
  const index = m.index + 1
  return move(m, index < m.hosts.length ? "Hooks" : "Credential", {
    results,
    index,
    digest: index < m.hosts.length ? hookDigest(m.hosts, index) : ""
  })
}
