import { performGraphNativeGroup } from "./graph-native-group.ts"
import { TransportFailure } from "@hapsland/runtime-environment/runtime/effect-transport"
import * as Effect from "effect/Effect"
import owner from "@hapsland/agent-flow-bend/canonical-resolver-owner"
import type { Step, State } from "@hapsland/agent-flow-bend/canonical-resolver-owner"
import {
  toOwner,
  readChildSnapshot,
  type Control,
  type Method,
  type Arguments,
  type EntryTable
} from "@hapsland/canonical-policy/canonical/child-execution"
import { CANONICAL_MAX_BYTES, encodeCanonicalEvent } from "@hapsland/canonical-policy/canonical/adapter"
import { GRAPH_LIMIT_CEILINGS } from "@hapsland/canonical-policy/canonical/graph-limits"
import { effectiveGraphLimits } from "@hapsland/runtime-inputs/configuration/resolve"
import { createNativeSessionRegistry } from "@hapsland/runtime-environment/runtime/native-session-registry"
import {
  createGraphMachine,
  type GraphOutcome
} from "@hapsland/source-analysis/direct-event/graph-resolution/composition"
import { createBendEffectResolver } from "@hapsland/source-analysis/direct-event/graph-resolution"
import { hostNatural, list, unlist, productValue } from "@hapsland/source-artifacts/direct-event/value/codec"
import type { StableCapture } from "@hapsland/native-observation/direct-event/capture"
import { createPhysicalPreparationCapability } from "./physical-effects.mjs"
import {
  createEffectPreparationDriver,
  type PublicPreparationSession,
  type PublicPreparationReply,
  type PreparationSession
} from "./canonical-driver.ts"
import { encodePreparationInput, type PreparationObservation } from "./input.ts"
import type { SourcePreparationContext } from "./contract.ts"
import { performFinalizationSync, createFinalizationSession } from "./finalization-protocol.ts"

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
  // This state and its decoded reader remain private to one preparation lifetime.
  // Each existing owner step commits before the common driver executes its actions.
  let state = owner.initial_limits(1n, BigInt(CANONICAL_MAX_BYTES), 1n, BigInt(CANONICAL_MAX_BYTES))
  let activeReader = owner.active_reader(state.children)
  const commit = (step: Step): Step => {
    state = step.state
    activeReader = owner.active_reader(state.children)
    return step
  }
  const readChild = (invocation: bigint) => readChildSnapshot(activeReader, invocation)
  const entries: EntryTable = owner
  const control: Control = {
    readState: () => state,
    readChild,
    readActive: (invocation) => activeReader.query(invocation),
    invoke<M extends Method>(method: M, args: Arguments<M>) {
      const call = entries[method] as (state: State, ...args: Arguments<M>) => Step
      return commit(call(state, ...args))
    }
  }
  const driver = createEffectPreparationDriver({
    owner,
    control,
    machine: graph,
    registry,
    selectMachine: (_input, session) => ("input" in session ? session.machine : graph),
    hooks: {
      canonicalOutputs: (value) => {
        outputs = value
      }
    },
    foreignSync(requests, execution) {
      if (requests.length !== 1) throw new TypeError("Preparation requires one owned request")
      const request = requests[0]!
      if ("finalization" in request) return performFinalizationSync(request)
      const session = registry.get(hostNatural(request.invocation))
      if (!session) throw new TypeError("Unknown owned service invocation")
      if ("operation" in request) {
        if ("input" in session) throw new TypeError("Wrong graph service session")
        return performGraphNativeGroup(request, session, execution)
      }
      if (!("input" in session) || !("performEffect" in session))
        throw new TypeError("Wrong preparation service session")
      const { signal, ownerLease } = execution
      if (ownerLease === undefined) throw new TypeError("Missing preparation owner lease")
      return {
        effect: session.performEffect(request, { ownerLease, ...(signal === undefined ? {} : { signal }) }),
        map: (value: unknown) => value as PublicPreparationReply
      }
    },
    foreign() {
      throw new TypeError("Public preparation requires its selected native Effect port")
    }
  })
  const canonicalGate: import("./preparation-finalization.ts").CanonicalRuleGate = async (event) => {
    driver.canonicalEvent(toOwner(encodeCanonicalEvent(event)))
    const decision = outputs.find((output) => output.$ === "../Canonical.PolicyDecided")
    if (!decision || decision.$ !== "../Canonical.PolicyDecided" || decision.decision.$ !== "../Canonical.RuleGate")
      throw new TypeError("Canonical finalization gate missing")
    if (decision.decision.gate.$ === "../RulePolicy.Admit") return true
    if (decision.decision.gate.$ === "../RulePolicy.Omit") return false
    throw new TypeError("Invalid Canonical finalization gate")
  }
  const physical = createPhysicalPreparationCapability({
    root: observation.root,
    rootIdentity: observation.rootIdentity,
    context,
    cache,
    settings: context.settings,
    graphLimits,
    runEffect: (effect) => effect,
    canonicalGate,
    runFinalization: (input, execution) =>
      Effect.gen(function* () {
        const parent = execution.ownerLease
        const invocation = driver.allocateInvocation({
          $: "Parent",
          invocation: parent.invocation,
          generation: parent.generation,
          request: parent.request
        })
        let session
        try {
          session = createFinalizationSession(invocation, input, execution, canonicalGate)
        } catch (error) {
          try {
            driver.constructionFailed(invocation)
          } catch (cleanup) {
            throw new AggregateError([error, cleanup], "Finalization construction and cleanup failed", { cause: error })
          }
          throw error
        }
        const result = yield* driver.driveEffect(session, session.input, execution)
        if (
          "failure" in result &&
          result.failure !== undefined &&
          "$" in result.failure &&
          result.failure.$ === "Types.InvocationCancelled"
        )
          throw new TransportFailure("aborted")
        if (!("finalization" in result)) throw new TypeError("Canonical did not accept finalization")
        return result.finalization
      }),
    admitMaterialization: (capture, preflight) =>
      Effect.gen(function* () {
        const admission =
          context.beforeAnalyze === undefined
            ? { status: "admitted" as const }
            : yield* context.beforeAnalyze(capture.path, hostNatural(capture.bytes), preflight)
        if (admission.status === "admitted")
          return { $: "MaterializationDone", result: { $: "Resized" }, requested: capture.bytes }
        return {
          $: "MaterializationDone",
          result: { $: "MaterializationDenied", diagnostic: productValue(admission.diagnostic) },
          requested: capture.bytes
        }
      }),
    rejectMaterializationCapacity: () => Effect.void,
    recordMaterializationCapacity: () => Effect.void,
    resolveRoot: (request, facts, execution) =>
      Effect.gen(function* () {
        const parent = readChild(request.invocation)
        if (parent.$ !== "Some") throw new TypeError("Missing preparation parent invocation")
        let terminalFrame: GraphOutcome | undefined
        const resolve = createBendEffectResolver({
          allocateInvocation: () =>
            driver.allocateInvocation({
              $: "Parent",
              invocation: request.invocation,
              generation: parent.value.generation,
              request: request.id
            }),
          onConstructionFailure: driver.constructionFailed,
          drive: (...args) =>
            Effect.gen(function* () {
              const outcome = yield* driver.driveEffect(...args)
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
            })
        })
        const unit = yield* resolve(facts.path, facts.capture, facts.name, facts.context, execution)
        if (terminalFrame === undefined) throw new TypeError("Resolver completed without an accepted terminal")
        return {
          unit,
          references:
            "finalFrame" in terminalFrame && terminalFrame.finalFrame.$ === "Some"
              ? terminalFrame.finalFrame.value.references
              : list([])
        }
      })
  })
  driver.canonicalEvent({ $: "../Canonical.OpenRound", partition: 1n, lifetime: 1n })
  const opened = outputs.find(
    (output) => output.$ === "../Canonical.EventEstablished" && output.event.$ === "../Canonical.RoundStarted"
  )
  if (!opened || opened.$ !== "../Canonical.EventEstablished" || opened.event.$ !== "../Canonical.RoundStarted")
    throw new TypeError("Canonical round missing")
  const round = opened.event.id
  const retire = () =>
    Effect.sync(() => {
      driver.canonicalEvent({ $: "../Canonical.RetirePartition", partition: 1n, lifetime: 1n, round })
    }).pipe(
      Effect.ensuring(
        Effect.promise(async () => {
          await registry.retryCleanup()
          cache.clear()
          if (registry.size || registry.pendingCleanup || Object.values(driver.resources).some((count) => count !== 0))
            throw new Error("Preparation resource lifetime did not settle")
        })
      )
    )
  const run = () =>
    Effect.gen(function* () {
      const beginning = unlist(
        owner.begin_public_preparation(driver.state, 1n, 1n, round, BigInt(graphLimits.readBytes))
      )
      for (const step of beginning) driver.acceptPublication(commit(step))
      const admission = beginning[0]
      const admitted =
        admission?.$ === "Advanced"
          ? unlist(admission.outputs).find(
              (output) =>
                output.$ === "../Canonical.EventEstablished" && output.event.$ === "../Canonical.ObservationAdmitted"
            )
          : undefined
      if (
        !admitted ||
        admitted.$ !== "../Canonical.EventEstablished" ||
        admitted.event.$ !== "../Canonical.ObservationAdmitted"
      )
        throw new TypeError("Canonical observation missing")
      const observationId = admitted.event.id
      const requested = outputs.find(
        (output) => output.$ === "../Canonical.ActionRequested" && output.request.$ === "../Canonical.Prepare"
      )
      if (
        !requested ||
        requested.$ !== "../Canonical.ActionRequested" ||
        requested.request.$ !== "../Canonical.Prepare"
      )
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
        performEffect: physical.performEffect,
        revoke() {},
        close() {}
      }
      const outcome = yield* driver.driveEffect(session, input)
      if (!("preparation" in outcome)) throw new Error("Canonical did not accept a preparation result")
      const result = physical.decode(outcome.preparation)
      for (const step of unlist(
        owner.complete_public_preparation(driver.state, 1n, 1n, round, preparation, observationId)
      ))
        driver.acceptPublication(commit(step))
      return { ...result, ambiguousLine: outcome.preparation.ambiguous_line }
    })
  return { run, retire }
}

export const prepareSource = Effect.fn("Preparation.prepareSource")(function* (
  observation: PreparationObservation,
  context: SourcePreparationContext,
  options: Options = {}
) {
  return yield* Effect.acquireUseRelease(
    Effect.sync(() => makeExecution(observation, context, options)),
    (execution) => execution.run(),
    (execution) => execution.retire()
  )
})
