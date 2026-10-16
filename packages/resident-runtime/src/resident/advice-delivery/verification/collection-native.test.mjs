import assert from "node:assert/strict"
import { it } from "node:test"
import * as Effect from "effect/Effect"
import * as Cause from "effect/Cause"
import * as Result from "effect/Result"
import { makeResidentAdviceCollection } from "../../../../dist/resident/advice-delivery/advice-collection.js"
import { canonicalCollectionDecision } from "../../../../dist/resident/advice-delivery/collection.js"
import { recipientPartition } from "../../../../dist/resident/recipient/identity.js"

// Exercise the emitted collection and fitting cores through the production
// Effect interpreter, injecting only native records, observations and faults.
const fixture = (hooks = {}) => {
  const trace = []
  const advicee = { host: "codex-cli", hostVersion: "0.114.0", sessionId: "session", subagentId: "agent" }
  const finding = {
    path: "file.ts",
    declaration: "value",
    ruleId: "rule",
    probability: 1,
    message: "finding",
    semanticIdentity: "finding"
  }
  const advice = {
    id: "advice",
    admissionId: 1,
    sequence: 1,
    credentialGeneration: null,
    observation: { root: "/repo", advicee },
    partition: recipientPartition(advicee),
    revision: {},
    prepared: {}
  }
  const state = {
    advice,
    retained: advice,
    token: undefined,
    postChecks: 0,
    content: { evaluations: [], findings: [finding], collectionEligible: true }
  }
  const failUnexpected = () => Effect.die(new Error("Unexpected native collection operation"))
  const collection = makeResidentAdviceCollection({
    residentNow: () => 0,
    residentExpirePending: () => Effect.void,
    residentPruneNoticeCooldowns: () => Effect.void,
    residentAdvice: () => Effect.sync(() => [state.retained]),
    residentInspection: { observeAdviceFate: () => assert.fail("Unexpected suppressed finding") },
    residentComposedDelivery: { suppresses: () => Effect.succeed(false) },
    residentJoined: { hasAdmission: () => Effect.succeed(false) },
    residentRemoveAdvice: failUnexpected,
    residentIsCurrentWork: () => Effect.succeed(true),
    residentLedger: {
      transition: (event) =>
        Effect.sync(() => {
          if (event.kind === "postValidationCheck") {
            trace.push("post")
            state.postChecks++
            hooks.post?.(state)
          }
          return { outputs: [{ kind: canonicalCollectionDecision(event) }] }
        }),
      advice: {
        snapshots: () => Effect.sync(() => [{ capability: advice, content: state.content }]),
        current: () => Effect.sync(() => state.content),
        eligible: () => Effect.void,
        reserveLease: (_advice, token) =>
          Effect.sync(() => {
            state.token = token
            state.content = {
              ...state.content,
              delivery: { token, findings: [], leaseUntil: Infinity, acknowledged: false }
            }
            return true
          }),
        updateDelivery: (_advice, token, update) =>
          Effect.sync(() => {
            trace.push("update")
            assert.equal(state.content.delivery?.token, token)
            state.content = { ...state.content, delivery: { ...state.content.delivery, ...update } }
            return true
          }),
        releaseLease: failUnexpected
      }
    },
    residentReviewControls: {
      beforeSelection: () => Effect.sync(() => hooks.first?.(state)),
      beforeFinalSelection: () => Effect.void
    },
    residentFindingSelectionFacts: () =>
      Effect.gen(function* () {
        trace.push("facts")
        if (hooks.facts) yield* hooks.facts()
        return {
          partition: 1,
          round: 1,
          unit: 1,
          snapshot: 1,
          currentSnapshot: 1,
          credential: 1,
          currentCredential: 1,
          ageMs: 0,
          collectionReady: true
        }
      }),
    residentCollectionFindingOffer: () =>
      Effect.sync(() => {
        trace.push("offer")
        return hooks.limited ? "limited" : "selected"
      }),
    residentRecordOperationalFailure: () =>
      Effect.sync(() => {
        trace.push("limited")
        hooks.report?.()
      }),
    releaseDelivery: (token) =>
      Effect.sync(() => {
        assert.equal(token, state.token)
        trace.push("release")
        const { delivery: _, ...content } = state.content
        state.content = content
      })
  })
  return { trace, state, collect: collection.residentCollect("/repo", advicee, {}) }
}

it(
  "interruption inside fitting waits for fitting and limited notifications, then releases the lease",
  { timeout: 5000 },
  async (t) => {
    const entered = Promise.withResolvers(),
      continueFacts = Promise.withResolvers()
    const controller = new AbortController()
    t.after(() => {
      controller.abort()
      continueFacts.resolve()
    })
    const f = fixture({
      limited: true,
      facts: () =>
        Effect.promise(() => {
          entered.resolve()
          return continueFacts.promise
        })
    })
    const result = Effect.runPromiseExit(f.collect, { signal: controller.signal })
    await entered.promise
    controller.abort()
    continueFacts.resolve()
    const exit = await result
    assert.equal(exit._tag, "Failure")
    assert.equal(Cause.hasInterrupts(exit.cause), true)
    assert.deepEqual(f.trace, ["facts", "offer", "limited", "release"])
    assert.equal(f.state.content.delivery, undefined)
  }
)

it("a limited-notification defect preserves the original failure and releases the lease", async () => {
  const error = new Error("limited notification fault")
  const f = fixture({
    limited: true,
    report: () => {
      throw error
    }
  })
  const exit = await Effect.runPromiseExit(f.collect)
  assert.equal(exit._tag, "Failure")
  assert.equal(Result.getOrThrow(Cause.findDefect(exit.cause)), error)
  assert.deepEqual(f.trace, ["facts", "offer", "limited", "release"])
  assert.equal(f.state.content.delivery, undefined)
})

it("a barrier replacement with the same advice ID cannot reach fitting", async () => {
  const f = fixture({
    first: (state) => {
      state.retained = { ...state.advice }
    }
  })
  const result = await Effect.runPromise(f.collect)
  assert.equal(result.status, "empty")
  assert.deepEqual(f.trace, [])
})

it("loss of the original token after final fitting prevents the final delivery update", async () => {
  const f = fixture({
    post: (state) => {
      if (state.postChecks === 2)
        state.content = { ...state.content, delivery: { ...state.content.delivery, token: "replacement" } }
    }
  })
  const result = await Effect.runPromise(f.collect)
  assert.equal(result.status, "empty")
  assert.equal(f.state.content.delivery.token, "replacement")
  assert.deepEqual(f.trace, ["facts", "offer", "post", "update", "facts", "offer", "post"])
})
