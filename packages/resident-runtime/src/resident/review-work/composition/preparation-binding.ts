import { runCanonicalEvaluation } from "../evaluation/canonical-evaluation.ts"
import type { EvaluationDependencies } from "../evaluation/native-retention.ts"
import type { UnitJob } from "../../work-ownership/jobs.ts"
import * as Effect from "effect/Effect"
import owner from "@hapsland/agent-flow-bend/canonical-resolver-owner"
import { effectiveGraphLimits } from "@hapsland/runtime-inputs/configuration/resolve"
import post from "../preparation/post-preparation-core.js"
import type { PostContext } from "../preparation/post-preparation-host.mjs"
import type { createResidentOwnerTransaction } from "../../state/resolver-custody/resident-owner-transaction.mjs"
import { createPreparationSessionRegistry } from "./native-preparation-sessions.ts"
import { createResidentPreparationDriver } from "./preparation-driver.ts"
import { createResidentPreparationSession } from "./preparation-session.ts"
import { runResidentSourcePreparation } from "./source-preparation-entry.ts"

import type { DeliveryContext } from "@hapsland/agent-flow-bend/canonical-resolver-owner"
import type { DeliveryHandoff } from "@hapsland/canonical-policy/canonical/child-execution"
import type { ResidentResponse } from "@hapsland/resident-transport/resident/protocol"
import type { makeResidentCollectionRoot } from "../../advice-delivery/handoff/collection-root.ts"
import type { makeResidentSourceCurrentSession } from "../../advice-delivery/handoff/source-current.ts"
import type { makeResidentDeliveryFinalizationSession } from "../../advice-delivery/handoff/delivery-finalize.ts"
import type { DeliveryOutcome } from "./owned-artifact-driver.mjs"
import { effectNative, nativeFailureAggregate } from "@hapsland/runtime-environment/runtime/native-execution"
import {
  createCollectionDeliverySession,
  createPrepareDeliverySession,
  createFinalizeDeliverySession
} from "../../advice-delivery/handoff/delivery-cursors.ts"

/** One resident lifetime binding. Canonical owns preparation and delivery;
 * callers provide the current job's effects and receive whole preparation.
 * Keep this binding and its action sink alive until cleanup succeeds. Failed
 * cleanup retains exact obligations and may be retried through the same entry.
 */
export function createResidentPreparationBinding(bridge: ReturnType<typeof createResidentOwnerTransaction>) {
  const registry = createPreparationSessionRegistry()
  const driver = createResidentPreparationDriver({ bridge, registry })
  const deliveryOutcome = (value: Effect.Success<ReturnType<typeof driver.driveDeliveryEffect>>): DeliveryOutcome => {
    if ("delivery" in value) return value
    if ("failure" in value && "$" in value.failure && value.failure.$ === "Types.InvocationCancelled")
      return { failure: { $: value.failure.$ } }
    throw new TypeError("Wrong Canonical delivery outcome")
  }
  return {
    acceptActions: driver.acceptActions,
    evaluate: (deps: EvaluationDependencies, job: UnitJob, sequence: number): Effect.Effect<void> =>
      runCanonicalEvaluation({ bridge, driver }, deps, job, sequence),
    validateAdviceInput: driver.validateAdviceInput,
    collect: Effect.fn("ResidentRuntime.canonicalCollection")(function* (
      context: Omit<DeliveryContext, "request">,
      native: ReturnType<typeof makeResidentCollectionRoot>
    ): Effect.fn.Return<DeliveryOutcome> {
      return yield* driver.driveConstructedEffect(() => {
        const invocation = driver.allocateCollectionInvocation(
          { ...context, request: driver.state.next_invocation },
          function* () {
            yield effectNative(native.cleanup(), false)
          }
        )
        const child = owner.find(invocation, driver.state.children)
        const inputHandle =
          child.$ === "Some" && child.value.scope.$ === "DeliveryScope" ? child.value.scope.input_handle : undefined
        let session: ReturnType<typeof createCollectionDeliverySession> | undefined
        try {
          session = createCollectionDeliverySession(invocation, native)
          return { session, input: session.input }
        } catch (error) {
          try {
            driver.constructionFailed(invocation, {
              ...(session === undefined ? {} : { session }),
              ...(inputHandle === undefined ? {} : { inputHandle })
            })
          } catch (cleanup) {
            throw nativeFailureAggregate([error, cleanup], "Collect construction and cleanup failed", { cause: error })
          }
          throw error
        }
      })
    }),
    prepareDelivery: Effect.fn("ResidentRuntime.canonicalPrepareDelivery")(function* (
      receipt: DeliveryHandoff,
      construct: (response: ResidentResponse) => ReturnType<typeof makeResidentSourceCurrentSession>
    ): Effect.fn.Return<DeliveryOutcome> {
      const outcome = yield* driver.driveDeliveryEffect(receipt, function* (projected, invocation, cleanup) {
        if (projected.kind !== "delivery") throw new TypeError("Wrong Collect projection")
        const previous = projected.machine.accepted(projected.view)
        const permission = receipt.receipt.permission
        if (previous.stage !== "collect" || permission.$ !== "PrepareDeliveryIssued")
          throw new TypeError("Wrong Prepare delivery receipt")
        let native: Effect.Success<ReturnType<typeof makeResidentSourceCurrentSession>> | undefined
        try {
          yield effectNative(
            construct(previous.response).pipe(
              Effect.tap((value) =>
                Effect.sync(() => {
                  native = value
                })
              )
            ),
            false
          )
          if (native === undefined) throw new Error("Missing constructed Prepare session")
          const session = createPrepareDeliverySession(
            invocation,
            native,
            previous.response,
            permission.selection,
            cleanup
          )
          return { session, input: session.input }
        } catch (error) {
          // Keep the physical Scope even if a pure session constructor fails
          // before the shared driver has received a native session.
          if (native !== undefined) {
            const held = native
            registry.retainConstructionCleanupFlow(invocation, undefined, function* () {
              yield effectNative(held.finish(), false)
            })
          }
          throw error
        }
      })
      return deliveryOutcome(outcome)
    }),
    finalizeDelivery: Effect.fn("ResidentRuntime.canonicalFinalizeDelivery")(
      (
        receipt: DeliveryHandoff,
        construct: (
          response: ResidentResponse,
          sources: ReadonlyMap<string, boolean>
        ) => ReturnType<typeof makeResidentDeliveryFinalizationSession>
      ): Effect.Effect<DeliveryOutcome> =>
        driver
          .driveDeliveryEffect(receipt, function* (projected, invocation, cleanup) {
            if (projected.kind !== "delivery") throw new TypeError("Wrong Prepare projection")
            const previous = projected.machine.accepted(projected.view)
            const permission = receipt.receipt.permission
            if (previous.stage !== "prepare" || permission.$ !== "FinalizeDeliveryIssued")
              throw new TypeError("Wrong Finalize delivery receipt")
            const native = construct(previous.response, previous.sources)
            const session = createFinalizeDeliverySession(invocation, native, permission.selection, cleanup)
            return { session, input: session.input }
          })
          .pipe(Effect.map(deliveryOutcome), Effect.uninterruptible)
    ),
    cancelDelivery: (receipt: DeliveryHandoff) => driver.cancelDeliveryEffect(receipt),
    prepare: Effect.fn("ResidentRuntime.canonicalPreparation")(function* (context: Omit<PostContext, "ownedAdvice">) {
      const ownedContext: PostContext = { ...context, ownedAdvice: { core: post, bridge, driver } }
      yield* runResidentSourcePreparation(ownedContext, {
        bridge,
        driver,
        buildPreparationSession: (invocation, candidate, preparation) => {
          // Construct only after Source accepts the gates and issues admission;
          // no job, settings or capture cache is held by the lifetime constructor.
          const { job, deps } = ownedContext
          const settings = job.settings
          const cache = new Map()
          return createResidentPreparationSession({
            invocation,
            observation: job.observation,
            candidate,
            connection: { bridge, runtime: deps.residentLedger.runtime, preparation },
            owner,
            driver,
            root: job.observation.root,
            rootIdentity: job.observation.rootIdentity,
            context: {
              ...deps.residentInspection.preparationPorts(job),
              ...(deps.residentCaptureSource === undefined ? {} : { captureSource: deps.residentCaptureSource }),
              now: deps.residentNow
            },
            cache,
            settings,
            graphLimits: effectiveGraphLimits(settings.configuration.policy),
            residentContext: ownedContext
          })
        }
      })
    }),
    cleanup: () => registry.retryCleanupEffect()
  }
}
