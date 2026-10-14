import type { CachedEvaluation } from "../../../state/evaluation-reuse.ts"
import type { WorkRevision } from "../../../state/revision.ts"
import type { ResidentLedger } from "../../../work-ownership/jobs.ts"
import type { DirectObservation } from "@hapsland/native-observation/direct-event/observation"
import * as Effect from "effect/Effect"
import { sourcePartition } from "../../../recipient/identity.ts"
import { evaluationSourcePartition } from "../../../work-ownership/identity.ts"
import { type PreparationContext, type ReadyPreparedOutcome } from "../context.ts"

export const planPreparedUnits = Effect.fn("ResidentRuntime.planPreparedUnits")(function* (
  context: PreparationContext<"residentAdvice" | "residentRestoreCurrentWork" | "residentReuse">,
  deliverable: readonly ReadyPreparedOutcome[]
) {
  const preparationGenerationPartition = () => {
    const generationPartition = evaluationSourcePartition(
      context.job.observation,
      context.job.work?.id ?? "standalone",
      context.job.dispatch.credential?.generation ?? "controlled",
      context.job.settings.configuration.policy.digest
    )
    return generationPartition
  }
  return yield* Effect.forEach(
    deliverable,
    Effect.fn("ResidentRuntime.planPreparedUnit")(function* (outcome) {
      const generationPartition = preparationGenerationPartition()
      const evaluationKey = context.deps.residentReuse.key(generationPartition, outcome.prepared)
      const liveAdvice = (yield* context.deps.residentAdvice()).some((advice) => advice.evaluationKey === evaluationKey)
      switch (yield* context.deps.residentReuse.route(evaluationKey, liveAdvice)) {
        case "joinedAdvice":
          return { kind: "joined" as const, join: "advice" as const, outcome, evaluationKey }
        case "joinedClaimed":
          return { kind: "joined" as const, join: "claimed" as const, outcome, evaluationKey }
        case "joinedPending": {
          const pending = yield* context.deps.residentReuse.pending(evaluationKey)
          if (pending === undefined) throw new Error("canonical reuse route lacks pending evaluation")
          pending.revision = yield* context.deps.residentRestoreCurrentWork(
            sourcePartition(context.job.observation.root, context.job.observation.advicee),
            outcome.prepared
          )
          return { kind: "joined" as const, join: "pending" as const, outcome, evaluationKey }
        }
        case "cached":
          return {
            kind: "cached" as const,
            outcome,
            evaluationKey,
            cached: yield* context.deps.residentReuse.cached(evaluationKey)
          }
        case "owner":
          context.unassignedClaims.add(evaluationKey)
          return { kind: "owner" as const, outcome, evaluationKey }
      }
    })
  )
})

/** Independent original native plan model, retained only by the verification oracle. */
export type PlannedPreparationItem =
  | { kind: "owner"; outcome: ReadyPreparedOutcome; evaluationKey: string; cached?: never; join?: never }
  | { kind: "cached"; outcome: ReadyPreparedOutcome; evaluationKey: string; cached: CachedEvaluation; join?: never }
  | {
      kind: "joined"
      join: "advice" | "claimed" | "pending"
      outcome: ReadyPreparedOutcome
      evaluationKey: string
      cached?: never
    }

export type RetainedPreparationItem = Extract<PlannedPreparationItem, { kind: "owner" | "cached" }>

export type PreparationReservation = Effect.Success<ReturnType<ResidentLedger["completePreparation"]>>[number]

export type PreparedUnitFacts = {
  readonly item: RetainedPreparationItem
  readonly admitted: NonNullable<PreparationReservation>
  readonly pathObservation: DirectObservation
  readonly analyticsEnabled: boolean
  readonly sourceHash: string | undefined
  readonly revision: WorkRevision
  readonly workUnitId: number | undefined
}
