import * as Effect from "effect/Effect"
import owner from "@hapsland/agent-flow-bend/canonical-resolver-owner"
import { createChildExecutionDriver } from "@hapsland/canonical-policy/canonical/child-execution"
import { CANONICAL_MAX_BYTES } from "@hapsland/canonical-policy/canonical/adapter"
import { createNativeSessionRegistry } from "@hapsland/runtime-environment/runtime/native-session-registry"
import { createFreshnessSession, freshnessProtocol, performFreshnessSync } from "./canonical-protocol.ts"
import type { FreshnessSession } from "./canonical-protocol.ts"
import type { FreshnessInput, FreshnessPorts, FreshnessResult } from "./contract.ts"

// Each public entry supplies only its original external Effects. Canonical
// owns the scope, service leases, acceptance and native session settlement.
export const executeFreshness = Effect.fn("Freshness.execute")(function* (
  input: FreshnessInput,
  ports: FreshnessPorts
): Effect.fn.Return<FreshnessResult> {
  const registry = createNativeSessionRegistry<FreshnessSession>()
  const driver = createChildExecutionDriver({
    owner,
    initialState: owner.initial_limits(1, Number(CANONICAL_MAX_BYTES), 1, Number(CANONICAL_MAX_BYTES)),
    registry,
    machine: {
      kind: "freshness" as const,
      retainedHandles: 0,
      disposeInvocation() {},
      close() {},
      initial() {
        throw new TypeError("Freshness requires its selected session machine")
      }
    },
    selectMachine: (_input, session) => session.machine,
    protocol: freshnessProtocol,
    foreignSync: ([request], execution) => {
      if (!request) throw new TypeError("Missing freshness request")
      return performFreshnessSync(request, execution)
    },
    foreign() {
      throw new TypeError("Freshness requires its synchronous command group")
    }
  })
  const invocation = driver.allocateFreshnessInvocation()
  let session: FreshnessSession
  try {
    session = createFreshnessSession(invocation, input, ports)
  } catch (error) {
    try {
      driver.constructionFailed(invocation)
    } catch (cleanup) {
      throw new AggregateError([error, cleanup], "Freshness construction and cleanup failed", { cause: error })
    }
    throw error
  }
  const cleanup = Effect.promise(async () => {
    await registry.retryCleanup()
    if (registry.size || registry.pendingCleanup || Object.values(driver.resources).some((count) => count !== 0))
      throw new Error("Freshness native resources did not settle")
  })
  const outcome = yield* driver.driveEffect(session, session.input).pipe(Effect.ensuring(cleanup))
  if (!("kind" in outcome)) throw new TypeError("Canonical did not accept a freshness result")
  return outcome
})
