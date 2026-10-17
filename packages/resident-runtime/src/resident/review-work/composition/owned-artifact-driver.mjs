import {
  finalizationProtocol,
  performFinalizationSync,
  performFinalizationAsync
} from "@hapsland/review-execution/direct-event/preparation"
import * as Effect from "effect/Effect"
import * as ownedMachine from "./owned-machine.mjs"
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
 * @typedef {import("@hapsland/runtime-environment/runtime/native-session-registry").NativeSession & {revoke(): unknown, finish?: () => unknown | Promise<unknown>, exception?: (token: Parameters<Parameters<typeof import("@hapsland/source-analysis/direct-event/graph-resolution").createBendResolver>[0]["drive"]>[0] extends {exception: (token: infer T) => unknown} ? T : never) => unknown, forceCleanup?: (error: unknown) => unknown, cleanupFlow?: () => import("@hapsland/runtime-environment/runtime/native-execution").NativeFlow<unknown>}} NativeSession
 * @typedef {Extract<ownedMachine.Projection["view"], {$: "Types.AwaitService"}>["request"] | import("../../advice-delivery/handoff/delivery-session.ts").DeliveryRequest | import("../evaluation/dispatch-session.ts").DispatchRequest} RawRequest
 * @typedef {RawRequest & {readonly invocation: number, readonly id: number}} Request
 * @typedef {import("@hapsland/canonical-policy/canonical/child-execution").ForeignOptions} ForeignOptions

 * @typedef {import("@hapsland/canonical-policy/canonical/child-execution").PreparationHandoff} PreparationHandoff
 * @typedef {import("@hapsland/canonical-policy/canonical/child-execution").AdviceHandoff} AdviceHandoff
 * @typedef {ReturnType<typeof ownedMachine.accepted> | PreparationHandoff | {adviceRetained: false, reason: unknown, cleanupPending: boolean}} TerminalOutcome
 * @typedef {import("@hapsland/canonical-policy/canonical/child-execution").CancellationOutcome} CancellationOutcome
 * @typedef {Extract<TerminalOutcome, {result: object}> | Extract<TerminalOutcome, {failure: {$: string}}>} GraphOutcome
 * @typedef {import("../../advice-delivery/handoff/delivery-session.ts").DeliveryAccepted | CancellationOutcome} DeliveryOutcome
 * @typedef {ReturnType<typeof finalizationProtocol.accepted> | CancellationOutcome} FinalizationOutcome
 * @typedef {PreparationHandoff | ReturnType<ownedMachine.PreparationMachine["accepted"]> | CancellationOutcome} PreparationOutcome
 * @typedef {ReturnType<ownedMachine.SourceMachine["accepted"]> | CancellationOutcome} SourceOutcome
 * @typedef {ReturnType<ownedMachine.PostMachine["accepted"]> | CancellationOutcome} PostOutcome
 * @typedef {ReturnType<ownedMachine.AdviceMachine["accepted"]> | CancellationOutcome} AdviceOutcome
 * @typedef {import("../evaluation/dispatch-session.ts").DispatchAccepted | CancellationOutcome} DispatchOutcome
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
 * (session: Session, input: Parameters<ownedMachine.FinalizationMachine["initial"]>[0], options?: ForeignOptions): Promise<FinalizationOutcome>;
 * (session: Session, input: Parameters<ownedMachine.ArtifactMachine["initial"]>[0], options?: ForeignOptions): Promise<GraphOutcome>;
 * (session: Session, input: Parameters<ownedMachine.PreparationMachine["initial"]>[0], options?: ForeignOptions): Promise<PreparationOutcome>;
 * (session: Session, input: Parameters<ownedMachine.SourceMachine["initial"]>[0], options?: ForeignOptions): Promise<SourceOutcome>;
 * (session: Session, input: Parameters<ownedMachine.PostMachine["initial"]>[0], options?: ForeignOptions): Promise<PostOutcome>;
 * (session: Session, input: Parameters<ownedMachine.AdviceMachine["initial"]>[0], options?: ForeignOptions): Promise<AdviceOutcome>;
 * (session: Session, input: import("../../advice-delivery/handoff/delivery-session.ts").DeliveryInput, options?: ForeignOptions): Promise<DeliveryOutcome>;
 * (session: Session, input: import("../evaluation/dispatch-session.ts").DispatchInput, options?: ForeignOptions): Promise<DispatchOutcome>;
 * }} Drive
 */
/**
 * @template {NativeSession} Session
 * @typedef {{
 * (session: Session, input: Parameters<ownedMachine.FinalizationMachine["initial"]>[0], options?: ForeignOptions): import("effect/Effect").Effect<FinalizationOutcome>;
 * (session: Session, input: Parameters<ownedMachine.ArtifactMachine["initial"]>[0], options?: ForeignOptions): import("effect/Effect").Effect<GraphOutcome>;
 * (session: Session, input: Parameters<ownedMachine.PreparationMachine["initial"]>[0], options?: ForeignOptions): import("effect/Effect").Effect<PreparationOutcome>;
 * (session: Session, input: Parameters<ownedMachine.SourceMachine["initial"]>[0], options?: ForeignOptions): import("effect/Effect").Effect<SourceOutcome>;
 * (session: Session, input: Parameters<ownedMachine.PostMachine["initial"]>[0], options?: ForeignOptions): import("effect/Effect").Effect<PostOutcome>;
 * (session: Session, input: Parameters<ownedMachine.AdviceMachine["initial"]>[0], options?: ForeignOptions): import("effect/Effect").Effect<AdviceOutcome>;
 * (session: Session, input: import("../../advice-delivery/handoff/delivery-session.ts").DeliveryInput, options?: ForeignOptions): import("effect/Effect").Effect<DeliveryOutcome>;
 * (session: Session, input: import("../evaluation/dispatch-session.ts").DispatchInput, options?: ForeignOptions): import("effect/Effect").Effect<DispatchOutcome>;
 * }} DriveEffect
 */
/**
 * @template {NativeSession} Session
 * @typedef {Omit<SharedDriver<Session>, "drive" | "driveHandoff" | "driveAdvice" | "driveConstructedEffect" | "driveEffect" | "driveHandoffEffect" | "driveAdviceEffect" | "driveConstructedFlowEffect"> & {
 * driveConstructedEffect: {
 * (construct: () => {session: Session, input: import("../evaluation/dispatch-session.ts").DispatchInput}, options?: ForeignOptions): import("effect/Effect").Effect<DispatchOutcome>;
 * (construct: () => {session: Session, input: Parameters<ownedMachine.SourceMachine["initial"]>[0]}, options?: ForeignOptions): import("effect/Effect").Effect<SourceOutcome>;
 * (construct: () => {session: Session, input: import("../../advice-delivery/handoff/delivery-session.ts").DeliveryInput}, options?: ForeignOptions): import("effect/Effect").Effect<DeliveryOutcome>;
 * },
 * driveConstructedFlowEffect: (construct: () => import("@hapsland/runtime-environment/runtime/native-execution").NativeFlow<{session: Session, input: Parameters<ownedMachine.PreparationMachine["initial"]>[0]}>, options?: ForeignOptions) => Effect.Effect<PreparationOutcome>,
 * drive: Drive<Session>,
 * driveEffect: DriveEffect<Session>,
 * driveHandoffEffect: (receipt: PreparationHandoff, session: Session, buildInput: (result: {preparation: PreparationResult}, invocation: number, scope: PreparationHandoff["scope"]) => Parameters<ownedMachine.PostMachine["initial"]>[0], options?: ForeignOptions) => import("effect/Effect").Effect<PostOutcome>,
 * driveAdviceEffect: (receipt: AdviceHandoff, session: Session & {input: Parameters<ownedMachine.AdviceMachine["initial"]>[0]}, options?: ForeignOptions) => import("effect/Effect").Effect<AdviceOutcome>,
 * driveHandoff: (receipt: PreparationHandoff, session: Session, buildInput: (result: {preparation: PreparationResult}, invocation: number, scope: PreparationHandoff["scope"]) => Parameters<ownedMachine.PostMachine["initial"]>[0], options?: ForeignOptions) => Promise<PostOutcome>,
 * driveAdvice: (receipt: AdviceHandoff, session: Session & {input: Parameters<ownedMachine.AdviceMachine["initial"]>[0]}, options?: ForeignOptions) => Promise<AdviceOutcome>
 * }} Driver
 */
/** @param {RawRequest} request @returns {request is Request} */
const exactRequest = (request) => {
  const invocation = request.invocation
  if (typeof invocation !== "number" || !Number.isInteger(invocation)) return false
  const id = request.id
  return typeof id === "number" && Number.isInteger(id)
}
/** @param {Extract<ownedMachine.Projection, {kind: "delivery"}>} projected @param {Scope} scope */
const validateDeliveryStage = (projected, scope) => {
  if (scope.$ !== "DeliveryScope") throw new TypeError("Delivery requires its Canonical scope")
  const permission = scope.permission.$
  if (
    !(
      (projected.machine.stage === "collect" && permission === "CollectDelivery") ||
      (projected.machine.stage === "prepare" && permission === "PrepareDelivery") ||
      (projected.machine.stage === "finalize" && permission === "FinalizeDelivery")
    )
  )
    throw new TypeError("Wrong Canonical delivery stage permission")
}

// Concrete machine protocols remain at this composition owner. CanonicalPolicy
// executes their single shared action/custody implementation.
/**
 * @template {NativeSession} [Session=NativeSession]
 * @param {{owner: Owner, initialState?: State, scope?: Scope, registry: ReturnType<typeof import("@hapsland/runtime-environment/runtime/native-session-registry").createNativeSessionRegistry<Session>>, foreign: (requests: readonly Request[], options: ForeignOptions) => import("@hapsland/runtime-environment/runtime/native-execution").NativeWork<ownedMachine.Reply>, dispatchForeign?: (request: import("../evaluation/dispatch-session.ts").DispatchRequest, options: ForeignOptions) => import("@hapsland/canonical-policy/canonical/child-execution").ForeignReply<import("../evaluation/dispatch-session.ts").DispatchReply>, deliveryForeign?: (request: import("../../advice-delivery/handoff/delivery-session.ts").DeliveryRequest, options: ForeignOptions) => import("@hapsland/canonical-policy/canonical/child-execution").ForeignReply<import("../../advice-delivery/handoff/delivery-session.ts").DeliveryReply>, hooks?: Hooks<Session>, control?: Control, machine: ownedMachine.Machine, selectMachine?: (input: ownedMachine.Input, session: Session) => ownedMachine.Machine | undefined}} options
 * @returns {Driver<Session>}
 */
export function createOwnedArtifactDriver({
  owner,
  initialState,
  scope,
  registry,
  foreign,
  deliveryForeign,
  dispatchForeign,
  hooks = {},
  control,
  machine,
  selectMachine
}) {
  /** @type {import("@hapsland/canonical-policy/canonical/child-execution").Protocol<ownedMachine.Input, ownedMachine.Machine, ownedMachine.Continuation, ownedMachine.Projection, Request, ownedMachine.Reply, ReturnType<typeof ownedMachine.accepted>, PreparationResult, Session>} */
  const protocol = {
    initialSignalCheckpoint: (machine) => (machine.kind === "finalization" ? "protocol" : "executor"),
    synchronousAdvance: (held, options) =>
      held.kind === "finalization" ? finalizationProtocol.synchronousAdvance?.(held, options) : undefined,
    initial: ownedMachine.initial,
    view: ownedMachine.view,
    resume: ownedMachine.resume,
    awaitRequest(projected) {
      if (projected.kind === "dispatch")
        return projected.view.$ === "DispatchAwait" ? projected.view.request : undefined
      if (projected.kind === "delivery")
        return projected.view.$ === "DeliveryAwait" ? projected.view.request : undefined
      if (projected.view.$ !== "Types.AwaitService") return undefined
      const request = projected.view.request
      if (!exactRequest(request)) throw new TypeError("Provider request requires exact Bend Nat identifiers")
      return request
    },
    installation(projected, scope) {
      if (projected.kind === "dispatch") {
        if (scope.$ !== "EvaluationDispatchScope") throw new TypeError("Wrong dispatch scope binding")
        return { method: "install" }
      }
      if (projected.kind === "delivery") {
        validateDeliveryStage(projected, scope)
        return { method: "install" }
      }
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
      if (projected.kind === "dispatch") {
        if (scope.$ !== "EvaluationDispatchScope" || projected.view.$ !== "DispatchDone")
          throw new TypeError("Wrong dispatch terminal binding")
        return { method: "complete_evaluation_dispatch", success: projected.view.result.$ === "Dispatched" }
      }
      if (projected.kind === "delivery") {
        validateDeliveryStage(projected, scope)
        return { method: "complete_delivery", selection: projected.machine.selection(projected.view) }
      }
      if (projected.kind === "finalization") return "terminal"
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
    deliveryHandoff(projected, session, receipt) {
      if (projected.kind !== "delivery") throw new TypeError("Wrong delivery handoff projection")
      return {
        accepted: { delivery: { kind: "handoff", value: projected.machine.accepted(projected.view), receipt } },
        cleanup: required(session.cleanupFlow)
      }
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
    foreignSync(requests, options) {
      if (requests.length !== 1) throw new TypeError("Preparation requires one owned request")
      const request = required(requests[0])
      if ("evaluationDispatch" in request) return required(dispatchForeign)(request, options)
      if ("delivery" in request) return required(deliveryForeign)(request, options)
      if ("finalization" in request) return performFinalizationSync(request)
      const work = foreign(requests, options)
      return Effect.isEffect(work)
        ? { effect: work, map: (value) => /** @type {ownedMachine.Reply} */ (value) }
        : { pending: work, map: (value) => /** @type {ownedMachine.Reply} */ (value) }
    },
    foreign(requests, _options) {
      if (requests.length !== 1) throw new TypeError("Preparation requires one owned request")
      const request = required(requests[0])
      if ("finalization" in request) return performFinalizationAsync(request)
      throw new TypeError("Owned native work must use its selected execution port")
    },
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
    sharedAdvice = shared.driveAdvice,
    sharedConstructed = shared.driveConstructedEffect,
    sharedConstructedFlow = shared.driveConstructedFlowEffect,
    sharedEffect = shared.driveEffect,
    sharedHandoffEffect = shared.driveHandoffEffect,
    sharedAdviceEffect = shared.driveAdviceEffect
  /** @overload @param {Session} session @param {Parameters<ownedMachine.ArtifactMachine["initial"]>[0]} input @param {ForeignOptions} [options] @returns {Promise<GraphOutcome>} */
  /** @overload @param {Session} session @param {Parameters<ownedMachine.PreparationMachine["initial"]>[0]} input @param {ForeignOptions} [options] @returns {Promise<PreparationOutcome>} */
  /** @overload @param {Session} session @param {Parameters<ownedMachine.SourceMachine["initial"]>[0]} input @param {ForeignOptions} [options] @returns {Promise<SourceOutcome>} */
  /** @overload @param {Session} session @param {Parameters<ownedMachine.PostMachine["initial"]>[0]} input @param {ForeignOptions} [options] @returns {Promise<PostOutcome>} */
  /** @overload @param {Session} session @param {Parameters<ownedMachine.FinalizationMachine["initial"]>[0]} input @param {ForeignOptions} [options] @returns {Promise<FinalizationOutcome>} */
  /** @overload @param {Session} session @param {Parameters<ownedMachine.AdviceMachine["initial"]>[0]} input @param {ForeignOptions} [options] @returns {Promise<AdviceOutcome>} */
  /** @overload @param {Session} session @param {import("../../advice-delivery/handoff/delivery-session.ts").DeliveryInput} input @param {ForeignOptions} [options] @returns {Promise<DeliveryOutcome>} */
  /** @overload @param {Session} session @param {import("../evaluation/dispatch-session.ts").DispatchInput} input @param {ForeignOptions} [options] @returns {Promise<DispatchOutcome>} */
  /** @param {Session} session @param {ownedMachine.Input} input @param {ForeignOptions} [options] @returns {Promise<TerminalOutcome>} */
  function drive(session, input, options) {
    return sharedDrive(session, input, options)
  }
  /** @overload @param {Session} session @param {Parameters<ownedMachine.ArtifactMachine["initial"]>[0]} input @param {ForeignOptions} [options] @returns {Effect.Effect<GraphOutcome>} */
  /** @overload @param {Session} session @param {Parameters<ownedMachine.PreparationMachine["initial"]>[0]} input @param {ForeignOptions} [options] @returns {Effect.Effect<PreparationOutcome>} */
  /** @overload @param {Session} session @param {Parameters<ownedMachine.SourceMachine["initial"]>[0]} input @param {ForeignOptions} [options] @returns {Effect.Effect<SourceOutcome>} */
  /** @overload @param {Session} session @param {Parameters<ownedMachine.PostMachine["initial"]>[0]} input @param {ForeignOptions} [options] @returns {Effect.Effect<PostOutcome>} */
  /** @overload @param {Session} session @param {Parameters<ownedMachine.FinalizationMachine["initial"]>[0]} input @param {ForeignOptions} [options] @returns {Effect.Effect<FinalizationOutcome>} */
  /** @overload @param {Session} session @param {Parameters<ownedMachine.AdviceMachine["initial"]>[0]} input @param {ForeignOptions} [options] @returns {Effect.Effect<AdviceOutcome>} */
  /** @overload @param {Session} session @param {import("../../advice-delivery/handoff/delivery-session.ts").DeliveryInput} input @param {ForeignOptions} [options] @returns {Effect.Effect<DeliveryOutcome>} */
  /** @overload @param {Session} session @param {import("../evaluation/dispatch-session.ts").DispatchInput} input @param {ForeignOptions} [options] @returns {Effect.Effect<DispatchOutcome>} */
  /** @param {Session} session @param {ownedMachine.Input} input @param {ForeignOptions} [options] @returns {Effect.Effect<TerminalOutcome>} */
  function driveEffect(session, input, options) {
    return sharedEffect(session, input, options)
  }
  /** @overload @param {PreparationHandoff} receipt @param {Session} session @param {(result: {preparation: PreparationResult}, invocation: number, scope: PreparationHandoff["scope"]) => Parameters<ownedMachine.PostMachine["initial"]>[0]} buildInput @param {ForeignOptions} [options] @returns {Promise<PostOutcome>} */
  /** @param {PreparationHandoff} receipt @param {Session} session @param {(result: {preparation: PreparationResult}, invocation: number, scope: PreparationHandoff["scope"]) => Parameters<ownedMachine.PostMachine["initial"]>[0]} buildInput @param {ForeignOptions} [options] @returns {Promise<TerminalOutcome>} */
  function driveHandoff(receipt, session, buildInput, options) {
    return sharedHandoff(receipt, session, buildInput, options)
  }
  /** @overload @param {AdviceHandoff} receipt @param {Session & {input: Parameters<ownedMachine.AdviceMachine["initial"]>[0]}} session @param {ForeignOptions} [options] @returns {Promise<AdviceOutcome>} */
  /** @param {AdviceHandoff} receipt @param {Session & {input: Parameters<ownedMachine.AdviceMachine["initial"]>[0]}} session @param {ForeignOptions} [options] @returns {Promise<TerminalOutcome>} */
  function driveAdvice(receipt, session, options) {
    return sharedAdvice(receipt, session, options)
  }
  /** @overload @param {PreparationHandoff} receipt @param {Session} session @param {(result: {preparation: PreparationResult}, invocation: number, scope: PreparationHandoff["scope"]) => Parameters<ownedMachine.PostMachine["initial"]>[0]} buildInput @param {ForeignOptions} [options] @returns {Effect.Effect<PostOutcome>} */
  /** @param {PreparationHandoff} receipt @param {Session} session @param {(result: {preparation: PreparationResult}, invocation: number, scope: PreparationHandoff["scope"]) => Parameters<ownedMachine.PostMachine["initial"]>[0]} buildInput @param {ForeignOptions} [options] @returns {Effect.Effect<TerminalOutcome>} */
  function driveHandoffEffect(receipt, session, buildInput, options) {
    return sharedHandoffEffect(receipt, session, buildInput, options)
  }
  /** @overload @param {AdviceHandoff} receipt @param {Session & {input: Parameters<ownedMachine.AdviceMachine["initial"]>[0]}} session @param {ForeignOptions} [options] @returns {Effect.Effect<AdviceOutcome>} */
  /** @param {AdviceHandoff} receipt @param {Session & {input: Parameters<ownedMachine.AdviceMachine["initial"]>[0]}} session @param {ForeignOptions} [options] @returns {Effect.Effect<TerminalOutcome>} */
  function driveAdviceEffect(receipt, session, options) {
    return sharedAdviceEffect(receipt, session, options)
  }
  /** @overload @param {() => {session: Session, input: Parameters<ownedMachine.SourceMachine["initial"]>[0]}} construct @param {ForeignOptions} [options] @returns {import("effect/Effect").Effect<SourceOutcome>} */
  /** @overload @param {() => {session: Session, input: import("../../advice-delivery/handoff/delivery-session.ts").DeliveryInput}} construct @param {ForeignOptions} [options] @returns {Effect.Effect<DeliveryOutcome>} */
  /** @overload @param {() => {session: Session, input: import("../evaluation/dispatch-session.ts").DispatchInput}} construct @param {ForeignOptions} [options] @returns {Effect.Effect<DispatchOutcome>} */
  /** @param {() => {session: Session, input: ownedMachine.Input}} construct @param {ForeignOptions} [options] @returns {import("effect/Effect").Effect<TerminalOutcome>} */
  function driveConstructedEffect(construct, options) {
    return sharedConstructed(construct, options)
  }
  /** @overload @param {() => import("@hapsland/runtime-environment/runtime/native-execution").NativeFlow<{session: Session, input: Parameters<ownedMachine.PreparationMachine["initial"]>[0]}>} construct @param {ForeignOptions} [options] @returns {Effect.Effect<PreparationOutcome>} */
  /** @param {() => import("@hapsland/runtime-environment/runtime/native-execution").NativeFlow<{session: Session, input: ownedMachine.Input}>} construct @param {ForeignOptions} [options] @returns {Effect.Effect<TerminalOutcome>} */
  function driveConstructedFlowEffect(construct, options) {
    return sharedConstructedFlow(construct, options)
  }
  return Object.assign(shared, {
    drive,
    driveHandoff,
    driveAdvice,
    driveConstructedEffect,
    driveConstructedFlowEffect,
    driveEffect,
    driveHandoffEffect,
    driveAdviceEffect
  })
}
