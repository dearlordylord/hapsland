import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Cause from "effect/Cause"
import owner from "@hapsland/agent-flow-bend/canonical-resolver-owner"
import type { Step } from "@hapsland/agent-flow-bend/canonical-resolver-owner"
import { toOwner } from "@hapsland/canonical-policy/canonical/child-execution"
import { CANONICAL_MAX_BYTES, encodeCanonicalEvent } from "@hapsland/canonical-policy/canonical/adapter"
import { GRAPH_LIMIT_CEILINGS } from "@hapsland/canonical-policy/canonical/graph-limits"
import { effectiveGraphLimits } from "@hapsland/runtime-inputs/configuration/resolve"
import { createNativeSessionRegistry } from "@hapsland/runtime-environment/runtime/native-session-registry"
import {
  createGraphMachine,
  type GraphOutcome
} from "@hapsland/source-analysis/direct-event/graph-resolution/composition"
import { createBendResolver, performGraphServiceRequest } from "@hapsland/source-analysis/direct-event/graph-resolution"
import { hostNatural, list, productValue } from "@hapsland/source-artifacts/direct-event/value/codec"
import type { StableCapture } from "@hapsland/native-observation/direct-event/capture"
import { createPhysicalPreparationCapability } from "./physical-effects.mjs"
import {
  createPublicPreparationDriver,
  type PublicPreparationSession,
  type PreparationSession
} from "./canonical-driver.ts"
import { encodePreparationInput, type PreparationObservation } from "./input.ts"
import type { SourcePreparationContext } from "./contract.ts"

// Private host receipt preserves the original Effect Exit across Promise IO.
// It is neither product state nor a Bend correctness premise.
const causeTag = Symbol("Preparation Effect Cause")
type CauseReceipt = { readonly [causeTag]: Cause.Cause<never> }
const isCauseReceipt = (value: unknown): value is CauseReceipt =>
  typeof value === "object" && value !== null && causeTag in value && Cause.isCause(value[causeTag])
const runEffect = async <A>(effect: Effect.Effect<A>, options?: { signal?: AbortSignal | undefined }): Promise<A> => {
  const exit = await Effect.runPromiseExit(effect, options)
  if (Exit.isFailure(exit)) throw { [causeTag]: exit.cause }
  return exit.value
}
const fromPromise = <A>(run: (signal: AbortSignal) => Promise<A>): Effect.Effect<A> =>
  Effect.tryPromise({ try: run, catch: (error) => error }).pipe(
    Effect.catch((error) => (isCauseReceipt(error) ? Effect.failCause(error[causeTag]) : Effect.die(error)))
  )
type Output = Extract<Extract<Step, { $: "Advanced" }>["outputs"], { $: "Con" }>["head"]

/** One public source preparation. Its real Canonical outputs issue every scope
 * identity; the shared driver owns all Preparation and nested Graph invocations.
 * Native effects and the caller's optional admission hook remain external ports.
 */
type Options = { readonly frozenNames?: ReadonlyMap<string, ReadonlySet<string>>; readonly line?: number }
const makeExecution = (observation: PreparationObservation, context: SourcePreparationContext, options: Options) => {
  const graphLimits =
    context.settings.configuration === undefined
      ? GRAPH_LIMIT_CEILINGS
      : effectiveGraphLimits(context.settings.configuration.policy)
  const cache = new Map<string, StableCapture>()
  const registry = createNativeSessionRegistry<PublicPreparationSession>()
  const graph = createGraphMachine()
  let outputs: readonly Output[] = []
  const driver = createPublicPreparationDriver({
    owner,
    initialState: owner.initial_limits(1n, BigInt(CANONICAL_MAX_BYTES), 1n, BigInt(CANONICAL_MAX_BYTES)),
    machine: graph,
    registry,
    selectMachine: (_input, session) => ("input" in session ? session.machine : graph),
    hooks: {
      canonicalOutputs: (value) => {
        outputs = value
      }
    },
    async foreign(requests, execution) {
      if (requests.length !== 1) throw new TypeError("Preparation requires one owned request")
      const request = requests[0]!
      const session = registry.get(hostNatural(request.invocation))
      if (!session) throw new TypeError("Unknown owned service invocation")
      if ("operation" in request) {
        if ("input" in session) throw new TypeError("Wrong graph service session")
        return performGraphServiceRequest(session, request, execution)
      }
      if (!("input" in session)) throw new TypeError("Wrong preparation service session")
      const { signal, ownerLease } = execution
      if (ownerLease === undefined) throw new TypeError("Missing preparation owner lease")
      return session.perform(request, { ownerLease, ...(signal === undefined ? {} : { signal }) })
    }
  })
  const physical = createPhysicalPreparationCapability({
    root: observation.root,
    rootIdentity: observation.rootIdentity,
    context,
    cache,
    settings: context.settings,
    graphLimits,
    runEffect,
    async canonicalGate(event) {
      driver.canonicalEvent(toOwner(encodeCanonicalEvent(event)))
      const decision = outputs.find((output) => output.$ === "../Canonical.PolicyDecided")
      if (!decision || decision.$ !== "../Canonical.PolicyDecided" || decision.decision.$ !== "../Canonical.RuleGate")
        throw new TypeError("Canonical finalization gate missing")
      if (decision.decision.gate.$ === "../RulePolicy.Admit") return true
      if (decision.decision.gate.$ === "../RulePolicy.Omit") return false
      throw new TypeError("Invalid Canonical finalization gate")
    },
    async admitMaterialization(capture, preflight, execution) {
      const admission =
        context.beforeAnalyze === undefined
          ? { status: "admitted" as const }
          : await runEffect(context.beforeAnalyze(capture.path, hostNatural(capture.bytes), preflight), execution)
      if (admission.status === "admitted")
        return { $: "MaterializationDone", result: { $: "Resized" }, requested: capture.bytes }
      return {
        $: "MaterializationDone",
        result: { $: "MaterializationDenied", diagnostic: productValue(admission.diagnostic) },
        requested: capture.bytes
      }
    },
    async rejectMaterializationCapacity() {},
    async recordMaterializationCapacity() {},
    async resolveRoot(request, facts, execution) {
      const parent = owner.find(request.invocation, driver.state.children)
      if (parent.$ !== "Some") throw new TypeError("Missing preparation parent invocation")
      let terminalFrame: GraphOutcome | undefined
      const resolve = createBendResolver({
        allocateInvocation: () =>
          driver.allocateInvocation({
            $: "Parent",
            invocation: request.invocation,
            generation: parent.value.generation,
            request: request.id
          }),
        onConstructionFailure: driver.constructionFailed,
        async drive(...args) {
          const outcome = await driver.drive(...args)
          if ("result" in outcome) {
            const accepted = { result: outcome.result, finalFrame: outcome.finalFrame }
            terminalFrame = accepted
            return accepted
          }
          if ("failure" in outcome && outcome.failure !== undefined && "$" in outcome.failure) {
            const accepted = { failure: outcome.failure }
            terminalFrame = accepted
            return accepted
          }
          throw new TypeError("Canonical did not accept a Graph result")
        }
      })
      const captureSource = facts.context.captureSource
      const graphContext = captureSource === undefined ? facts.context : {
        ...facts.context,
        captureSource: (...args: Parameters<typeof captureSource>) =>
          Effect.promise(signal => runEffect(captureSource(...args), { signal }))
      }
      const unit = await resolve(facts.path, facts.capture, facts.name, graphContext, execution)
      if (terminalFrame === undefined) throw new TypeError("Resolver completed without an accepted terminal")
      return {
        unit,
        references:
          "finalFrame" in terminalFrame && terminalFrame.finalFrame.$ === "Some"
            ? terminalFrame.finalFrame.value.references
            : list([])
      }
    }
  })
  driver.canonicalEvent({ $: "../Canonical.OpenRound", partition: 1n, lifetime: 1n })
  const opened = outputs.find(
    (output) => output.$ === "../Canonical.EventEstablished" && output.event.$ === "../Canonical.RoundStarted"
  )
  if (!opened || opened.$ !== "../Canonical.EventEstablished" || opened.event.$ !== "../Canonical.RoundStarted")
    throw new TypeError("Canonical round missing")
  const round = opened.event.id
  let active: Promise<unknown> | undefined
  const retire = (exit: Exit.Exit<unknown, unknown>) => {
    const completion = active
    const settle =
      completion === undefined
        ? Effect.void
        : fromPromise(() => completion).pipe(
            Effect.catchCause((cause) => {
              if (!Exit.isFailure(exit)) return Effect.failCause(cause)
              const remaining = [...exit.cause.reasons]
              const observed = cause.reasons.every((reason) => {
                const index = remaining.findIndex((previous) =>
                  reason._tag === "Die"
                    ? previous._tag === "Die" && previous.defect === reason.defect
                    : reason._tag === "Fail"
                      ? previous._tag === "Fail" && previous.error === reason.error
                      : previous._tag === "Interrupt" && previous.fiberId === reason.fiberId
                )
                if (index < 0) return false
                remaining.splice(index, 1)
                return true
              })
              return observed ? Effect.void : Effect.failCause(cause)
            }),
            Effect.asVoid
          )
    const cleanup = fromPromise(async () => {
      await registry.retryCleanup()
      cache.clear()
      if (registry.size || registry.pendingCleanup || Object.values(driver.resources).some((count) => count !== 0))
        throw new Error("Preparation resource lifetime did not settle")
    })
    return fromPromise(async () => {
      driver.canonicalEvent({ $: "../Canonical.RetirePartition", partition: 1n, lifetime: 1n, round })
    }).pipe(Effect.ensuring(settle.pipe(Effect.ensuring(cleanup))))
  }
  const run = async (signal: AbortSignal) => {
    driver.canonicalEvent({ $: "../Canonical.AdmitObservation", partition: 1n, lifetime: 1n, round })
    const admitted = outputs.find(
      (output) => output.$ === "../Canonical.EventEstablished" && output.event.$ === "../Canonical.ObservationAdmitted"
    )
    if (
      !admitted ||
      admitted.$ !== "../Canonical.EventEstablished" ||
      admitted.event.$ !== "../Canonical.ObservationAdmitted"
    )
      throw new TypeError("Canonical observation missing")
    const observationId = admitted.event.id
    driver.canonicalEvent({
      $: "../Canonical.StartObservation",
      partition: 1n,
      lifetime: 1n,
      round,
      observation: observationId
    })
    driver.canonicalEvent({
      $: "../Canonical.BeginObservedPreparation",
      partition: 1n,
      lifetime: 1n,
      round,
      observation: observationId,
      bytes: BigInt(graphLimits.readBytes)
    })
    const requested = outputs.find(
      (output) => output.$ === "../Canonical.ActionRequested" && output.request.$ === "../Canonical.Prepare"
    )
    if (!requested || requested.$ !== "../Canonical.ActionRequested" || requested.request.$ !== "../Canonical.Prepare")
      throw new TypeError("Canonical preparation missing")
    const preparation = requested.request.operation
    const preparationInput = encodePreparationInput({
      observation,
      context,
      graphLimits,
      beforeAnalyze: context.beforeAnalyze !== undefined,
      ...options
    })
    const invocation = driver.allocateInvocation(undefined, false, {
      $: "Scope",
      partition: 1n,
      lifetime: 1n,
      round,
      preparation
    })
    const input = { invocation: BigInt(invocation), preparation: preparationInput }
    const session: PreparationSession = {
      invocation,
      input,
      machine: physical.machine,
      perform: physical.perform,
      revoke() {},
      close() {}
    }
    const task = driver.drive(session, input, { signal })
    active = task
    const outcome = await task
    if (!("preparation" in outcome)) throw new Error("Canonical did not accept a preparation result")
    const result = physical.decode(outcome.preparation)
    driver.canonicalEvent({
      $: "../Canonical.PreparationCompleted",
      partition: 1n,
      lifetime: 1n,
      round,
      operation: preparation,
      unit_bytes: list([])
    })
    driver.canonicalEvent({
      $: "../Canonical.CompleteObservation",
      partition: 1n,
      lifetime: 1n,
      round,
      observation: observationId
    })
    return { ...result, ambiguousLine: outcome.preparation.ambiguous_line }
  }
  return { run, retire }
}

export const prepareSource = Effect.fn("Preparation.prepareSource")(function* (
  observation: PreparationObservation,
  context: SourcePreparationContext,
  options: Options = {}
) {
  return yield* Effect.acquireUseRelease(
    Effect.sync(() => makeExecution(observation, context, options)),
    (execution) => fromPromise(execution.run),
    (execution, exit) => execution.retire(exit)
  )
})
