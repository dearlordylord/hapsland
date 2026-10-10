export const localFailureMessage = (cause: unknown): string => {
  if (typeof cause === "object" && cause !== null && "reason" in cause && typeof cause.reason === "string") {
    const source = "source" in cause ? String(cause.source) : "Setup"
    const field = "field" in cause ? String(cause.field) : "$"
    return `${source}:${field}: ${cause.reason}`
  }
  return cause instanceof Error ? cause.message : "Local operation failed"
}
