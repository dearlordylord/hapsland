import { packageRoot } from "@hapsland/runtime-environment/runtime/package-runtime"
import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"
import { accessSync, constants, readFileSync } from "node:fs"
import { join } from "node:path"
import { analyzeTypeFile } from "@hapsland/source-analysis/direct-event/analyzer"
import { registeredLanguages } from "@hapsland/source-analysis/direct-event/languages/registry"
import { inspectResidentEffect as inspectResident } from "@hapsland/resident-transport/resident/client"
import { previewCodexInstallation, inspectCodexInstallation, type InstallationRequest } from "./codex-installation.ts"

export type DoctorCheckStatus = "ready" | "missing" | "conflict" | "unsupported" | "unknown"
export type DoctorCheck = {
  readonly stage: string
  readonly status: DoctorCheckStatus
  readonly observed: unknown
  readonly action?: string
}

const object = (value: unknown): Readonly<Record<string, unknown>> | undefined =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Readonly<Record<string, unknown>>)
    : undefined

const readable = (path: string): boolean => {
  try {
    accessSync(path, constants.R_OK)
    return true
  } catch {
    return false
  }
}

export const DoctorResult = Schema.Struct({
  version: Schema.Literal(1),
  operation: Schema.Literal("doctor"),
  status: Schema.Literals(["ready", "not-ready", "unknown"]),
  offline: Schema.Literal(true),
  readOnly: Schema.Literal(true),
  providerCalls: Schema.Literal(0),
  checks: Schema.Array(
    Schema.Struct({
      stage: Schema.String,
      status: Schema.Literals(["ready", "missing", "conflict", "unsupported", "unknown"]),
      observed: Schema.Unknown,
      action: Schema.optionalKey(Schema.String)
    })
  ),
  nextSteps: Schema.Array(Schema.Struct({ stage: Schema.String, action: Schema.String }))
})
export interface DoctorResult extends Schema.Schema.Type<typeof DoctorResult> {}
export class DoctorError extends Schema.TaggedError<DoctorError>()("DoctorError", {
  operation: Schema.NonEmptyString
}) {}
const observe = Effect.fn("Doctor.observe")(<A>(operation: string, read: () => A) =>
  Effect.try({ try: read, catch: () => new DoctorError({ operation }) })
)

const recordValue = (value: unknown): Readonly<Record<string, unknown>> => object(value) ?? {}
const packageCheck = (declaration: Readonly<Record<string, unknown>> | undefined): DoctorCheck =>
  declaration === undefined
    ? {
        stage: "package",
        status: "missing",
        observed: "package-runtime.json unavailable",
        action: "reinstall the released package"
      }
    : { stage: "package", status: "ready", observed: { declaration: "package-runtime.json", packageRoot } }
const parserCheck = (): DoctorCheck => {
  try {
    const observed = Object.fromEntries(
      registeredLanguages.map((language) => [
        language.id,
        analyzeTypeFile(language.probe.path, language.probe.source).status
      ])
    )
    return Object.values(observed).every((status) => status === "analyzed")
      ? { stage: "parser", status: "ready", observed: "loaded-and-analyzed" }
      : {
          stage: "parser",
          status: "unsupported",
          observed,
          action: "reinstall the package for this exact OS and architecture"
        }
  } catch {
    return {
      stage: "parser",
      status: "missing",
      observed: "load-failed",
      action: "reinstall a release archive containing compatible parser bindings for this platform"
    }
  }
}
const runtimeCheck = (value: unknown): DoctorCheck => {
  const runtime = recordValue(value)
  if (runtime.supported === true) return { stage: "runtime", status: "ready", observed: runtime.checks ?? "supported" }
  const unavailable = Object.entries(recordValue(runtime.checks)).flatMap(([name, value]) => {
    const check = recordValue(value)
    return check.ready === false && typeof check.path === "string"
      ? [`${name}: ${String(check.observed ?? "unavailable")} at ${check.path}`]
      : []
  })
  return {
    stage: "runtime",
    status: "unsupported",
    observed: runtime.checks ?? "unavailable",
    action:
      unavailable.length > 0
        ? `reinstall the package to restore its required components (${unavailable.join("; ")})`
        : "reinstall the package containing the declared runtime, hook, parser and resident executables"
  }
}

const hostCheck = (value: unknown, host: Readonly<Record<string, unknown>>): DoctorCheck => {
  const codex = recordValue(value)
  return codex.supported === true
    ? { stage: "host", status: "ready", observed: { adapter: "codex", home: host.home, version: codex.observed } }
    : {
        stage: "host",
        status: "unsupported",
        observed: codex.observed ?? "unavailable",
        action: `select a Codex home and install ${codex.required ?? "a declared Codex CLI version"}`
      }
}
const inspectionMessage = (inspection: Readonly<Record<string, unknown>>): unknown =>
  recordValue(inspection.error).message ?? "configuration conflict"
const inspectionCheck = (inspection: Readonly<Record<string, unknown>>): DoctorCheck => {
  if (inspection.status === "conflict")
    return {
      stage: "configuration-ownership",
      status: "conflict",
      observed: inspectionMessage(inspection),
      action: "reconcile the reported malformed, duplicate, or locally modified owned entry, then rerun doctor"
    }
  if (inspection.status === "partial")
    return {
      stage: "configuration-ownership",
      status: "conflict",
      observed: inspection.recovery ?? "partial mutation journal",
      action: "resume the journaled operation with its original proposal digest"
    }
  if (inspection.installed === true)
    return {
      stage: "configuration-ownership",
      status: "ready",
      observed: "owned hook and feature match the installation record"
    }
  return {
    stage: "configuration-ownership",
    status: "missing",
    observed: "integration is not installed in the selected Codex home",
    action: "preview and install the integration for the selected Codex home"
  }
}
const residentCheck = (resident: Effect.Success<ReturnType<typeof inspectResident>>): DoctorCheck =>
  resident.available
    ? { stage: "resident", status: "ready", observed: { lifetime: resident.lifetime, pid: resident.pid } }
    : {
        stage: "resident",
        status: "unknown",
        observed: "not-running-or-unreachable",
        action: "start or restart Codex so the installed hook can launch the resident"
      }
const nextStep = (check: DoctorCheck) =>
  check.status === "ready" || check.action === undefined ? [] : [{ stage: check.stage, action: check.action }]
const failedCheckStatuses: ReadonlySet<DoctorCheckStatus> = new Set(["missing", "conflict", "unsupported"])
const doctorReadiness = (checks: readonly DoctorCheck[]): DoctorResult["status"] => {
  if (checks.some((check) => failedCheckStatuses.has(check.status))) return "not-ready"
  return checks.some((check) => check.status === "unknown") ? "unknown" : "ready"
}
export const diagnoseInstalledIntegration = Effect.fn("Doctor.diagnose")(function* (options: {
  readonly installation: InstallationRequest
  readonly repository: DoctorCheck
  readonly credential: DoctorCheck
}) {
  const checks: DoctorCheck[] = []
  const declarationPath = join(packageRoot, "package-runtime.json")
  const declaration = yield* observe("read package declaration", () =>
    readable(declarationPath) ? object(JSON.parse(readFileSync(declarationPath, "utf8"))) : undefined
  )
  checks.push(packageCheck(declaration), parserCheck())
  const preview = yield* previewCodexInstallation(options.installation)
  const host = recordValue(recordValue(preview).host)
  const compatibility = recordValue(host.compatibility)
  checks.push(runtimeCheck(compatibility.runtime), hostCheck(compatibility.codex, host))
  const inspection = recordValue(yield* inspectCodexInstallation(options.installation))
  checks.push(inspectionCheck(inspection))
  const resident = yield* inspectResident()
  checks.push(
    residentCheck(resident),
    {
      stage: "host-trust",
      status: "unknown",
      observed: "Codex does not expose an offline trust query for this integration",
      action: "start Codex normally in the repository and complete any native trust or hook review prompt"
    },
    options.credential,
    options.repository
  )
  return {
    version: 1,
    operation: "doctor",
    status: doctorReadiness(checks),
    offline: true,
    readOnly: true,
    providerCalls: 0,
    checks,
    nextSteps: checks.flatMap(nextStep)
  } satisfies DoctorResult
})
