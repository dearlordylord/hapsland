import * as ownedMachine from "./owned-machine.mjs"
import { createArtifactMachine } from "./artifact-dispatcher.mjs"
import { createChildExecutionDriver } from "@hapsland/canonical-policy/canonical/child-execution"
import { readNat } from "@hapsland/canonical-policy/canonical/boundary-schema"
/**
 * @typedef {import("@hapsland/agent-flow-bend/canonical-resolver-owner").CanonicalResolverOwner} Owner
 * @typedef {import("@hapsland/agent-flow-bend/canonical-resolver-owner").State} State
 * @typedef {import("@hapsland/agent-flow-bend/canonical-resolver-owner").Step} OwnerStep
 * @typedef {import("@hapsland/agent-flow-bend/canonical-resolver-owner").Action} Action
 * @typedef {import("@hapsland/agent-flow-bend/canonical-resolver-owner").Scope} Scope
 * @typedef {import("@hapsland/canonical-policy/canonical/child-execution").Control} Control
 * @typedef {import("@hapsland/canonical-policy/canonical/child-execution").ControlledStep | OwnerStep} Step
 * @typedef {import("@hapsland/runtime-environment/runtime/native-session-registry").NativeSession & {revoke(): unknown, finish?: () => unknown | Promise<unknown>, exception?: (token: Parameters<Parameters<typeof import("@hapsland/source-analysis/direct-event/graph-resolution").createBendResolver>[0]["drive"]>[0] extends {exception: (token: infer T) => unknown} ? T : never) => unknown, forceCleanup?: (error: unknown) => unknown}} NativeSession
 * @typedef {Extract<ownedMachine.Projection["view"], {$: "Types.AwaitService"}>["request"]} RawRequest
 * @typedef {RawRequest & {readonly invocation: bigint, readonly id: bigint}} Request
 * @typedef {import("@hapsland/canonical-policy/canonical/child-execution").ForeignOptions} ForeignOptions

 * @typedef {import("@hapsland/canonical-policy/canonical/child-execution").PreparationHandoff} PreparationHandoff
 * @typedef {import("@hapsland/canonical-policy/canonical/child-execution").AdviceHandoff} AdviceHandoff
 * @typedef {ReturnType<typeof ownedMachine.accepted> | PreparationHandoff | {adviceRetained: false, reason: unknown, cleanupPending: boolean}} TerminalOutcome
 * @typedef {import("@hapsland/canonical-policy/canonical/child-execution").CancellationOutcome} CancellationOutcome
 * @typedef {Extract<TerminalOutcome, {result: object}> | Extract<TerminalOutcome, {failure: {$: string}}>} GraphOutcome
 * @typedef {PreparationHandoff | ReturnType<ownedMachine.PreparationMachine["accepted"]> | CancellationOutcome} PreparationOutcome
 * @typedef {ReturnType<ownedMachine.SourceMachine["accepted"]> | CancellationOutcome} SourceOutcome
 * @typedef {ReturnType<ownedMachine.PostMachine["accepted"]> | CancellationOutcome} PostOutcome
 * @typedef {ReturnType<ownedMachine.AdviceMachine["accepted"]> | CancellationOutcome} AdviceOutcome
 */
/**
 * @template {NativeSession} [Session=NativeSession]
 * @typedef {NonNullable<Parameters<typeof createChildExecutionDriver<ownedMachine.Input, ownedMachine.Machine, ownedMachine.Continuation, ownedMachine.Projection, Request, ownedMachine.Reply, ReturnType<typeof ownedMachine.accepted>, PreparationResult, Session>>[0]["hooks"]>} Hooks
 */
/** @template A @param {A | undefined} value @returns {A} */
const required = (value) => {
  if (value === undefined) throw new TypeError("Missing owned invocation resource")
  return value
}
/** @typedef {Extract<ReturnType<ownedMachine.PreparationMachine["view"]>, {$: "PreparationFinished"}>["result"]} PreparationResult */
/** @template {NativeSession} Session @typedef {ReturnType<typeof createChildExecutionDriver<ownedMachine.Input, ownedMachine.Machine, ownedMachine.Continuation, ownedMachine.Projection, Request, ownedMachine.Reply, ReturnType<typeof ownedMachine.accepted>, PreparationResult, Session>>} SharedDriver */
/**
 * @template {NativeSession} Session
 * @typedef {{
 * (session: Session, input: Parameters<ownedMachine.ArtifactMachine["initial"]>[0], options?: ForeignOptions): Promise<GraphOutcome>;
 * (session: Session, input: Parameters<ownedMachine.PreparationMachine["initial"]>[0], options?: ForeignOptions): Promise<PreparationOutcome>;
 * (session: Session, input: Parameters<ownedMachine.SourceMachine["initial"]>[0], options?: ForeignOptions): Promise<SourceOutcome>;
 * (session: Session, input: Parameters<ownedMachine.PostMachine["initial"]>[0], options?: ForeignOptions): Promise<PostOutcome>;
 * (session: Session, input: Parameters<ownedMachine.AdviceMachine["initial"]>[0], options?: ForeignOptions): Promise<AdviceOutcome>;
 * }} Drive
 */
/**
 * @template {NativeSession} Session
 * @typedef {Omit<SharedDriver<Session>, "drive" | "driveHandoff" | "driveAdvice"> & {
 * drive: Drive<Session>,
 * driveHandoff: (receipt: PreparationHandoff, session: Session, buildInput: (result: {preparation: PreparationResult}, invocation: bigint, scope: PreparationHandoff["scope"]) => Parameters<ownedMachine.PostMachine["initial"]>[0], options?: ForeignOptions) => Promise<PostOutcome>,
 * driveAdvice: (receipt: AdviceHandoff, session: Session & {input: Parameters<ownedMachine.AdviceMachine["initial"]>[0]}, options?: ForeignOptions) => Promise<AdviceOutcome>
 * }} Driver
 */
/** @param {RawRequest} request @returns {request is Request} */
const exactRequest = (request) => typeof request.invocation === "bigint" && typeof request.id === "bigint"
// Concrete machine protocols remain at this composition owner. CanonicalPolicy
// executes their single shared action/custody implementation.
/**
 * @template {NativeSession} [Session=NativeSession]
 * @param {{owner: Owner, initialState?: State, scope?: Scope, artifacts?: Parameters<typeof createArtifactMachine>[0], registry: ReturnType<typeof import("@hapsland/runtime-environment/runtime/native-session-registry").createNativeSessionRegistry<Session>>, foreign: (requests: readonly Request[], options: ForeignOptions) => Promise<ownedMachine.Reply>, hooks?: Hooks<Session>, control?: Control, machine?: ownedMachine.Machine, selectMachine?: (input: ownedMachine.Input, session: Session) => ownedMachine.Machine | undefined}} options
 * @returns {Driver<Session>}
 */
export function createOwnedArtifactDriver({
  owner,
  initialState,
  scope,
  artifacts,
  registry,
  foreign,
  hooks = {},
  control,
  machine: providedMachine,
  selectMachine
}) {
  if (!providedMachine && !artifacts) throw new TypeError("Missing owned machine artifacts")
  const machine = providedMachine ?? createArtifactMachine({ ...required(artifacts), retainPrefixes: false })
  /** @type {import("@hapsland/canonical-policy/canonical/child-execution").Protocol<ownedMachine.Input, ownedMachine.Machine, ownedMachine.Continuation, ownedMachine.Projection, Request, ownedMachine.Reply, ReturnType<typeof ownedMachine.accepted>, PreparationResult, Session>} */
  const protocol = {
    initial: ownedMachine.initial,
    view: ownedMachine.view,
    resume: ownedMachine.resume,
    awaitRequest(projected) {
      if (projected.view.$ !== "Types.AwaitService") return undefined
      const request = projected.view.request
      if (!exactRequest(request)) throw new TypeError("Provider request requires exact Bend Nat identifiers")
      return request
    },
    installation(projected, scope) {
      if (scope.$ === "AdviceTailScope") {
        if (projected.kind !== "advice" || projected.view.$ !== "Types.AwaitService")
          throw new TypeError("Wrong advice permission binding")
        return { method: "install_advice", permission: projected.machine.permission(projected.view.request) }
      }
      if (scope.$ === "SourceScope") {
        if (projected.kind !== "source" || projected.view.$ !== "Types.AwaitService")
          throw new TypeError("Wrong source permission binding")
        return { method: "install_source", permission: projected.machine.permission(projected.view.request) }
      }
      if (scope.$ === "AfterSourceScope") {
        if (projected.kind !== "source" || projected.view.$ !== "Types.AwaitService")
          throw new TypeError("Wrong after-source permission binding")
        return { method: "install_after_source", permission: projected.machine.afterPermission(projected.view.request) }
      }
      return { method: "install" }
    },
    terminal(projected, scope) {
      return projected.view.$ === "AdviceTailPreserved"
        ? "terminal_advice_preserved"
        : scope.$ === "PreparationScope"
          ? projected.view.$ === "PreparationFinished"
            ? "terminal_preparation"
            : "terminal_preparation_failed"
          : scope.$ === "SourceScope" && projected.view.$ === "SourcePreparationStopped"
            ? "terminal_source_failed"
            : "terminal"
    },
    preparation(projected) {
      if (projected.kind !== "preparation" || projected.view.$ !== "PreparationFinished")
        throw new Error("Invalid preparation handoff payload")
      return projected.view.result
    },
    accepted(projected) {
      return projected.view.$ === "AdviceTailStopped"
        ? { adviceRetained: false, reason: projected.view.reason, cleanupPending: projected.view.cleanupPending }
        : ownedMachine.accepted(projected)
    },
    projectTerminal(outcome, session) {
      if (
        "failure" in outcome &&
        "$" in outcome.failure &&
        (outcome.failure.$ === "Types.ForeignProviderFailure" || outcome.failure.$ === "Types.RuntimeFailure")
      )
        throw required(session.exception)(outcome.failure.exception)
      if ("failure" in outcome && "$" in outcome.failure && outcome.failure.$ === "Types.NegativeGraphWork")
        readNat(-Number(outcome.failure.magnitude))
      return outcome
    }
  }
  /** @type {SharedDriver<Session>} */
  const shared = createChildExecutionDriver({
    owner,
    registry,
    foreign,
    hooks,
    machine,
    protocol,
    ...(initialState === undefined ? {} : { initialState }),
    ...(scope === undefined ? {} : { scope }),
    ...(control === undefined ? {} : { control }),
    ...(selectMachine === undefined ? {} : { selectMachine })
  })
  const sharedDrive = shared.drive,
    sharedHandoff = shared.driveHandoff,
    sharedAdvice = shared.driveAdvice
  /** @overload @param {Session} session @param {Parameters<ownedMachine.ArtifactMachine["initial"]>[0]} input @param {ForeignOptions} [options] @returns {Promise<GraphOutcome>} */
  /** @overload @param {Session} session @param {Parameters<ownedMachine.PreparationMachine["initial"]>[0]} input @param {ForeignOptions} [options] @returns {Promise<PreparationOutcome>} */
  /** @overload @param {Session} session @param {Parameters<ownedMachine.SourceMachine["initial"]>[0]} input @param {ForeignOptions} [options] @returns {Promise<SourceOutcome>} */
  /** @overload @param {Session} session @param {Parameters<ownedMachine.PostMachine["initial"]>[0]} input @param {ForeignOptions} [options] @returns {Promise<PostOutcome>} */
  /** @overload @param {Session} session @param {Parameters<ownedMachine.AdviceMachine["initial"]>[0]} input @param {ForeignOptions} [options] @returns {Promise<AdviceOutcome>} */
  /** @param {Session} session @param {ownedMachine.Input} input @param {ForeignOptions} [options] @returns {Promise<TerminalOutcome>} */
  function drive(session, input, options) {
    return sharedDrive(session, input, options)
  }
  /** @overload @param {PreparationHandoff} receipt @param {Session} session @param {(result: {preparation: PreparationResult}, invocation: bigint, scope: PreparationHandoff["scope"]) => Parameters<ownedMachine.PostMachine["initial"]>[0]} buildInput @param {ForeignOptions} [options] @returns {Promise<PostOutcome>} */
  /** @param {PreparationHandoff} receipt @param {Session} session @param {(result: {preparation: PreparationResult}, invocation: bigint, scope: PreparationHandoff["scope"]) => Parameters<ownedMachine.PostMachine["initial"]>[0]} buildInput @param {ForeignOptions} [options] @returns {Promise<TerminalOutcome>} */
  function driveHandoff(receipt, session, buildInput, options) {
    return sharedHandoff(receipt, session, buildInput, options)
  }
  /** @overload @param {AdviceHandoff} receipt @param {Session & {input: Parameters<ownedMachine.AdviceMachine["initial"]>[0]}} session @param {ForeignOptions} [options] @returns {Promise<AdviceOutcome>} */
  /** @param {AdviceHandoff} receipt @param {Session & {input: Parameters<ownedMachine.AdviceMachine["initial"]>[0]}} session @param {ForeignOptions} [options] @returns {Promise<TerminalOutcome>} */
  function driveAdvice(receipt, session, options) {
    return sharedAdvice(receipt, session, options)
  }
  return Object.assign(shared, { drive, driveHandoff, driveAdvice })
}
