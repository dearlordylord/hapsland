import { previewDefaultRules, applyDefaultRules } from "./default-rules.ts"
import { configurationError } from "../configuration/errors.ts"
import { previewPiInstallation, installPiIntegration } from "./pi-installation.ts"
import * as Effect from "effect/Effect"
import { discoverWorkingTreeRoot } from "../repository/root.ts"
import { loadReviewSettings, type ReviewSettings } from "../runtime/review-config.ts"
import { resolveCredential, saveCredential, type CredentialResolution } from "../credentials/secret-service.ts"
import { installCodexIntegration, previewCodexInstallation, type InstallationRequest } from "./codex-installation.ts"
import {
  installClaudeIntegration,
  hasClaudeRegistration,
  previewClaudeInstallation,
  previewClaudeUpdate,
  updateClaudeIntegration
} from "./claude-installation.ts"

type SetupFields = {
  readonly version: 1
  readonly operation: "setup"
  readonly scope: { readonly cwd: string; readonly review: "enabled" | "disabled" }
  readonly credential: "saved" | "environment" | "skip"
  readonly rulesProposalDigest?: string
  readonly installProposalDigest?: string
  readonly interactive?: boolean
  readonly newKey?: boolean
}

export type SetupRequest = SetupFields &
  (
    | { readonly host: "codex"; readonly codexHome?: string; readonly codexExecutable?: string }
    | { readonly host: "pi"; readonly piHome?: string; readonly piExecutable?: string }
    | { readonly host: "claude"; readonly claudeHome?: string; readonly claudeExecutable?: string }
  )

type StageStatus = "complete" | "pending" | "skipped" | "unknown" | "unsupported" | "conflict" | "partial"
type SetupStage = {
  readonly stage:
    | "compatibility"
    | "installation"
    | "credential"
    | "repository"
    | "rules"
    | "host-trust"
    | "execution-context"
  readonly status: StageStatus
  readonly summary: string
  readonly observed?: unknown
}
type SetupAction = {
  readonly stage: SetupStage["stage"]
  readonly code: string
  readonly action: string
  readonly authorization?: Readonly<Record<string, string>>
}

type RecordValue = Readonly<Record<string, unknown>>
const record = (value: unknown): RecordValue | undefined =>
  typeof value === "object" && value !== null && !Array.isArray(value) ? (value as RecordValue) : undefined
const text = (value: unknown): string | undefined => (typeof value === "string" ? value : undefined)
const list = (value: unknown): ReadonlyArray<unknown> => (Array.isArray(value) ? value : [])

const installationRequest = (request: Extract<SetupRequest, { host: "codex" }>): InstallationRequest => ({
  ...(request.codexHome === undefined ? {} : { codexHome: request.codexHome }),
  ...(request.codexExecutable === undefined ? {} : { codexExecutable: request.codexExecutable })
})

export type SetupOptions = {
  readonly statePath: string
  readonly userConfigPath?: string
  /** Supplied only by the installed CLI's masked /dev/tty handoff. */
  readonly readCredential?: () => Effect.Effect<string, unknown>
}

type SetupProgress = {
  readonly stages: Array<SetupStage>
  readonly actions: Array<SetupAction>
  readonly completed: Array<string>
  readonly pending: Array<string>
}

const reportRepositorySettings = (
  request: SetupRequest,
  settings: ReviewSettings,
  root: string,
  progress: SetupProgress
) => {
  const { stages, actions, completed, pending } = progress
  if (request.scope.review === "disabled") {
    const excludedAll = settings.configuration.policy.excludes.some(
      (entry) => entry.origin.layer === "user" && entry.value === "**/*"
    )
    stages.push({
      stage: "repository",
      status: excludedAll ? "complete" : "pending",
      summary: excludedAll ? "user file settings exclude all files" : "review disablement requires a user exclusion",
      observed: {
        configurationDigest: settings.configuration.policy.digest,
        rulePackDigests: [...new Set(settings.rules?.map((rule) => `${rule.packId}:${rule.packDigest}`) ?? [])],
        canonicalRoot: root,
        effectiveIncludes: settings.configuration.policy.includes.map((entry) => entry.value)
      }
    })
    if (excludedAll) completed.push("user file settings disable review")
    else {
      actions.push({
        stage: "repository",
        code: "exclude-all-files",
        action: 'set excludes to ["**/*"] in user review settings, then rerun setup'
      })
      pending.push("exclude all files in user review settings")
    }
  } else {
    stages.push({
      stage: "repository",
      status: "complete",
      summary: "effective file settings loaded",
      observed: {
        configurationDigest: settings.configuration.policy.digest,
        rulePackDigests: [...new Set(settings.rules?.map((rule) => `${rule.packId}:${rule.packDigest}`) ?? [])],
        canonicalRoot: root,
        effectiveIncludes: settings.configuration.policy.includes.map((entry) => entry.value),
        effectiveExcludes: settings.configuration.policy.excludes.map((entry) => entry.value)
      }
    })
    completed.push("effective file settings loaded")
  }
}

const reportExecutionContext = (installed: boolean, hostName: string, progress: SetupProgress) => {
  const { stages, actions, pending: _pending } = progress
  if (installed) {
    stages.push({
      stage: "host-trust",
      status: "unknown",
      summary: `${hostName} native repository and hook trust cannot be queried offline`,
      observed: { trustRecordsModified: false, bypassUsed: false }
    })
    actions.push({
      stage: "host-trust",
      code: "complete-native-trust",
      action: `start ${hostName} normally in the canonical repository and complete any native repository or hook review prompt`
    })
  } else {
    stages.push({ stage: "host-trust", status: "pending", summary: "native trust follows installation" })
  }
  stages.push({
    stage: "execution-context",
    status: "unknown",
    summary: "actual host invocation and credential accessibility remain unknown until observed",
    observed: { providerCalls: 0, reviewPerformed: false }
  })
}

const reportRepositoryFailure = (discoveryFailed: boolean, progress: SetupProgress) => {
  const { stages, actions, pending } = progress
  stages.push({
    stage: "credential",
    status: "unknown",
    summary: "credential selection is unknown because repository configuration is unavailable"
  })
  stages.push({
    stage: "repository",
    status: discoveryFailed ? "unsupported" : "conflict",
    summary: discoveryFailed
      ? "the requested scope is not a discoverable Git working tree"
      : "the repository review configuration is invalid"
  })
  actions.push({
    stage: "repository",
    code: discoveryFailed ? "select-repository" : "repair-repository-configuration",
    action: discoveryFailed
      ? "select a discoverable canonical Git working tree, then rerun setup"
      : "repair the reported repository review configuration, then rerun setup"
  })
  pending.push("repair repository discovery or configuration")
}

type InteractiveCredentialOutcome =
  | { readonly status: "cancelled" }
  | { readonly status: string; readonly generation: number; readonly savedCredentialUse: "active" | "suspended" }

const reportSkippedCredential = (request: SetupRequest, progress: SetupProgress) => {
  const { stages, actions, completed, pending } = progress
  stages.push({
    stage: "credential",
    status: request.scope.review === "disabled" ? "skipped" : "pending",
    summary: "credential setup was explicitly skipped"
  })
  if (request.scope.review === "disabled") completed.push("credential setup skipped")
  else {
    actions.push({
      stage: "credential",
      code: "select-credential-source",
      action: "rerun setup with an explicit saved or environment credential source before expecting review readiness"
    })
    pending.push("select a credential source")
  }
}

const reportInteractiveCredentialAction = (outcome: InteractiveCredentialOutcome, progress: SetupProgress) => {
  const { actions } = progress
  const indeterminate = outcome.status === "indeterminate"
  const cancelled = outcome.status === "cancelled"
  actions.push({
    stage: "credential",
    code: interactiveCredentialActionCode(outcome.status),
    action: cancelled
      ? "rerun setup interactively or run hapsland --login in a user terminal"
      : indeterminate
        ? "run hapsland --logout to resolve the uncertain replacement, then run hapsland --login"
        : outcome.status === "locked"
          ? "unlock the login keyring, then run hapsland --login"
          : outcome.status === "invalid"
            ? "run hapsland --login again and enter a nonempty credential"
            : "reinstall an archive containing the native helper for this platform if it is missing, or repair native credential storage; then run hapsland --login. Alternatively set TYPESAFE_API_KEY before setup and launching the agent"
  })
}

const interactiveCredentialActionCode = (status: string) =>
  status === "cancelled"
    ? "credential-entry-cancelled"
    : status === "indeterminate"
      ? "reconcile-credential-lifecycle"
      : status === "invalid"
        ? "replace-invalid-credential"
        : "recover-credential-storage"

const reportInteractiveCredential = (outcome: InteractiveCredentialOutcome, progress: SetupProgress) => {
  const { stages, pending } = progress
  const indeterminate = outcome.status === "indeterminate"
  const cancelled = outcome.status === "cancelled"
  stages.push({
    stage: "credential",
    status: "pending",
    summary: cancelled
      ? "masked credential entry was cancelled"
      : indeterminate
        ? "credential replacement is indeterminate and saved use is suspended"
        : `credential storage returned ${outcome.status}`,
    observed: {
      source: "saved",
      status: outcome.status,
      inspectedContext: "setup-process",
      valueDisclosed: false,
      ...("generation" in outcome
        ? {
            generation: outcome.generation,
            savedCredentialUse: outcome.savedCredentialUse,
            ...(indeterminate ? {} : { previousCredentialPreserved: true })
          }
        : { previousCredentialPreserved: true })
    }
  })
  pending.push(indeterminate ? "reconcile suspended saved credential use" : "complete saved credential login")
  reportInteractiveCredentialAction(outcome, progress)
}

const credentialPendingSummary = (resolution: CredentialResolution): string => {
  if (resolution.source === "saved" && resolution.status === "unavailable")
    return "native credential storage is unavailable; Hapsland could not check for a saved Jev key"
  if (resolution.status === "missing")
    return "a Jev API key is required; no key was found in the selected credential source"
  return `the selected ${resolution.source} credential is ${resolution.status}`
}

const credentialPendingAction = (
  request: SetupRequest,
  settings: ReviewSettings,
  environmentOnly: boolean,
  resolution: CredentialResolution
): string => {
  if (resolution.file !== undefined)
    return `restore a readable regular credential file at ${resolution.file}, then rerun setup`
  if (resolution.status === "locked")
    return "unlock the login keyring in the desktop session, then rerun setup interactively"
  if (request.credential === "environment" || environmentOnly)
    return `set ${settings.credentialEnvVar} in the selected host execution environment, then rerun setup`
  if (resolution.status === "missing" || resolution.status === "invalid")
    return "rerun setup interactively in a user terminal for masked credential entry; use --new-key to replace a saved key"
  return `restore native credential storage (Linux: a session D-Bus Secret Service with a default collection; macOS: login Keychain), or set ${settings.credentialEnvVar} in the terminal before setup and launching the agent`
}

const reportCredentialResolution = (
  request: SetupRequest,
  settings: ReviewSettings,
  environmentOnly: boolean,
  resolution: CredentialResolution,
  progress: SetupProgress
) => {
  const { stages, actions, completed, pending } = progress
  if (resolution.status === "present") {
    stages.push({
      stage: "credential",
      status: "complete",
      summary: `a review credential is available from ${resolution.file ?? resolution.source}`,
      observed: {
        source: resolution.source,
        ...(resolution.file === undefined ? {} : { file: resolution.file }),
        inspectedContext: "setup-process",
        valueDisclosed: false
      }
    })
    completed.push("credential available to setup")
  } else {
    const code = resolution.status === "locked" ? "unlock-credential-store" : "provide-credential"
    stages.push({
      stage: "credential",
      status: "pending",
      summary: credentialPendingSummary(resolution),
      observed: {
        source: resolution.source,
        ...(resolution.file === undefined ? {} : { file: resolution.file }),
        status: resolution.status,
        inspectedContext: "setup-process",
        valueDisclosed: false
      }
    })
    actions.push({
      stage: "credential",
      code,
      action: credentialPendingAction(request, settings, environmentOnly, resolution)
    })
    pending.push("make the selected credential available")
  }
}

const readInteractiveCredential = Effect.fn("Setup.readCredential")(function* (
  readCredential: () => Effect.Effect<string, unknown>,
  settings: ReviewSettings
) {
  let resolution: CredentialResolution | undefined
  let interactiveOutcome: InteractiveCredentialOutcome | undefined
  const valueResult = yield* readCredential().pipe(Effect.result)
  if (valueResult._tag === "Success") {
    let value = valueResult.success
    const saved = yield* saveCredential(value)
    value = ""
    if (saved.status === "stored") {
      resolution = yield* resolveCredential({ envVar: settings.credentialEnvVar, environmentOnly: false })
    } else {
      interactiveOutcome = {
        status: saved.status,
        generation: saved.state.generation,
        savedCredentialUse: saved.state.savedUseSuspended ? "suspended" : "active"
      }
    }
  } else interactiveOutcome = { status: "cancelled" }
  return { resolution, interactiveOutcome }
})

const maskedCredentialReader = (
  request: SetupRequest,
  options: SetupOptions,
  resolution: CredentialResolution,
  installed: boolean
) => {
  if (
    request.credential === "saved" &&
    request.interactive === true &&
    resolution.source === "saved" &&
    resolution.status === "missing" &&
    installed
  ) {
    return options.readCredential
  }
  return undefined
}

const newCredentialReader = (
  request: SetupRequest,
  options: SetupOptions,
  environmentOnly: boolean,
  installed: boolean
) => {
  if (request.credential !== "saved" || environmentOnly || !installed || request.interactive !== true) return undefined
  return options.readCredential
}

const reportNewCredentialPending = (settings: ReviewSettings, environmentOnly: boolean, progress: SetupProgress) => {
  progress.stages.push({
    stage: "credential",
    status: "pending",
    summary: environmentOnly
      ? "new saved key entry cannot replace the configured environment credential"
      : "a new Jev key requires interactive entry after installation approval"
  })
  progress.actions.push({
    stage: "credential",
    code: "provide-credential",
    action: environmentOnly
      ? `set ${settings.credentialEnvVar} in the selected host execution environment; remove the explicit credentialEnvVar setting to use saved login`
      : "run hapsland setup with --new-key in a user terminal and approve installation"
  })
  progress.pending.push("enter a new credential")
}

const setupNewCredential = Effect.fn("Setup.newCredential")(function* (
  request: SetupRequest,
  options: SetupOptions,
  settings: ReviewSettings,
  installed: boolean,
  environmentOnly: boolean,
  progress: SetupProgress
) {
  const reader = newCredentialReader(request, options, environmentOnly, installed)
  if (reader === undefined) {
    reportNewCredentialPending(settings, environmentOnly, progress)
    return
  }
  const result = yield* readInteractiveCredential(reader, settings)
  if (result.interactiveOutcome !== undefined) reportInteractiveCredential(result.interactiveOutcome, progress)
  else if (result.resolution !== undefined)
    reportCredentialResolution(request, settings, false, result.resolution, progress)
})

const setupCredential = Effect.fn("Setup.credential")(function* (
  request: SetupRequest,
  options: SetupOptions,
  settings: ReviewSettings,
  installed: boolean,
  progress: SetupProgress
) {
  const environmentOnly =
    request.credential === "environment" || settings.configuration.policy.credentialEnvVar.origin.layer !== "built-in"
  if (request.newKey === true) {
    yield* setupNewCredential(request, options, settings, installed, environmentOnly, progress)
    return
  }
  if (request.credential === "skip") {
    reportSkippedCredential(request, progress)
  } else {
    let resolution = yield* resolveCredential({
      envVar: settings.credentialEnvVar,
      environmentOnly,
      root: settings.configuration.policy.root
    })
    let interactiveOutcome: InteractiveCredentialOutcome | undefined
    const readCredential = maskedCredentialReader(request, options, resolution, installed)
    if (readCredential !== undefined) {
      const result = yield* readInteractiveCredential(readCredential, settings)
      interactiveOutcome = result.interactiveOutcome
      if (result.resolution !== undefined) resolution = result.resolution
    }
    if (interactiveOutcome !== undefined) {
      reportInteractiveCredential(interactiveOutcome, progress)
    } else {
      reportCredentialResolution(request, settings, environmentOnly, resolution, progress)
    }
  }
})

const reportCompatibility = (
  installationStatus: string,
  hostName: string,
  compatibility: RecordValue | undefined,
  progress: SetupProgress
) => {
  const { stages, actions, completed } = progress
  if (installationStatus === "unsupported") {
    stages.push({
      stage: "compatibility",
      status: "unsupported",
      summary: `the selected ${hostName} host is unsupported`,
      observed: compatibility
    })
    actions.push({
      stage: "compatibility",
      code: "select-supported-host",
      action: `select a declared ${hostName} executable and the packaged Bun runtime, then rerun setup`
    })
  } else {
    stages.push({
      stage: "compatibility",
      status: "complete",
      summary: `the selected ${hostName} host and packaged runtime are compatible`,
      observed: compatibility
    })
    completed.push("compatibility checked")
  }
}

type InstallationState = {
  readonly currentInstallationStatus: string
  readonly installedAtPreview: boolean
  readonly hostName: string
  readonly hostHome: string | undefined
  readonly installationRecord: RecordValue
  readonly proposal: RecordValue | undefined
  readonly installDigest: string | undefined
}

const reportInstalled = (state: InstallationState, progress: SetupProgress) => {
  const { stages, completed } = progress
  const { currentInstallationStatus, installedAtPreview, hostName, hostHome, installationRecord } = state
  stages.push({
    stage: "installation",
    status: "complete",
    summary:
      currentInstallationStatus === "already-installed" || installedAtPreview
        ? `the owned ${hostName} integration is already installed`
        : `the owned ${hostName} integration was installed`,
    observed: { home: hostHome, changes: list(installationRecord.completed) }
  })
  completed.push(`owned ${hostName} integration installed`)
}

const reportPartialInstallation = (state: InstallationState, progress: SetupProgress) => {
  const { stages, actions, pending } = progress
  const { installationRecord, proposal, installDigest } = state
  stages.push({
    stage: "installation",
    status: "partial",
    summary: "installation stopped after partial completion",
    observed: { recovery: installationRecord.recovery, proposal: installationRecord.proposal ?? proposal }
  })
  const recovery = record(installationRecord.recovery)
  const recoveryDigest = text(recovery?.proposalDigest) ?? installDigest
  actions.push({
    stage: "installation",
    code: "resume-installation",
    action: "rerun setup with the journaled installation proposal digest",
    ...(recoveryDigest === undefined ? {} : { authorization: { installProposalDigest: recoveryDigest } })
  })
  pending.push("resume the journaled installation")
}

const reportInstallationApproval = (
  state: InstallationState & { readonly installDigest: string },
  progress: SetupProgress
) => {
  const { stages, actions, pending } = progress
  const { hostName, proposal, installDigest } = state
  stages.push({
    stage: "installation",
    status: "pending",
    summary: "installation requires approval of the exact owned changes",
    observed: {
      proposal: { digest: installDigest, changes: list(proposal?.changes), ownedChanges: proposal?.ownedChanges }
    }
  })
  actions.push({
    stage: "installation",
    code: "approve-installation",
    action: "review the change summary, then rerun setup with its proposal digest",
    authorization: { installProposalDigest: installDigest }
  })
  pending.push(`approve the owned ${hostName} configuration changes`)
}

const reportInstallationConflict = (state: InstallationState, progress: SetupProgress) => {
  const { stages, actions, pending } = progress
  const { currentInstallationStatus, hostName, installationRecord } = state
  const status: StageStatus = currentInstallationStatus === "unsupported" ? "unsupported" : "conflict"
  stages.push({
    stage: "installation",
    status,
    summary: `the owned ${hostName} integration could not be installed`,
    observed: installationRecord.error
  })
  actions.push({
    stage: "installation",
    code: status === "unsupported" ? "select-supported-host" : "resolve-installation-conflict",
    action:
      status === "unsupported"
        ? `select a supported ${hostName} executable and host configuration home, then rerun setup`
        : "preserve the selected host files, resolve the reported ownership or configuration conflict, then rerun setup"
  })
  pending.push("resolve the reported installation problem")
}

const reportInstallation = (state: InstallationState, installed: boolean, progress: SetupProgress) => {
  if (installed) return reportInstalled(state, progress)
  if (state.currentInstallationStatus === "partial") return reportPartialInstallation(state, progress)
  if (state.currentInstallationStatus === "preview" && state.installDigest !== undefined) {
    return reportInstallationApproval({ ...state, installDigest: state.installDigest }, progress)
  }
  reportInstallationConflict(state, progress)
}

const installationOperations = (request: SetupRequest) => {
  if (request.host === "pi")
    return {
      preview: () => previewPiInstallation(request),
      install: (proposalDigest: string) => installPiIntegration({ ...request, proposalDigest })
    }
  if (request.host === "codex") {
    const codexRequest = installationRequest(request)
    return {
      preview: () => previewCodexInstallation(codexRequest),
      install: (proposalDigest: string) => installCodexIntegration({ ...codexRequest, proposalDigest })
    }
  }
  const claudeRequest = {
    ...(request.claudeHome === undefined ? {} : { claudeHome: request.claudeHome }),
    ...(request.claudeExecutable === undefined ? {} : { claudeExecutable: request.claudeExecutable })
  }
  const claudeInstalled = hasClaudeRegistration(claudeRequest)
  const preview = Effect.fn("Setup.previewInstallation")(function* () {
    if (!claudeInstalled) return yield* previewClaudeInstallation(claudeRequest)
    const target = yield* previewClaudeUpdate(claudeRequest)
    const changes = list(record(record(target)?.proposal)?.changes)
    return { ...target, installed: target.status === "preview" && changes.length === 0 }
  })
  return {
    preview,
    install: (proposalDigest: string) =>
      claudeInstalled
        ? updateClaudeIntegration({ ...claudeRequest, proposalDigest })
        : installClaudeIntegration({ ...claudeRequest, proposalDigest })
  }
}

const shouldApplyInstallation = (
  status: string,
  installed: boolean,
  suppliedDigest: string | undefined,
  digest: string | undefined
) => {
  if (digest === undefined || suppliedDigest !== digest) return false
  return status === "partial" || (status === "preview" && !installed)
}

const optionalNextSteps = (request: SetupRequest, status: string) =>
  status === "completed" && request.scope.review === "enabled" && request.host === "codex"
    ? {
        optionalNextSteps: [
          {
            operation: "demo" as const,
            selection: "preview" as const,
            paid: false as const,
            action:
              "optionally preview the separate synthetic first-review demo; live execution requires an explicit selection for its disposable root"
          }
        ]
      }
    : {}

const installationPreview = (request: SetupRequest, installation: unknown) => {
  const installationRecord = record(installation) ?? {}
  const previewHost = record(installationRecord.host)
  const compatibility = record(previewHost?.compatibility)
  const installationStatus = text(installationRecord.status) ?? "conflict"
  const hostHome =
    text(previewHost?.home) ??
    (request.host === "pi" ? request.piHome : request.host === "claude" ? request.claudeHome : request.codexHome)

  return { installationRecord, compatibility, installationStatus, hostHome }
}

const setupInstallation = Effect.fn("Setup.installation")(function* (request: SetupRequest, progress: SetupProgress) {
  const hostName = request.host === "pi" ? "Pi" : request.host === "claude" ? "Claude Code" : "Codex"
  const { preview, install } = installationOperations(request)
  let installation: unknown = yield* preview()
  const previewEvidence = installationPreview(request, installation)
  let installationRecord = previewEvidence.installationRecord
  const { compatibility, installationStatus, hostHome } = previewEvidence

  reportCompatibility(installationStatus, hostName, compatibility, progress)

  const proposal = record(installationRecord.proposal)
  const installDigest = text(proposal?.digest)
  const installedAtPreview = installationRecord.installed === true
  if (
    shouldApplyInstallation(installationStatus, installedAtPreview, request.installProposalDigest, installDigest) &&
    installDigest !== undefined
  ) {
    installation = yield* install(installDigest)
    installationRecord = record(installation) ?? {}
  }

  const currentInstallationStatus = text(installationRecord.status) ?? installationStatus
  const installed =
    installedAtPreview ||
    ["installed", "already-installed", "complete", "updated", "already-current"].includes(currentInstallationStatus)
  reportInstallation(
    { currentInstallationStatus, installedAtPreview, hostName, hostHome, installationRecord, proposal, installDigest },
    installed,
    progress
  )
  return { installed, hostHome, hostName }
})

const setupStatus = (request: SetupRequest, installed: boolean, progress: SetupProgress) => {
  const { stages, actions, completed: _completed } = progress
  const blockingStage = stages.find(
    (stage) => stage.status === "unsupported" || stage.status === "conflict" || stage.status === "partial"
  )
  const repositoryStage = stages.find((stage) => stage.stage === "repository")
  const status =
    blockingStage?.status === "unsupported"
      ? "unsupported"
      : blockingStage?.status === "conflict"
        ? "conflict"
        : blockingStage?.status === "partial"
          ? "partial"
          : request.scope.review === "disabled" && installed && repositoryStage?.status === "complete"
            ? "completed"
            : actions.length > 0
              ? "needs-user-action"
              : "completed"
  return status
}

export const runSetup = Effect.fn("Setup.run")(function* (request: SetupRequest, options: SetupOptions) {
  const stages: Array<SetupStage> = []
  const actions: Array<SetupAction> = []
  const completed: Array<string> = []
  const pending: Array<string> = []
  const progress: SetupProgress = { stages, actions, completed, pending }
  const rulesPreview =
    request.scope.review === "enabled"
      ? yield* previewDefaultRules(options.userConfigPath, request.scope.cwd).pipe(Effect.result)
      : undefined
  if (
    request.rulesProposalDigest !== undefined &&
    rulesPreview?._tag === "Success" &&
    request.rulesProposalDigest !== rulesPreview.success.digest
  )
    return yield* configurationError(
      rulesPreview.success.configurationPath,
      "rulesProposalDigest",
      "default rules plan is stale; preview again before applying"
    )
  if (request.rulesProposalDigest !== undefined && rulesPreview?._tag === "Failure") return yield* rulesPreview.failure
  const { installed, hostHome, hostName } = yield* setupInstallation(request, progress)
  if (rulesPreview?._tag === "Failure") {
    stages.push({
      stage: "rules",
      status: "conflict",
      summary: rulesPreview.failure.reason,
      observed: { source: rulesPreview.failure.source, field: rulesPreview.failure.field }
    })
  } else if (rulesPreview?._tag === "Success") {
    const proposal = rulesPreview.success
    const application =
      request.rulesProposalDigest === proposal.digest && installed
        ? yield* applyDefaultRules(options.userConfigPath, proposal.digest, request.scope.cwd).pipe(Effect.result)
        : undefined
    const applied = application?._tag === "Success"
    if (application?._tag === "Failure") {
      stages.push({
        stage: "rules",
        status: "partial",
        summary: "editable default rules application could not complete; inspect the reported files and preview again",
        observed: { path: proposal.path, configurationPath: proposal.configurationPath }
      })
      pending.push("preview and resume default rules application")
    } else
      stages.push({
        stage: "rules",
        status: applied || !proposal.changed ? "complete" : "pending",
        summary:
          applied || !proposal.changed
            ? "editable default rules connected"
            : "editable default rules require setup authorization",
        observed: { path: proposal.path, configurationPath: proposal.configurationPath, digest: proposal.digest }
      })
    if (!applied && proposal.changed) {
      actions.push({
        stage: "rules",
        code: "approve-default-rules",
        action: `materialize editable rules at ${proposal.path} and connect them in ${proposal.configurationPath}`,
        authorization: { rulesProposalDigest: proposal.digest }
      })
      pending.push("approve editable default rules")
    }
  }

  const rootResult = yield* discoverWorkingTreeRoot(request.scope.cwd).pipe(Effect.result)
  const settingsResult =
    rootResult._tag === "Success"
      ? yield* loadReviewSettings(
          rootResult.success,
          options.userConfigPath === undefined ? {} : { userConfigPath: options.userConfigPath }
        ).pipe(Effect.result)
      : undefined

  if (rootResult._tag === "Failure" || settingsResult === undefined || settingsResult._tag === "Failure") {
    reportRepositoryFailure(rootResult._tag === "Failure", progress)
  } else {
    const settings = settingsResult.success
    yield* setupCredential(request, options, settings, installed, progress)

    reportRepositorySettings(request, settings, rootResult.success, progress)
  }

  reportExecutionContext(installed, hostName, progress)

  const status = setupStatus(request, installed, progress)
  return {
    version: 1 as const,
    operation: "setup" as const,
    status,
    host: { adapter: request.host, ...(hostHome === undefined ? {} : { home: hostHome }) },
    scope: {
      repository: rootResult._tag === "Success" ? rootResult.success : request.scope.cwd,
      review: request.scope.review
    },
    providerCalls: 0 as const,
    paidVerificationPerformed: false as const,
    stages,
    completed,
    pending,
    actions: actions.slice(0, 4),
    ...optionalNextSteps(request, status)
  }
})

export * as Setup from "./setup.ts"
