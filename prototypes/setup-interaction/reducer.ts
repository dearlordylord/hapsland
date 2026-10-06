import {
  allowedObservation,
  hookDigest,
  move,
  nextHost,
  pending,
  saveDigest,
  safeObservation,
  sourceAfterSave,
  type Event,
  type Model
} from "./domain.ts"
export function reduce(m: Model, e: Event): Model {
  if (e.revision !== m.revision || m.phase === "Done" || m.phase === "Cancelled") return m
  e = safeObservation(m, e)
  const a = e.action
  if (a.kind === "cancel") return pending(m) ? m : move(m, "Cancelled")
  if (a.kind === "back") {
    if (pending(m)) return m
    if (m.phase === "SaveApproval") return move(m, "Credential", { digest: "" })
    if (m.phase === "CheckApproval") return move(m, "Credential")
    if (m.phase === "Credential") return move(m, "Select", { digest: "" })
    if (m.phase === "Hooks") return move(m, "Select", { digest: "" })
    return m
  }
  switch (m.phase) {
    case "Select":
      return a.kind === "select"
        ? move(m, a.hosts.length ? "Hooks" : "Done", {
            hosts: a.hosts,
            index: 0,
            digest: a.hosts.length ? hookDigest(a.hosts, 0) : ""
          })
        : m
    case "Hooks":
      return a.kind === "approve" ? (a.yes ? move(m, "Applying") : nextHost(m, "declined")) : m
    case "Applying":
      return allowedObservation(m, e) && a.kind === "observed" ? nextHost(m, a.outcome) : m
    case "Credential":
      if (a.kind === "keep" && m.source !== "none") return move(m, "CheckApproval")
      if (a.kind !== "destination") return m
      if (a.destination === "skip") return move(m, "Done")
      return move(m, "SaveApproval", { destination: a.destination, digest: saveDigest(a.destination) })
    case "SaveApproval":
      return a.kind === "approve" ? (a.yes ? move(m, "Saving") : move(m, "Credential", { digest: "" })) : m
    case "Saving":
      if (!allowedObservation(m, e) || a.kind !== "observed") return m
      return a.outcome === "saved"
        ? move(m, "CheckApproval", {
            source: sourceAfterSave(m.source, m.destination),
            credentialOutcome: "saved",
            savedDestination: m.destination,
            digest: ""
          })
        : move(m, "Credential", { credentialOutcome: a.outcome, digest: "" })
    case "CheckApproval":
      return a.kind === "approve" ? move(m, a.yes ? "Checking" : "Done") : m
    case "Checking":
      return allowedObservation(m, e) && a.kind === "observed" ? move(m, "Done", { check: a.outcome }) : m
    default:
      return m
  }
}
