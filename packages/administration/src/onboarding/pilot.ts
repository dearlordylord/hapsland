import { childFlow, flowInteraction } from "../interaction/flow-input.ts"
import { Context, Effect, Exit, Schema, Terminal } from "effect"
import { CLIENT_NAMES } from "@hapsland/runtime-environment/runtime/agent-clients"
import { ConfigurationError } from "@hapsland/runtime-inputs/configuration/errors"
import { JEV_PROVIDER } from "@hapsland/runtime-environment/runtime/backend"
import { setupCommand as setupInvocation } from "@hapsland/runtime-environment/runtime/cli-names"
import type { HostProcessResult } from "@hapsland/runtime-environment/process/closed-stdin"
import { formatOutcome, formatStatusOutcome } from "../interaction/outcome.ts"
import type { profileFields } from "./client-command.ts"
import { formatInstallationRequirements, formatProposal } from "./client-lifecycle.ts"
import type { SetupClient } from "./client-selection.ts"
import type { SetupRequest, SetupProgressObservation, runSetup } from "./setup.ts"
import { credentialSourceGuidance } from "./credential-guidance.ts"
import type { VerificationOutcome } from "./verification-conversation.ts"
import {
  initialSetup,
  reduceSetup,
  setupCommand,
  setupObservationReady,
  type SetupModel,
  type SetupEvent,
  type SetupObservation,
  type SetupCommand
} from "./setup-model.ts"

type SetupResult = Effect.Success<ReturnType<typeof runSetup>>
type SetupStage = SetupResult["stages"][number]
export interface PilotOptions {
  readonly terminal: boolean
  readonly newKey?: boolean
  readonly host: SetupClient
  readonly fields: ReturnType<typeof profileFields>
  readonly cwd: string
  readonly platform: NodeJS.Platform
  readonly request?: SetupRequest
}
export interface SetupOwner {
  readonly run: (
    request: SetupRequest,
    credentialEntered: () => void,
    observeProgress: (progress: SetupProgressObservation) => Effect.Effect<void>
  ) => Effect.Effect<SetupResult, unknown>
  readonly activate: Effect.Effect<void, unknown>
  readonly doctor: Effect.Effect<HostProcessResult, unknown>
  readonly verifyCredential: Effect.Effect<VerificationOutcome, unknown>
}
export class SetupOwnerService extends Context.Service<SetupOwnerService, SetupOwner>()(
  "@hapsland/administration/SetupOwner"
) {}
export type SetupTransition = { before: SetupModel; event: SetupEvent; after: SetupModel }
export type SetupOutcome = { kind: "completed" | "cancelled" | "back"; model: SetupModel; exitCode: number }
const stage = (result: SetupResult, name: SetupStage["stage"]) => result.stages.find((item) => item.stage === name)
const stageLine = (result: SetupResult, name: SetupStage["stage"], label: string, suffix = "") =>
  `${formatStatusOutcome(stage(result, name)?.status ?? "", `${label}: ${stage(result, name)?.summary ?? "unavailable"}.${suffix}`)}\n`
const action = (result: SetupResult, code: string) => result.actions.find((item) => item.code === code)
const record = (value: unknown): Record<string, unknown> | undefined =>
  typeof value === "object" && value !== null ? (value as Record<string, unknown>) : undefined
const safeCredential = (stages: SetupProgressObservation["stages"]): SetupObservation["credential"] => {
  const credential = record(stages.find((item) => item.stage === "credential")?.observed)
  if (typeof credential?.status !== "string") return undefined
  return {
    status: credential.status,
    ...(typeof credential.generation !== "number" ? {} : { generation: credential.generation })
  }
}
const progressObservation = (progress: SetupProgressObservation): SetupObservation => {
  const credential = safeCredential(progress.stages)
  return {
    status: "in-progress",
    stages: progress.stages.map((item) => ({ stage: item.stage, status: item.status })),
    ...(credential === undefined ? {} : { credential })
  }
}
const approvalDigest = (approval: SetupResult["actions"][number] | undefined, field: string): string | undefined => {
  if (approval === undefined) return undefined
  const digest = approval.authorization?.[field]
  if (!digest) throw new Error("setup preview omitted its approval digest")
  return digest
}
const observation = (result: SetupResult): SetupObservation => {
  const installDigest = approvalDigest(
    action(result, "approve-installation") ?? action(result, "resume-installation"),
    "installProposalDigest"
  )
  const rulesDigest = approvalDigest(action(result, "approve-default-rules"), "rulesProposalDigest")
  return {
    ...progressObservation(result),
    status: result.status,
    ...(installDigest === undefined ? {} : { installDigest }),
    ...(rulesDigest === undefined ? {} : { rulesDigest })
  }
}
const approvedRequest = (request: SetupRequest, model: SetupModel): SetupRequest => ({
  ...request,
  interactive: true,
  ...(model.installApproved === undefined ? {} : { installProposalDigest: model.installApproved }),
  ...(model.rulesApproved === undefined ? {} : { rulesProposalDigest: model.rulesApproved })
})
const staleRules = (error: unknown): boolean =>
  error instanceof ConfigurationError && error.field === "rulesProposalDigest" && error.reason.includes("stale")
const approvalView = (result: SetupResult, model: SetupModel, hostName: string) => {
  const rules = model.phase === "RulesApproval"
  const digest = rules ? model.proposal?.rulesDigest : model.proposal?.installDigest
  if (!digest) throw new Error("Setup approval requires its current digest")
  return {
    kind: rules ? ("approveRules" as const) : ("approveHooks" as const),
    digest,
    message: rules ? "Apply these default rule changes?" : `Apply these setup changes for ${hostName}?`,
    preview: rules
      ? `Rules preview: ${action(result, "approve-default-rules")?.action ?? ""}.`
      : `Installation preview:\n${formatProposal(record(stage(result, "installation")?.observed)?.proposal).join("\n")}`,
    back: true
  }
}
const SetupDiagnosis = Schema.Struct({
  status: Schema.String,
  nextSteps: Schema.optionalKey(Schema.Array(Schema.Struct({ action: Schema.String }))),
  checks: Schema.optionalKey(Schema.Array(Schema.Struct({ stage: Schema.String, status: Schema.String })))
})
const decodeDiagnosis = (stdout: string) =>
  Effect.try(() => JSON.parse(stdout)).pipe(Effect.flatMap(Schema.decodeUnknownEffect(SetupDiagnosis)))
const previewRequest = (options: PilotOptions): SetupRequest => {
  const request: SetupRequest = options.request ?? {
    version: 1,
    operation: "setup",
    ...options.fields,
    scope: { cwd: options.cwd, review: "enabled" },
    credential: "saved",
    ...(options.newKey ? { newKey: true } : {})
  }
  const {
    interactive: _interactive,
    installProposalDigest: _install,
    rulesProposalDigest: _rules,
    ...preview
  } = request
  return preview
}
export const runPilotSetup = Effect.fn("SetupConversation.run")(function* (
  options: PilotOptions,
  hooks: { observe?: (transition: SetupTransition) => Effect.Effect<void> } = {}
) {
  const owner = yield* SetupOwnerService
  const interaction = yield* flowInteraction("setup")
  let model = initialSetup()
  let current: SetupResult | undefined
  let credentialEntered = false
  const hostName = CLIENT_NAMES[options.host]
  const readinessName = options.host === "codex" ? "Codex" : hostName
  const request = previewRequest(options)
  const dispatch = (action: SetupEvent["action"]) =>
    Effect.gen(function* () {
      const before = model
      const event = { revision: before.revision, action }
      model = reduceSetup(before, event)
      yield* hooks.observe?.({ before, event, after: model }) ?? Effect.void
    })
  const writeActions = (result: SetupResult) =>
    Effect.forEach(
      result.actions,
      (item) => interaction.present(`${formatOutcome("info", `Next: ${item.action}.`)}\n`),
      { discard: true }
    )
  const reportPreview = (result: SetupResult) =>
    Effect.gen(function* () {
      if (stage(result, "compatibility")?.status !== "complete") {
        yield* interaction.present(
          `${formatOutcome("error", `Cannot install Hapsland for the selected ${hostName} executable.`)}\n`
        )
        for (const line of formatInstallationRequirements(stage(result, "compatibility")?.observed))
          yield* interaction.present(`${line}\n`)
        yield* interaction.present(`${result.actions[0]?.action ?? `Use a declared ${hostName} profile.`}\n`)
      } else if (model.phase === "Done") {
        yield* interaction.present(stageLine(result, "installation", "Installation"))
        yield* writeActions(result)
      }
    })
  const reportSavedCredential = (result: SetupResult) =>
    Effect.gen(function* () {
      if (credentialEntered && stage(result, "credential")?.status === "complete") {
        yield* interaction.present(
          `${JEV_PROVIDER.name} key saved in ${options.platform === "darwin" ? "Keychain" : "Secret Service"}.\n`
        )
        const observed = record(stage(result, "credential")?.observed)
        if (observed?.source !== undefined && observed.source !== "saved")
          yield* interaction.present(
            `${formatOutcome("warning", "The newly saved key is not active: an environment or file key takes priority.")}\n`
          )
      }
    })
  const reportApplication = (result: SetupResult) =>
    Effect.gen(function* () {
      yield* interaction.present(stageLine(result, "installation", "Installation"))
      yield* reportSavedCredential(result)
      yield* interaction.present(
        stageLine(result, "credential", "Credential", " No real verification or review was sent.")
      )
      yield* interaction.present(stageLine(result, "repository", "Repository"))
      if (stage(result, "rules") !== undefined) yield* interaction.present(stageLine(result, "rules", "Rules"))
      if (!setupObservationReady(progressObservation(result))) {
        for (const line of credentialSourceGuidance(
          stage(result, "credential")?.observed,
          options.host,
          options.platform
        ))
          yield* interaction.present(`${formatOutcome("info", line)}\n`)
        yield* interaction.present(
          `${formatOutcome("warning", "Setup incomplete: installation, credentials, rules or repository settings need attention.")}\n`
        )
        yield* writeActions(result)
      }
    })
  const run = (id: number, applying: boolean) =>
    Effect.gen(function* () {
      const input = applying ? approvedRequest(request, model) : request
      let sequence = 0
      const result = yield* owner
        .run(
          input,
          () => {
            credentialEntered = true
          },
          (progress) =>
            applying
              ? dispatch({
                  kind: "progressed",
                  commandId: id,
                  sequence: ++sequence,
                  observation: progressObservation(progress)
                })
              : Effect.void
        )
        .pipe(Effect.result)
      if (result._tag === "Failure") {
        if (applying && staleRules(result.failure)) {
          yield* dispatch({ kind: "stale", commandId: id })
          yield* interaction.present(
            "The default rules proposal changed. Preview the current changes and approve again.\n"
          )
          return
        }
        yield* dispatch({ kind: "failed", commandId: id })
        return yield* Effect.fail(result.failure)
      }
      current = result.success
      const safe = yield* Effect.try({
        try: () => observation(result.success),
        catch: () => new Error("setup preview omitted its approval digest")
      })
      yield* dispatch({ kind: applying ? "applied" : "previewed", commandId: id, observation: safe })
      yield* applying ? reportApplication(result.success) : reportPreview(result.success)
    })
  const approve = () =>
    Effect.gen(function* () {
      if (!current) return yield* Effect.die(new Error("Setup approval requires an observed proposal"))
      const view = yield* Effect.try({
        try: () => approvalView(current!, model, hostName),
        catch: () => new Error("Setup approval requires its current digest")
      })
      const answer = yield* interaction.confirm(view)
      yield* dispatch(
        answer.kind === "confirmed" ? { kind: view.kind, digest: view.digest, yes: answer.yes } : { kind: answer.kind }
      )
      if (answer.kind === "confirmed" && !answer.yes)
        yield* interaction.present(
          `${formatOutcome("info", `No new setup changes were applied. Previously observed changes are retained. Run ${setupInvocation(options.host)} to resume.`)}\n`
        )
    }).pipe(
      Effect.catchIf(
        (error) => error instanceof Terminal.QuitError,
        () => dispatch({ kind: "exit" })
      )
    )
  const activate = (id: number) =>
    Effect.gen(function* () {
      const result = yield* owner.activate.pipe(Effect.result)
      if (result._tag === "Failure") {
        yield* dispatch({ kind: "failed", commandId: id })
        yield* interaction.present(
          "Public command activation failed. Observed installation and credential changes remain; keep this package and retry setup.\n"
        )
        return yield* Effect.fail(result.failure)
      }
      yield* dispatch({ kind: "activated", commandId: id })
    })
  const reportDiagnosis = (diagnosis: typeof SetupDiagnosis.Type) =>
    Effect.gen(function* () {
      yield* interaction.present(
        `${formatStatusOutcome(diagnosis.status, `Setup: offline readiness: ${diagnosis.status}.`)}\n`
      )
      for (const next of diagnosis.nextSteps ?? [])
        yield* interaction.present(`${formatOutcome("info", `Next: ${next.action}.`)}\n`)
      for (const check of diagnosis.checks ?? [])
        if (check.status !== "ready")
          yield* interaction.present(`${formatStatusOutcome(check.status, `${check.stage}: ${check.status}.`)}\n`)
      yield* interaction.present(
        `${formatOutcome("info", `Next: restart ${readinessName}, complete native repository and hook trust, then make an ordinary supported edit and inspect review activity. A real review was not verified by setup.`)}\n`
      )
    })
  const diagnose = (id: number) =>
    Effect.gen(function* () {
      const result = yield* owner.doctor
      const diagnosis = result.succeeded ? yield* decodeDiagnosis(result.stdout).pipe(Effect.result) : undefined
      if (!diagnosis || diagnosis._tag === "Failure") {
        yield* interaction.present(
          `${formatOutcome("error", `${result.succeeded ? "Readiness result was unreadable" : "Readiness check could not complete"}. Run hapsland setup ${options.host} again or hapsland doctor ${options.host}.`)}\n`
        )
        yield* dispatch({ kind: "diagnosed", commandId: id, status: "unavailable", succeeded: false })
        return
      }
      yield* dispatch({ kind: "diagnosed", commandId: id, status: diagnosis.success.status, succeeded: true })
      yield* reportDiagnosis(diagnosis.success)
    })
  const runCommand = (command: SetupCommand) =>
    Effect.gen(function* () {
      switch (command.kind) {
        case "preview":
          yield* run(command.id, false)
          break
        case "apply":
          yield* run(command.id, true)
          break
        case "activate":
          yield* activate(command.id)
          break
        case "verify":
          yield* dispatch({
            kind: "verified",
            commandId: command.id,
            outcome: yield* childFlow("setup", "verification", owner.verifyCredential)
          })
          break
        case "diagnose":
          yield* diagnose(command.id)
          break
      }
    })
  if (!options.terminal) {
    yield* interaction.present(
      "Guided setup needs a terminal. Run hapsland --pilot there, or use hapsland --setup with a versioned JSON request.\n"
    )
    return { kind: "completed", model: { ...model, phase: "Done", exitCode: 6 }, exitCode: 6 } satisfies SetupOutcome
  }
  yield* interaction.present(
    `${hostName} review integration setup. Selected profile hooks apply across repositories according to file settings. Installation and local checks make no ${JEV_PROVIDER.name} calls; an optional key verification is offered separately.\n`
  )
  return yield* Effect.gen(function* () {
    while (!["Done", "Cancelled", "Back", "Failed"].includes(model.phase)) {
      const command = setupCommand(model)
      if (!command) {
        yield* approve()
        continue
      }
      yield* runCommand(command)
    }
    return {
      kind: model.phase === "Cancelled" ? "cancelled" : model.phase === "Back" ? "back" : "completed",
      model,
      exitCode: model.exitCode
    } satisfies SetupOutcome
  }).pipe(
    Effect.onExit((exit) =>
      Exit.isFailure(exit)
        ? interaction.present(
            `Setup stopped. Observed stages: ${
              model.observations
                .at(-1)
                ?.stages.map((item) => `${item.stage}=${item.status}`)
                .join(", ") ?? "none"
            }. Activation: ${model.activation}. Previously observed changes remain; no rollback is implied.\n`
          )
        : Effect.void
    )
  )
})
