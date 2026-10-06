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
  credentialOutcome: string
  savedDestination: Destination
  declinedUpdates: string[]
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
  check: "not requested",
  credentialOutcome: "not requested",
  savedDestination: "skip",
  declinedUpdates: []
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
  const host = activeHost(m)
  const retained = outcome === "declined" && m.results[host] !== undefined
  const results = { ...m.results, [host]: retained ? m.results[host]! : outcome }
  const index = m.index + 1
  return move(m, index < m.hosts.length ? "Hooks" : "Credential", {
    results,
    declinedUpdates: retained ? [...new Set([...m.declinedUpdates, host])] : m.declinedUpdates,
    index,
    digest: index < m.hosts.length ? hookDigest(m.hosts, index) : ""
  })
}

// Owner observations are allowed status codes, never arbitrary response/error text.
export function safeObservation(m: Model, e: Event): Event {
  if (e.action.kind !== "observed") return e
  const allowed =
    m.phase === "Applying"
      ? ["complete", "partial: restart required", "failed", "cancelled"]
      : m.phase === "Saving"
        ? ["saved", "failed", "cancelled", "partial: credential save needs recovery"]
        : ["synthetic success (zero requests)", "failed", "cancelled"]
  const outcome = allowed.includes(e.action.outcome)
    ? e.action.outcome
    : m.phase === "Saving" && e.action.outcome.startsWith("partial:")
      ? "partial: credential save needs recovery"
      : "failed"
  return { ...e, action: { ...e.action, outcome } }
}
const sourcePriority = (source: string): number => {
  if (source.startsWith("environment")) return 4
  if (source.includes(".env.local")) return 3
  if (source.includes(".env") && !source.includes(".config") && !source.startsWith("user")) return 2
  if (source.startsWith("project")) return 3
  if (source.startsWith("user") || source.includes(".config")) return 1
  return source.startsWith("native") ? 0 : -1
}
export function sourceAfterSave(source: string, destination: Destination): string {
  const priority = destination === "project" ? 3 : destination === "user" ? 1 : 0
  if (sourcePriority(source) > priority)
    return source.startsWith("environment") ? "environment (saved credential shadowed)" : source
  return destination
}
export function readiness(m: Model) {
  const outcomes = Object.values(m.results)
  const setup =
    m.credentialOutcome.startsWith("partial") ||
    outcomes.some((o) => o.startsWith("partial") || o === "failed" || o === "cancelled")
      ? "needs action"
      : outcomes.some((o) => o === "complete")
        ? "configured (simulated)"
        : "not configured"
  const credentials = m.source === "none" ? "missing: review unavailable" : `available from ${m.source} (simulated)`
  const nextSteps: string[] = []
  if (!m.hosts.length && !outcomes.length) nextSteps.push("Choose an agent if you want hook installation.")
  if (outcomes.some((o) => o.startsWith("partial") || o === "failed" || o === "cancelled"))
    nextSteps.push("Inspect preserved agent results before retrying setup.")
  if (m.credentialOutcome.startsWith("partial"))
    nextSteps.push("Inspect credential-save recovery before retrying; storage may have changed.")
  if (m.source === "none") nextSteps.push("Configure a credential before enabling review.")
  else nextSteps.push("Restart the agent; no real hook execution was tested.")
  return {
    setup,
    credentials,
    credentialAvailable: m.source !== "none",
    credentialRecovery: m.credentialOutcome,
    verification:
      m.check === "synthetic success (zero requests)" ? "simulated only; validity unverified" : "validity unverified",
    next: nextSteps.join(" "),
    nextSteps
  }
}
