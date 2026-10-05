import { formatOutcome, formatStatusOutcome } from "./human-output.ts"
import type { profileFields } from "./client-command.ts"
import * as Effect from "effect/Effect"
import { formatFailure, formatProposal, type invokeLifecycle } from "./client-lifecycle.ts"
import type { SetupClient } from "./client-selection.ts"

type LifecycleResult = Effect.Success<ReturnType<typeof invokeLifecycle>>
type LifecycleProposal = NonNullable<LifecycleResult["proposal"]>
type UpdateOutcome = "updated" | "already current" | "skipped" | "failed"
const updateRequest = (
  fields: ReturnType<typeof profileFields>,
  operation: "update-preview" | "update",
  proposalDigest?: string
) => ({ version: 1 as const, operation, ...fields, ...(proposalDigest === undefined ? {} : { proposalDigest }) })
export interface UpdatePorts {
  readonly fields: (host: SetupClient) => ReturnType<typeof profileFields>
  readonly registered: (
    flags: ReadonlyMap<string, string>,
    onError: (host: SetupClient, cause: unknown) => void
  ) => SetupClient[]
  readonly target: Effect.Effect<string, unknown>
  readonly invoke: (
    executable: string,
    host: SetupClient,
    request: ReturnType<typeof updateRequest>,
    environment: NodeJS.ProcessEnv
  ) => Effect.Effect<LifecycleResult, unknown>
  readonly activate: (executable: string) => Effect.Effect<void, unknown>
  readonly confirm: (question: string) => Effect.Effect<boolean, unknown>
  readonly write: (text: string) => void
  readonly reportFailure: (host: SetupClient, cause: unknown) => void
}
export interface UpdateOptions {
  readonly terminal: boolean
  readonly host: SetupClient | undefined
  readonly flags: ReadonlyMap<string, string>
  readonly environment: NodeJS.ProcessEnv
}
type UpdateState = {
  readonly outcomes: Map<SetupClient, UpdateOutcome>
  readonly proposals: Array<{ host: SetupClient; digest: string }>
}
type UpdateFrame = UpdateState & {
  readonly ports: UpdatePorts
  readonly executable: string
  readonly environment: NodeJS.ProcessEnv
}
const failedUpdate = (state: UpdateState, ports: UpdatePorts, host: SetupClient, cause: unknown): void => {
  ports.reportFailure(host, cause)
  state.outcomes.set(host, "failed")
}
const runHostStep = Effect.fn("Update.hostStep")(function* (
  frame: UpdateFrame,
  host: SetupClient,
  step: Effect.Effect<void, unknown>
) {
  const result = yield* step.pipe(
    Effect.catchDefect((cause) => Effect.fail(cause)),
    Effect.result
  )
  if (result._tag === "Failure") failedUpdate(frame, frame.ports, host, result.failure)
})
const updateEnvironment = (environment: NodeJS.ProcessEnv): NodeJS.ProcessEnv => {
  const child = { ...environment }
  delete child.REVIEW_INSTALL_RUNTIME
  delete child.REVIEW_INSTALL_ENTRYPOINT
  return child
}
const invokeUpdate = Effect.fn("Update.invoke")(function* (
  frame: UpdateFrame,
  host: SetupClient,
  operation: "update-preview" | "update",
  digest?: string
) {
  const output = yield* frame.ports.invoke(
    frame.executable,
    host,
    updateRequest(frame.ports.fields(host), operation, digest),
    frame.environment
  )
  for (const line of formatProposal(output.proposal)) frame.ports.write(`${line}\n`)
  return output
})
const applicableUpdateProposal = (preview: LifecycleResult): LifecycleProposal => {
  if (!["preview", "partial"].includes(preview.status) || preview.proposal === undefined)
    throw new Error("target did not return an applicable update preview")
  return preview.proposal
}
const currentUpdate = (preview: LifecycleResult, proposal: LifecycleProposal): boolean =>
  preview.alreadyCurrent === true || proposal.changes?.length === 0
const previewUpdateHost = Effect.fn("Update.previewHost")(function* (frame: UpdateFrame, host: SetupClient) {
  frame.ports.write(`Preview ${host}:\n`)
  const preview = yield* invokeUpdate(frame, host, "update-preview")
  const proposal = applicableUpdateProposal(preview)
  if (currentUpdate(preview, proposal)) {
    frame.outcomes.set(host, "already current")
    yield* frame.ports.activate(frame.executable)
    return
  }
  frame.proposals.push({ host, digest: proposal.digest })
})
const applyUpdateHost = Effect.fn("Update.applyHost")(function* (
  frame: UpdateFrame,
  proposal: UpdateState["proposals"][number]
) {
  const result = yield* invokeUpdate(frame, proposal.host, "update", proposal.digest)
  if (result.status === "partial") {
    yield* frame.ports.activate(frame.executable)
    return yield* Effect.fail(
      new Error(
        `${formatFailure(result, proposal.host)} Next: hapsland repair ${proposal.host}. The selected package is retained for recovery.`
      )
    )
  }
  if (!["updated", "complete", "already-current"].includes(result.status))
    return yield* Effect.fail(new Error(formatFailure(result, proposal.host)))
  frame.outcomes.set(proposal.host, result.status === "already-current" ? "already current" : "updated")
  yield* frame.ports.activate(frame.executable)
})
const applyUpdateProposals = Effect.fn("Update.applyProposals")(function* (frame: UpdateFrame) {
  if (frame.proposals.length === 0) return
  const apply = yield* frame.ports.confirm(
    `Apply these changes to ${frame.proposals.map((proposal) => proposal.host).join(", ")} profiles?`
  )
  for (const proposal of frame.proposals) {
    if (!apply) {
      frame.outcomes.set(proposal.host, "skipped")
      continue
    }
    yield* runHostStep(frame, proposal.host, applyUpdateHost(frame, proposal))
  }
})
const writeUpdateOutcomes = (frame: UpdateFrame): void => {
  for (const [host, status] of frame.outcomes) {
    frame.ports.write(`${formatStatusOutcome(status, `${host} update: ${status}.`)}\n`)
    if (status === "updated")
      frame.ports.write(
        `${formatOutcome("info", `Next: finish current work, restart ${host}, and review native trust prompts. A real review was not verified by update.`)}\n`
      )
  }
  frame.ports.write("Retain previous packages until their hooks and active sessions no longer depend on them.\n")
}
const updateHosts = (options: UpdateOptions, state: UpdateState, ports: UpdatePorts): SetupClient[] =>
  options.host === undefined
    ? ports.registered(options.flags, (host, cause) => failedUpdate(state, ports, host, cause))
    : [options.host]
const writeNoUpdateHosts = (state: UpdateState, ports: UpdatePorts): void => {
  ports.write(
    state.outcomes.size === 0
      ? "No Hapsland integrations found. Run hapsland setup first.\n"
      : "No client registrations could be selected for update. Resolve the reported discovery errors.\n"
  )
}
export const updateClients = Effect.fn("Update.clients")(function* (options: UpdateOptions, ports: UpdatePorts) {
  if (!options.terminal)
    return yield* Effect.fail(
      new Error("Interactive update needs a terminal. Use --update-preview / --update JSON operations for automation.")
    )
  const state: UpdateState = { outcomes: new Map(), proposals: [] }
  const hosts = updateHosts(options, state, ports)
  if (hosts.length === 0) {
    writeNoUpdateHosts(state, ports)
    return
  }
  ports.write(`Update clients: ${hosts.join(", ")}.\n`)
  const executable = yield* ports.target
  const frame: UpdateFrame = { ...state, ports, executable, environment: updateEnvironment(options.environment) }
  for (const host of hosts) yield* runHostStep(frame, host, previewUpdateHost(frame, host))
  yield* applyUpdateProposals(frame)
  writeUpdateOutcomes(frame)
})
