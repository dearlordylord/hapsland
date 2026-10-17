import rootCore from "../../../../dist/resident/advice-delivery/handoff/collection-handoff-core.js"
import { residentEditCollectionStatus } from "../../../../dist/resident/advice-delivery/handoff/collection-status.js"
import assert from "node:assert/strict"
import { it } from "node:test"
import * as Effect from "effect/Effect"
import * as Cause from "effect/Cause"
import * as Result from "effect/Result"
import { makeResidentAdviceCollection } from "../../../../dist/resident/advice-delivery/advice-collection.js"
import * as Clock from "effect/Clock"
import { makeResidentCollectionRoot } from "../../../../dist/resident/advice-delivery/handoff/collection-root.js"
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
    residentComposedDelivery: { isDeciding: () => Effect.succeed(true), suppresses: () => Effect.succeed(false) },
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
  const native = makeResidentCollectionRoot({
    kind: "direct",
    composed: false,
    turnEnd: false,
    collection: collection.residentCollectionSession(
      "/repo",
      advicee,
      { credential: null },
      "ordinary",
      undefined,
      false
    )
  })
  const collect = Effect.gen(function* () {
    let step = native.initial(71)
    while (step.$ === "RootAwait") step = yield* native.advance(step)
    return native.decode(step)
  }).pipe(Effect.ensuring(native.finish()), Effect.onError(native.release))
  return { trace, state, collection, advicee, collect }
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

it(
  "the complete native collection reaches its response after renewal and final fitting",
  { timeout: 5000 },
  async () => {
    const f = fixture()
    const response = await Effect.runPromise(f.collect)
    assert.equal(response.status, "advice")
    assert.equal(response.findingCount, 1)
    assert.deepEqual(f.trace, [
      "facts",
      "offer",
      "post",
      "update",
      "facts",
      "offer",
      "post",
      "update",
      "update",
      "facts",
      "offer",
      "update"
    ])
  }
)

it(
  "direct Root waits for physical close before interruption releases its selected lease",
  { timeout: 5000 },
  async (t) => {
    const entered = Promise.withResolvers(),
      close = Promise.withResolvers()
    const controller = new AbortController()
    t.after(() => {
      controller.abort()
      close.resolve()
    })
    const f = fixture()
    const collection = f.collection.residentCollectionSession(
      "/repo",
      f.advicee,
      { credential: null },
      "ordinary",
      undefined,
      false
    )
    const root = makeResidentCollectionRoot({
      kind: "direct",
      composed: false,
      turnEnd: false,
      collection: {
        ...collection,
        finish: () =>
          collection.finish().pipe(
            Effect.andThen(
              Effect.promise(() => {
                f.trace.push("close-entered")
                entered.resolve()
                return close.promise.then(() => {
                  f.trace.push("close-finished")
                })
              })
            )
          )
      }
    })
    let step = root.initial(71)
    while (step.$ === "RootAwait" && step.request.command.$ !== "RootDecode")
      step = await Effect.runPromise(root.advance(step))
    assert.equal(step.request.command.$, "RootDecode")
    let settled = false
    const result = Effect.runPromiseExit(root.advance(step).pipe(Effect.onError(root.release)), {
      signal: controller.signal
    }).then((exit) => {
      settled = true
      return exit
    })
    await entered.promise
    controller.abort()
    await new Promise(setImmediate)
    assert.equal(settled, false)
    assert.equal(f.trace.includes("release"), false)
    close.resolve()
    const exit = await result
    assert.equal(exit._tag, "Failure")
    assert.deepEqual(f.trace.slice(-3), ["close-entered", "close-finished", "release"])
  }
)

it(
  "edit Root returns its timeout through the live Bend request after gate interruption",
  { timeout: 5000 },
  async () => {
    const trace = []
    const deadline = await Effect.runPromise(Clock.monotonicTimeNanos.pipe(Effect.map((now) => now + 1_000_000_000n)))
    const root = makeResidentCollectionRoot({
      kind: "edit",
      partition: "recipient",
      deadline,
      startPass: () => assert.fail("timeout must not start a pass"),
      gate: () => Effect.never.pipe(Effect.ensuring(Effect.sync(() => trace.push("gate-stopped")))),
      advice: () => assert.fail("timeout must not scan advice"),
      expired: () => assert.fail("timeout must not check expiry"),
      workCount: () => assert.fail("timeout must not count work"),
      now: () => 0
    })
    const step = await Effect.runPromise(root.advance(root.initial(71)))
    assert.deepEqual(trace, ["gate-stopped"])
    assert.deepEqual(step, { $: "RootDone", result: { $: "RootEditPending" } })
    assert.deepEqual(root.decode(step), { requestRoute: "edit", status: "pending" })
  }
)

it("edit Root owns repeated fresh collection passes and the final work exhaustion", { timeout: 5000 }, async () => {
  const f = fixture(),
    passes = [],
    counts = [1, 0],
    checked = []
  const deadline = await Effect.runPromise(Clock.monotonicTimeNanos.pipe(Effect.map((now) => now + 4_000_000_000n)))
  const root = makeResidentCollectionRoot({
    kind: "edit",
    partition: recipientPartition(f.advicee),
    deadline,
    startPass: () => {
      const session = f.collection.residentCollectionSession(
        "/repo",
        f.advicee,
        { credential: null },
        "ordinary",
        undefined,
        true
      )
      passes.push(session)
      return session
    },
    gate: () => Effect.succeed(undefined),
    advice: () => Effect.succeed([{ observation: { advicee: { ...f.advicee, sessionId: "other" } } }, f.state.advice]),
    expired: (item) =>
      Effect.sync(() => {
        checked.push(item)
        return true
      }),
    workCount: () => Effect.sync(() => counts.shift()),
    now: () => 0
  })
  let step = root.initial(71),
    commands = 0
  while (step.$ === "RootAwait" && commands++ < 100) step = await Effect.runPromise(root.advance(step))
  assert.deepEqual(step, { $: "RootDone", result: { $: "RootEditEmpty" } })
  assert.deepEqual(root.decode(step), { requestRoute: "edit", status: "empty" })
  assert.equal(passes.length, 2)
  assert.notEqual(passes[0], passes[1])
  assert.deepEqual(checked, [f.state.advice, f.state.advice])
  assert.deepEqual(counts, [])
  await Effect.runPromise(root.cleanup())
})

for (const composed of [false, true]) {
  it(`final status keeps ${composed ? "recipient" : "stored"} partition matching and stops at the first current advice`, async () => {
    const f = fixture(),
      trace = []
    const stored = {
      ...f.state.advice,
      partition: "stored",
      observation: { ...f.state.advice.observation, advicee: { ...f.advicee, sessionId: "other" } }
    }
    const recipient = { ...f.state.advice, partition: "other" }
    const last = { ...f.state.advice, partition: "stored" }
    const expected = composed ? recipient : stored
    const result = await Effect.runPromise(
      residentEditCollectionStatus(
        {
          residentAdvice: () =>
            Effect.sync(() => {
              trace.push("advice")
              return [stored, recipient, last]
            }),
          residentAdviceExpired: (item, now) =>
            Effect.sync(() => {
              assert.equal(item, expected)
              assert.equal(now, 127)
              trace.push("expiry")
              return false
            }),
          residentCollectionWorkCount: () => assert.fail("current advice must skip work count")
        },
        { partition: "stored" },
        "/repo",
        f.advicee,
        composed,
        127
      )
    )
    assert.deepEqual(result, { requestRoute: "edit", status: "pending" })
    assert.deepEqual(trace, ["advice", "expiry"])
  })
}

for (const count of [0, 1]) {
  it(`status-only Root returns work count ${count} without polling or edit terminal replies`, async () => {
    const trace = []
    const root = makeResidentCollectionRoot({
      kind: "status",
      partition: "recipient",
      matching: "recipient",
      advice: () =>
        Effect.sync(() => {
          trace.push("advice")
          return []
        }),
      expired: () => assert.fail("empty advice must skip expiry"),
      workCount: () =>
        Effect.sync(() => {
          trace.push("count")
          return count
        }),
      now: () => {
        trace.push("clock")
        return 127
      }
    })
    let step = root.initial(71)
    while (step.$ === "RootAwait") {
      for (const terminal of ["RootEditTimedOut", "RootEditLost"]) {
        assert.deepEqual(
          rootCore.resume(step, {
            $: "RootReply",
            invocation: step.request.invocation,
            id: step.request.id,
            response: { $: terminal }
          }),
          { $: "RootRejected" }
        )
      }
      step = await Effect.runPromise(root.advance(step))
    }
    assert.deepEqual(root.decode(step), { requestRoute: "edit", status: count === 0 ? "empty" : "pending" })
    assert.deepEqual(trace, ["clock", "advice", "count"])
  })
}
