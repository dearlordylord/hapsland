import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import owner from "@hapsland/agent-flow-bend/canonical-resolver-owner"
import { createSourcePreparationProvider } from "../preparation/source-preparation-provider.mjs"
import type { PostContext } from "../preparation/post-preparation-host.mjs"
import type { SourceOutcome } from "./owned-artifact-driver.mjs"
import type { createResidentPreparationDriver } from "./preparation-driver.ts"
import type { createResidentOwnerTransaction } from "../../state/resolver-custody/resident-owner-transaction.mjs"

type SourceSession = ReturnType<typeof createSourcePreparationProvider>
type SourcePorts = {
  readonly driver: ReturnType<typeof createResidentPreparationDriver>
  readonly bridge: ReturnType<typeof createResidentOwnerTransaction>
  readonly buildPreparationSession: Parameters<typeof createSourcePreparationProvider>[2]["buildPreparationSession"]
  /** Prefix correspondence fixtures; resident entry always uses full gates. */
  readonly entry?: "full" | "after-gates"
  /** Terminal observation for correspondence; never selects progression or exit. */
  readonly onTerminal?: (session: SourceSession, outcome: SourceOutcome) => void
}

/** Execute the whole Source cursor through Canonical. The host supplies native
 * session construction and maps the emitted terminal fact to the Effect exit.
 * A failed constructor retires its allocated invocation before propagating;
 * the existing driver retains failed cleanup obligations for exact retry.
 * The supplied binding must outlive this effect and its finalization.
 */
export const runResidentSourcePreparation = Effect.fn("ResidentRuntime.sourcePreparation")(function* (
  context: PostContext,
  ports: SourcePorts
) {
  const { driver, bridge } = ports
  const job = context.job
  const { source, outcome } = yield* Effect.acquireUseRelease(
    Effect.gen(function* () {
      const partition = yield* context.deps.residentLedger.partitionId(job.partition)
      const invocation = driver.allocateSourceInvocation({
        $: "SourceScope",
        partition: BigInt(partition),
        lifetime: BigInt(context.deps.residentLedger.canonicalLifetime),
        round: BigInt(job.canonicalRound),
        observation: BigInt(job.canonicalObservationId),
        permission: { $: "SourceNew" }
      })
      const source = yield* Effect.sync(() => {
        try {
          return createSourcePreparationProvider(BigInt(invocation), context, {
            owner,
            bridge,
            driver,
            candidates: job.observation.candidates,
            buildPreparationSession: ports.buildPreparationSession,
            entry: ports.entry ?? "full"
          })
        } catch (original) {
          try {
            driver.constructionFailed(invocation)
          } catch (cleanup) {
            throw new AggregateError([original, cleanup], "Source construction and cleanup failed", { cause: original })
          }
          throw original
        }
      })
      const controller = new AbortController()
      const signal = AbortSignal.any([context.preparationSignal, controller.signal])
      const completion = Promise.resolve().then(() => driver.drive(source, source.input, { signal }))
      return { source, controller, completion }
    }),
    ({ source, completion }) => Effect.promise(() => completion.then((outcome) => ({ source, outcome }))),
    ({ controller, completion }, exit) =>
      Effect.gen(function* () {
        controller.abort()
        yield* Effect.promise(() => completion).pipe(
          Effect.catchCause((cause) => {
            // Keep late cleanup failures on interruption; do not duplicate a
            // completion rejection already observed by the use effect.
            const observed =
              Exit.isFailure(exit) &&
              cause.reasons.every(
                (reason) =>
                  reason._tag === "Die" &&
                  exit.cause.reasons.some((previous) => previous._tag === "Die" && previous.defect === reason.defect)
              )
            return observed ? Effect.void : Effect.failCause(cause)
          }),
          Effect.asVoid
        )
      })
  )
  if (!("completed" in outcome) && !("failure" in outcome && outcome.failure.$ === "Types.InvocationCancelled"))
    throw new TypeError("Wrong Canonical Source terminal binding")
  ports.onTerminal?.(source, outcome)
  // Canonical job cancellation is a settled product outcome. Fiber interruption
  // is handled separately by acquireUseRelease and retains its original Cause.
  if ("failure" in outcome) return outcome
  if (!outcome.recovered && outcome.reason && "token" in outcome.reason) {
    const cause = source.cause(outcome.reason.token)
    if (cause === undefined) throw new TypeError("Missing Source terminal Cause")
    return yield* Effect.failCause(cause)
  }
  if (outcome.reason?.$ === "ProtocolFailure") throw new TypeError("Rejected Source protocol")
  return outcome
})
