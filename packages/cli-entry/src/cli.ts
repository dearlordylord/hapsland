#!/usr/bin/env node
import { controlledOptions } from "@hapsland/resident-transport/resident/controlled-options"
import {
  statePathConfig,
  activityPathConfig,
  userConfigPathConfig
} from "@hapsland/runtime-inputs/runtime/input-settings"
import { SUPPORTED_CLIENTS, CLIENT_NAMES } from "@hapsland/runtime-environment/runtime/agent-clients"
import { formatOutcome, formatStatusOutcome } from "@hapsland/administration/onboarding/human-output"
import {
  NEW_KEY_FLAG,
  CLI_NAME,
  LOGIN_FLAG,
  setupCommand,
  DEFAULT_UPDATE_CHANNEL
} from "@hapsland/runtime-environment/runtime/cli-names"
import { JEV_PROVIDER } from "@hapsland/runtime-environment/runtime/backend"
import { HAPSLAND_CONFIG_DIRECTORY, HAPSLAND_STATE_DIRECTORY } from "@hapsland/runtime-environment/runtime/user-paths"
import { profileFields } from "@hapsland/administration/onboarding/client-command"
import type { DoctorCheck } from "@hapsland/administration/onboarding/doctor"
import type { ClientChoice, SetupClient } from "@hapsland/administration/onboarding/client-selection"
import type { ReleaseSelection } from "@hapsland/administration/onboarding/distribution"
import type { readAnalytics, formatAnalyticsHuman } from "@hapsland/activity-observation/activity/analytics"
import type { formatActivityHuman } from "@hapsland/activity-observation/activity/status"
import type { inspectPiInstallation } from "@hapsland/administration/onboarding/pi-installation"
import type { inspectClaudeInstallation } from "@hapsland/administration/onboarding/claude-installation"
import type { inspectCodexInstallation } from "@hapsland/administration/onboarding/codex-installation"
import { formatReviewFeedback } from "@hapsland/delivery-output/feedback/message"
import { SetupOperation } from "@hapsland/administration/onboarding/setup-request"
import { parseInvocation, type ClientArguments } from "@hapsland/administration/cli-command"
import "effect/Schedule"
import { effectiveSessionAnalytics } from "@hapsland/runtime-inputs/configuration/resolve"
import * as Config from "effect/Config"
import * as ConfigProvider from "effect/ConfigProvider"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as Redacted from "effect/Redacted"
import * as Schema from "effect/Schema"
import "node:os"
import { join } from "node:path"
import { readFileSync } from "node:fs"
import { execFileClosedStdin } from "@hapsland/runtime-environment/process/closed-stdin"
import { currentCommand, runtimeVersion } from "@hapsland/runtime-environment/runtime/package-runtime"
import { machineClockLayer } from "@hapsland/runtime-environment/runtime/machine-clock"
import { discoverWorkingTreeRoot, rootRelativePath } from "@hapsland/native-observation/repository/root"
import { selectFile } from "@hapsland/runtime-inputs/configuration/decision"
import {
  DEFAULT_CREDENTIAL_ENV_VAR,
  loadReviewSettings,
  type ReviewSettings
} from "@hapsland/review-definition/runtime/review-config"
import { inspectResidentEffect } from "@hapsland/resident-transport/resident/client"
import {
  logoutCredential,
  resolveCredential,
  runSecretService,
  saveCredential
} from "@hapsland/credential-storage/credentials/secret-service"
import { readActivity } from "@hapsland/activity-observation/activity/status"

const localFailureMessage = (cause: unknown): string => {
  if (typeof cause === "object" && cause !== null && "reason" in cause && typeof cause.reason === "string") {
    const source = "source" in cause ? String(cause.source) : "Setup"
    const field = "field" in cause ? String(cause.field) : "$"
    return `${source}:${field}: ${cause.reason}`
  }
  return cause instanceof Error ? cause.message : "Local operation failed"
}

const statusExitCodes = new Map<string, number>([
  ["unsupported", 3],
  ["conflict", 4],
  ["proposal-mismatch", 4],
  ["partial", 5],
  ...[
    "deletion-failed",
    "needs-user-action",
    "locked",
    "interaction-required",
    "unavailable",
    "timed-out",
    "indeterminate",
    "busy",
    "cancelled",
    "invalid",
    "incomplete",
    "inconclusive"
  ].map((status): [string, number] => [status, 6])
])
const exitCodeForResult = (record: object): number => {
  const status = "status" in record ? record.status : undefined
  const statusCode = typeof status === "string" ? statusExitCodes.get(status) : undefined
  return statusCode ?? ("error" in record ? 2 : 0)
}

const assignResultExitCode = (output: unknown): void => {
  if (typeof output === "object" && output !== null) {
    process.exitCode = exitCodeForResult(output)
  }
}

let invocation: Awaited<ReturnType<typeof parseInvocation>>
try {
  invocation = await parseInvocation(process.argv.slice(2))
} catch (cause) {
  process.stderr.write(`${(cause instanceof Error ? cause.message : "Invalid CLI arguments").slice(0, 1400)}\n`)
  process.exit(6)
}
if (invocation === undefined) process.exit(0)
const cliOptions = invocation.kind === "automation" ? invocation.options : undefined
const cliSwitch = (name: string): boolean =>
  cliOptions !== undefined && name in cliOptions && cliOptions[name as keyof typeof cliOptions] === true

const readStdin = Effect.try({ try: () => readFileSync(0, "utf8"), catch: () => new Error("could not read stdin") })

const decodeJson = (input: string) =>
  Effect.try({ try: () => JSON.parse(input) as unknown, catch: () => new Error("stdin is not valid JSON") })

const ReviewOperation = Schema.Union([
  Schema.Struct({ version: Schema.Literal(1), operation: Schema.Literal("credentials"), cwd: Schema.String }),
  Schema.Struct({
    version: Schema.Literal(1),
    operation: Schema.Literal("status"),
    cwd: Schema.String,
    sessionId: Schema.optionalKey(Schema.NonEmptyString),
    format: Schema.optionalKey(Schema.Literals(["json", "human"]))
  }),
  Schema.Struct({
    version: Schema.Literal(1),
    operation: Schema.Literal("explain"),
    cwd: Schema.String,
    path: Schema.String
  })
])
type ReviewOperation = typeof ReviewOperation.Type

const installationOperationsFor = <const Fields extends Schema.Struct.Fields>(fields: Fields) =>
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

const InstallationOperation = Schema.Union([
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
type InstallationOperation = typeof InstallationOperation.Type

const FirstReviewDemoOperation = Schema.Struct({
  version: Schema.Literal(1),
  operation: Schema.Literal("demo"),
  selection: Schema.Literals(["preview", "live", "cancel"]),
  codexHome: Schema.optionalKey(Schema.NonEmptyString),
  codexExecutable: Schema.optionalKey(Schema.NonEmptyString),
  demoId: Schema.optionalKey(Schema.NonEmptyString),
  selectionDigest: Schema.optionalKey(Schema.String.check(Schema.isPattern(/^[a-f0-9]{64}$/)))
})
type FirstReviewDemoOperation = typeof FirstReviewDemoOperation.Type

const forcedOperation = (): ReviewOperation["operation"] | undefined => {
  if (cliSwitch("credentials")) {
    return "credentials"
  }
  if (cliSwitch("status")) {
    return "status"
  }
  if (cliSwitch("explain")) {
    return "explain"
  }
  return undefined
}

const forcedInstallationOperation = (): InstallationOperation["operation"] | undefined => {
  if (cliSwitch("doctor")) return "doctor"
  if (cliSwitch("install-preview")) return "install-preview"
  if (cliSwitch("install")) return "install"
  if (cliSwitch("update-preview")) return "update-preview"
  if (cliSwitch("update")) return "update"
  if (cliSwitch("uninstall")) return "uninstall"
  return undefined
}

const decodeSetupOperation = (input: string) =>
  decodeJson(input).pipe(Effect.flatMap(Schema.decodeUnknownEffect(SetupOperation, { onExcessProperty: "error" })))

const decodeFirstReviewDemoOperation = (input: string) =>
  decodeJson(input).pipe(
    Effect.flatMap(Schema.decodeUnknownEffect(FirstReviewDemoOperation, { onExcessProperty: "error" }))
  )

const decodeInstallationOperation = (input: string, forced: InstallationOperation["operation"] | undefined) =>
  decodeJson(input).pipe(
    Effect.flatMap(Schema.decodeUnknownEffect(InstallationOperation, { onExcessProperty: "error" })),
    Effect.flatMap((operation) =>
      forced !== undefined && operation.operation !== forced
        ? Effect.fail(new Error("installation operation flag does not match the request"))
        : Effect.succeed(operation)
    )
  )

type EvaluationOperationName = "plan" | "run" | "report"

const forcedEvaluationOperation = (): EvaluationOperationName | undefined => {
  if (cliSwitch("evaluation-plan")) return "plan"
  if (cliSwitch("evaluation-run")) return "run"
  if (cliSwitch("evaluation-report")) return "report"
  return undefined
}

const forcedStatusFormat = (): "human" | undefined => (cliSwitch("human") ? "human" : undefined)

const decodeOperation = (input: string, forced: ReviewOperation["operation"] | undefined) =>
  decodeJson(input).pipe(
    Effect.flatMap((value) => Schema.decodeUnknownEffect(ReviewOperation, { onExcessProperty: "error" })(value)),
    Effect.flatMap((operation) =>
      forced !== undefined && operation.operation !== forced
        ? Effect.fail(new Error("operation flag does not match the request"))
        : Effect.succeed(operation)
    )
  )

const assertNever = (value: never): never => {
  throw new Error(`unsupported consent operation: ${String(value)}`)
}

const fileSelectionReadiness = (settings: ReviewSettings) => {
  const includesEmpty = settings.configuration.policy.includes.length === 0
  const userExcludeAll = settings.configuration.policy.excludes.some(
    (entry) => entry.origin.layer === "user" && entry.value === "**/*"
  )
  const excludeAll = settings.configuration.policy.excludes.some((entry) => entry.value === "**/*")
  const selected = selectFile({ protected: false, excluded: excludeAll, includesEmpty, included: true }) === "selected"
  return {
    selected,
    observed: includesEmpty
      ? "effective include list selects no files"
      : userExcludeAll
        ? "user file settings exclude all files"
        : excludeAll
          ? "effective file settings exclude all files"
          : "effective file settings loaded"
  }
}

const isControlledReviewer = cliSwitch("controlled-reviewer")
const requestedOperation = forcedOperation()
const requestedInstallationOperation = forcedInstallationOperation()
const requestedEvaluationOperation = forcedEvaluationOperation()

type StatusOperation = Extract<ReviewOperation, { readonly operation: "status" }>
type StatusCredential = Effect.Success<ReturnType<typeof resolveCredential>>
const statusFileSelection = (settings: ReviewSettings | undefined): string =>
  settings === undefined ? "unavailable" : fileSelectionReadiness(settings).selected ? "configured" : "none"
const statusReadiness = (settings: ReviewSettings | undefined, credential: StatusCredential) => {
  const configuration = settings === undefined ? "invalid" : "ready"
  const fileSelection = statusFileSelection(settings)
  const present = credential.status === "present"
  return {
    status: configuration === "ready" && present && fileSelection === "configured" ? "ready" : "not-ready",
    configuration,
    fileSelection,
    credentials: {
      envVar: settings?.credentialEnvVar ?? DEFAULT_CREDENTIAL_ENV_VAR,
      present,
      source: credential.source,
      ...(credential.file === undefined ? {} : { file: credential.file }),
      status: credential.status
    }
  }
}
const statusCredential = Effect.fn("Cli.statusCredential")(function* (settings: ReviewSettings | undefined) {
  return yield* resolveCredential({
    envVar: settings?.credentialEnvVar ?? DEFAULT_CREDENTIAL_ENV_VAR,
    ...(settings === undefined ? {} : { root: settings.configuration.policy.root }),
    environmentOnly:
      settings !== undefined && settings.configuration.policy.credentialEnvVar.origin.layer !== "built-in"
  })
})
const statusConfiguration = Effect.fn("Cli.statusConfiguration")(function* (
  root: string,
  userConfigPath: string | undefined
) {
  const configuration = yield* loadReviewSettings(root, userConfigPath === undefined ? {} : { userConfigPath }).pipe(
    Effect.result
  )
  return configuration._tag === "Success" ? configuration.success : undefined
})
const humanStatusReceipt = (
  operation: StatusOperation,
  output: ReturnType<typeof statusOutput>,
  formatActivity: typeof formatActivityHuman,
  formatAnalytics: typeof formatAnalyticsHuman
) =>
  `${formatStatusOutcome(output.readiness.status, `readiness: ${output.readiness.status} (configuration=${output.readiness.configuration}, files=${output.readiness.fileSelection}, credentials=${output.readiness.credentials.present ? "present" : "absent"})`)}\n${formatActivity(operation.sessionId ?? "<session id required>", output.activity)}\n${formatAnalytics(output.analytics)}`
const statusOutput = (
  operation: StatusOperation,
  root: string,
  readiness: ReturnType<typeof statusReadiness>,
  residentActivity: ReturnType<typeof readActivity>,
  analytics: ReturnType<typeof readAnalytics>
) => ({
  version: 1,
  operation: "status",
  repository: { canonicalRoot: root },
  ...(operation.sessionId === undefined ? {} : { sessionId: operation.sessionId }),
  readiness,
  activity: residentActivity,
  analytics,
  activitySource: "resident-v1"
})
const runStatusOperation = Effect.fn("Cli.runStatusOperation")(function* (
  operation: StatusOperation,
  root: string,
  activityPath: string,
  userConfigPath: string | undefined
) {
  const settings = yield* statusConfiguration(root, userConfigPath)
  const { readAnalytics, formatAnalyticsHuman } = yield* Effect.promise(
    () => import("@hapsland/activity-observation/activity/analytics")
  )
  const { formatActivityHuman } = yield* Effect.promise(() => import("@hapsland/activity-observation/activity/status"))
  const credential = yield* statusCredential(settings)
  const readiness = statusReadiness(settings, credential)
  const resident = yield* inspectResidentEffect()
  const residentActivity = readActivity({
    statePath: activityPath,
    root,
    sessionId: operation.sessionId ?? "",
    resident
  })
  const analytics = readAnalytics({
    enabled: settings !== undefined && effectiveSessionAnalytics(settings.configuration.policy),
    statePath: activityPath,
    root,
    sessionId: operation.sessionId ?? ""
  })
  const output = statusOutput(operation, root, readiness, residentActivity, analytics)
  return operation.format === "human"
    ? humanStatusReceipt(operation, output, formatActivityHuman, formatAnalyticsHuman)
    : output
})

const runOperation = Effect.fn("Cli.runOperation")(function* (
  operation: ReviewOperation,
  statePath: string,
  activityPath: string,
  userConfigPath: string | undefined
) {
  const cwd = operation.cwd
  const root = yield* discoverWorkingTreeRoot(cwd)
  /**
   * Status is observational: a malformed current configuration must be
   * reported as readiness state, not prevent an explicit session receipt
   * from being read.  It also deliberately stops before constructing any
   * review/backend layer.
   */
  if (operation.operation === "status") return yield* runStatusOperation(operation, root, activityPath, userConfigPath)

  const settings = yield* loadReviewSettings(root, userConfigPath === undefined ? {} : { userConfigPath })
  const credentialEnvVar = settings.credentialEnvVar
  switch (operation.operation) {
    case "credentials": {
      const resolution = yield* resolveCredential({
        envVar: credentialEnvVar,
        root,
        environmentOnly: settings.configuration.policy.credentialEnvVar.origin.layer !== "built-in"
      })
      return {
        version: 1,
        operation: "credentials",
        credentialEnvVar,
        present: resolution.status === "present",
        source: resolution.source,
        ...(resolution.file === undefined ? {} : { file: resolution.file }),
        status: resolution.status
      }
    }
    case "explain": {
      const { explainPath, formatPathExplanation } = yield* Effect.promise(
        () => import("@hapsland/administration/explanation/index")
      )
      const relativePath = rootRelativePath(root, cwd, operation.path)
      const policy = settings.configuration.policy
      const explanation = explainPath(policy, relativePath ?? operation.path)
      return {
        version: 1,
        operation: "explain",
        repository: { canonicalRoot: root },
        explanation,
        text: formatPathExplanation(explanation)
      }
    }
    default:
      return assertNever(operation)
  }
})

const installationReinstall = (operation: InstallationOperation) =>
  "reinstall" in operation && operation.reinstall === true ? { reinstall: true } : {}
const installationDigest = (operation: InstallationOperation) =>
  "proposalDigest" in operation && operation.proposalDigest !== undefined
    ? { proposalDigest: operation.proposalDigest }
    : {}

const doctorRepositoryChecks = Effect.fn("Cli.doctorRepositoryChecks")(function* (
  cwd: string,
  userConfigPath: string | undefined
) {
  const rootResult = yield* discoverWorkingTreeRoot(cwd).pipe(Effect.result)
  const { credentialDiagnostic } = yield* Effect.promise(
    () => import("@hapsland/administration/onboarding/credential-diagnostics")
  )
  if (rootResult._tag === "Failure") {
    return {
      repository: {
        stage: "file-selection",
        status: "unsupported",
        observed: "working tree could not be discovered",
        action: "run doctor from a supported Git working tree"
      } satisfies DoctorCheck,
      credential: {
        stage: "credential-accessibility",
        status: "unknown",
        observed: {
          inspectedContext: "doctor-process",
          configuredEnvironmentVariable: "unknown",
          doctorProcessEnvironment: "unknown-not-inspected",
          actualHookAccessibility: "unknown",
          savedCredentialAccessibility: "unknown-not-inspected-by-this-version",
          reason: "repository configuration is unavailable"
        },
        action: "fix repository discovery, then rerun doctor without passing any secret"
      } satisfies DoctorCheck
    }
  }
  const settingsResult = yield* loadReviewSettings(
    rootResult.success,
    userConfigPath === undefined ? {} : { userConfigPath }
  ).pipe(Effect.result)
  if (settingsResult._tag === "Failure") {
    return {
      repository: {
        stage: "file-selection",
        status: "conflict",
        observed: "review configuration is invalid",
        action: "repair the reported review configuration, then rerun doctor"
      } satisfies DoctorCheck,
      credential: {
        stage: "credential-accessibility",
        status: "unknown",
        observed: {
          inspectedContext: "doctor-process",
          configuredEnvironmentVariable: "unknown",
          doctorProcessEnvironment: "unknown-not-inspected",
          actualHookAccessibility: "unknown",
          savedCredentialAccessibility: "unknown-not-inspected-by-this-version",
          reason: "credential selection could not be resolved"
        },
        action: "repair review configuration, then rerun doctor without passing any secret"
      } satisfies DoctorCheck
    }
  }
  const settings = settingsResult.success
  const doctorEnvironmentCredential = yield* Config.option(Config.Redacted(settings.credentialEnvVar)).pipe(
    Effect.map((value) => Option.isSome(value) && Redacted.value(value.value).length > 0)
  )
  const credential = yield* resolveCredential({
    envVar: settings.credentialEnvVar,
    root: settings.configuration.policy.root,
    environmentOnly: settings.configuration.policy.credentialEnvVar.origin.layer !== "built-in"
  })
  const fileSelection = fileSelectionReadiness(settings)
  return {
    repository: {
      stage: "file-selection",
      status: fileSelection.selected ? "ready" : "missing",
      observed: fileSelection.observed,
      ...(!fileSelection.selected
        ? { action: "adjust user file includes or excludes to select the files you want reviewed" }
        : {})
    } satisfies DoctorCheck,
    credential: credentialDiagnostic(credential, settings.credentialEnvVar, doctorEnvironmentCredential)
  }
})

const claudeInstallationRequest = (operation: Extract<InstallationOperation, { host: "claude" }>) => {
  return {
    ...installationReinstall(operation),
    ...(operation.claudeHome === undefined ? {} : { claudeHome: operation.claudeHome }),
    ...(!("claudeExecutable" in operation) || operation.claudeExecutable === undefined
      ? {}
      : { claudeExecutable: operation.claudeExecutable }),
    ...installationDigest(operation)
  }
}

const dispatchClaudeInstallation = Effect.fn("Cli.dispatchClaudeInstallation")(function* (
  operation: Extract<InstallationOperation, { host: "claude" }>
) {
  const {
    diagnoseClaudeIntegration,
    previewClaudeInstallation,
    installClaudeIntegration,
    previewClaudeUpdate,
    updateClaudeIntegration,
    uninstallClaudeIntegration
  } = yield* Effect.promise(() => import("@hapsland/administration/onboarding/claude-installation"))
  const claudeInstallationHandlers = {
    doctor: diagnoseClaudeIntegration,
    "install-preview": previewClaudeInstallation,
    install: installClaudeIntegration,
    "update-preview": previewClaudeUpdate,
    update: updateClaudeIntegration,
    uninstall: uninstallClaudeIntegration
  }

  return yield* claudeInstallationHandlers[operation.operation](claudeInstallationRequest(operation))
})

const opencodeInstallationRequest = (operation: Extract<InstallationOperation, { host: "opencode" }>) => {
  return {
    ...(operation.opencodeConfigHome === undefined ? {} : { opencodeConfigHome: operation.opencodeConfigHome }),
    ...(!("opencodeExecutable" in operation) || operation.opencodeExecutable === undefined
      ? {}
      : { opencodeExecutable: operation.opencodeExecutable }),
    ...installationDigest(operation)
  }
}

const dispatchOpencodeInstallation = Effect.fn("Cli.dispatchOpencodeInstallation")(function* (
  operation: Extract<InstallationOperation, { host: "opencode" }>
) {
  const {
    diagnoseOpenCodeIntegration,
    previewOpenCodeInstallation,
    installOpenCodeIntegration,
    previewOpenCodeUpdate,
    updateOpenCodeIntegration,
    uninstallOpenCodeIntegration
  } = yield* Effect.promise(() => import("@hapsland/administration/onboarding/opencode-installation"))
  const opencodeInstallationHandlers = {
    doctor: diagnoseOpenCodeIntegration,
    "install-preview": (request: ReturnType<typeof opencodeInstallationRequest>) =>
      Effect.succeed(previewOpenCodeInstallation(request)),
    install: installOpenCodeIntegration,
    "update-preview": (request: ReturnType<typeof opencodeInstallationRequest>) =>
      Effect.succeed(previewOpenCodeUpdate(request)),
    update: updateOpenCodeIntegration,
    uninstall: uninstallOpenCodeIntegration
  }

  return yield* opencodeInstallationHandlers[operation.operation](opencodeInstallationRequest(operation))
})

type CodexInstallationOperation = Exclude<InstallationOperation, { host: "claude" | "opencode" | "pi" }>
const codexInstallationRequest = (operation: CodexInstallationOperation) => {
  return {
    ...installationReinstall(operation),
    ...(operation.codexHome === undefined ? {} : { codexHome: operation.codexHome }),
    ...(!("codexExecutable" in operation) || operation.codexExecutable === undefined
      ? {}
      : { codexExecutable: operation.codexExecutable }),
    ...installationDigest(operation)
  }
}

const dispatchCodexInstallation = Effect.fn("Cli.dispatchCodexInstallation")(function* (
  operation: CodexInstallationOperation,
  userConfigPath: string | undefined
) {
  const request = codexInstallationRequest(operation)
  const {
    previewCodexInstallation,
    installCodexIntegration,
    previewCodexUpdate,
    updateCodexIntegration,
    uninstallCodexIntegration
  } = yield* Effect.promise(() => import("@hapsland/administration/onboarding/codex-installation"))
  switch (operation.operation) {
    case "doctor": {
      const { diagnoseInstalledIntegration } = yield* Effect.promise(
        () => import("@hapsland/administration/onboarding/doctor")
      )
      const repositoryResult = yield* doctorRepositoryChecks(operation.cwd, userConfigPath)
      return yield* diagnoseInstalledIntegration({
        installation: request,
        repository: repositoryResult.repository,
        credential: repositoryResult.credential
      })
    }
    case "install-preview":
      return yield* previewCodexInstallation(request)
    case "install":
      return yield* installCodexIntegration(request)
    case "update-preview":
      return yield* previewCodexUpdate(request)
    case "update":
      return yield* updateCodexIntegration(request)
    case "uninstall":
      return yield* uninstallCodexIntegration(request)
  }
})

const piInstallationDoctor = Effect.fn("Cli.piInstallationDoctor")(function* (
  request: Extract<InstallationOperation, { host: "pi" }>,
  cwd: string,
  userConfigPath: string | undefined
) {
  const { diagnosePiIntegration } = yield* Effect.promise(
    () => import("@hapsland/administration/onboarding/pi-installation")
  )
  const diagnosis = yield* diagnosePiIntegration(request)
  const repository = yield* doctorRepositoryChecks(cwd, userConfigPath)
  return {
    ...diagnosis,
    checks: [
      ...diagnosis.checks.filter((check) => check.stage !== "credential"),
      repository.repository,
      repository.credential
    ]
  }
})
const dispatchPiInstallation = Effect.fn("Cli.dispatchPiInstallation")(function* (
  operation: Extract<InstallationOperation, { host: "pi" }>,
  userConfigPath: string | undefined
) {
  const { previewPiInstallation, installPiIntegration, previewPiUpdate, updatePiIntegration, uninstallPiIntegration } =
    yield* Effect.promise(() => import("@hapsland/administration/onboarding/pi-installation"))
  const piInstallationHandlers = {
    "install-preview": previewPiInstallation,
    install: installPiIntegration,
    "update-preview": previewPiUpdate,
    update: updatePiIntegration,
    uninstall: uninstallPiIntegration
  }

  const request = { ...operation, ...installationDigest(operation), ...installationReinstall(operation) }
  if (operation.operation === "doctor") return yield* piInstallationDoctor(request, operation.cwd, userConfigPath)
  return yield* piInstallationHandlers[operation.operation](request)
})

const dispatchInstallation = Effect.fn("Cli.dispatchInstallation")(function* (
  operation: InstallationOperation,
  userConfigPath: string | undefined
) {
  if (operation.host === "pi") return yield* dispatchPiInstallation(operation, userConfigPath)
  if (operation.host === "claude") return yield* dispatchClaudeInstallation(operation)
  if (operation.host === "opencode") return yield* dispatchOpencodeInstallation(operation)
  return yield* dispatchCodexInstallation(operation, userConfigPath)
})

const evaluationFlagMatches = (value: unknown): boolean => {
  if (typeof value !== "object" || value === null || !("operation" in value)) return false
  return requestedEvaluationOperation === undefined || value.operation === requestedEvaluationOperation
}

const runJsonEvaluation = Effect.fn("Cli.runJsonEvaluation")(function* (input: string) {
  const { runEvaluationCommand } = yield* Effect.promise(() => import("@hapsland/administration/evaluation/command"))
  const evaluationInput = yield* decodeJson(input)
  if (!evaluationFlagMatches(evaluationInput)) {
    return {
      version: 1,
      error: {
        code: "invalid_request",
        message: "evaluation operation flag does not match the version-1 evaluation contract"
      }
    }
  }
  return yield* runEvaluationCommand(evaluationInput, {
    allowLive: cliSwitch("evaluation-live"),
    credentialEnvVar: yield* Config.NonEmptyString("EVALUATION_CREDENTIAL_ENV").pipe(
      Config.withDefault(DEFAULT_CREDENTIAL_ENV_VAR)
    ),
    ...(isControlledReviewer ? { controlled: yield* controlledOptions } : {})
  })
})

const runJsonSetup = Effect.fn("Cli.runJsonSetup")(function* (
  input: string,
  statePath: string,
  userConfigPath: string | undefined
) {
  const operation: SetupOperation = yield* decodeSetupOperation(input)
  const { runSetup } = yield* Effect.promise(() => import("@hapsland/administration/onboarding/setup"))
  const { readMaskedCredential } = yield* Effect.promise(
    () => import("@hapsland/administration/credentials/masked-input")
  )
  return yield* runSetup(operation, {
    statePath,
    ...(userConfigPath === undefined ? {} : { userConfigPath }),
    ...(operation.interactive === true ? { readCredential: readMaskedCredential } : {})
  })
})

const runJsonDemo = Effect.fn("Cli.runJsonDemo")(function* (input: string) {
  const { runFirstReviewDemo } = yield* Effect.promise(
    () => import("@hapsland/administration/onboarding/first-review-demo")
  )
  const operation: FirstReviewDemoOperation = yield* decodeFirstReviewDemoOperation(input)
  const demoStatePath = yield* Config.NonEmptyString("REVIEW_DEMO_STATE_PATH").pipe(
    Config.withDefault(join(HAPSLAND_STATE_DIRECTORY, "demos"))
  )
  return yield* runFirstReviewDemo(operation, { statePath: demoStatePath })
})

const runAdministrativeOperation = Effect.fn("Cli.runAdministrativeOperation")(function* (
  input: string,
  statePath: string,
  activityPath: string,
  userConfigPath: string | undefined
) {
  const decodedOperation = yield* decodeOperation(input, requestedOperation)
  const operation =
    forcedStatusFormat() !== undefined && decodedOperation.operation === "status"
      ? { ...decodedOperation, format: "human" as const }
      : decodedOperation
  return yield* runOperation(operation, statePath, activityPath, userConfigPath)
})

const readProgramInput = Effect.fn("Cli.readProgramInput")(function* () {
  const input = yield* readStdin
  const statePath = yield* statePathConfig
  const activityPath = yield* activityPathConfig
  const userConfigPath = Option.getOrUndefined(yield* userConfigPathConfig)
  return { input, statePath, activityPath, userConfigPath }
})
type ProgramInput = Effect.Success<ReturnType<typeof readProgramInput>>

const jsonRoute = (input: string) => {
  const routes = [
    {
      kind: "evaluation",
      requested: requestedEvaluationOperation !== undefined || /"operation"\s*:\s*"(?:plan|run|report)"/.test(input)
    },
    { kind: "setup", requested: cliSwitch("setup") || /"operation"\s*:\s*"setup"/.test(input) },
    { kind: "demo", requested: cliSwitch("demo") || /"operation"\s*:\s*"demo"/.test(input) },
    {
      kind: "installation",
      requested:
        requestedInstallationOperation !== undefined ||
        /"operation"\s*:\s*"(?:doctor|install-preview|install|update-preview|update|uninstall)"/.test(input)
    },
    {
      kind: "administrative",
      requested: requestedOperation !== undefined || /"operation"\s*:\s*"(?:credentials|status|explain)"/.test(input)
    }
  ] as const
  return routes.find((route) => route.requested)?.kind ?? "unsupported"
}
const runJsonInstallation = Effect.fn("Cli.runJsonInstallation")(function* (context: ProgramInput) {
  const operation = yield* decodeInstallationOperation(context.input, requestedInstallationOperation)
  return yield* dispatchInstallation(operation, context.userConfigPath)
})
const jsonHandlers = {
  evaluation: (context: ProgramInput) => runJsonEvaluation(context.input),
  setup: (context: ProgramInput) => runJsonSetup(context.input, context.statePath, context.userConfigPath),
  demo: (context: ProgramInput) => runJsonDemo(context.input),
  installation: runJsonInstallation,
  administrative: (context: ProgramInput) =>
    runAdministrativeOperation(context.input, context.statePath, context.activityPath, context.userConfigPath),
  unsupported: () => Effect.succeed({ version: 1, error: { code: "invalid_request", message: "unsupported command" } })
}
const dispatchJsonInput = Effect.fn("Cli.dispatchJsonInput")(function* (context: ProgramInput) {
  return yield* jsonHandlers[jsonRoute(context.input)](context)
})

const program = Effect.gen(function* () {
  return yield* dispatchJsonInput(yield* readProgramInput())
}).pipe(
  Effect.catchCause(() =>
    Effect.succeed({
      version: 1,
      error: { code: "invalid_request", message: "input does not satisfy a supported command contract" }
    })
  )
)

const savedCredentialAction = (status: Effect.Success<ReturnType<typeof saveCredential>>["status"]) => ({
  ...(status === "indeterminate"
    ? { action: "credential replacement may have committed; retry login or logout before review" }
    : status === "busy"
      ? { action: "another credential change is still running; retry" }
      : {})
})
const savedCredentialOutput = (result: Effect.Success<ReturnType<typeof saveCredential>>) => {
  return {
    version: 1,
    operation: "login",
    status: result.status,
    stored: result.status === "stored",
    paidVerificationPerformed: false,
    previousCredentialPreserved: result.status !== "stored" && result.status !== "indeterminate",
    replacementOutcome: result.status,
    savedCredentialUse: result.state.savedUseSuspended ? "suspended" : "active",
    stateLock: result.stateLock,
    ...savedCredentialAction(result.status),
    generation: result.state.generation
  }
}
const loginProbeAction = (status: string): string => {
  return status === "locked"
    ? "unlock the native credential store in the desktop session, then retry"
    : status === "interaction-required"
      ? "approve native credential access from this explicit login command, then retry"
      : "reinstall an archive containing the native helper for this platform if it is missing, or make the native credential store available; then retry"
}
const loginCredential = Effect.fn("Cli.loginCredential")(function* () {
  const { readMaskedCredential } = yield* Effect.promise(
    () => import("@hapsland/administration/credentials/masked-input")
  )
  const probe = yield* runSecretService("probe", { deadlineMs: 2_000, allowInteraction: true })
  if (probe.status !== "available") {
    return { version: 1, operation: "login", status: probe.status, action: loginProbeAction(probe.status) }
  }
  const inputTask: Effect.Effect<string, unknown> = cliSwitch("credential-stdin")
    ? Effect.try(() => readFileSync(0, "utf8").replace(/\r?\n$/, ""))
    : readMaskedCredential()
  const input = yield* inputTask.pipe(Effect.result)
  if (input._tag === "Failure") {
    return {
      version: 1,
      operation: "login",
      status: "cancelled",
      preservedPreviousCredential: true,
      action: "retry in a terminal or explicitly use --credential-stdin"
    }
  }
  let value = input.success
  const result = yield* saveCredential(value)
  value = ""
  return savedCredentialOutput(result)
})
const credentialEnvironmentName = Effect.fn("Cli.credentialEnvironmentName")(function* () {
  let environmentName: string = DEFAULT_CREDENTIAL_ENV_VAR
  try {
    const repository = yield* execFileClosedStdin("git", ["rev-parse", "--show-toplevel"], {
      cwd: process.cwd(),
      env: process.env,
      timeout: 1_000,
      maxBuffer: 1024 * 1024
    })
    const root = repository.succeeded ? repository.stdout.trim() : ""
    if (root.length > 0) {
      environmentName = yield* loadReviewSettings(root).pipe(
        Effect.map((settings) => settings.credentialEnvVar),
        Effect.catch(() => Effect.succeed(DEFAULT_CREDENTIAL_ENV_VAR))
      )
    }
  } catch {
    /* The global default remains the only known environment override. */
  }
  return environmentName
})
const logoutStatus = (status: Effect.Success<ReturnType<typeof logoutCredential>>["status"]) => {
  return status === "busy" || status === "indeterminate"
    ? status
    : status === "deleted" || status === "missing"
      ? "logged-out"
      : "deletion-failed"
}
const logoutAction = (status: Effect.Success<ReturnType<typeof logoutCredential>>["status"]) => ({
  ...(status === "busy"
    ? { action: "another credential change is still running; retry" }
    : status === "indeterminate"
      ? { action: "saved credential deletion may have committed; retry logout to reconcile suspended saved use" }
      : {})
})
const logoutSavedCredential = Effect.fn("Cli.logoutSavedCredential")(function* () {
  const result = yield* logoutCredential()
  const environmentName = yield* credentialEnvironmentName()
  const environmentActive = yield* Config.option(Config.Redacted(environmentName)).pipe(
    Effect.map((value) => Option.isSome(value) && Redacted.value(value.value).length > 0),
    Effect.catch(() => Effect.succeed(false))
  )
  return {
    version: 1,
    operation: "logout",
    status: logoutStatus(result.status),
    stateLock: result.stateLock,
    savedCredentialUse: result.state.savedUseSuspended ? "suspended" : "absent",
    generation: result.state.generation,
    grantsPreserved: true,
    sentRequestsRecalled: false,
    ...logoutAction(result.status),
    environmentOverride: {
      envVar: environmentName,
      active: environmentActive,
      warning: environmentActive
        ? `${environmentName} remains active and takes precedence over saved storage`
        : undefined
    }
  }
})
const runCredentialCommand = Effect.fn("Cli.credentialCommand")(function* () {
  return cliSwitch("login") ? yield* loginCredential() : yield* logoutSavedCredential()
})

const isCredentialCommand = cliSwitch("login") || cliSwitch("logout")
const processConfigurationLayer = ConfigProvider.layer(ConfigProvider.fromEnv({ preserveEmptyStrings: true }))

let clientArguments: ClientArguments | undefined
const flagValue = (name: string): string | undefined => clientArguments?.flags.get(name)
const positionalHost = () => clientArguments?.host
const selectedHost = (): SetupClient => clientArguments?.host ?? "codex"
const hostFields = (host: SetupClient) => profileFields(host, clientArguments?.flags ?? new Map())

const pilotConfiguration = Effect.fn("InteractiveSetup.configuration")(function* () {
  const configuredStatePath = Option.getOrUndefined(yield* Config.option(Config.NonEmptyString("REVIEW_STATE_PATH")))
  const statePath =
    configuredStatePath ??
    (yield* Config.NonEmptyString("REVIEW_CONSENT_FILE").pipe(
      Config.withDefault(join(HAPSLAND_CONFIG_DIRECTORY, "consent"))
    ))
  const userConfigPath = Option.getOrUndefined(yield* Config.option(Config.NonEmptyString("REVIEW_USER_CONFIG_PATH")))
  return { statePath, ...(userConfigPath === undefined ? {} : { userConfigPath }) }
})
let setupInventoryShown = false
const writeSetupRuleInventory = Effect.fn("InteractiveSetup.ruleInventory")(function* (
  terminal: boolean,
  cwd: string,
  configuration: Effect.Success<ReturnType<typeof pilotConfiguration>> | undefined
) {
  if (terminal && !setupInventoryShown) {
    setupInventoryShown = true
    const { loadRuleInventory, formatRuleInventory } = yield* Effect.promise(
      () => import("@hapsland/administration/rules/inventory")
    )
    const root = yield* discoverWorkingTreeRoot(cwd)
    const inventory = yield* loadRuleInventory(root, configuration ?? {}).pipe(Effect.result)
    if (inventory._tag === "Success") process.stderr.write(formatRuleInventory(inventory.success))
    else
      process.stderr.write(
        "Rule inventory unavailable; repair the connected rule files or configuration and run hapsland rules list.\n"
      )
  }
})
const pilotSetup = Effect.fn("InteractiveSetup.run")(function* (host: SetupClient) {
  const { runSetup } = yield* Effect.promise(() => import("@hapsland/administration/onboarding/setup"))
  const { readMaskedCredential } = yield* Effect.promise(
    () => import("@hapsland/administration/credentials/masked-input")
  )
  const { activateCurrentPackage } = yield* Effect.promise(
    () => import("@hapsland/administration/onboarding/client-lifecycle")
  )
  const { askConfirmation } = yield* Effect.promise(() => import("@hapsland/administration/onboarding/confirmation"))
  const { runPilotSetup } = yield* Effect.promise(() => import("@hapsland/administration/onboarding/pilot"))
  const terminal = Boolean(process.stdin.isTTY && process.stderr.isTTY)
  // Configuration is read only for an actual terminal setup, as in the direct CLI path.
  const configuration = terminal ? yield* pilotConfiguration() : undefined
  const cwd = process.cwd()
  const command = currentCommand()
  const result = yield* runPilotSetup(
    {
      terminal,
      host,
      fields: hostFields(host),
      cwd,
      platform: process.platform,
      newKey: clientArguments?.flags.has(NEW_KEY_FLAG) ?? false
    },
    {
      run: (request, entered) => {
        if (configuration === undefined) return Effect.fail(new Error("setup configuration unavailable"))
        return runSetup(request, {
          ...configuration,
          readCredential: () => readMaskedCredential().pipe(Effect.tap(() => Effect.sync(entered)))
        })
      },
      activate: activateCurrentPackage(currentCommand()),
      verifyCredential: Effect.gen(function* () {
        const { runGuidedCredentialCheck } = yield* Effect.promise(
          () => import("@hapsland/administration/onboarding/credential-verification")
        )
        yield* runGuidedCredentialCheck({
          cwd,
          host,
          platform: process.platform,
          ...(configuration?.userConfigPath === undefined ? {} : { userConfigPath: configuration.userConfigPath }),
          confirm: askConfirmation,
          readCredential: readMaskedCredential,
          write: (text) => {
            process.stderr.write(text)
          }
        })
      }).pipe(
        Effect.catch(() =>
          Effect.sync(() => {
            process.stderr.write(
              "[WARN] Key validity: not checked because verification preparation failed. The selected key was not removed.\n"
            )
          })
        )
      ),
      doctor: execFileClosedStdin(command.executable, [...command.args, "--doctor"], {
        cwd,
        env: process.env,
        maxBuffer: 1024 * 1024,
        input: JSON.stringify({ version: 1, operation: "doctor", cwd, ...hostFields(host) }),
        timeout: 10_000
      }),
      confirm: askConfirmation,
      write: (text) => {
        process.stderr.write(text)
      },
      exitCode: (code) => {
        process.exitCode = code
      }
    }
  )
  yield* writeSetupRuleInventory(terminal, cwd, configuration)
  return result
})

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
  const { previewCodexUpdate } = yield* Effect.promise(
    () => import("@hapsland/administration/onboarding/codex-installation")
  )
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
  const { previewClaudeInstallation } = yield* Effect.promise(
    () => import("@hapsland/administration/onboarding/claude-installation")
  )
  return (yield* previewClaudeInstallation(fields)).status === "unsupported" ? ("unavailable" as const) : status
})
const clientInstallationPorts = Effect.fn("InteractiveSetup.installationPorts")(function* () {
  const { hasPiRegistration, inspectPiInstallation } = yield* Effect.promise(
    () => import("@hapsland/administration/onboarding/pi-installation")
  )
  const { hasClaudeRegistration, inspectClaudeInstallation } = yield* Effect.promise(
    () => import("@hapsland/administration/onboarding/claude-installation")
  )
  const { hasCodexRegistration, inspectCodexInstallation } = yield* Effect.promise(
    () => import("@hapsland/administration/onboarding/codex-installation")
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
  const { previewPiInstallation } = yield* Effect.promise(
    () => import("@hapsland/administration/onboarding/pi-installation")
  )
  return (yield* previewPiInstallation(fields)).status === "unsupported" ? ("unavailable" as const) : initial
})
const clientStatuses = { pi: piClientStatus, claude: claudeClientStatus, codex: codexClientStatus }
const currentClientStatus = (fields: ReturnType<typeof hostFields>, initial: ClientChoice["status"]) =>
  clientStatuses[fields.host](fields, initial)
const setupClientChoice = Effect.fn("InteractiveSetup.clientChoice")(function* (host: SetupClient) {
  const fields = hostFields(host)
  const { inspect } = yield* clientInstallationPorts()
  const inspection = yield* inspect(fields)
  const decoded = Schema.decodeUnknownSync(
    Schema.Struct({ status: Schema.String, installed: Schema.optionalKey(Schema.Boolean) })
  )(inspection)
  const status = yield* currentClientStatus(fields, initialClientStatus(decoded))
  return { host, name: CLIENT_NAMES[host], status }
})
const chooseSetupClients = Effect.fn("InteractiveSetup.chooseClients")(function* () {
  const { selectSetupClients } = yield* Effect.promise(
    () => import("@hapsland/administration/onboarding/client-selection")
  )
  if (!process.stdin.isTTY || !process.stderr.isTTY)
    throw new Error("Guided setup needs a terminal. Use --setup JSON for automation.")
  const choices: ClientChoice[] = yield* Effect.forEach(SUPPORTED_CLIENTS, setupClientChoice)
  const { InteractionService } = yield* Effect.promise(() => import("@hapsland/administration/interaction/interaction"))
  const { withInteractionSession } = yield* Effect.promise(
    () => import("@hapsland/administration/interaction/interaction-session")
  )
  const hosts = yield* withInteractionSession(
    (input) => selectSetupClients(choices).pipe(Effect.provideService(InteractionService, input)),
    Effect.sync(() => {
      process.exitCode = 130
      return []
    })
  )
  if (hosts.length === 0) {
    process.stderr.write("No clients selected. No changes made.\n")
    return
  }
  for (const host of hosts) {
    const result = yield* pilotSetup(host).pipe(
      Effect.catchDefect((cause) => Effect.fail(cause)),
      Effect.result
    )
    if (result._tag === "Failure") {
      process.stderr.write(`${host}: ${result.failure instanceof Error ? result.failure.message : "Setup failed"}\n`)
      process.exitCode = 6
    }
  }
})

const validateArchiveSelection = (archive: string | undefined, version: string | undefined): void => {
  if (archive !== undefined && (version !== undefined || flagValue("--channel") !== undefined))
    throw new Error("select either --tarball or a registry channel/version")
}
const selectedRelease = (): ReleaseSelection => {
  const channel = flagValue("--channel") ?? DEFAULT_UPDATE_CHANNEL
  if (channel !== "latest" && channel !== "next") throw new Error("--channel must be latest or next")
  const archive = flagValue("--tarball")
  const version = flagValue("--version")
  validateArchiveSelection(archive, version)
  return archive === undefined
    ? { kind: "registry", channel, ...(version === undefined ? {} : { version }) }
    : { kind: "archive", path: archive }
}
const releaseSelectionLabel = (selection: ReleaseSelection): string =>
  selection.kind === "archive" ? selection.path : `@hapsland/hapsland@${selection.version ?? selection.channel}`
const updateExecutable = Effect.fn("InteractiveUpdate.target")(function* () {
  const { stageRelease } = yield* Effect.promise(() => import("@hapsland/administration/onboarding/distribution"))
  const target = flagValue("--target")
  if (target !== undefined) {
    if (["--tarball", "--version", "--channel"].some((flag) => flagValue(flag) !== undefined))
      throw new Error("--target cannot be combined with --tarball, --version, or --channel")
    return target
  }
  const selection = selectedRelease()
  process.stderr.write(
    `Select ${releaseSelectionLabel(selection)}; reuse a verified package when available. The previous package is retained.\n`
  )
  const staged = yield* stageRelease(selection)
  process.stderr.write(`Target ${staged.packageVersion}: ${staged.executable}\n`)
  return staged.executable
})
const explicitUpdateHost = (): SetupClient | undefined =>
  flagValue("--host") !== undefined || positionalHost() !== undefined ? selectedHost() : undefined
const reportUpdateFailure = (host: SetupClient, cause: unknown): void => {
  process.stderr.write(
    `${formatOutcome("error", `${host}: ${cause instanceof Error ? cause.message : "Update failed"}`)}\n`
  )
  process.exitCode = 6
}
const updateInteractive = Effect.fn("InteractiveUpdate.run")(function* () {
  const { registeredClients, invokeLifecycle, activatePackage } = yield* Effect.promise(
    () => import("@hapsland/administration/onboarding/client-lifecycle")
  )
  const { askConfirmation } = yield* Effect.promise(() => import("@hapsland/administration/onboarding/confirmation"))
  const { updateClients } = yield* Effect.promise(() => import("@hapsland/administration/onboarding/update"))
  return yield* updateClients(
    {
      terminal: Boolean(process.stdin.isTTY && process.stderr.isTTY),
      host: explicitUpdateHost(),
      flags: clientArguments?.flags ?? new Map(),
      environment: process.env
    },
    {
      fields: hostFields,
      registered: registeredClients,
      target: updateExecutable(),
      invoke: (executable, host, request, environment) =>
        invokeLifecycle(executable, [`--${request.operation}`], host, request, environment),
      activate: activatePackage,
      confirm: askConfirmation,
      write: (text) => {
        process.stderr.write(text)
      },
      reportFailure: reportUpdateFailure
    }
  )
})

const reportClientFailure = (host: SetupClient, cause: unknown) => {
  process.stderr.write(
    `${formatOutcome("error", `${host}: ${cause instanceof Error ? cause.message : "operation failed"}`)}\n`
  )
  process.exitCode = 6
}

const maintenanceInteractive = Effect.fn("InteractiveMaintenance.run")(function* (
  command: "repair" | "reinstall" | "uninstall"
) {
  const { maintainClients } = yield* Effect.promise(() => import("@hapsland/administration/onboarding/maintenance"))
  const { registeredClients, invokeLifecycle, activateCurrentPackage } = yield* Effect.promise(
    () => import("@hapsland/administration/onboarding/client-lifecycle")
  )
  const { askConfirmation } = yield* Effect.promise(() => import("@hapsland/administration/onboarding/confirmation"))
  const { installed, inspect } = yield* clientInstallationPorts()
  const ownCommand = currentCommand()
  return yield* maintainClients(
    command,
    {
      terminal: Boolean(process.stdin.isTTY && process.stderr.isTTY),
      host: clientArguments?.host,
      flags: clientArguments?.flags ?? new Map(),
      registered: registeredClients
    },
    {
      fields: hostFields,
      installed,
      inspect,
      invoke: (host, request) =>
        invokeLifecycle(ownCommand.executable, [...ownCommand.args, `--${request.operation}`], host, request),
      activate: activateCurrentPackage(currentCommand()),
      confirm: askConfirmation,
      write: (text) => {
        process.stderr.write(text)
      },
      reportFailure: reportClientFailure
    }
  )
})

const diagnoseClientProcess = Effect.fn("HumanDoctor.diagnoseClient")(function* (host: SetupClient) {
  const command = currentCommand()
  const result = yield* execFileClosedStdin(command.executable, [...command.args, "--doctor"], {
    input: JSON.stringify({ version: 1, operation: "doctor", cwd: process.cwd(), ...hostFields(host) }),
    env: process.env,
    timeout: 10_000,
    maxBuffer: 1024 * 1024
  })
  if (result.timedOut) return yield* Effect.fail(new Error("doctor request deadline exceeded"))
  const diagnosis: unknown = yield* Effect.try(() => JSON.parse(result.stdout))
  const checked = yield* Schema.decodeUnknownEffect(Schema.Struct({ status: Schema.String }))(diagnosis)
  return { diagnosis, status: checked.status, exitCode: result.exitCode }
})

if (invocation.kind === "dashboard") {
  const { runInspectionDashboard } = await import("@hapsland/administration/inspection/command")
  runInspectionDashboard(invocation)
} else if (cliSwitch("feedback-preview")) {
  process.stdout.write(
    "Synthetic example; no review was run.\n\n" +
      formatReviewFeedback([
        {
          path: "example.ts",
          declaration: "ExampleState",
          message: "This is a sample finding. Actual messages come from the configured rule."
        }
      ]) +
      "\n"
  )
} else if (cliSwitch("runtime-identity")) {
  process.stdout.write(
    JSON.stringify({ version: runtimeVersion(), platform: process.platform, architecture: process.arch }) + "\n"
  )
} else if (cliSwitch("package-identity")) {
  process.stdout.write(JSON.stringify({ name: "@hapsland/hapsland", ...currentCommand() }) + "\n")
} else if (invocation.kind === "rules") {
  const { runRulesCommand } = await import("@hapsland/administration/rules/command")
  try {
    await Effect.runPromise(runRulesCommand(invocation.options).pipe(Effect.provide(processConfigurationLayer)))
  } catch (cause) {
    const error = localFailureMessage(cause)
    process.stderr.write(`${error}\n`)
    process.exitCode = 6
  }
} else if (cliSwitch("pilot") || invocation.kind === "lifecycle") {
  try {
    const command = invocation.kind === "lifecycle" ? invocation.command : "setup"
    const { dispatchSelectedPackage, dispatchActivePackage, registeredClients, formatDoctor } =
      await import("@hapsland/administration/onboarding/client-lifecycle")
    clientArguments = invocation.client
    const selectedPackage = clientArguments.flags.get("--target")
    const dispatched =
      selectedPackage !== undefined && command !== "update"
        ? await Effect.runPromise(
            dispatchSelectedPackage(selectedPackage, command, clientArguments.host, clientArguments.flags).pipe(
              Effect.provide(processConfigurationLayer),
              Effect.provide(machineClockLayer)
            )
          )
        : await Effect.runPromise(
            dispatchActivePackage([
              command,
              ...(clientArguments.host === undefined ? [] : [clientArguments.host]),
              ...[...clientArguments.flags]
                .filter(([name]) => name !== "--host")
                .map(([name, value]) => `${name}=${value}`)
            ]).pipe(Effect.provide(processConfigurationLayer), Effect.provide(machineClockLayer))
          )
    if (dispatched !== undefined) process.exitCode = dispatched
    else if (command === "doctor") {
      const hosts =
        clientArguments.host === undefined
          ? registeredClients(clientArguments.flags, reportClientFailure)
          : [selectedHost()]
      if (hosts.length === 0)
        process.stderr.write(
          `${formatOutcome("warning", "No Hapsland integrations found. Run hapsland setup first.")}\n`
        )
      for (const host of hosts) {
        try {
          const result = await Effect.runPromise(
            diagnoseClientProcess(host).pipe(
              Effect.provide(processConfigurationLayer),
              Effect.provide(machineClockLayer)
            )
          )
          process.stdout.write(formatDoctor(result.diagnosis, host).join("\n") + "\n")
          if (result.exitCode !== 0 || result.status === "not-ready") process.exitCode = result.exitCode || 6
        } catch (cause) {
          reportClientFailure(host, cause)
        }
      }
    } else if (command === "update")
      await Effect.runPromise(
        updateInteractive().pipe(Effect.provide(processConfigurationLayer), Effect.provide(machineClockLayer))
      )
    else if (command === "repair" || command === "reinstall" || command === "uninstall")
      await Effect.runPromise(
        maintenanceInteractive(command).pipe(
          Effect.provide(processConfigurationLayer),
          Effect.provide(machineClockLayer)
        )
      )
    else if (
      !cliSwitch("pilot") &&
      (clientArguments.flags.has("--no-input") ||
        clientArguments.flags.has("--apply") ||
        clientArguments.flags.has("--save-plan") ||
        clientArguments.flags.has("--apply-plan") ||
        !process.stdin.isTTY ||
        !process.stderr.isTTY)
    ) {
      const { runUnattendedSetup } = await import("@hapsland/administration/onboarding/unattended")
      const result = await Effect.runPromise(
        runUnattendedSetup(clientArguments).pipe(
          Effect.provide(processConfigurationLayer),
          Effect.catch((cause) =>
            Effect.succeed({
              version: 1,
              operation: "setup",
              status: "needs-user-action",
              providerCalls: 0,
              paidVerificationPerformed: false,
              message: localFailureMessage(cause)
            })
          )
        )
      )
      assignResultExitCode(result)
      process.stdout.write(JSON.stringify(result) + "\n")
    } else if (clientArguments.host === undefined)
      await Effect.runPromise(
        chooseSetupClients().pipe(Effect.provide(processConfigurationLayer), Effect.provide(machineClockLayer))
      )
    else
      await Effect.runPromise(
        pilotSetup(selectedHost()).pipe(Effect.provide(processConfigurationLayer), Effect.provide(machineClockLayer))
      )
  } catch (cause) {
    process.stderr.write(
      `${formatOutcome("error", cause instanceof Error ? cause.message : "Interactive operation failed")}\n`
    )
    process.exitCode = 6
  }
} else {
  const credentialNextAction = (result: Readonly<Record<string, unknown>>) => {
    return (
      result.action ??
      (result.operation === "logout"
        ? "Use user file exclusions to stop future review dispatches if needed."
        : result.status === "invalid"
          ? `Enter a nonempty ${JEV_PROVIDER.name} key and retry ${CLI_NAME} ${LOGIN_FLAG}. The previous saved key was preserved.`
          : result.status === "cancelled"
            ? "No key was changed. Run hapsland --login again when ready."
            : result.status === "locked" || result.status === "interaction-required"
              ? "Unlock or approve the native credential store in this session, then retry hapsland --login."
              : "Check native credential storage in this user session, then retry hapsland --login.")
    )
  }
  const writeLogoutEnvironmentWarning = (result: Readonly<Record<string, unknown>>): void => {
    if (result.operation === "logout") {
      const environment = result.environmentOverride as { envVar?: string; active?: boolean } | undefined
      if (environment?.active === true)
        process.stdout.write(
          `${environment.envVar ?? "The selected environment credential"} remains active; set user excludes to ["**/*"] to stop dispatch.\n`
        )
    }
  }
  const writeCredentialSummary = (result: Readonly<Record<string, unknown>>): void => {
    if (result.operation === "login" && result.status === "stored") {
      process.stdout.write(
        `${JEV_PROVIDER.name} key saved in ${process.platform === "darwin" ? "Keychain" : "Secret Service"}. No ${JEV_PROVIDER.name} request or review was sent.\nNext: run ${setupCommand("claude")} or ${setupCommand("codex")}, then complete client sign-in and native trust.\n`
      )
    } else {
      const next = credentialNextAction(result)
      process.stdout.write(
        `${result.operation === "logout" ? "Logout" : "Login"}: ${String(result.status)}. ${String(next)}\n`
      )
      writeLogoutEnvironmentWarning(result)
    }
  }
  const interactiveCredentialOutput = (): boolean =>
    isCredentialCommand && !cliSwitch("json") && !cliSwitch("credential-stdin") && process.stdin.isTTY
  const writeResultOutput = (output: unknown): void => {
    if (interactiveCredentialOutput()) {
      writeCredentialSummary(output as Readonly<Record<string, unknown>>)
      return
    }
    process.stdout.write(typeof output === "string" ? output : `${JSON.stringify(output)}\n`)
  }
  const output = isCredentialCommand
    ? await Effect.runPromise(
        runCredentialCommand().pipe(Effect.provide(processConfigurationLayer), Effect.provide(machineClockLayer))
      )
    : await Effect.runPromise(
        program.pipe(Effect.provide(processConfigurationLayer), Effect.provide(machineClockLayer))
      )
  assignResultExitCode(output)
  writeResultOutput(output)
}
