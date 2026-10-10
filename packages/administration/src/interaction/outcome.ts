export type OutcomeLevel = "success" | "warning" | "error" | "info"

const markers: Readonly<Record<OutcomeLevel, string>> = {
  success: "[OK]",
  warning: "[WARN]",
  error: "[FAIL]",
  info: "[INFO]"
}

export const formatOutcome = (level: OutcomeLevel, message: string): string => `${markers[level]} ${message}`

const statusLevels: Readonly<Record<string, OutcomeLevel>> = {
  ready: "success",
  restored: "success",
  removed: "success",
  intact: "success",
  "already removed": "success",
  complete: "success",
  completed: "success",
  updated: "success",
  "already current": "success",
  unknown: "warning",
  pending: "warning",
  partial: "warning",
  skipped: "info"
}

export const formatStatusOutcome = (status: string, message: string): string =>
  formatOutcome(statusLevels[status] ?? "error", message)
