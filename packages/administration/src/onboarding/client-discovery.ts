import type { InvocationSession } from "../invocation/session.ts"
import { CLIENT_NAMES } from "@hapsland/runtime-environment/runtime/agent-clients"
import type { ClientChoice, SetupClient } from "./client-selection.ts"
import type { inspectPiInstallation } from "./pi-installation.ts"
import type { inspectClaudeInstallation } from "./claude-installation.ts"
import type { inspectCodexInstallation } from "./codex-installation/queries.ts"
import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"
import { hostFields } from "./invocation-fields.ts"

const initialClientStatus = (inspection: {
  readonly status: string
  readonly installed?: boolean
}): ClientChoice["status"] =>
  inspection.installed === true
    ? "installed"
    : ["conflict", "partial"].includes(inspection.status)
      ? "needs attention"
      : "not installed"

type ClientInstallationFields = Parameters<typeof inspectPiInstallation>[0] &
  Parameters<typeof inspectClaudeInstallation>[0] &
  Parameters<typeof inspectCodexInstallation>[0]

const codexClientStatus = Effect.fn("InteractiveSetup.codexStatus")(function* (
  fields: ClientInstallationFields,
  status: ClientChoice["status"]
) {
  if (status !== "not installed") return status
  const { previewCodexUpdate } = yield* Effect.promise(() => import("./codex-installation/queries.ts"))
  const target = yield* previewCodexUpdate(fields)
  // An owned registration may point to a different retained package.
  if (target.status === "preview") return "installed" as const
  return target.status === "unsupported" ? ("unavailable" as const) : status
})

const claudeClientStatus = Effect.fn("InteractiveSetup.claudeStatus")(function* (
  fields: ClientInstallationFields,
  status: ClientChoice["status"]
) {
  if (status !== "not installed") return status
  const { previewClaudeInstallation } = yield* Effect.promise(() => import("./claude-installation.ts"))
  return (yield* previewClaudeInstallation(fields)).status === "unsupported" ? ("unavailable" as const) : status
})

export const clientInstallationPorts = Effect.fn("InteractiveSetup.installationPorts")(function* (
  _session: InvocationSession
) {
  const { hasPiRegistration, inspectPiInstallation } = yield* Effect.promise(() => import("./pi-installation.ts"))
  const { hasClaudeRegistration, inspectClaudeInstallation } = yield* Effect.promise(
    () => import("./claude-installation.ts")
  )
  const { hasCodexRegistration, inspectCodexInstallation } = yield* Effect.promise(
    () => import("./codex-installation/queries.ts")
  )
  const clientInstallations = {
    pi: { installed: hasPiRegistration, inspect: inspectPiInstallation },
    claude: { installed: hasClaudeRegistration, inspect: inspectClaudeInstallation },
    codex: { installed: hasCodexRegistration, inspect: inspectCodexInstallation }
  }
  return {
    installed: (fields: ReturnType<typeof hostFields>) => clientInstallations[fields.host].installed(fields),
    inspect: (fields: ReturnType<typeof hostFields>) => clientInstallations[fields.host].inspect(fields)
  }
})

const piClientStatus = Effect.fn("InteractiveSetup.piStatus")(function* (
  fields: ClientInstallationFields,
  initial: ClientChoice["status"]
) {
  const { previewPiInstallation } = yield* Effect.promise(() => import("./pi-installation.ts"))
  return (yield* previewPiInstallation(fields)).status === "unsupported" ? ("unavailable" as const) : initial
})

const clientStatuses = { pi: piClientStatus, claude: claudeClientStatus, codex: codexClientStatus }

const currentClientStatus = (
  session: InvocationSession,
  fields: ReturnType<typeof hostFields>,
  initial: ClientChoice["status"]
) => clientStatuses[fields.host](fields, initial)

export const setupClientChoice = Effect.fn("InteractiveSetup.clientChoice")(function* (
  session: InvocationSession,
  host: SetupClient
) {
  const fields = hostFields(session, host)
  const { inspect } = yield* clientInstallationPorts(session)
  const inspection = yield* inspect(fields)
  const decoded = Schema.decodeUnknownSync(
    Schema.Struct({ status: Schema.String, installed: Schema.optionalKey(Schema.Boolean) })
  )(inspection)
  const status = yield* currentClientStatus(session, fields, initialClientStatus(decoded))
  return { host, name: CLIENT_NAMES[host], status }
})
