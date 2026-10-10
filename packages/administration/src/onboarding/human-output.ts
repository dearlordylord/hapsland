import type * as Effect from "effect/Effect"
import type { diagnosePackage } from "./package-diagnostics.ts"
import { formatStatusOutcome, formatOutcome } from "../interaction/outcome.ts"

export type PackageDiagnosis = Effect.Success<ReturnType<typeof diagnosePackage>>

export type PackageCheck = PackageDiagnosis["checks"][number]

export const packageCheckLines = (check: PackageCheck): string[] => [
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

export { formatOutcome, formatStatusOutcome, type OutcomeLevel } from "../interaction/outcome.ts"
