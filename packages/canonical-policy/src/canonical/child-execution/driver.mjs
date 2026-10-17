import * as Effect from "effect/Effect"
import {
  awaitNative,
  awaitNativeWork,
  effectNative,
  runNativePromise,
  runNativeEffect,
  nativeFailureAggregate
} from "@hapsland/runtime-environment/runtime/native-execution"

const constructionFailureTag = Symbol("CanonicalConstructionFailure")
/**
 * @typedef {import("@hapsland/agent-flow-bend/canonical-resolver-owner").CanonicalResolverOwner} Owner
 * @typedef {import("@hapsland/agent-flow-bend/canonical-resolver-owner").State} State
 * @typedef {import("@hapsland/agent-flow-bend/canonical-resolver-owner").Step} OwnerStep
 * @typedef {import("@hapsland/agent-flow-bend/canonical-resolver-owner").Action} Action
 * @typedef {import("@hapsland/agent-flow-bend/canonical-resolver-owner").Scope} Scope
 * @typedef {import("./contract.ts").Control} Control
 * @typedef {import("./contract.ts").Method} Method
 * @typedef {import("./contract.ts").ControlledStep | OwnerStep} Step
 * @typedef {{phase: string, error: unknown, command?: Action, operation?: number}} Failure
 * @typedef {{failures: Failure[], rejection: Failure | undefined}} ActionOutcome
 * @typedef {{signal?: AbortSignal | undefined, ownerLease?: {invocation: number, generation: number, lease: number, request: number}}} ForeignOptions
 * @typedef {{[constructionFailureTag]: true, kind: "construction-failure", view: {$: "AdviceTailStopped", reason: unknown, cleanupPending: false}}} ConstructionFailure
 * @typedef {{origin: number, value: unknown, kind?: never}} AdviceInput
 * @typedef {import("./contract.ts").PreparationHandoff} PreparationHandoff
 * @typedef {import("./contract.ts").DeliveryHandoff} DeliveryHandoff
 * @typedef {{handoff: number, scope: Extract<Scope, {$: "AdviceTailScope"}>}} AdviceHandoff
 * @typedef {Extract<Action, {$: "Launch"}> | (Extract<Action, {$: "LaunchPostPreparation"}> & {input_handle: number, receipt: PreparationHandoff}) | (Extract<Action, {$: "LaunchAdviceTail"}> & {receipt: AdviceHandoff})} Launch
 * @typedef {{command: Extract<Action, {$: "CancelChild"}>, completed: Set<number>}} CancellationCleanup
 */
/** @template {Method} M @typedef {import("./contract.ts").Arguments<M>} Arguments */
/** @typedef {{[K in Method]: (state: State, ...args: Arguments<K>) => OwnerStep}} EntryTable */
/** @template A @param {A | undefined} value @returns {A} */
const required = (value) => {
  if (value === undefined) throw new TypeError("Missing owned invocation resource")
  return value
}
/**
 * @template Reply
 * @param {import("./contract.ts").ForeignReply<Reply>} result
 * @param {() => boolean} live
 * @param {() => void} onAwait
 * @returns {import("@hapsland/runtime-environment/runtime/native-execution").NativeFlow<import("./contract.ts").ForeignResult<Reply> | {revoked: true}>}
 */
const executeSynchronousGroup = function* (result, live, onAwait) {
  if (!("group" in result)) return result
  const checkpointed = result.group.checkpoints === "canonical"
  for (;;) {
    if (checkpointed && !live()) return { revoked: true }
    const command = result.group.next()
    if (checkpointed && !live()) return { revoked: true }
    switch (command.kind) {
      case "primitive":
        command.perform()
        break
      case "checkpointed": {
        if (!checkpointed) throw new TypeError("Checkpointed primitive requires Canonical group authority")
        const completed = command.perform()
        if (!("commit" in completed)) return completed
        if (!live()) return { revoked: true }
        completed.commit()
        break
      }
      case "effect-checkpointed": {
        if (!checkpointed) throw new TypeError("Effect checkpoint requires Canonical group authority")
        onAwait()
        const outcome = yield* awaitNativeWork(command.perform())
        if ("value" in outcome) return { value: outcome.value }
        if (!live()) return { revoked: true }
        outcome.commit()
        break
      }
      case "pending":
        return command.start()
      case "terminal":
        return { value: command.value }
    }
  }
}
/**
 * @template {import("./contract.ts").Projection} P
 * @param {P | ConstructionFailure} value
 * @returns {value is ConstructionFailure}
 */
const constructionFailure = (value) => constructionFailureTag in value
/**
 * @template {import("./contract.ts").Input} I
 * @template {import("./contract.ts").Machine} M
 * @template C
 * @template {import("./contract.ts").Projection} P
 * @template {import("./contract.ts").Request} R
 * @template Reply, A, Prep
 * @template {import("./contract.ts").Session} S
 * @param {{owner: Owner, initialState?: State, scope?: Scope, registry: ReturnType<typeof import("@hapsland/runtime-environment/runtime/native-session-registry").createNativeSessionRegistry<S>>, foreign: (requests: readonly R[], options: ForeignOptions) => Promise<Reply>, foreignSync?: (requests: readonly R[], options: ForeignOptions) => import("./contract.ts").ForeignReply<Reply> | undefined, control?: Control, machine: M, selectMachine?: (input: I, session: S) => M | undefined, protocol: import("./contract.ts").Protocol<I, M, C, P, R, Reply, A, Prep, S>, hooks?: {
 * beforeInstall?: (event: {invocation: number, generation: number, handle: number, request: R, driver: ReturnType<typeof createChildExecutionDriver<I,M,C,P,R,Reply,A,Prep,S>>}) => unknown,
 * beforeTerminal?: (event: {invocation: number, generation: number, handle: number, driver: ReturnType<typeof createChildExecutionDriver<I,M,C,P,R,Reply,A,Prep,S>>}) => unknown,
 * afterAction?: (event: {command: Action, driver: ReturnType<typeof createChildExecutionDriver<I,M,C,P,R,Reply,A,Prep,S>>}) => unknown,
 * canonicalOutputs?: (outputs: readonly (Extract<Step, {$: "Advanced"}>["outputs"] extends import("@hapsland/agent-flow-bend/canonical-resolver-owner").List<infer O> ? O : never)[]) => unknown,
 * beforeProvider?: (event: {invocation: number, lease: number, request: R, driver: ReturnType<typeof createChildExecutionDriver<I,M,C,P,R,Reply,A,Prep,S>>}) => unknown,
 * beforeCompletion?: (event: {invocation: number, lease: number, request: R, driver: ReturnType<typeof createChildExecutionDriver<I,M,C,P,R,Reply,A,Prep,S>>}) => unknown
 * }}} options
 */
// foreignSync must return undefined without effects for unsupported requests;
// only that case delegates execution to the asynchronous foreign port.
export function createChildExecutionDriver({
  owner,
  initialState,
  scope,
  registry,
  foreign,
  foreignSync,
  hooks = {},
  control,
  machine,
  selectMachine,
  protocol
}) {
  /**
   * @typedef {{cleanup: () => import("@hapsland/runtime-environment/runtime/native-execution").NativeFlow<unknown>, cleaned: boolean, retained: boolean, successor?: DeliveryHandoff}} DeliveryCustody
   * @typedef {DeliveryCustody & {receipt: DeliveryHandoff, projected: P}} DeliveryInput
   * @typedef {P | ConstructionFailure} ResultPayload
   * @typedef {{value: Reply} | {error: unknown} | {revoked: true}} ReplyPayload
   * @typedef {{kind: "state", value: C} | {kind: "result", value: ResultPayload} | {kind: "reply", value: ReplyPayload} | {kind: "input", value: I | P | AdviceInput | undefined, custody?: DeliveryCustody, successor?: DeliveryHandoff} | {kind: "advice-input", value: AdviceInput} | {kind: "pending-input", value: undefined} | {kind: "delivery-input", value: DeliveryInput}} Payload
   * @typedef {Payload & {invocation: number}} HeldResource
   * @typedef {import("./contract.ts").Outcome<A>} TerminalOutcome
   */
  /** @type {Map<number, M>} */
  const machines = new Map()
  /** @type {Map<number, AbortSignal | undefined>} */
  const invocationSignals = new Map()
  /** @param {number} invocation */
  const engine = (invocation) => machines.get(invocation) ?? machine
  let state = control ? undefined : initialState,
    nextHandle = 1
  /** @type {EntryTable} */
  const entries = owner
  const current = () => (control ? control.readState() : required(state))
  // Internal metadata reads need the existing custody snapshot, not Canonical ABI conversion.
  const currentCustody = () => control?.readCustody?.() ?? current()
  /**
   * @template {Method} M
   * @param {M} method
   * @param {Arguments<M>} args
   * @returns {Step}
   */
  const invoke = (method, ...args) => {
    if (control) {
      const invokeControlled =
        /** @type {(method: M, args: Arguments<M>) => import("./contract.ts").ControlledStep} */ (control.invoke)
      return invokeControlled(method, args)
    }
    const call = /** @type {(state: State, ...args: Arguments<M>) => OwnerStep} */ (entries[method])
    return call(current(), ...args)
  }
  /** @param {number} invocation */
  const findChild = (invocation) => {
    const child = owner.find(invocation, currentCustody().children)
    if (child.$ !== "Some") throw new Error("Missing Canonical invocation")
    return child.value
  }
  /**
   * @param {number} invocation
   * @returns {ReturnType<NonNullable<Control["readActive"]>>}
   */
  const readActive = (invocation) => {
    if (control?.readActive) return control.readActive(invocation)
    const found = owner.find(invocation, currentCustody().children)
    return found.$ === "Some" ? { $: "Some", value: owner.child_active(found.value) } : { $: "None" }
  }
  /** @param {number} invocation */
  const requireActive = (invocation) => {
    const observed = readActive(invocation)
    if (observed.$ !== "Some") throw new Error("Missing Canonical invocation")
    return observed.value
  }
  /** @type {Map<number, HeldResource>} */
  const resources = new Map()
  /** @type {Map<number, {invocation: number, request: R, controller: AbortController}>} */
  const leases = new Map()
  /** @type {Map<number, Launch>} */
  const launches = new Map()
  /** @type {Map<number, S>} */
  const sessions = new Map()
  /** @type {Map<number, TerminalOutcome>} */
  const finished = new Map()
  /** @type {WeakSet<S>} */
  const finalizedSessions = new WeakSet()
  /** @param {S} session */
  function* finalizeSessionFlow(session) {
    if (finalizedSessions.has(session)) return
    if (session.finishFlow)
      yield effectNative(
        runNativeEffect(session.finishFlow(), () => {}),
        false
      )
    else yield awaitNative(session.finish?.())
    finalizedSessions.add(session)
  }
  /** @param {S} session */
  function* finishSessionFlow(session) {
    try {
      yield* finalizeSessionFlow(session)
    } catch (error) {
      registry.retainCleanupFlow(session, () => finalizeSessionFlow(session))
      throw error
    }
  }
  /** @param {S} session */
  function* closeUnregisteredFlow(session) {
    if ([...sessions.values()].includes(session) || registry.get(session.invocation) === session) return
    try {
      yield* finishSessionFlow(session)
    } finally {
      session.close?.()
    }
  }
  const stats = {
    launches: 0,
    resumes: 0,
    accepted: 0,
    providerStarts: 0,
    providerCleanups: 0,
    revoked: 0,
    discarded: 0
  }
  /** @template A @param {import("@hapsland/agent-flow-bend/canonical-resolver-owner").List<A>} value @returns {A[]} */
  const list = (value) => {
    const out = []
    while (value.$ === "Con") {
      out.push(value.head)
      value = value.tail
    }
    if (value.$ !== "Nil") throw new Error("Malformed owner action list")
    return out
  }
  /** @param {number} invocation @param {Payload} payload */
  const save = (invocation, payload) => {
    const id = nextHandle++
    resources.set(id, { invocation, ...payload })
    return id
  }
  /** @overload @param {number} id @param {number} invocation @param {"state"} kind @returns {C} */
  /** @overload @param {number} id @param {number} invocation @param {"result"} kind @returns {ResultPayload} */
  /** @overload @param {number} id @param {number} invocation @param {"reply"} kind @returns {ReplyPayload} */
  /** @overload @param {number} id @param {number} invocation @param {"input"} kind @returns {I | P | AdviceInput | undefined} */
  /** @param {number} id @param {number} invocation @param {Payload["kind"]} kind @returns {Payload["value"]} */
  function load(id, invocation, kind) {
    const held = resources.get(id)
    if (!held || held.invocation !== invocation || held.kind !== kind)
      throw new Error("Wrong opaque resource ownership")
    return held.value
  }
  /** @param {number} id @param {number} invocation */
  const release = (id, invocation) => {
    const held = resources.get(id)
    if (held && held.invocation === invocation) {
      resources.delete(id)
      stats.discarded++
    }
  }
  /** @returns {Extract<TerminalOutcome, {failure: object}>} */
  const failed = () => ({ failure: { $: "Types.InvocationCancelled" } })
  /** @param {number} invocation @param {number} generation @param {C} raw @returns {ActionOutcome} */
  const settleOutcome = (invocation, generation, raw) => {
    if (protocol.synchronousAdvance) {
      for (;;) {
        // A synchronous effect may cancel through Canonical without aborting
        // the caller's signal. Never advance a continuation after that revocation.
        if (!requireActive(invocation)) return { failures: [], rejection: undefined }
        const next = protocol.synchronousAdvance(raw, { signal: invocationSignals.get(invocation) })
        if (next === undefined) break
        raw = next
      }
    }
    const projected = protocol.view(raw)
    const request = protocol.awaitRequest(projected)
    if (request !== undefined) {
      if (request.invocation !== invocation) throw new Error("Artifact request owner mismatch")
      const id = save(invocation, { kind: "state", value: raw })
      let transferred = false
      try {
        hooks.beforeInstall?.({ invocation, generation, handle: id, request, driver })
        const child = findChild(invocation)
        const requestId = Number(BigInt(request.id))
        const installation = protocol.installation(projected, child.scope)
        const step =
          installation.method === "install"
            ? invoke("install", invocation, generation, id, requestId)
            : installation.method === "install_source"
              ? invoke("install_source", invocation, generation, id, requestId, installation.permission)
              : installation.method === "install_after_source"
                ? invoke("install_after_source", invocation, generation, id, requestId, installation.permission)
                : invoke("install_advice", invocation, generation, id, requestId, installation.permission)
        const outcome = applyOutcome(step)
        transferred = !outcome.rejection
        return outcome
      } finally {
        if (!transferred) release(id, invocation)
      }
    } else {
      const id = save(invocation, { kind: "result", value: projected })
      try {
        hooks.beforeTerminal?.({ invocation, generation, handle: id, driver })
        const child = findChild(invocation)
        const method = protocol.terminal(projected, child.scope)
        const outcome = applyOutcome(
          typeof method === "string"
            ? invoke(method, invocation, generation, id)
            : invoke("complete_delivery", invocation, generation, id, method.selection)
        )
        // A transfer action may succeed before an observer throws. Its resource
        // already belongs to the successor; retain cleanup under that child.
        if (outcome.rejection) {
          const held = resources.get(id)
          if (held?.kind === "delivery-input") {
            const cancelled = applyOutcome(invoke("cancel", held.invocation))
            outcome.failures.push(...cancelled.failures)
          }
        }
        return outcome
      } finally {
        release(id, invocation)
      }
    }
  }
  // Cancellation commits in Canonical before these resource operations run.
  // Keep successful suboperations so a later cleanup retry cannot replay them.
  /** @type {Map<number, CancellationCleanup>} */
  const cancellationCleanup = new Map()
  /** @param {number} handle @param {number} invocation @param {DeliveryCustody} input */
  const cleanDeliveryFlow = function* (handle, invocation, input) {
    if (!input.cleaned && !input.successor) {
      yield* input.cleanup()
      input.cleaned = true
    }
    const pending = cancellationCleanup.get(invocation)
    if (pending) {
      const outcome = runCancellationCleanup(pending)
      if (outcome.rejection) throw outcome.rejection.error
      cancellationCleanup.delete(invocation)
    }
    release(handle, invocation)
  }
  /** @param {number} handle @param {number} invocation @param {DeliveryCustody} input */
  const retainDeliveryCleanup = (handle, invocation, input) => {
    if (input.retained || input.successor) return
    registry.retainConstructionCleanupFlow(invocation, undefined, function* () {
      yield* cleanDeliveryFlow(handle, invocation, input)
    })
    input.retained = true
  }
  /** @param {CancellationCleanup} obligation @returns {ActionOutcome} */
  const runCancellationCleanup = (obligation) => {
    const { command, completed } = obligation
    const invocation = command.invocation
    const operations = [
      () => sessions.get(invocation)?.revoke(),
      () => engine(invocation).disposeInvocation(invocation),
      () => {
        for (const [handle, held] of resources)
          if (held.invocation === invocation) {
            if (held.kind === "delivery-input") retainDeliveryCleanup(handle, invocation, held.value)
            else if (held.kind === "input" && held.custody && !sessions.has(invocation))
              retainDeliveryCleanup(handle, invocation, held.custody)
          }
        const pending = launches.get(invocation)
        if (pending) {
          release(pending.input_handle, invocation)
          launches.delete(invocation)
        }
      },
      () => {
        for (const lease of leases.values()) if (lease.invocation === invocation) lease.controller.abort()
      },
      () => {
        if (sessions.has(invocation)) finished.set(invocation, failed())
        stats.revoked++
      }
    ]
    /** @type {Failure[]} */
    const failures = []
    for (let index = 0; index < operations.length; index++) {
      if (completed.has(index)) continue
      try {
        required(operations[index])()
        completed.add(index)
      } catch (error) {
        failures.push({ phase: "action", command, operation: index, error })
      }
    }
    if (!failures.length && !sessions.has(invocation)) cancellationCleanup.delete(invocation)
    return { failures, rejection: failures[0] }
  }
  /** @param {Action} command @returns {ActionOutcome | undefined} */
  const actionOutcome = (command) => {
    const invocation = command.invocation
    switch (command.$) {
      case "Launch":
        launches.set(invocation, command)
        stats.launches++
        break
      case "IssueDeliveryHandoff": {
        const raw = command.receipt
        try {
          const projected = load(raw.input_handle, invocation, "result")
          if (constructionFailure(projected)) throw new Error("Invalid delivery handoff payload")
          const child = owner.find(raw.invocation, currentCustody().children)
          if (child.$ !== "Some" || !owner.delivery_receipt_matches(child.value, raw))
            throw new Error("Delivery handoff lacks Canonical custody")
          const receipt = Object.freeze({ handoff: raw.invocation, receipt: raw })
          const transfer = required(protocol.deliveryHandoff)(projected, required(sessions.get(invocation)), receipt)
          resources.set(raw.input_handle, {
            invocation: raw.invocation,
            kind: "delivery-input",
            value: { receipt, projected, cleanup: transfer.cleanup, cleaned: false, retained: false }
          })
          const previous = owner.find(invocation, currentCustody().children)
          const input =
            previous.$ === "Some" && previous.value.scope.$ === "DeliveryScope"
              ? resources.get(previous.value.scope.input_handle)
              : undefined
          if (input?.kind === "input") {
            input.successor = receipt
            if (input.custody) input.custody.successor = receipt
          }
          finished.set(invocation, transfer.accepted)
          stats.accepted++
        } catch (error) {
          const primary = { phase: "action", command, error }
          try {
            const cleanup = applyOutcome(invoke("cancel", raw.invocation))
            return { failures: [primary, ...cleanup.failures], rejection: primary }
          } catch (cleanupError) {
            return {
              failures: [primary, { phase: "handoff-cleanup", command, error: cleanupError }],
              rejection: primary
            }
          }
        }
        break
      }
      case "LaunchAdviceTail": {
        const held = resources.get(command.input_handle)
        if (!held || held.invocation !== 0 || held.kind !== "advice-input" || held.value.origin !== command.origin)
          throw new Error("Advice launch requires its prepared opaque input")
        const child = owner.find(invocation, currentCustody().children)
        if (child.$ !== "Some" || child.value.scope.$ !== "AdviceTailScope")
          throw new Error("Advice launch lacks Canonical custody")
        const receipt = Object.freeze({ handoff: invocation, scope: child.value.scope })
        resources.set(command.input_handle, { invocation, kind: "input", value: held.value })
        launches.set(invocation, { ...command, receipt })
        stats.launches++
        break
      }
      case "LaunchPostPreparation": {
        try {
          const projected = load(command.result_handle, command.preparation_invocation, "result")
          if (constructionFailure(projected)) throw new Error("Invalid preparation handoff payload")
          protocol.preparation(projected)
          if (command.scope.$ !== "RetainingScope") throw new Error("Invalid preparation handoff scope")
          const receipt = Object.freeze({ handoff: invocation, scope: command.scope })
          resources.set(command.result_handle, { invocation, kind: "input", value: projected })
          launches.set(invocation, { ...command, input_handle: command.result_handle, receipt })
          finished.set(command.preparation_invocation, receipt)
          stats.launches++
          stats.accepted++
        } catch (error) {
          const primary = { phase: "action", command, error }
          try {
            const cleanup = applyOutcome(invoke("cancel", invocation))
            return { failures: [primary, ...cleanup.failures], rejection: primary }
          } catch (cleanupError) {
            return {
              failures: [primary, { phase: "handoff-cleanup", command, error: cleanupError }],
              rejection: primary
            }
          }
        }
        break
      }
      case "ExecuteProvider": {
        const raw = load(command.state_handle, invocation, "state")
        const request = protocol.awaitRequest(protocol.view(raw))
        if (request === undefined) throw new Error("Provider requires its Await")
        if (request.invocation !== invocation || request.id !== command.request)
          throw new Error("Provider Await binding mismatch")
        if (leases.has(command.lease)) throw new Error("Duplicate provider lease")
        leases.set(command.lease, { invocation, request, controller: new AbortController() })
        stats.providerStarts++
        break
      }
      case "Resume": {
        const raw = load(command.state_handle, invocation, "state"),
          reply = load(command.reply_handle, invocation, "reply")
        if ("error" in reply) throw reply.error
        if ("revoked" in reply) throw new TypeError("Revoked synchronous group cannot resume")
        stats.resumes++
        return settleOutcome(invocation, command.generation, protocol.resume(raw, reply.value))
      }
      case "RetireHandle":
        release(command.state_handle, invocation)
        break
      case "CancelChild": {
        let obligation = cancellationCleanup.get(invocation)
        if (!obligation) {
          obligation = { command, completed: new Set() }
          cancellationCleanup.set(invocation, obligation)
        }
        return runCancellationCleanup(obligation)
      }
      case "CleanupProvider": {
        const lease = leases.get(command.lease)
        if (!lease || lease.invocation !== invocation) throw new Error("Wrong provider cleanup owner")
        leases.delete(command.lease)
        stats.providerCleanups++
        break
      }
      case "AcceptResult": {
        // Synchronous handoff in this serialized turn; no queued acceptance permit.
        const projected = load(command.result_handle, invocation, "result")
        if (constructionFailure(projected)) {
          finished.set(invocation, {
            adviceRetained: false,
            reason: projected.view.reason,
            cleanupPending: projected.view.cleanupPending
          })
          release(command.result_handle, invocation)
          stats.accepted++
          break
        }
        finished.set(invocation, protocol.accepted(projected))
        release(command.result_handle, invocation)
        stats.accepted++
        break
      }
      default:
        throw new Error("Unknown owner action")
    }
  }
  /** @param {readonly Action[]} commands @returns {ActionOutcome} */
  const executeActionsOutcome = (commands) => {
    /** @type {Failure[]} */
    const failures = []
    for (const command of commands) {
      if (failures.length && !["RetireHandle", "CleanupProvider", "CancelChild"].includes(command.$)) continue
      try {
        const nested = actionOutcome(command)
        if (nested?.failures.length) failures.push(...nested.failures)
        else hooks.afterAction?.({ command, driver })
      } catch (error) {
        failures.push({ phase: "action", command, error })
      }
    }
    return { failures, rejection: failures[0] }
  }
  /** @param {Step} step @returns {ActionOutcome} */
  const applyOutcome = (step) => {
    // External control has already committed through resident Ref.modify.
    if (!control) {
      if (!("state" in step)) throw new TypeError("Uncommitted owner step lacks its state")
      state = step.state
    }
    if (step.$ !== "Advanced") {
      const receipt = { phase: "owner", error: new Error("Canonical resolver refused: " + step.refusal.$) }
      return { failures: [receipt], rejection: receipt }
    }
    /** @type {Failure[]} */
    const failures = []
    try {
      failures.push(...executeActionsOutcome(list(step.actions)).failures)
    } catch (error) {
      failures.push({ phase: "actions", error })
    }
    try {
      hooks.canonicalOutputs?.(list(step.outputs))
    } catch (error) {
      failures.push({ phase: "outputs", error })
    }
    return { failures, rejection: failures[0] }
  }
  /** @param {ActionOutcome} outcome */
  const unwrap = (outcome) => {
    if (outcome.rejection) throw outcome.rejection.error
  }
  /** @param {Step} step */
  const apply = (step) => unwrap(applyOutcome(step))
  /** @param {S} session @param {I} input @param {ForeignOptions} [options] @param {DeliveryInput} [delivery] @returns {import("@hapsland/runtime-environment/runtime/native-execution").NativeFlow<TerminalOutcome>} */
  function* driveInvocationFlow(session, input, options = {}, delivery) {
    if ([...sessions.values()].includes(session) || registry.get(session.invocation) === session)
      throw new Error("Session already owned by an active invocation")
    const invocation = Number(BigInt(input.invocation)),
      launch = launches.get(invocation)
    if (!launch) {
      const missing = yield* registry.runOutcomeFlow(session, function* () {
        throw new Error("Missing Canonical Launch")
      })
      if (missing.rejection) throw missing.rejection.error
      throw new Error("Missing Canonical Launch")
    }
    let nativeInput = resources.get(launch.input_handle)
    let taskEntered = false,
      registryRejected = false
    /** @type {Failure | undefined} */
    let constructionError
    /** @type {TerminalOutcome | undefined} */
    let outcome
    /** @type {Failure | undefined} */
    let taskFailure
    /** @type {Failure[]} */
    const failures = []
    /** @param {unknown} error */
    const rememberFailure = (error) => {
      const receipt = { phase: "boundary", error }
      failures.push(receipt)
      return receipt
    }
    // Only synchronous, known outcome-to-throw edges use this local slot.
    // Arbitrary foreign callbacks remain observable failures at their boundary.
    /** @type {Failure | undefined} */
    let forwardedReceipt
    /** @param {ActionOutcome} result */
    const requireOutcome = (result) => {
      failures.push(...result.failures)
      if (result.rejection) {
        forwardedReceipt = result.rejection
        throw result.rejection.error
      }
    }
    /** @param {unknown} error */
    const takeFailure = (error) => {
      const receipt = forwardedReceipt ?? rememberFailure(error)
      forwardedReceipt = undefined
      return receipt
    }
    // Project opaque terminal exceptions while this invocation still owns its
    // session. Registry cleanup clears the token table after the task settles.
    const terminalOutcome = () => protocol.projectTerminal(required(finished.get(invocation)), session)
    /** @param {Step} step */
    const applyInInvocation = (step) => requireOutcome(applyOutcome(step))
    /** @param {Parameters<typeof settleOutcome>} args */
    const settleInInvocation = (...args) => requireOutcome(settleOutcome(...args))
    try {
      launches.delete(invocation)
      sessions.set(invocation, session)
      machines.set(invocation, (selectMachine ? selectMachine(input, session) : undefined) ?? machine)
      if (!delivery) {
        resources.set(launch.input_handle, {
          invocation,
          kind: "input",
          value: input,
          ...(nativeInput?.kind === "input" && nativeInput.custody ? { custody: nativeInput.custody } : {})
        })
        nativeInput = resources.get(launch.input_handle)
      }
      invocationSignals.set(invocation, options.signal)
      const registryOutcome = yield* registry.runOutcomeFlow(
        session,
        /** @returns {import("@hapsland/runtime-environment/runtime/native-execution").NativeFlow<TerminalOutcome>} */ function* () {
          taskEntered = true
          // Registry registration precedes this task. Until then the issued
          // resource remains available to cancellation without a session.
          if (delivery) {
            if (!requireActive(invocation)) throw new Error("Delivery cancelled before registration")
            resources.set(launch.input_handle, { invocation, kind: "input", value: input, custody: delivery })
            nativeInput = resources.get(launch.input_handle)
          }
          /** @type {Failure | undefined} */
          let abortFailure
          const abort = () => {
            try {
              const child = owner.find(invocation, currentCustody().children)
              if (child.$ === "Some" && owner.child_active(child.value)) applyInInvocation(invoke("cancel", invocation))
            } catch (error) {
              const receipt = takeFailure(error)
              abortFailure ??= receipt
            }
          }
          options.signal?.addEventListener("abort", abort, { once: true })
          const finishTaskSession = function* () {
            try {
              yield awaitNative(yield* finishSessionFlow(session))
            } catch (error) {
              taskFailure = rememberFailure(error)
              throw error
            }
          }
          try {
            if (protocol.initialSignalCheckpoint?.(engine(invocation)) !== "protocol" && options.signal?.aborted)
              abort()
            if (finished.has(invocation)) {
              if (abortFailure) {
                taskFailure = abortFailure
                throw abortFailure.error
              }
              return terminalOutcome()
            }
            try {
              settleInInvocation(invocation, 0, protocol.initial(engine(invocation), input))
            } finally {
              // Custody must remain reachable when a later provider completion
              // issues the successor. Ordinary copied inputs can retire now.
              if (nativeInput?.kind !== "input" || !nativeInput.custody) release(launch.input_handle, invocation)
            }
            while (!finished.has(invocation)) {
              applyInInvocation(invoke("provider_start", invocation))
              const child = findChild(invocation)
              if (child.lease.$ !== "Some") throw new Error("Provider start lacks its Canonical lease")
              const leaseId = child.lease.value.id
              const lease = required(leases.get(leaseId))
              /** @type {ReplyPayload} */
              let payload
              let immediateFailure = false,
                awaited = false
              try {
                const signal = options.signal
                  ? AbortSignal.any([options.signal, lease.controller.signal])
                  : lease.controller.signal
                hooks.beforeProvider?.({ invocation, lease: leaseId, request: lease.request, driver })
                const execution = {
                  ...options,
                  signal,
                  ownerLease: Object.freeze({
                    invocation,
                    generation: child.generation,
                    lease: leaseId,
                    request: Number(BigInt(lease.request.id))
                  })
                }
                const offered = foreignSync?.([lease.request], execution)
                const synchronous =
                  offered === undefined
                    ? undefined
                    : yield* executeSynchronousGroup(
                        offered,
                        () => {
                          const found = readActive(invocation)
                          return found.$ === "Some" && found.value
                        },
                        () => {
                          awaited = true
                        }
                      )
                if (synchronous === undefined) {
                  // The existing async port keeps its late-reply discard rules.
                  awaited = true
                  payload = {
                    value: /** @type {Reply} */ (yield awaitNative(foreign([lease.request], execution), true))
                  }
                } else if ("revoked" in synchronous) {
                  payload = synchronous
                } else if ("pending" in synchronous) {
                  awaited = true
                  const value = yield awaitNative(synchronous.pending, true)
                  payload = { value: synchronous.map(value) }
                } else if ("effect" in synchronous) {
                  awaited = true
                  const value = yield effectNative(synchronous.effect)
                  payload = { value: synchronous.map(value) }
                } else payload = { value: synchronous.value }
              } catch (error) {
                immediateFailure = !awaited
                payload = { error }
              }
              const replyId = save(invocation, { kind: "reply", value: payload })
              try {
                hooks.beforeCompletion?.({ invocation, lease: leaseId, request: lease.request, driver })
                applyInInvocation(
                  invoke("provider_completed", invocation, leaseId, Number(BigInt(lease.request.id)), replyId)
                )
              } catch (error) {
                taskFailure = takeFailure(error)
                try {
                  const child = owner.find(invocation, currentCustody().children)
                  if (child.$ === "Some" && owner.child_active(child.value))
                    applyInInvocation(invoke("cancel", invocation))
                } catch (cleanupError) {
                  takeFailure(cleanupError)
                }
                if (leases.has(leaseId)) {
                  try {
                    applyInInvocation(
                      invoke("provider_completed", invocation, leaseId, Number(BigInt(lease.request.id)), replyId)
                    )
                  } catch (cleanupError) {
                    takeFailure(cleanupError)
                  }
                }
                throw error
              } finally {
                release(replyId, invocation)
              }
              if (immediateFailure && "error" in payload) {
                // Cancellation can discard the reply but cannot turn an engine
                // throw before any await into a late asynchronous rejection.
                taskFailure = takeFailure(payload.error)
                throw payload.error
              }
            }
            if (abortFailure) {
              taskFailure = abortFailure
              throw abortFailure.error
            }
            return terminalOutcome()
          } catch (error) {
            taskFailure ??= takeFailure(error)
            try {
              const child = owner.find(invocation, currentCustody().children)
              if (child.$ === "Some" && owner.child_active(child.value)) applyInInvocation(invoke("cancel", invocation))
            } catch (cleanupError) {
              taskFailure = takeFailure(cleanupError)
              throw cleanupError
            }
            throw error
          } finally {
            options.signal?.removeEventListener("abort", abort)
            // Provider await has settled before registry.run closes native resources.
            yield awaitNative(yield* finishTaskSession())
          }
        }
      )
      for (const receipt of registryOutcome.failures)
        if (receipt.phase !== "task" || !taskFailure) rememberFailure(receipt.error)
      if (registryOutcome.rejection) {
        registryRejected = true
        throw registryOutcome.rejection.error
      }
      if (registryOutcome.task.status !== "success") throw new Error("Unsettled invocation task")
      outcome = registryOutcome.task.value
    } catch (error) {
      if (!registryRejected) takeFailure(error)
      try {
        const child = owner.find(invocation, currentCustody().children)
        if (child.$ === "Some" && owner.child_active(child.value)) applyInInvocation(invoke("cancel", invocation))
        if (!taskEntered && child.$ === "Some" && child.value.scope.$ === "AdviceTailScope") {
          constructionError = required(failures[0])
          session.forceCleanup?.(constructionError.error)
        }
      } catch (cleanupError) {
        takeFailure(cleanupError)
      }
    }
    const releaseInvocation = () => {
      // Keep the selected engine/session reachable if native close fails.
      if (!taskEntered && registry.get(Number(BigInt(invocation))) !== session) session.close?.()
      if (!cancellationCleanup.get(invocation)?.completed.has(1)) engine(invocation).disposeInvocation(invocation)
      cancellationCleanup.delete(invocation)
      invocationSignals.delete(invocation)
      machines.delete(invocation)
      sessions.delete(invocation)
      finished.delete(invocation)
      for (const [id, held] of resources) if (held.invocation === invocation) release(id, invocation)
    }
    /** @returns {import("@hapsland/runtime-environment/runtime/native-execution").NativeFlow<ActionOutcome>} */
    const completeInvocationOutcome = function* () {
      /** @type {Failure[]} */
      const attemptFailures = []
      /** @param {Step} step */
      const applyAttempt = (step) => {
        const result = applyOutcome(step)
        attemptFailures.push(...result.failures)
        return result.rejection
      }
      try {
        const pendingCancellation = cancellationCleanup.get(invocation)
        if (pendingCancellation) {
          const cleanup = runCancellationCleanup(pendingCancellation)
          attemptFailures.push(...cleanup.failures)
          if (cleanup.rejection) return { failures: attemptFailures, rejection: attemptFailures[0] }
        }
        let child = owner.find(invocation, currentCustody().children)
        if (child.$ === "Some" && child.value.lease.$ !== "None")
          throw new Error("Finalization still owns a provider lease")
        // Call finish directly here: a failing retry must not replace its registry
        // obligation, or a subsequent successful retry cannot discharge that owner.
        yield* finalizeSessionFlow(session)
        if (constructionError && child.$ === "Some" && owner.child_active(child.value)) {
          const id = save(invocation, {
            kind: "result",
            value: {
              [constructionFailureTag]: true,
              kind: "construction-failure",
              view: { $: "AdviceTailStopped", reason: constructionError.error, cleanupPending: false }
            }
          })
          try {
            if (applyAttempt(invoke("terminal", invocation, child.value.generation, id)))
              return { failures: attemptFailures, rejection: attemptFailures[0] }
          } finally {
            release(id, invocation)
          }
        }
        child = owner.find(invocation, currentCustody().children)
        if (child.$ === "Some" && owner.child_active(child.value)) {
          if (applyAttempt(invoke("cancel", invocation)))
            return { failures: attemptFailures, rejection: attemptFailures[0] }
          child = owner.find(invocation, currentCustody().children)
          if (child.$ === "Some" && owner.child_active(child.value))
            throw new Error("Finalization has no closed Canonical owner")
        }
        // A root that did not transfer custody must settle its lease before
        // its input can disappear, including empty success and registration failure.
        if (!delivery && nativeInput?.kind === "input" && nativeInput.custody)
          yield* cleanDeliveryFlow(launch.input_handle, invocation, nativeInput.custody)
        releaseInvocation()
      } catch (error) {
        attemptFailures.push({ phase: "finalization", error })
      }
      return { failures: attemptFailures, rejection: attemptFailures[0] }
    }
    const completeInvocation = function* () {
      const attempt = yield* completeInvocationOutcome()
      if (attempt.failures.length > 1)
        throw nativeFailureAggregate(
          attempt.failures.map((receipt) => receipt.error),
          "Finalization attempt failed",
          { cause: required(attempt.rejection).error }
        )
      unwrap(attempt)
    }
    const finalization = yield* completeInvocationOutcome()
    failures.push(...finalization.failures)
    if (finalization.rejection) registry.retainCleanupFlow(session, completeInvocation)
    // An unsuccessful caller cannot receive a newly issued continuation. Revoke
    // only its still-unclaimed successor; a caller that already claimed owns it.
    if (failures.length && nativeInput?.kind === "input" && nativeInput.successor) {
      const receipt = nativeInput.successor
      const held = resources.get(receipt.receipt.input_handle)
      const child = owner.find(receipt.handoff, currentCustody().children)
      if (
        held?.kind === "delivery-input" &&
        held.value.receipt === receipt &&
        child.$ === "Some" &&
        owner.delivery_receipt_matches(child.value, receipt.receipt)
      ) {
        try {
          failures.push(...applyOutcome(invoke("cancel", receipt.handoff)).failures)
        } catch (error) {
          failures.push({ phase: "handoff-cleanup", error })
        }
      }
    }
    if (failures.length === 1) throw required(failures[0]).error
    if (failures.length > 1) {
      /** @type {unknown} */
      let primary = required(failures[0]).error
      const seen = new Set()
      while (primary instanceof AggregateError && Object.hasOwn(primary, "cause") && !seen.has(primary.cause)) {
        seen.add(primary)
        primary = primary.cause
      }
      throw nativeFailureAggregate(
        failures.map((receipt) => receipt.error),
        "Invocation and finalization failed",
        { cause: primary }
      )
    }
    return required(outcome)
  }
  /** @param {AdviceHandoff} receipt @param {S & {input: I}} session @param {ForeignOptions} [options] @returns {import("@hapsland/runtime-environment/runtime/native-execution").NativeFlow<TerminalOutcome>} */
  function* driveAdviceFlow(receipt, session, options = {}) {
    const launch = launches.get(receipt.handoff)
    if (!launch || launch.$ !== "LaunchAdviceTail" || launch.receipt !== receipt) {
      yield* closeUnregisteredFlow(session)
      throw new Error("Unknown or consumed advice handoff")
    }
    if (session.input.invocation !== receipt.handoff) {
      yield* closeUnregisteredFlow(session)
      throw new Error("Advice session changed Canonical invocation")
    }
    return yield* driveInvocationFlow(session, session.input, options)
  }
  /** @param {PreparationHandoff} receipt @param {S} session @param {(result: {preparation: Prep}, invocation: number, scope: PreparationHandoff["scope"]) => I} buildInput @param {ForeignOptions} [options] @returns {import("@hapsland/runtime-environment/runtime/native-execution").NativeFlow<TerminalOutcome>} */
  function* driveHandoffFlow(receipt, session, buildInput, options = {}) {
    const invocation = receipt.handoff
    if ([...sessions.values()].includes(session) || registry.get(session.invocation) === session)
      throw new Error("Session already owned by an active invocation")
    // Refuse a consumed capability without cancelling its already-running child.
    const launch = launches.get(invocation)
    if (!launch || launch.$ !== "LaunchPostPreparation" || launch.receipt !== receipt) {
      yield* closeUnregisteredFlow(session)
      throw new Error("Unknown or consumed preparation handoff capability")
    }
    let entered = false
    try {
      const result = driver.handoffResult(receipt)
      const input = buildInput(result, invocation, receipt.scope)
      if (input.invocation !== invocation) throw new Error("Post input changed Canonical invocation")
      entered = true
      return yield* driveInvocationFlow(session, input, options)
    } catch (error) {
      const child = owner.find(invocation, currentCustody().children)
      if (child.$ === "Some" && owner.child_active(child.value)) apply(invoke("cancel", invocation))
      throw error
    } finally {
      if (!entered) yield* closeUnregisteredFlow(session)
    }
  }
  /** @param {DeliveryHandoff} receipt @param {(projected: P, invocation: number, cleanup: DeliveryCustody["cleanup"]) => import("@hapsland/runtime-environment/runtime/native-execution").NativeFlow<{session: S, input: I}>} construct @param {ForeignOptions} [options] @returns {import("@hapsland/runtime-environment/runtime/native-execution").NativeFlow<TerminalOutcome>} */
  function* driveDeliveryFlow(receipt, construct, options = {}) {
    const invocation = receipt.handoff,
      handle = receipt.receipt.input_handle
    const held = resources.get(handle)
    // Refusal cannot revoke another caller's already-running invocation.
    if (!held || held.invocation !== invocation || held.kind !== "delivery-input" || held.value.receipt !== receipt)
      throw new Error("Unknown or consumed delivery handoff capability")
    const claim = invoke("claim_delivery", receipt.receipt)
    if (claim.$ !== "Advanced") {
      apply(claim)
      throw new Error("Unreachable rejected delivery claim")
    }
    let constructed,
      entered = false
    try {
      apply(claim)
      if (!requireActive(invocation)) throw new Error("Delivery cancelled before construction")
      constructed = yield* construct(held.value.projected, invocation, held.value.cleanup)
      if (constructed.input.invocation !== invocation || constructed.session.invocation !== invocation)
        throw new Error("Delivery construction changed Canonical invocation")
      if (!requireActive(invocation)) throw new Error("Delivery cancelled during construction")
      entered = true
      return yield* driveInvocationFlow(constructed.session, constructed.input, options, held.value)
    } catch (error) {
      const failures = [error]
      try {
        const child = owner.find(invocation, currentCustody().children)
        if (child.$ === "Some" && owner.child_active(child.value)) apply(invoke("cancel", invocation))
      } catch (cleanupError) {
        failures.push(cleanupError)
      }
      try {
        retainDeliveryCleanup(handle, invocation, held.value)
      } catch (cleanupError) {
        failures.push(cleanupError)
      }
      if (constructed && !entered) {
        try {
          yield* closeUnregisteredFlow(constructed.session)
        } catch (cleanupError) {
          failures.push(cleanupError)
        }
      }
      if (failures.length > 1)
        throw nativeFailureAggregate(failures, "Delivery construction and cleanup failed", { cause: error })
      throw error
    }
  }
  /** @param {(options: ForeignOptions) => import("@hapsland/runtime-environment/runtime/native-execution").NativeFlow<TerminalOutcome>} flow @param {ForeignOptions} options */
  const runEffectFlow = (flow, options) =>
    Effect.suspend(() => {
      const interruption = new AbortController()
      const signal = options.signal ? AbortSignal.any([options.signal, interruption.signal]) : interruption.signal
      return runNativeEffect(flow({ ...options, signal }), () => interruption.abort())
    })
  const driver = {
    /** @param {import("@hapsland/agent-flow-bend/canonical-resolver-owner").Parent | undefined} [parent] @param {boolean} [preparation] @param {Scope} [issuedScope] @param {"settings" | "freshness"} [independentOperation] @returns {number} */
    allocateInvocation(parent, preparation = false, issuedScope = scope, independentOperation) {
      if (independentOperation && (parent || preparation))
        throw new TypeError("Independent operation requires a root invocation")
      if (!independentOperation && (!parent || preparation) && !issuedScope)
        throw new TypeError("Missing owned invocation scope")
      if (currentCustody().next_invocation < 1 || currentCustody().next_invocation > Number.MAX_SAFE_INTEGER)
        throw new RangeError("Invocation exceeds exact native ID range")
      const invocation = currentCustody().next_invocation
      const inputId = save(invocation, { kind: "input", value: undefined })
      try {
        apply(
          independentOperation
            ? invoke(independentOperation === "freshness" ? "launch_freshness" : "launch_settings", inputId)
            : parent
              ? preparation
                ? invoke("launch_source_preparation", parent, required(issuedScope), inputId)
                : invoke("launch_nested", parent, inputId)
              : invoke(
                  required(issuedScope).$ === "SourceScope"
                    ? "launch_source"
                    : preparation
                      ? "launch_preparation"
                      : "launch",
                  required(issuedScope),
                  inputId
                )
        )
        return Number(BigInt(invocation))
      } catch (error) {
        const child = owner.find(invocation, currentCustody().children)
        if (child.$ === "Some") {
          try {
            driver.constructionFailed(Number(BigInt(invocation)), { inputHandle: inputId })
          } catch (cleanup) {
            throw nativeFailureAggregate([error, cleanup], "Invocation publication and cleanup failed", {
              cause: error
            })
          }
        } else resources.delete(inputId)
        throw error
      }
    },
    /** @param {import("@hapsland/agent-flow-bend/canonical-resolver-owner").DeliveryContext} context @param {DeliveryCustody["cleanup"]} cleanup @returns {number} */
    allocateCollectionInvocation(context, cleanup) {
      const invocation = currentCustody().next_invocation
      if (!Number.isSafeInteger(invocation) || invocation < 1)
        throw new RangeError("Invocation exceeds exact native ID range")
      const inputId = save(invocation, {
        kind: "input",
        value: undefined,
        custody: { cleanup, cleaned: false, retained: false }
      })
      try {
        apply(invoke("launch_collection", context, inputId))
        return invocation
      } catch (error) {
        try {
          driver.constructionFailed(invocation, { inputHandle: inputId })
        } catch (cleanup) {
          throw nativeFailureAggregate([error, cleanup], "Collection publication and cleanup failed", { cause: error })
        }
        throw error
      }
    },
    /** @param {DeliveryHandoff} receipt @param {(projected: P, invocation: number, cleanup: DeliveryCustody["cleanup"]) => import("@hapsland/runtime-environment/runtime/native-execution").NativeFlow<{session: S, input: I}>} construct @param {ForeignOptions} [options] */
    driveDeliveryEffect(receipt, construct, options = {}) {
      return runEffectFlow((execution) => driveDeliveryFlow(receipt, construct, execution), options)
    },
    /** Cancel only the exact issued native receipt. A consumed receipt cannot
     * revoke a claimed successor; failed cleanup retains the same capability.
     * @param {DeliveryHandoff} receipt
     */
    cancelDeliveryEffect(receipt) {
      return Effect.uninterruptible(
        Effect.suspend(() => {
          const invocation = receipt.handoff
          const held = resources.get(receipt.receipt.input_handle)
          if (
            !held ||
            held.invocation !== invocation ||
            held.kind !== "delivery-input" ||
            held.value.receipt !== receipt
          )
            return Effect.succeed(false)
          const child = owner.find(invocation, currentCustody().children)
          if (child.$ === "Some" && owner.delivery_receipt_matches(child.value, receipt.receipt)) {
            apply(invoke("cancel", invocation))
          } else if (!held.value.retained || (child.$ === "Some" && owner.child_active(child.value))) {
            return Effect.succeed(false)
          }
          return registry.retryCleanupEffect().pipe(Effect.as(true))
        })
      )
    },
    /** @returns {number} */
    allocateSettingsInvocation() {
      return driver.allocateInvocation(undefined, false, undefined, "settings")
    },
    /** @returns {number} */
    allocateFreshnessInvocation() {
      return driver.allocateInvocation(undefined, false, undefined, "freshness")
    },
    /** @param {Scope} [issuedScope] @param {import("@hapsland/agent-flow-bend/canonical-resolver-owner").Parent | undefined} [parent] @returns {number} */
    allocatePreparationInvocation(issuedScope = scope, parent) {
      return driver.allocateInvocation(parent, true, issuedScope)
    },
    /** @param {Scope} issuedScope @returns {number} */
    allocateSourceInvocation(issuedScope) {
      return driver.allocateInvocation(undefined, false, issuedScope)
    },
    /** @param {number} origin @param {unknown} value */
    prepareAdviceInput(origin, value) {
      if (!Number.isSafeInteger(origin) || origin < 1) throw new Error("Advice input requires its origin")
      return save(0, { kind: "advice-input", value: { origin, value } })
    },
    /** @param {number} origin @param {number} handle */
    validateAdviceInput(origin, handle) {
      const held = resources.get(handle)
      return !!held && held.invocation === 0 && held.kind === "advice-input" && held.value.origin === origin
    },
    /** @param {number} handle */
    releaseAdviceInput(handle) {
      release(handle, 0)
    },
    /** @param {number} invocation @returns {AdviceHandoff} */
    adviceHandoff(invocation) {
      const launch = launches.get(invocation)
      if (launch?.$ !== "LaunchAdviceTail") throw new Error("Missing advice launch")
      return launch.receipt
    },
    /** @param {AdviceHandoff} receipt @param {S & {input: I}} session @param {ForeignOptions} [options] */
    driveAdvice(receipt, session, options = {}) {
      return runNativePromise(driveAdviceFlow(receipt, session, options))
    },
    /** @param {AdviceHandoff} receipt @param {S & {input: I}} session @param {ForeignOptions} [options] */
    driveAdviceEffect(receipt, session, options = {}) {
      return runEffectFlow((execution) => driveAdviceFlow(receipt, session, execution), options)
    },
    /** @param {PreparationHandoff} receipt @returns {{preparation: Prep}} */
    handoffResult(receipt) {
      const launch = launches.get(receipt.handoff)
      if (!launch || launch.$ !== "LaunchPostPreparation" || launch.receipt !== receipt)
        throw new Error("Unknown preparation handoff capability")
      const projected = required(load(launch.input_handle, receipt.handoff, "input"))
      if (!("kind" in projected) || typeof projected.kind !== "string")
        throw new Error("Wrong accepted preparation handoff")
      return { preparation: protocol.preparation(projected) }
    },
    /** @param {PreparationHandoff} receipt @param {S} session @param {(result: {preparation: Prep}, invocation: number, scope: PreparationHandoff["scope"]) => I} buildInput @param {ForeignOptions} [options] */
    driveHandoff(receipt, session, buildInput, options = {}) {
      return runNativePromise(driveHandoffFlow(receipt, session, buildInput, options))
    },
    /** @param {PreparationHandoff} receipt @param {S} session @param {(result: {preparation: Prep}, invocation: number, scope: PreparationHandoff["scope"]) => I} buildInput @param {ForeignOptions} [options] */
    driveHandoffEffect(receipt, session, buildInput, options = {}) {
      return runEffectFlow((execution) => driveHandoffFlow(receipt, session, buildInput, execution), options)
    },
    /** @param {S} session @param {I} input @param {ForeignOptions} [options] */
    drive(session, input, options = {}) {
      return runNativePromise(driveInvocationFlow(session, input, options))
    },
    /** @param {S} session @param {I} input @param {ForeignOptions} [options] */
    driveEffect(session, input, options = {}) {
      return runEffectFlow((execution) => driveInvocationFlow(session, input, execution), options)
    },
    /** Construction and registration share the first masked interpreter step.
     * @param {() => {session: S, input: I}} construct @param {ForeignOptions} [options]
     */
    driveConstructedEffect(construct, options = {}) {
      return runEffectFlow(function* (execution) {
        const { session, input } = construct()
        return yield* driveInvocationFlow(session, input, execution)
      }, options)
    },
    /** Async native construction and registration share the same masked flow.
     * @param {() => import("@hapsland/runtime-environment/runtime/native-execution").NativeFlow<{session: S, input: I}>} construct @param {ForeignOptions} [options]
     */
    driveConstructedFlowEffect(construct, options = {}) {
      return runEffectFlow(function* (execution) {
        const { session, input } = yield* construct()
        return yield* driveInvocationFlow(session, input, execution)
      }, options)
    },
    /** @param {number} invocation @param {{session?: S | undefined, closePending?: boolean, inputHandle?: number}} [cleanup] */
    constructionFailed(invocation, { session, closePending = false, inputHandle } = {}) {
      const ownerInvocation = Number(BigInt(invocation))
      const held = inputHandle === undefined ? undefined : resources.get(inputHandle)
      const custody = held?.kind === "input" ? held.custody : undefined
      const child = owner.find(ownerInvocation, currentCustody().children)
      let cancelCommitted = !!custody && (child.$ === "None" || !owner.child_active(child.value))
      /** @type {Extract<Step, {$: "Advanced"}>["outputs"] | undefined} */
      let pendingOutputs
      const attempt = () => {
        const failures = []
        if (closePending) {
          try {
            required(session).close()
            closePending = false
          } catch (error) {
            failures.push(error)
          }
        }
        try {
          if (!cancelCommitted) {
            const step = invoke("cancel", ownerInvocation)
            const outcome = applyOutcome(step)
            // A committed cancel may still have unfinished actual resource actions.
            const child = owner.find(ownerInvocation, currentCustody().children)
            cancelCommitted = step.$ === "Advanced" && (child.$ === "None" || !owner.child_active(child.value))
            if (step.$ === "Advanced" && outcome.failures.some((receipt) => receipt.phase === "outputs"))
              pendingOutputs = step.outputs
            failures.push(...outcome.failures.map((receipt) => receipt.error))
          } else {
            const pending = cancellationCleanup.get(ownerInvocation)
            if (pending) failures.push(...runCancellationCleanup(pending).failures.map((receipt) => receipt.error))
          }
        } catch (error) {
          failures.push(error)
        }
        if (cancelCommitted && pendingOutputs && failures.length === 0) {
          try {
            hooks.canonicalOutputs?.(list(pendingOutputs))
            pendingOutputs = undefined
          } catch (error) {
            failures.push(error)
          }
        }
        if (failures.length === 1) throw failures[0]
        if (failures.length)
          throw nativeFailureAggregate(failures, "Construction cleanup failed", { cause: failures[0] })
        // A committed launch can fail before its action enters launches. Only
        // release the allocator's exact input after cancellation has settled.
        if (!custody && inputHandle !== undefined && resources.has(inputHandle)) release(inputHandle, ownerInvocation)
        cancellationCleanup.delete(ownerInvocation)
      }
      if (custody && inputHandle !== undefined) {
        // Keep one pre-session owner. Retry cancellation before touching the
        // physical lease, even when publication failed before creating a child.
        registry.retainConstructionCleanupFlow(invocation, undefined, function* () {
          attempt()
          yield* cleanDeliveryFlow(inputHandle, ownerInvocation, custody)
        })
        custody.retained = true
      }
      try {
        attempt()
      } catch (error) {
        if (!custody) registry.retainConstructionCleanup(invocation, session, attempt)
        throw error
      }
    },
    /** @param {number} invocation */
    cancel(invocation) {
      apply(invoke("cancel", Number(BigInt(invocation))))
    },
    /** @param {readonly Action[]} commands */
    acceptActions(commands) {
      unwrap(executeActionsOutcome(commands))
    },
    /** @param {Step} step */
    acceptPublication(step) {
      apply(step)
    },
    /** @param {Step} step */
    acceptPublicationOutcome(step) {
      return applyOutcome(step)
    },
    /** @param {Parameters<Owner["canonical_event"]>[1]} event */
    canonicalEvent(event) {
      apply(invoke("canonical_event", event))
    },
    /** @returns {State} */
    get state() {
      return current()
    },
    get stats() {
      return { ...stats }
    },
    get pendingCancellationCleanups() {
      return cancellationCleanup.size
    },
    get resources() {
      return {
        payloads: resources.size,
        leases: leases.size,
        sessions: sessions.size,
        artifactStates: [...new Set([machine, ...machines.values()])].reduce(
          (total, owned) => total + owned.retainedHandles,
          0
        ),
        launches: launches.size
      }
    }
  }
  return driver
}
