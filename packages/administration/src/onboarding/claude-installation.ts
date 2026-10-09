import { standaloneHookBinding, bindingDigest, sameStandaloneImplementation } from "./hook-binding.ts"
import { commandHookGroup } from "@hapsland/runtime-environment/runtime/hook-catalog"
import {
  packageCommand,
  commandEntrypoint,
  commandTokens,
  commandFromEntrypoint,
  versionProbeArguments,
  observedRuntimeVersion,
  expectedRuntimeVersion
} from "@hapsland/runtime-environment/runtime/package-runtime"
import { isClaudeHostVersion } from "@hapsland/native-observation/direct-event/observation"
import { Config, Effect, Schema } from "effect"
import { execFileClosedStdin } from "@hapsland/runtime-environment/process/closed-stdin"
import { createHash } from "node:crypto"
import { lstatSync, readFileSync, realpathSync, statSync } from "node:fs"
import { homedir } from "node:os"
import { join, resolve } from "node:path"
import { atomicInstallationFile } from "./atomic-installation-file.ts"

import { withInstallationLock } from "./installation-lock.ts"
import {
  canonicalJson as canonical,
  reconcileOwnedEvent,
  removeMarkedHandlers,
  retainedHookSubset
} from "./hook-reconciliation.ts"

export class ClaudeInstallationError extends Schema.TaggedError<ClaudeInstallationError>()("ClaudeInstallationError", {
  reason: Schema.NonEmptyString
}) {
  override get message() {
    return this.reason
  }
}

const MARKER = "--review-tool-owned=claude-v1"
const COMPOSED_MARKER = "--review-tool-composed-owned=claude-v1"
const TESTED_VERSION = "2.1.218"
const OWNERSHIP_VERSION = 1
type JsonObject = Record<string, unknown>

export interface ClaudeInstallationRequest {
  readonly claudeHome?: string
  readonly claudeExecutable?: string
  readonly proposalDigest?: string
  readonly reinstall?: boolean
}

interface OwnedRecord {
  readonly version: 1
  readonly adapter: "claude"
  readonly home: string
  readonly hookDigest: string
  readonly command: string
  readonly implementation?: { readonly executable: string; readonly args: ReadonlyArray<string> }
  readonly bindingDigest?: string
  readonly hookGroups?: Record<string, unknown>
  readonly composed?: {
    readonly stopDigest: string
    readonly promptDigest: string
    readonly subagentStopDigest?: string
    readonly preToolUseDigest?: string
  }
}

const object = (value: unknown): value is JsonObject =>
  typeof value === "object" && value !== null && !Array.isArray(value)
const digest = (value: string) => createHash("sha256").update(value).digest("hex")
const encode = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`
const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`
const error = (cause: unknown) => (cause instanceof Error ? cause.message : "installation failed")

const paths = (home: string) => ({
  settings: join(home, "settings.json"),
  binding: join(home, ".hapsland", "claude-hook-launcher.sh"),
  ownership: join(home, ".hapsland", "claude-installation-v1.json"),
  lock: join(home, ".hapsland", "claude-installation.lock")
})

const file = (path: string): string | undefined => {
  try {
    const stat = lstatSync(path)
    if (!stat.isFile()) throw new Error(`configuration is not a regular file: ${path}`)
    return readFileSync(path, "utf8")
  } catch (cause) {
    if (object(cause) && cause.code === "ENOENT") return undefined
    throw cause
  }
}

const parseObject = (content: string | undefined, label: string): JsonObject => {
  if (content === undefined) return {}
  try {
    const value: unknown = JSON.parse(content)
    if (object(value)) return value
  } catch {
    /* reported below */
  }
  throw new Error(`${label} must contain a JSON object`)
}

const requiredStringFields = (value: JsonObject, fields: ReadonlyArray<string>): boolean =>
  fields.every((field) => typeof value[field] === "string")
const optionalStringField = (value: JsonObject, field: string): boolean =>
  value[field] === undefined || typeof value[field] === "string"
const validComposedRecord = (value: unknown): boolean => {
  if (value === undefined) return true
  return (
    object(value) &&
    requiredStringFields(value, ["stopDigest", "promptDigest"]) &&
    optionalStringField(value, "subagentStopDigest") &&
    optionalStringField(value, "preToolUseDigest")
  )
}
const validImplementationRecord = (value: unknown): boolean => {
  if (value === undefined) return true
  return (
    object(value) &&
    typeof value.executable === "string" &&
    Array.isArray(value.args) &&
    value.args.every((arg) => typeof arg === "string")
  )
}
const readRecord = (path: string): OwnedRecord | undefined => {
  const content = file(path)
  if (content === undefined) return undefined
  const value = parseObject(content, "Claude ownership record")
  if (
    value.version !== OWNERSHIP_VERSION ||
    value.adapter !== "claude" ||
    !requiredStringFields(value, ["home", "hookDigest", "command"]) ||
    !optionalStringField(value, "bindingDigest") ||
    !validImplementationRecord(value.implementation) ||
    !validComposedRecord(value.composed)
  ) {
    throw new Error("Claude ownership record has an unsupported shape")
  }
  return value as unknown as OwnedRecord
}

const countMarker = (value: unknown): number =>
  typeof value === "string"
    ? value.includes(MARKER)
      ? 1
      : 0
    : Array.isArray(value)
      ? value.reduce<number>((sum, item) => sum + countMarker(item), 0)
      : object(value)
        ? Object.values(value).reduce<number>((sum, item) => sum + countMarker(item), 0)
        : 0

const groups = (settings: JsonObject): ReadonlyArray<unknown> => {
  if (settings.hooks === undefined) return []
  if (!object(settings.hooks)) throw new Error("Claude settings hooks must be an object")
  const post = settings.hooks.PostToolUse
  if (post === undefined) return []
  if (!Array.isArray(post)) throw new Error("Claude settings PostToolUse must be an array")
  return post
}

const owned = (settings: JsonObject): { index: number; group: unknown } | undefined => {
  if (countMarker(settings) > 1) throw new Error("duplicate owned Claude hook markers require reconciliation")
  const foundGroups = groups(settings)
    .map((group, index) => ({ group, index }))
    .filter(({ group }) => countMarker(group) === 1 || JSON.stringify(group).includes(COMPOSED_MARKER))
  if (foundGroups.length > 1) throw new Error("duplicate owned Claude PostToolUse groups require reconciliation")
  const found = foundGroups[0]
  if (countMarker(settings) === 1 && found === undefined) throw new Error("owned Claude marker is outside PostToolUse")
  return found
}

const withGroups = (settings: JsonObject, next: ReadonlyArray<unknown>): JsonObject => {
  const hooks = { ...(settings.hooks as JsonObject | undefined) }
  if (next.length === 0) delete hooks.PostToolUse
  else hooks.PostToolUse = next
  const result = { ...settings }
  if (Object.keys(hooks).length === 0) delete result.hooks
  else result.hooks = hooks
  return result
}

const withComposedGroup = (
  settings: JsonObject,
  event: "PreToolUse" | "Stop" | "SubagentStop" | "UserPromptSubmit",
  next: unknown | undefined,
  expectedDigest: string | undefined,
  restoreMissing = false,
  expectedGroup?: unknown
): JsonObject =>
  reconcileOwnedEvent(settings, event, next, {
    marker: COMPOSED_MARKER,
    fingerprint: (group) => digest(canonical(group)),
    expectedFingerprint: expectedDigest,
    expectedGroup,
    restoreMissing,
    label: "Claude"
  })

const host = (observed: string) => {
  const version = /^(\d+\.\d+\.\d+)(?: \(Claude Code\))?$/.exec(observed)?.[1] ?? "unavailable"
  return {
    supported: isClaudeHostVersion(version),
    observed,
    version,
    tested: version === TESTED_VERSION,
    testedVersions: [TESTED_VERSION],
    required: "Claude Code with a stable semantic version"
  }
}

const inputs = (
  request: ClaudeInstallationRequest,
  configured: { runtime: string; entrypoint: string },
  observed: string,
  runtimeObserved: string
) => {
  const home = resolve(request.claudeHome ?? join(homedir(), ".claude"))
  const runtime = resolve(configured.runtime)
  let entrypoint = resolve(configured.entrypoint)
  try {
    entrypoint = realpathSync(entrypoint)
  } catch {
    /* readiness reports missing path */
  }
  const binding = standaloneHookBinding(runtime, entrypoint, home, "claude")
  const options = {
    command: binding?.command ?? commandTokens(runtime, entrypoint).map(quote).join(" "),
    editMarker: MARKER,
    composedMarker: COMPOSED_MARKER,
    versionFlag: `--claude-version=${host(observed).version}`
  }
  const group = commandHookGroup("claude", "PostToolUse", options)
  const command = group.hooks[0]!.command
  const stopGroup = commandHookGroup("claude", "Stop", options)
  const subagentStopGroup = commandHookGroup("claude", "SubagentStop", options)
  const preGroup = commandHookGroup("claude", "PreToolUse", options)
  const promptGroup = commandHookGroup("claude", "UserPromptSubmit", options)
  return {
    home,
    runtime,
    entrypoint,
    binding,
    command,
    group,
    preGroup,
    stopGroup,
    subagentStopGroup,
    promptGroup,
    paths: paths(home),
    host: host(observed),
    runtimeObserved
  }
}

const resolveInputs = Effect.fn("ClaudeInstallation.inputs")(
  function* (request: ClaudeInstallationRequest) {
    const runtime = yield* Config.NonEmptyString("REVIEW_INSTALL_RUNTIME").pipe(
      Config.withDefault(packageCommand("hook").executable)
    )
    const entrypoint = yield* Config.NonEmptyString("REVIEW_INSTALL_ENTRYPOINT").pipe(
      Config.withDefault(commandEntrypoint(packageCommand("hook")))
    )
    const hostRun = yield* execFileClosedStdin(request.claudeExecutable ?? "claude", ["--version"], {
      env: process.env,
      timeout: 2_000,
      maxBuffer: 1_048_576
    })
    const runtimeRun = yield* execFileClosedStdin(resolve(runtime), versionProbeArguments(runtime, entrypoint), {
      env: process.env,
      timeout: 2_000,
      maxBuffer: 1_048_576
    })
    return yield* Effect.try({
      try: () =>
        inputs(
          request,
          { runtime, entrypoint },
          hostRun.succeeded ? hostRun.stdout.trim() : "unavailable",
          runtimeRun.succeeded ? observedRuntimeVersion(runtimeRun.stdout) : "unavailable"
        ),
      catch: () => new ClaudeInstallationError({ reason: "installation inputs unavailable" })
    })
  },
  Effect.mapError(() => new ClaudeInstallationError({ reason: "Claude installation configuration is invalid" }))
)

const ready = (input: ReturnType<typeof inputs>) => {
  const version = input.runtimeObserved
  let entrypointReady = false
  try {
    entrypointReady = statSync(input.entrypoint).isFile()
  } catch {
    /* reported as unavailable */
  }
  return {
    supported: input.host.supported && version === expectedRuntimeVersion(input.entrypoint) && entrypointReady,
    host: input.host,
    runtime: { observed: version, required: expectedRuntimeVersion(input.entrypoint) },
    entrypoint: { path: input.entrypoint, ready: entrypointReady }
  }
}

type Kind = "install" | "update" | "uninstall"
type ClaudeInputs = ReturnType<typeof inputs>
type OwnedHookGroup = NonNullable<ReturnType<typeof owned>>
const readPlanRecord = (request: ClaudeInstallationRequest, input: ClaudeInputs): OwnedRecord | undefined => {
  let record: OwnedRecord | undefined
  try {
    record = readRecord(input.paths.ownership)
  } catch (cause) {
    if (!request.reinstall) throw cause
  }
  if (record !== undefined && record.home !== input.home)
    throw new Error("Claude ownership record belongs to another home")
  return record
}
const assertNoComposedRecord = (settings: JsonObject): void => {
  for (const event of ["PreToolUse", "Stop", "SubagentStop", "UserPromptSubmit"] as const)
    withComposedGroup(settings, event, undefined, undefined)
}
const currentHookMatches = (record: OwnedRecord, current: OwnedHookGroup): boolean =>
  digest(canonical(current.group)) === record.hookDigest ||
  retainedHookSubset(current.group, record.hookGroups?.PostToolUse)
const assertOwnedHook = (record: OwnedRecord | undefined, current: OwnedHookGroup | undefined): void => {
  if (current !== undefined && record === undefined) throw new Error("owned Claude hook has no ownership record")
  if (record !== undefined && current !== undefined && !currentHookMatches(record, current))
    throw new Error("owned Claude hook is missing or locally modified")
}
const assertInstallableRecord = (kind: Kind, record: OwnedRecord | undefined): void => {
  if (kind === "install" && record !== undefined) throw new Error("Claude integration already installed; use update")
}
const assertUpdatableRecord = (
  kind: Kind,
  request: ClaudeInstallationRequest,
  previous: OwnedRecord | undefined
): void => {
  if (kind === "update" && previous === undefined && !request.reinstall)
    throw new Error("Claude integration is not installed")
}
const assertPlanKind = (
  kind: Kind,
  request: ClaudeInstallationRequest,
  record: OwnedRecord | undefined,
  previous: OwnedRecord | undefined
): void => {
  assertInstallableRecord(kind, record)
  assertUpdatableRecord(kind, request, previous)
}
const plannedPostToolGroups = (
  kind: Kind,
  settings: JsonObject,
  input: ClaudeInputs,
  current: OwnedHookGroup | undefined
): unknown[] => {
  const next = [...groups(settings)]
  if (kind === "uninstall") {
    if (current !== undefined) next.splice(current.index, 1)
  } else if (current === undefined) next.push(input.group)
  else next[current.index] = input.group
  return next
}
const nextComposedGroup = (kind: Kind, group: unknown): unknown | undefined =>
  kind === "uninstall" ? undefined : group
const composedPlanEvents = (kind: Kind, input: ClaudeInputs, record: OwnedRecord | undefined) => {
  const composed: Partial<NonNullable<OwnedRecord["composed"]>> = record?.composed ?? {}
  const expected: Record<string, unknown> = record?.hookGroups ?? {}
  return [
    {
      event: "PreToolUse" as const,
      next: nextComposedGroup(kind, input.preGroup),
      fingerprint: composed.preToolUseDigest,
      expected: expected.PreToolUse
    },
    {
      event: "Stop" as const,
      next: nextComposedGroup(kind, input.stopGroup),
      fingerprint: composed.stopDigest,
      expected: expected.Stop
    },
    {
      event: "SubagentStop" as const,
      next: nextComposedGroup(kind, input.subagentStopGroup),
      fingerprint: composed.subagentStopDigest,
      expected: expected.SubagentStop
    },
    {
      event: "UserPromptSubmit" as const,
      next: nextComposedGroup(kind, input.promptGroup),
      fingerprint: composed.promptDigest,
      expected: expected.UserPromptSubmit
    }
  ]
}
const plannedSettings = (
  kind: Kind,
  settings: JsonObject,
  postGroups: readonly unknown[],
  input: ClaudeInputs,
  record: OwnedRecord | undefined
): JsonObject => {
  if (kind === "uninstall" && record === undefined) return settings
  let next = withGroups(settings, postGroups)
  for (const event of composedPlanEvents(kind, input, record))
    next = withComposedGroup(next, event.event, event.next, event.fingerprint, true, event.expected)
  return next
}
const installationOwnedRecord = (input: ClaudeInputs): OwnedRecord => ({
  version: OWNERSHIP_VERSION,
  adapter: "claude",
  home: input.home,
  hookDigest: digest(canonical(input.group)),
  command: input.command,
  ...(input.binding === undefined
    ? {}
    : {
        bindingDigest: input.binding.fingerprint,
        implementation: commandFromEntrypoint(input.runtime, input.entrypoint)
      }),
  hookGroups: {
    PostToolUse: input.group,
    PreToolUse: input.preGroup,
    Stop: input.stopGroup,
    SubagentStop: input.subagentStopGroup,
    UserPromptSubmit: input.promptGroup
  },
  composed: {
    preToolUseDigest: digest(canonical(input.preGroup)),
    stopDigest: digest(canonical(input.stopGroup)),
    promptDigest: digest(canonical(input.promptGroup)),
    subagentStopDigest: digest(canonical(input.subagentStopGroup))
  }
})
const missingContentDigest = (content: string | undefined): string => digest(content ?? "<missing>")
const plannedSettingsContent = (
  kind: Kind,
  record: OwnedRecord | undefined,
  before: string | undefined,
  next: JsonObject
): string | undefined =>
  (kind === "uninstall" && record === undefined) ||
  (before !== undefined && canonical(parseObject(before, "Claude settings.json")) === canonical(next))
    ? before
    : encode(next)
const assertOwnedBinding = (
  before: string | undefined,
  request: ClaudeInstallationRequest,
  record: OwnedRecord | undefined
): void => {
  if (
    before !== undefined &&
    !request.reinstall &&
    (record?.bindingDigest === undefined || bindingDigest(before) !== record.bindingDigest)
  )
    throw new Error("Claude hook launcher was locally modified or is not owned")
}
const equivalentUpdate = (
  kind: Kind,
  record: OwnedRecord | undefined,
  beforeBinding: string | undefined,
  input: ClaudeInputs,
  beforeSettings: string | undefined,
  afterSettings: string | undefined
): boolean =>
  kind === "update" &&
  record?.implementation !== undefined &&
  record.bindingDigest !== undefined &&
  beforeBinding !== undefined &&
  sameStandaloneImplementation(record.implementation, commandFromEntrypoint(input.runtime, input.entrypoint)) &&
  beforeSettings === afterSettings
const plannedBindingContent = (
  kind: Kind,
  record: OwnedRecord | undefined,
  equivalent: boolean,
  input: ClaudeInputs,
  before: string | undefined
): string | undefined => {
  if (kind === "uninstall") return record?.bindingDigest === undefined ? before : undefined
  return equivalent ? before : (input.binding?.content ?? before)
}
const plan = (kind: Kind, request: ClaudeInstallationRequest, input: ReturnType<typeof inputs>) => {
  const beforeSettings = file(input.paths.settings)
  const beforeRecord = file(input.paths.ownership)
  const beforeBinding = file(input.paths.binding)
  const originalSettings = parseObject(beforeSettings, "Claude settings.json")
  const settings = request.reinstall
    ? removeMarkedHandlers(originalSettings, [MARKER, COMPOSED_MARKER])
    : originalSettings
  const previousRecord = readPlanRecord(request, input)
  const record = request.reinstall ? undefined : previousRecord
  const current = owned(settings)
  if (record === undefined) assertNoComposedRecord(settings)
  assertOwnedHook(record, current)
  assertPlanKind(kind, request, record, previousRecord)
  const nextGroups = plannedPostToolGroups(kind, settings, input, current)
  const nextSettings = plannedSettings(kind, settings, nextGroups, input, record)
  const afterSettings = plannedSettingsContent(kind, record, beforeSettings, nextSettings)
  assertOwnedBinding(beforeBinding, request, previousRecord)
  const equivalent = equivalentUpdate(kind, previousRecord, beforeBinding, input, beforeSettings, afterSettings)
  const afterBinding = plannedBindingContent(kind, previousRecord, equivalent, input, beforeBinding)
  const afterRecord =
    kind === "uninstall" ? undefined : equivalent ? beforeRecord : encode(installationOwnedRecord(input))
  const proposalDigest = digest(
    canonical({
      version: 1,
      adapter: "claude",
      operation: kind,
      home: input.home,
      beforeSettings: missingContentDigest(beforeSettings),
      beforeRecord: missingContentDigest(beforeRecord),
      beforeBinding: missingContentDigest(beforeBinding),
      afterBinding: missingContentDigest(afterBinding),
      afterSettings: missingContentDigest(afterSettings),
      afterRecord: missingContentDigest(afterRecord)
    })
  )
  return {
    input,
    beforeSettings,
    beforeRecord,
    beforeBinding,
    afterBinding,
    afterSettings,
    afterRecord,
    proposalDigest,
    noChange: beforeSettings === afterSettings && beforeRecord === afterRecord && beforeBinding === afterBinding
  }
}

const resultError = (operation: string, cause: unknown, home?: string) => ({
  version: 1 as const,
  operation,
  status: "conflict" as const,
  home,
  error: { message: error(cause) }
})

const previewOperations = { install: "install-preview", update: "update-preview", uninstall: "uninstall" } as const
const proposalFileChange = (
  before: string | undefined,
  after: string | undefined,
  path: string,
  description: string
) => (before === after ? [] : [{ path, description }])
const previewHookGroups = (kind: Kind, next: ReturnType<typeof plan>, input: ClaudeInputs): Record<string, unknown> => {
  if (kind !== "uninstall") return installationOwnedRecord(input).hookGroups ?? {}
  if (next.beforeRecord === undefined) return {}
  return readRecord(input.paths.ownership)?.hookGroups ?? {}
}
const requiresSupportedHost = (kind: Kind, supported: boolean): boolean => kind !== "uninstall" && !supported
const preview = (kind: Kind, request: ClaudeInstallationRequest, input: ReturnType<typeof inputs>) => {
  const operation = previewOperations[kind]
  try {
    const compatibility = ready(input)
    if (requiresSupportedHost(kind, compatibility.supported))
      return {
        version: 1 as const,
        operation,
        status: "unsupported" as const,
        host: { adapter: "claude", home: input.home, compatibility }
      }
    const next = plan(kind, request, input)
    return {
      version: 1 as const,
      operation,
      status: "preview" as const,
      host: { adapter: "claude", home: input.home, compatibility },
      proposal: {
        digest: next.proposalDigest,
        changes: [
          ...proposalFileChange(
            next.beforeSettings,
            next.afterSettings,
            input.paths.settings,
            "owned PostToolUse, PreToolUse, Stop, SubagentStop and UserPromptSubmit hooks"
          ),
          ...proposalFileChange(next.beforeRecord, next.afterRecord, input.paths.ownership, "Claude ownership record"),
          ...proposalFileChange(
            next.beforeBinding,
            next.afterBinding,
            input.paths.binding,
            "scoped hook implementation"
          )
        ],
        ownedChanges: {
          hooks: { file: input.paths.settings, groups: previewHookGroups(kind, next, input) },
          ownershipRecord: input.paths.ownership
        }
      },
      installed: next.noChange && kind !== "uninstall",
      alreadyCurrent: next.noChange,
      trust: {
        status: next.beforeSettings === next.afterSettings ? "unchanged" : "native-confirmation-required",
        guidance:
          "Claude Code owns workspace trust and hook approval; open the repository normally and review native prompts."
      },
      pending: ["apply this proposal digest", "review effective file settings and credential access"]
    }
  } catch (cause) {
    return resultError(operation, cause, request.claudeHome)
  }
}

const assertClaudeFiles = (
  first: string,
  firstExpected: string | undefined,
  second: string,
  secondExpected: string | undefined,
  message: string
): void => {
  if (file(first) !== firstExpected || file(second) !== secondExpected) throw new Error(message)
}
const rollbackOwnedRecord = (input: ClaudeInputs, next: ReturnType<typeof plan>): void => {
  try {
    if (file(input.paths.settings) === next.beforeSettings && file(input.paths.ownership) === next.afterRecord)
      atomicInstallationFile(input.paths.ownership, next.beforeRecord)
  } catch {
    /* Preserve primary failure; inspection exposes partial state. */
  }
}
const rollbackOwnedBinding = (input: ClaudeInputs, next: ReturnType<typeof plan>): void => {
  try {
    if (
      file(input.paths.settings) === next.beforeSettings &&
      file(input.paths.binding) === next.afterBinding &&
      next.beforeBinding !== next.afterBinding
    )
      atomicInstallationFile(input.paths.binding, next.beforeBinding)
  } catch {
    /* Inspection reports partial state. */
  }
}
const commitClaudePlan = (input: ClaudeInputs, next: ReturnType<typeof plan>): void => {
  // Settings is applied last; each owned file is checked before mutation.
  try {
    assertClaudeFiles(
      input.paths.ownership,
      next.beforeRecord,
      input.paths.settings,
      next.beforeSettings,
      "Claude configuration changed during apply; obtain a fresh preview"
    )
    if (file(input.paths.binding) !== next.beforeBinding) throw new Error("Claude hook launcher changed since preview")
    if (next.beforeRecord !== next.afterRecord) atomicInstallationFile(input.paths.ownership, next.afterRecord)
    assertClaudeFiles(
      input.paths.settings,
      next.beforeSettings,
      input.paths.ownership,
      next.afterRecord,
      "Claude configuration changed during apply; current settings were preserved"
    )
    if (next.beforeBinding !== next.afterBinding) atomicInstallationFile(input.paths.binding, next.afterBinding)
    if (next.beforeSettings !== next.afterSettings) atomicInstallationFile(input.paths.settings, next.afterSettings)
  } catch (cause) {
    rollbackOwnedBinding(input, next)
    rollbackOwnedRecord(input, next)
    throw cause
  }
}
const nonemptyInstallationError = (cause: Error): string =>
  cause.message.length > 0 ? cause.message : "installation failed"
const installationFailureReason = (cause: unknown): string =>
  cause instanceof Error ? nonemptyInstallationError(cause) : "installation failed"
const apply = Effect.fn("ClaudeInstallation.apply")(function* (kind: Kind, request: ClaudeInstallationRequest) {
  const operation = kind
  try {
    const input = yield* resolveInputs(request)
    if (kind !== "uninstall" && !ready(input).supported)
      return { version: 1 as const, operation, status: "unsupported" as const, host: input.host }
    return yield* withInstallationLock(
      input.paths.lock,
      Effect.try({
        try: () => {
          const next = plan(kind, request, input)
          if (request.proposalDigest === undefined) return preview(kind, request, input)
          if (request.proposalDigest !== next.proposalDigest)
            return {
              version: 1 as const,
              operation,
              status: "proposal-mismatch" as const,
              error: { message: "Claude settings changed since preview; obtain a new proposal" }
            }
          if (next.noChange) return { version: 1 as const, operation, status: "already-current" as const }
          commitClaudePlan(input, next)
          return {
            version: 1 as const,
            operation,
            status: "complete" as const,
            trust: {
              status: next.beforeSettings === next.afterSettings ? "unchanged" : "native-confirmation-required"
            },
            restart: { required: next.beforeSettings !== next.afterSettings }
          }
        },
        catch: (cause) => new ClaudeInstallationError({ reason: installationFailureReason(cause) })
      })
    ).pipe(Effect.catch((error) => Effect.succeed(resultError(operation, error, request.claudeHome))))
  } catch (cause) {
    return resultError(operation, cause, request.claudeHome)
  }
})

export const previewClaudeInstallation = Effect.fn("ClaudeInstallation.preview")(function* (
  request: ClaudeInstallationRequest
) {
  return preview("install", request, yield* resolveInputs(request))
})
export const installClaudeIntegration = Effect.fn("ClaudeInstallation.install")((request: ClaudeInstallationRequest) =>
  apply("install", request)
)
export const previewClaudeUpdate = Effect.fn("ClaudeInstallation.previewUpdate")(function* (
  request: ClaudeInstallationRequest
) {
  return preview("update", request, yield* resolveInputs(request))
})
export const updateClaudeIntegration = Effect.fn("ClaudeInstallation.update")((request: ClaudeInstallationRequest) =>
  apply("update", request)
)
export const uninstallClaudeIntegration = Effect.fn("ClaudeInstallation.uninstall")(function* (
  request: ClaudeInstallationRequest
) {
  if (request.proposalDigest !== undefined) return yield* apply("uninstall", request)
  return preview("uninstall", request, yield* resolveInputs(request))
})

/** Include damaged owned state so an update reports it instead of silently skipping the client. */
export const hasClaudeRegistration = (request: ClaudeInstallationRequest): boolean => {
  const selected = paths(resolve(request.claudeHome ?? join(homedir(), ".claude")))
  if (file(selected.ownership) !== undefined) return true
  const settings = file(selected.settings) ?? ""
  return settings.includes(MARKER) || settings.includes(COMPOSED_MARKER)
}

const assertInspectionOwnership = (
  record: OwnedRecord | undefined,
  current: OwnedHookGroup | undefined,
  input: ClaudeInputs
): void => {
  if (record === undefined || current === undefined) throw new Error("owned Claude hook and ownership record disagree")
  if (record.home !== input.home || digest(canonical(current.group)) !== record.hookDigest)
    throw new Error("owned Claude hook and ownership record disagree")
}
const inspectComposedOwnership = (settings: JsonObject, record: OwnedRecord | undefined): void => {
  if (record?.composed === undefined) return
  withComposedGroup(settings, "PreToolUse", undefined, record.composed.preToolUseDigest)
  withComposedGroup(settings, "Stop", undefined, record.composed.stopDigest)
  withComposedGroup(settings, "SubagentStop", undefined, record.composed.subagentStopDigest)
  withComposedGroup(settings, "UserPromptSubmit", undefined, record.composed.promptDigest)
}
const inspect = (request: ClaudeInstallationRequest, input: ReturnType<typeof inputs>) => {
  try {
    const settings = parseObject(file(input.paths.settings), "Claude settings.json")
    const record = readRecord(input.paths.ownership)
    const current = owned(settings)
    if (record === undefined) assertNoComposedRecord(settings)
    if (record === undefined && current === undefined)
      return { version: 1 as const, operation: "inspect-installation", status: "ready" as const, installed: false }
    assertInspectionOwnership(record, current, input)
    inspectComposedOwnership(settings, record)
    return { version: 1 as const, operation: "inspect-installation", status: "ready" as const, installed: true }
  } catch (cause) {
    return resultError("inspect-installation", cause, request.claudeHome)
  }
}

export const inspectClaudeInstallation = Effect.fn("ClaudeInstallation.inspect")(function* (
  request: ClaudeInstallationRequest
) {
  return inspect(request, yield* resolveInputs(request))
})

export const diagnoseClaudeIntegration = Effect.fn("ClaudeInstallation.diagnose")(function* (
  request: ClaudeInstallationRequest
) {
  const input = yield* resolveInputs(request)
  const compatibility = ready(input)
  const inspection = inspect(request, input)
  const checks = [
    { stage: "host", status: compatibility.host.supported ? "ready" : "unsupported", observed: compatibility.host },
    {
      stage: "runtime",
      status: compatibility.runtime.observed === compatibility.runtime.required ? "ready" : "unsupported",
      observed: compatibility.runtime
    },
    {
      stage: "configuration-ownership",
      status: inspection.status === "conflict" ? "conflict" : inspection.installed ? "ready" : "missing",
      observed: inspection
    },
    {
      stage: "native-trust",
      status: "unknown",
      observed: "Claude Code workspace trust and hook approval are host-owned"
    },
    { stage: "file-selection", status: "unknown", observed: "inspect effective file settings" }
  ]
  return {
    version: 1 as const,
    operation: "doctor" as const,
    status: checks.some(
      (check) => check.status === "conflict" || check.status === "unsupported" || check.status === "missing"
    )
      ? ("not-ready" as const)
      : ("unknown" as const),
    offline: true as const,
    readOnly: true as const,
    providerCalls: 0 as const,
    checks
  }
})
