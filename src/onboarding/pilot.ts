import { formatOutcome, formatStatusOutcome } from "./human-output.ts"
import type { profileFields } from "./client-command.ts"
import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"
import { formatInstallationRequirements, formatProposal } from "./client-lifecycle.ts"
import type { SetupClient } from "./client-selection.ts"
import type { SetupRequest, runSetup } from "./setup.ts"
import type { execFileClosedStdin } from "./host-process.ts"
import { credentialSourceGuidance } from "./credential-guidance.ts"
import { JEV_PROVIDER } from "../runtime/backend.ts"
import { setupCommand } from "../runtime/cli-names.ts"

type SetupResult = Effect.Success<ReturnType<typeof runSetup>>
type SetupStage = SetupResult["stages"][number]
export interface PilotOptions {
  readonly terminal: boolean
  readonly newKey?: boolean
  readonly host: SetupClient
  readonly fields: ReturnType<typeof profileFields>
  readonly cwd: string
  readonly platform: NodeJS.Platform
}
export interface PilotPorts {
  readonly run: (request: SetupRequest, credentialEntered: () => void) => Effect.Effect<SetupResult, unknown>
  readonly activate: Effect.Effect<void, unknown>
  readonly doctor: Effect.Effect<Effect.Success<ReturnType<typeof execFileClosedStdin>>, unknown>
  readonly verifyCredential: Effect.Effect<void, unknown>
  readonly confirm: (question: string) => Effect.Effect<boolean, unknown>
  readonly write: (text: string) => void
  readonly exitCode: (code: number) => void
}
type PilotFrame = { readonly options: PilotOptions; readonly ports: PilotPorts; readonly hostName: string }
const setupStage = (result: SetupResult, name: SetupStage["stage"]): SetupStage | undefined =>
  result.stages.find((item) => item.stage === name)
const stageSummary = (result: SetupResult, name: SetupStage["stage"]): string =>
  setupStage(result, name)?.summary ?? "unavailable"
const stageStatus = (result: SetupResult, name: SetupStage["stage"]): string => setupStage(result, name)?.status ?? ""
const setupAction = (result: SetupResult, code: string) => result.actions.find((item) => item.code === code)
const writeSetupActions = (result: SetupResult, ports: PilotPorts): void => {
  for (const action of result.actions) ports.write(`${formatOutcome("info", `Next: ${action.action}.`)}\n`)
}
const compatibilitySetupReady = (frame: PilotFrame, result: SetupResult): boolean => {
  if (stageStatus(result, "compatibility") === "complete") return true
  frame.ports.write(
    `${formatOutcome("error", `Cannot install Hapsland for the selected ${frame.hostName} executable.`)}\n`
  )
  for (const line of formatInstallationRequirements(setupStage(result, "compatibility")?.observed))
    frame.ports.write(`${line}\n`)
  frame.ports.write(`${result.actions[0]?.action ?? `Use a declared ${frame.hostName} profile.`}\n`)
  frame.ports.exitCode(3)
  return false
}
const installationSetupReady = (frame: PilotFrame, result: SetupResult): boolean => {
  if (["complete", "pending", "partial"].includes(stageStatus(result, "installation"))) return true
  frame.ports.write(
    `${formatStatusOutcome(stageStatus(result, "installation"), `Installation: ${stageSummary(result, "installation")}.`)}\n`
  )
  writeSetupActions(result, frame.ports)
  frame.ports.exitCode(result.status === "partial" ? 5 : 4)
  return false
}
const installationStageProposal = (result: SetupResult): unknown => {
  const observed = setupStage(result, "installation")?.observed
  return typeof observed === "object" && observed !== null && "proposal" in observed ? observed.proposal : undefined
}
const setupAuthorization = Effect.fn("Pilot.setupAuthorization")(function* (
  action: SetupResult["actions"][number] | undefined,
  rulesAction: SetupResult["actions"][number] | undefined
) {
  const digest = action?.authorization?.installProposalDigest
  if (action !== undefined && digest === undefined)
    return yield* Effect.fail(new Error("installation preview omitted its approval digest"))
  const rulesDigest = rulesAction?.authorization?.rulesProposalDigest
  return {
    ...(digest === undefined ? {} : { installProposalDigest: digest }),
    ...(rulesDigest === undefined ? {} : { rulesProposalDigest: rulesDigest })
  }
})
const approveSetupInstallation = Effect.fn("Pilot.approveInstallation")(function* (
  frame: PilotFrame,
  result: SetupResult,
  request: SetupRequest
) {
  const action = setupAction(result, "approve-installation") ?? setupAction(result, "resume-installation")
  const rulesAction = setupAction(result, "approve-default-rules")
  if (action === undefined && rulesAction === undefined) return request
  frame.ports.write(`Installation preview:\n${formatProposal(installationStageProposal(result)).join("\n")}\n`)
  if (rulesAction !== undefined) frame.ports.write(`Rules preview: ${rulesAction.action}.\n`)
  if (!(yield* frame.ports.confirm(`Apply these setup changes for ${frame.hostName}?`))) {
    frame.ports.write(
      `${formatOutcome("info", `Installation was not changed. Run ${setupCommand(frame.options.host)} to resume.`)}\n`
    )
    return undefined
  }
  return { ...request, ...(yield* setupAuthorization(action, rulesAction)) }
})
const setupCredentialComplete = (result: SetupResult): boolean =>
  stageStatus(result, "installation") === "complete" && stageStatus(result, "credential") === "complete"
const reportSavedCredential = (frame: PilotFrame, result: SetupResult, entered: boolean): void => {
  if (entered && stageStatus(result, "credential") === "complete")
    frame.ports.write(
      `${JEV_PROVIDER.name} key saved in ${frame.options.platform === "darwin" ? "Keychain" : "Secret Service"}.\n`
    )
}
const reportInactiveSavedKey = (frame: PilotFrame, observed: unknown): void => {
  if (typeof observed === "object" && observed !== null && "source" in observed && observed.source !== "saved")
    frame.ports.write(
      `${formatOutcome("warning", "The newly saved key is not active: an environment or file key takes priority.")}\n`
    )
}
const reportSetupCredential = (frame: PilotFrame, result: SetupResult, entered: boolean): boolean => {
  reportSavedCredential(frame, result, entered)
  frame.ports.write(
    `${formatStatusOutcome(stageStatus(result, "credential"), `Credential: ${stageSummary(result, "credential")}. No real verification or review was sent.`)}\n`
  )
  const complete = setupCredentialComplete(result)
  if (!complete)
    for (const line of credentialSourceGuidance(
      setupStage(result, "credential")?.observed,
      frame.options.host,
      frame.options.platform
    ))
      frame.ports.write(`${formatOutcome("info", line)}\n`)
  if (entered) reportInactiveSavedKey(frame, setupStage(result, "credential")?.observed)
  if (complete) return true
  frame.ports.write(`${formatOutcome("warning", "Setup incomplete: installation or credentials need attention.")}\n`)
  writeSetupActions(result, frame.ports)
  frame.ports.exitCode(result.status === "partial" ? 5 : 6)
  return false
}
const reportSetupRepository = (frame: PilotFrame, result: SetupResult): boolean => {
  frame.ports.write(
    `${formatStatusOutcome(stageStatus(result, "repository"), `Repository: ${stageSummary(result, "repository")}.`)}\n`
  )
  if (stageStatus(result, "repository") === "complete") return true
  frame.ports.write(`${formatOutcome("warning", "Setup incomplete: repository settings need attention.")}\n`)
  writeSetupActions(result, frame.ports)
  frame.ports.exitCode(6)
  return false
}
const SetupDiagnosis = Schema.Struct({
  status: Schema.String,
  nextSteps: Schema.optionalKey(Schema.Array(Schema.Struct({ action: Schema.String }))),
  checks: Schema.optionalKey(Schema.Array(Schema.Struct({ stage: Schema.String, status: Schema.String })))
})
const decodeSetupDiagnosis = Effect.fn("Pilot.decodeDiagnosis")(function* (stdout: string) {
  const parsed = yield* Effect.try(() => JSON.parse(stdout))
  return yield* Schema.decodeUnknownEffect(SetupDiagnosis)(parsed)
})
const writeSetupDiagnosis = (frame: PilotFrame, diagnosis: typeof SetupDiagnosis.Type): void => {
  frame.ports.write(`${formatStatusOutcome(diagnosis.status, `Setup: offline readiness: ${diagnosis.status}.`)}\n`)
  for (const next of diagnosis.nextSteps ?? []) frame.ports.write(`${formatOutcome("info", `Next: ${next.action}.`)}\n`)
  for (const check of diagnosis.checks ?? []) {
    if (check.status !== "ready")
      frame.ports.write(`${formatStatusOutcome(check.status, `${check.stage}: ${check.status}.`)}\n`)
  }
  frame.ports.write(
    `${formatOutcome("info", `Next: restart ${frame.hostName}, complete native repository and hook trust, then make an ordinary supported edit and inspect review activity. A real review was not verified by setup.`)}\n`
  )
}
const diagnoseSetup = Effect.fn("Pilot.diagnose")(function* (frame: PilotFrame) {
  const doctor = yield* frame.ports.doctor
  if (!doctor.succeeded) {
    frame.ports.write(
      `${formatOutcome("error", `Readiness check could not complete. Run hapsland setup ${frame.options.host} again or hapsland doctor ${frame.options.host}.`)}\n`
    )
    frame.ports.exitCode(6)
    return
  }
  const result = yield* decodeSetupDiagnosis(doctor.stdout).pipe(Effect.result)
  if (result._tag === "Failure") {
    frame.ports.write(
      `${formatOutcome("error", `Readiness result was unreadable. Rerun hapsland setup ${frame.options.host} or hapsland doctor ${frame.options.host}.`)}\n`
    )
    frame.ports.exitCode(6)
    return
  }
  writeSetupDiagnosis(frame, result.success)
})
const runApprovedSetup = Effect.fn("Pilot.runApproved")(function* (
  frame: PilotFrame,
  request: SetupRequest,
  entered: () => void,
  credentialWasEntered: () => boolean
) {
  const result = yield* frame.ports.run({ ...request, interactive: true }, entered)
  frame.ports.write(
    `${formatStatusOutcome(stageStatus(result, "installation"), `Installation: ${stageSummary(result, "installation")}.`)}\n`
  )
  if (["complete", "partial"].includes(stageStatus(result, "installation"))) yield* frame.ports.activate
  if (!reportSetupCredential(frame, result, credentialWasEntered())) return
  if (!reportSetupRepository(frame, result)) return
  yield* frame.ports.verifyCredential
  yield* diagnoseSetup(frame)
})
export const runPilotSetup = Effect.fn("Pilot.run")(function* (options: PilotOptions, ports: PilotPorts) {
  if (!options.terminal) {
    ports.write(
      "Guided setup needs a terminal. Run hapsland --pilot there, or use hapsland --setup with a versioned JSON request.\n"
    )
    ports.exitCode(6)
    return
  }
  const frame: PilotFrame = {
    options,
    ports,
    hostName: { claude: "Claude Code", codex: "Codex", pi: "Pi" }[options.host]
  }
  const request: SetupRequest = {
    version: 1,
    operation: "setup",
    ...options.fields,
    scope: { cwd: options.cwd, review: "enabled" },
    credential: "saved",
    ...(options.newKey ? { newKey: true } : {})
  }
  let credentialEntered = false
  const entered = () => {
    credentialEntered = true
  }
  ports.write(
    `${frame.hostName} review integration setup. Selected profile hooks apply across repositories according to file settings. Installation and local checks make no ${JEV_PROVIDER.name} calls; an optional key verification is offered separately.\n`
  )
  const result = yield* ports.run(request, entered)
  if (!compatibilitySetupReady(frame, result)) return
  if (!installationSetupReady(frame, result)) return
  const approved = yield* approveSetupInstallation(frame, result, request)
  if (approved === undefined) return
  yield* runApprovedSetup(frame, approved, entered, () => credentialEntered)
})
