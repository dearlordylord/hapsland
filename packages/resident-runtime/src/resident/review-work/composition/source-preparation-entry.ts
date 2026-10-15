import * as Effect from "effect/Effect"
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
  const partition = yield* context.deps.residentLedger.partitionId(job.partition)
  let source: SourceSession | undefined
  const outcome = yield* driver.driveConstructedEffect(
    () => {
      const invocation = driver.allocateSourceInvocation({
        $: "SourceScope",
        partition: Number(BigInt(partition)),
        lifetime: Number(BigInt(context.deps.residentLedger.canonicalLifetime)),
        round: Number(BigInt(job.canonicalRound)),
        observation: Number(BigInt(job.canonicalObservationId)),
        permission: { $: "SourceNew" }
      })
      try {
        source = createSourcePreparationProvider(Number(BigInt(invocation)), context, {
          owner,
          bridge,
          driver,
          candidates: job.observation.candidates,
          buildPreparationSession: ports.buildPreparationSession,
          entry: ports.entry ?? "full"
        })
        return { session: source, input: source.input }
      } catch (original) {
        try {
          driver.constructionFailed(invocation, source === undefined ? {} : { session: source })
        } catch (cleanup) {
          throw new AggregateError([original, cleanup], "Source construction and cleanup failed", { cause: original })
        }
        throw original
      }
    },
    { signal: context.preparationSignal }
  )
  if (source === undefined) throw new TypeError("Missing constructed Source session")
  if (!("completed" in outcome) && !("failure" in outcome && outcome.failure.$ === "Types.InvocationCancelled"))
    throw new TypeError("Wrong Canonical Source terminal binding")
  ports.onTerminal?.(source, outcome)
  // Canonical job cancellation is a settled product outcome. Fiber interruption
  // is settled by the shared driver and retains its original Cause.
  if ("failure" in outcome) return outcome
  if (!outcome.recovered && outcome.reason && "token" in outcome.reason) {
    const cause = source.cause(outcome.reason.token)
    if (cause === undefined) throw new TypeError("Missing Source terminal Cause")
    return yield* Effect.failCause(cause)
  }
  if (outcome.reason?.$ === "ProtocolFailure") throw new TypeError("Rejected Source protocol")
  return outcome
})
