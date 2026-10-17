import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import owner from "@hapsland/agent-flow-bend/canonical-resolver-owner"
import {
  effectNative,
  nativeFailureAggregate,
  runNativeEffect,
  type NativeFlow
} from "@hapsland/runtime-environment/runtime/native-execution"
import type { UnitJob } from "../../work-ownership/jobs.ts"
import type { createResidentOwnerTransaction } from "../../state/resolver-custody/resident-owner-transaction.mjs"
import type { createResidentPreparationDriver } from "../composition/preparation-driver.ts"
import { createEvaluationSession, type EvaluationSession } from "./evaluation-session.ts"
import { createNativeEvaluationIO } from "./native-evaluation.ts"
import { createNativeEvaluationRetention, type EvaluationDependencies } from "./native-retention.ts"

const completed = (effect: Effect.Effect<unknown, unknown>): Effect.Effect<void> =>
  runNativeEffect(
    (function* (): NativeFlow<void> {
      const exit = yield effectNative(Effect.exit(effect), false)
      if (!Exit.isExit(exit)) throw new TypeError("Missing evaluation completion Exit")
      if (Exit.isFailure(exit)) throw nativeFailureAggregate([], "Evaluation completion failed", undefined, exit.cause)
    })(),
    () => {}
  )

export const runCanonicalEvaluation = Effect.fn("ResidentRuntime.canonicalEvaluation")(
  (
    binding: {
      readonly bridge: ReturnType<typeof createResidentOwnerTransaction>
      readonly driver: ReturnType<typeof createResidentPreparationDriver>
    },
    deps: EvaluationDependencies,
    job: UnitJob,
    sequence: number
  ): Effect.Effect<void> =>
    Effect.scoped(
      Effect.gen(function* () {
        const { bridge, driver } = binding
        const partition = yield* deps.residentLedger.knownPartitionId(job.partition)
        if (partition === undefined) {
          yield* deps.residentReleaseReuseClaim(job.evaluationKey)
          yield* deps.residentReleaseUnit(job)
          return
        }
        const scope = yield* Effect.scope
        const context = {
          deps,
          job,
          sequence,
          signal: job.work?.controller.signal ?? deps.residentLifetimeController.signal
        }
        const identity = {
          partition: job.partition,
          canonicalPartition: partition,
          lifetime: deps.residentLedger.residentLifetime,
          canonicalLifetime: deps.residentLedger.canonicalLifetime,
          round: job.canonicalRound,
          hapslandRound: job.round?.generation ?? null,
          operation: job.canonicalOperationId
        }
        const io = createNativeEvaluationIO({
          context,
          identity,
          scope,
          bridge,
          driver,
          retention: (evaluation) => createNativeEvaluationRetention({ context, bridge, driver, evaluation })
        })
        let origin: number | undefined,
          released = false
        const cleanup = (): Effect.Effect<void> =>
          Effect.suspend(() => {
            if (released) return Effect.void
            const found =
              origin === undefined
                ? undefined
                : owner.find(origin, bridge.control.readCustody?.().children ?? bridge.control.readState().children)
            if (found === undefined || found.$ === "None")
              return deps.residentReleaseReuseClaim(job.evaluationKey).pipe(
                Effect.andThen(deps.residentReleaseUnit(job)),
                Effect.tap(() =>
                  Effect.sync(() => {
                    released = true
                  })
                )
              )
            const originId = origin
            if (originId === undefined) throw new Error("Evaluation cleanup lost its origin")
            if (found.value.phase.$ === "ChildAccepted")
              return completed(io.finish()).pipe(
                Effect.tap(() =>
                  Effect.sync(() => {
                    released = true
                  })
                )
              )
            if (found.value.phase.$ !== "ChildCancelled")
              throw new Error("Evaluation cleanup requires a stopped Canonical root")
            let session: EvaluationSession | undefined
            return driver
              .driveConstructedEffect(() => {
                const invocation = driver.allocateEvaluationCleanupInvocation(originId)
                try {
                  session = createEvaluationSession({
                    invocation,
                    mode: { kind: "cleanup" },
                    workSignal: context.signal,
                    perform: io.perform,
                    finish: () => Effect.void
                  })
                  return { session, input: session.input }
                } catch (error) {
                  driver.constructionFailed(invocation)
                  throw error
                }
              })
              .pipe(
                Effect.flatMap((result) => {
                  if (!("evaluation" in result) || session === undefined)
                    throw new Error("Canonical evaluation cleanup was not accepted")
                  return completed(session.completion(result.evaluation).pipe(Effect.andThen(io.finish())))
                }),
                Effect.tap(() =>
                  Effect.sync(() => {
                    released = true
                  })
                )
              )
          })
        const inputCleanup = function* (): NativeFlow<void> {
          yield effectNative(cleanup(), false)
        }
        let session: EvaluationSession | undefined
        const outcome = yield* driver.driveConstructedEffect(() => {
          origin = bridge.control.readCustody?.().next_invocation ?? bridge.control.readState().next_invocation
          const invocation = driver.allocateEvaluationInvocation(
            {
              $: "EvaluationContext",
              partition,
              lifetime: identity.canonicalLifetime,
              round: job.canonicalRound,
              operation: job.canonicalOperationId
            },
            inputCleanup
          )
          try {
            session = createEvaluationSession({
              invocation,
              mode: {
                kind: "root",
                input: { $: "Input", policy_unit: job.round !== undefined && job.workUnitId !== undefined }
              },
              workSignal: context.signal,
              perform: io.perform,
              finish: () => cleanup()
            })
            return { session, input: session.input }
          } catch (error) {
            driver.constructionFailed(invocation)
            throw error
          }
        })
        if (!("evaluation" in outcome)) return yield* Effect.interrupt
        if (session === undefined) throw new Error("Evaluation result lost its native session")
        yield* completed(session.completion(outcome.evaluation))
      })
    )
)
