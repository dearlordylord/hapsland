export const phases = [
  "Loading",
  "Approval",
  "Checking",
  "Recovery",
  "ReplacementApproval",
  "EnteringKey",
  "SavingKey",
  "Done",
  "Cancelled"
]
export const actions = [
  "loadFailed",
  "loaded",
  "approve",
  "observed",
  "recheck",
  "replace",
  "back",
  "exit",
  "approveReplacement",
  "entered",
  "inputEnded",
  "stored"
]
export const sources = [undefined, "saved", "file", "environment"]
export const sourceTags = ["MissingSource", "SavedSource", "FileSource", "EnvironmentSource"]
export const results = ["accepted", "rejected", "forbidden", "rate-limited", "unconfirmed"]
export const resultTags = ["Accepted", "Rejected", "Forbidden", "RateLimited", "Unconfirmed"]
export function fixture(phase, attempts, source, result, bits) {
  const current = Boolean(bits & 1),
    ready = Boolean(bits & 2),
    yes = Boolean(bits & 4),
    stored = Boolean(bits & 8)
  const model = {
    phase,
    revision: 7,
    keyRevision: 11,
    attempts,
    source,
    eligibility: "ready",
    observations: [{ attempt: 0, source: "saved", result: "rejected" }],
    storage: { status: "stored", generation: 4 }
  }
  const actions = {
    loadFailed: { kind: "loadFailed", commandId: 7 },
    loaded: { kind: "loaded", commandId: 7, source: "file", eligibility: ready ? "ready" : "unavailable" },
    approve: { kind: "approve", keyRevision: 11, yes },
    observed: { kind: "observed", commandId: 7, keyRevision: 11, result },
    recheck: { kind: "recheck" },
    replace: { kind: "replace" },
    back: { kind: "back" },
    exit: { kind: "exit" },
    approveReplacement: { kind: "approveReplacement", keyRevision: 11, yes },
    entered: { kind: "entered", commandId: 7 },
    inputEnded: { kind: "inputEnded", commandId: 7 },
    stored: { kind: "stored", commandId: 7, storage: { status: stored ? "stored" : "busy", generation: 5 } }
  }
  return { model, actions, current, ready, yes, stored }
}
