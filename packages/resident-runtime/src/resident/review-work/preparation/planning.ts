import * as Effect from "effect/Effect"
import { sourcePartition } from "../../recipient/identity.ts"
import { evaluationSourcePartition } from "../../work-ownership/identity.ts"
import { type PreparationContext, type ReadyPreparedOutcome } from "./context.ts"

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
