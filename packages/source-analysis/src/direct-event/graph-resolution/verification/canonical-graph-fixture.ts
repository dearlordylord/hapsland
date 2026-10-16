import assert from "node:assert/strict"
import * as Effect from "effect/Effect"
import owner from "@hapsland/agent-flow-bend/canonical-resolver-owner"
import { fromProductValue, unlist } from "@hapsland/source-artifacts/direct-event/value/codec"
import type { ReviewUnit } from "@hapsland/source-artifacts/direct-event/artifact-model"
import type { StableCapture } from "@hapsland/native-observation/direct-event/capture"
import type { LanguageGraphHost } from "../../languages/contracts.ts"
import { createGraphDriver } from "../composition/protocol.ts"
import { createGraphMachine } from "../composition/machine.ts"
import {
  createBendEffectResolver,
  createGraphServiceRegistry,
  performGraphServiceEffect,
  type GraphServiceReply
} from "../consumer.ts"

/** Regression fixture binding only. All Graph progression and acceptance use
 * the packaged production Canonical owner/driver; no native graph algorithm.
 * Each invocation owns its registry and awaits cleanup on success or failure.
 */
export const resolveCanonicalGraphFixture = (
  path: string,
  capture: StableCapture,
  name: string,
  context: LanguageGraphHost
): Effect.Effect<ReviewUnit | undefined> =>
  Effect.suspend(() => {
    let state = owner.initial_limits(100, 100000000, 100, 100000000)
    const opened = owner.canonical_event(state, { $: "../Canonical.OpenRound", partition: 1, lifetime: 1 })
    assert.equal(opened.$, "Advanced")
    if (opened.$ !== "Advanced") throw new Error("Fixture round refused")
    state = opened.state
    for (const step of unlist(owner.begin_public_preparation(state, 1, 1, 1, 1000))) {
      if (step.$ !== "Advanced") throw new Error("Fixture preparation refused")
      state = step.state
    }
    const registry = createGraphServiceRegistry()
    const driver = createGraphDriver({
      owner,
      initialState: state,
      scope: { $: "Scope", partition: 1, lifetime: 1, round: 1, preparation: 2 },
      machine: createGraphMachine(),
      registry,
      foreign: () => {
        throw new Error("Expected Graph Effect service")
      },
      foreignSync: (requests, options) => {
        const request = requests[0]
        if (requests.length !== 1 || !request) throw new TypeError("Expected one Graph service request")
        const session = registry.get(request.invocation)
        if (!session) throw new Error("Missing owned Graph service session")
        return {
          effect: performGraphServiceEffect(session, request, options),
          map: (reply) => reply as GraphServiceReply
        }
      }
    })
    const resolve = createBendEffectResolver({
      allocateInvocation: driver.allocateInvocation,
      onConstructionFailure: driver.constructionFailed,
      drive: driver.driveEffect
    })
    return resolve(path, capture, name, context).pipe(
      Effect.map((value) => (value === undefined ? undefined : (fromProductValue(value) as ReviewUnit))),
      Effect.ensuring(
        Effect.sync(() => {
          assert.equal(registry.size, 0)
          assert.equal(registry.pendingCleanup, 0)
          assert.deepEqual(driver.resources, { payloads: 0, leases: 0, sessions: 0, artifactStates: 0, launches: 0 })
        })
      )
    )
  })
