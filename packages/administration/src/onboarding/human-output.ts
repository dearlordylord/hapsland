import type * as Effect from "effect/Effect"
import type { diagnosePackage } from "./package-diagnostics.ts"

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

type PackageDiagnosis = Effect.Success<ReturnType<typeof diagnosePackage>>
type PackageCheck = PackageDiagnosis["checks"][number]

const packageCheckLines = (check: PackageCheck): string[] => [
  `  ${formatStatusOutcome(check.status, `${check.name}: ${check.observed}.`)}`,
  ...(check.status === "ready" ? [] : [`    Required: ${check.required}.`]),
  ...(check.action === undefined ? [] : [`    Next: ${check.action}.`])
]

export const formatPackageDoctor = (diagnosis: PackageDiagnosis): string[] => [
  formatStatusOutcome(
    diagnosis.status,
    diagnosis.status === "ready" ? "Package doctor: package checks passed." : "Package doctor: package checks failed."
  ),
  ...diagnosis.checks.flatMap(packageCheckLines),
  formatOutcome("info", "Package checks only; agent setup and a real review were not verified.")
]
