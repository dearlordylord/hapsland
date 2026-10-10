import type { InvocationSession } from "../../invocation/session.ts"
import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"
import { cliSwitch } from "../../invocation/session-options.ts"
import { decodeJson } from "../../invocation/json-input.ts"

export const installationOperationsFor = <const Fields extends Schema.Struct.Fields>(fields: Fields) =>
  Schema.Union([
    Schema.Struct({ version: Schema.Literal(1), operation: Schema.Literal("doctor"), cwd: Schema.String, ...fields }),
    Schema.Struct({
      version: Schema.Literal(1),
      operation: Schema.Literal("install-preview"),
      reinstall: Schema.optionalKey(Schema.Boolean),
      ...fields
    }),
    Schema.Struct({
      version: Schema.Literal(1),
      operation: Schema.Literal("install"),
      reinstall: Schema.optionalKey(Schema.Boolean),
      ...fields,
      proposalDigest: Schema.String.check(Schema.isPattern(/^[a-f0-9]{64}$/))
    }),
    Schema.Struct({ version: Schema.Literal(1), operation: Schema.Literal("update-preview"), ...fields }),
    Schema.Struct({
      version: Schema.Literal(1),
      operation: Schema.Literal("update"),
      ...fields,
      proposalDigest: Schema.String.check(Schema.isPattern(/^[a-f0-9]{64}$/))
    }),
    Schema.Struct({
      version: Schema.Literal(1),
      operation: Schema.Literal("uninstall"),
      ...fields,
      proposalDigest: Schema.optionalKey(Schema.String.check(Schema.isPattern(/^[a-f0-9]{64}$/)))
    })
  ])

export const InstallationOperation = Schema.Union([
  Schema.Struct({
    version: Schema.Literal(1),
    operation: Schema.Literal("update-preview"),
    host: Schema.Literal("resident")
  }),
  Schema.Struct({
    version: Schema.Literal(1),
    operation: Schema.Literal("update"),
    host: Schema.Literal("resident"),
    proposalDigest: Schema.String.check(Schema.isPattern(/^[a-f0-9]{64}$/))
  }),
  installationOperationsFor({
    host: Schema.optionalKey(Schema.Literal("codex")),
    codexHome: Schema.optionalKey(Schema.NonEmptyString),
    codexExecutable: Schema.optionalKey(Schema.NonEmptyString)
  }),
  installationOperationsFor({
    host: Schema.Literal("pi"),
    piHome: Schema.optionalKey(Schema.NonEmptyString),
    piExecutable: Schema.optionalKey(Schema.NonEmptyString)
  }),
  installationOperationsFor({
    host: Schema.Literal("claude"),
    claudeHome: Schema.optionalKey(Schema.NonEmptyString),
    claudeExecutable: Schema.optionalKey(Schema.NonEmptyString)
  }),
  installationOperationsFor({
    host: Schema.Literal("opencode"),
    opencodeConfigHome: Schema.optionalKey(Schema.NonEmptyString),
    opencodeExecutable: Schema.optionalKey(Schema.NonEmptyString)
  })
])

export type InstallationOperation = typeof InstallationOperation.Type

export const forcedInstallationOperation = (
  session: InvocationSession
): InstallationOperation["operation"] | undefined => {
  if (cliSwitch(session, "doctor")) return "doctor"
  if (cliSwitch(session, "install-preview")) return "install-preview"
  if (cliSwitch(session, "install")) return "install"
  if (cliSwitch(session, "update-preview")) return "update-preview"
  if (cliSwitch(session, "update")) return "update"
  if (cliSwitch(session, "uninstall")) return "uninstall"
  return undefined
}

export const decodeInstallationOperation = (input: string, forced: InstallationOperation["operation"] | undefined) =>
  decodeJson(input).pipe(
    Effect.flatMap(Schema.decodeUnknownEffect(InstallationOperation, { onExcessProperty: "error" })),
    Effect.flatMap((operation) =>
      forced !== undefined && operation.operation !== forced
        ? Effect.fail(new Error("installation operation flag does not match the request"))
        : Effect.succeed(operation)
    )
  )

export const installationReinstall = (operation: InstallationOperation) =>
  "reinstall" in operation && operation.reinstall === true ? { reinstall: true } : {}

export const installationDigest = (operation: InstallationOperation) =>
  "proposalDigest" in operation && operation.proposalDigest !== undefined
    ? { proposalDigest: operation.proposalDigest }
    : {}

export type CodexInstallationOperation = Exclude<
  InstallationOperation,
  { host: "claude" | "opencode" | "pi" | "resident" }
>

export type CodexInstallOperation = Extract<CodexInstallationOperation, { operation: "install-preview" | "install" }>

export type CodexLifecycleOperation = Extract<
  CodexInstallationOperation,
  { operation: "update-preview" | "update" | "uninstall" }
>

export type CodexDoctorOperation = Extract<CodexInstallationOperation, { operation: "doctor" }>
