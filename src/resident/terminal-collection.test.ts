import { reviewControlsLayer } from "../test-support/review-controls.ts"
import { ReviewControlError } from "@hapsland/resident-runtime/resident/review-controls"
import { nativeDeferred as deferred } from "../test-support/native-deferred.ts"
import { Layer, Ref } from "effect"
import {
  ResidentPreparationControls,
  PreparationControlError,
  defaultPreparationControls
} from "@hapsland/resident-runtime/resident/preparation-controls"
import { makePreparationControls } from "../test-support/preparation-controls.ts"
import { acquireResidentFixture, type ResidentRuntime } from "./runtime-fixture.ts"
import { describe, expect, it } from "vitest"
import * as Effect from "effect/Effect"
import { join } from "node:path"
import "node:fs"
import { readActivity } from "@hapsland/activity-observation/activity/status"
import { adaptClaudeDirectEvent } from "@hapsland/native-observation/direct-event/adapter"
import { makeReviewGitFixture as makeGitFixture, put } from "../direct-event/test-fixtures.ts"
import { configuredRules } from "../test-support/default-rules.ts"
import { residentPaths } from "@hapsland/resident-transport/resident/paths"

import "@hapsland/resident-transport/resident/hook-clock"
import "@hapsland/resident-runtime/resident/collection"
import type { ResidentDispatchContext, ResidentRequest } from "@hapsland/resident-transport/resident/protocol"

const fixture = async () => {
  const root = await makeGitFixture()
  const path = await put(root, "type.ts", "type OrderCount = number\n")
  const statePath = join(root, "consent")
  const observation = await Effect.runPromise(
    adaptClaudeDirectEvent({
      hook_event_name: "PostToolUse",
      tool_name: "Write",
      cwd: root,
      session_id: "session",
      tool_use_id: "tool-one",
      tool_input: { file_path: path, content: "type OrderCount = number\n" },
      tool_response: { filePath: path, content: "type OrderCount = number\n", originalFile: null, userModified: false }
    })
  )
  if (observation === undefined) throw new Error("fixture not adapted")
  const dispatch = (probability: number, failure?: string): ResidentDispatchContext => ({
    statePath,
    userConfigPath: null,
    credential: null,
    controlled: {
      answers: Object.fromEntries(configuredRules.map((rule) => [rule.id, { _tag: "Probability", probability }])),
      ...(failure === undefined ? {} : { failure })
    }
  })
  return { root, observation, dispatch }
}

const collect = (
  server: ResidentRuntime,
  data: Awaited<ReturnType<typeof fixture>>,
  dispatch: ResidentDispatchContext,
  advicee = data.observation.advicee
) =>
  Effect.runPromise(
    server.handle({
      requestRoute: "shared",
      operation: "collect",
      lifetime: server.lifetime,
      root: data.root,
      advicee,
      dispatch,
      composed: true,
      reportWorkState: true
    } satisfies ResidentRequest)
  )

describe("common collection and reuse invariants", () => {
  it("joins a claimed evaluation before its owner attaches the request", async () => {
    const data = await fixture()
    const controls = await Effect.runPromise(makePreparationControls())
    const primerEntered = deferred()
    const releasePrimer = deferred()
    const blockersEntered = deferred()
    const releaseBlockers = deferred()
    let evaluationCount = 0
    const evaluatedIdentities = new Set<string>()
    const evaluatedContracts = new Set<string>()
    const server = await acquireResidentFixture(residentPaths(join(data.root, "runtime")), () => 1_000, {
      reviewControls: reviewControlsLayer({
        beforeEvaluate: (prepared) =>
          Effect.gen(function* () {
            evaluationCount += 1
            evaluatedIdentities.add(prepared.identity)
            evaluatedContracts.add(prepared.input.contract)
            if (evaluationCount === 1) {
              yield* primerEntered.complete()
              yield* releasePrimer.wait
            } else if (evaluationCount <= 3) {
              if (evaluationCount === 3) yield* blockersEntered.complete()
              yield* releaseBlockers.wait
            }
          })
      }),
      preparationControls: controls.layer
    })
    const activityPath = join(data.root, "joined-activity")
    const dispatch = { ...data.dispatch(0), activityPath }
    const primer = { ...data.observation, advicee: { ...data.observation.advicee, sessionId: "primer" } }
    expect((await Effect.runPromise(server.admit(primer, dispatch))).status).toBe("accepted")
    await primerEntered.promise
    for (const sessionId of ["blocker-a", "blocker-b"]) {
      const blocker = { ...data.observation, advicee: { ...data.observation.advicee, sessionId } }
      expect((await Effect.runPromise(server.admit(blocker, dispatch))).status).toBe("accepted")
    }
    releasePrimer.resolve()
    await blockersEntered.promise
    await Effect.runPromise(controls.holdNextOwner)
    const first = await Effect.runPromise(server.admit(data.observation, dispatch, true))
    if (first.status !== "accepted") throw new Error("owner not admitted")
    const secondObservation = { ...data.observation, advicee: { ...data.observation.advicee, toolUseId: "tool-two" } }
    const second = await Effect.runPromise(server.admit(secondObservation, dispatch, true))
    if (second.status !== "accepted") throw new Error("repeat not admitted")
    releaseBlockers.resolve()
    await Effect.runPromise(controls.ownerEntered)
    try {
      await Effect.runPromise(controls.claimJoined)
      expect(await collect(server, data, dispatch, secondObservation.advicee)).toEqual({ status: "pending" })
    } finally {
      await Effect.runPromise(controls.releaseOwner)
    }
    await Effect.runPromise(server.whenIdle())
    expect(await collect(server, data, dispatch)).toEqual({ status: "empty" })
    expect(await collect(server, data, dispatch, secondObservation.advicee)).toEqual({ status: "empty" })
    expect(evaluationCount).toBe(4)
    expect(evaluatedIdentities.size).toBe(1)
    expect([...evaluatedContracts]).toEqual(["direct-event/type-shape/v1"])
    // Primer, both blockers, and owner occupy four distinct session partitions.
    expect(await Effect.runPromise(server.accountingMetrics())).toMatchObject({
      successfulCacheEntries: 4,
      pendingEvaluations: 0
    })
    const activity = readActivity({
      statePath: activityPath,
      root: data.root,
      sessionId: data.observation.advicee.sessionId,
      resident: { available: true, lifetime: server.lifetime }
    })
    expect(activity.counts.unavailable).toBe(0)
    expect(activity.counts.clear).toBeGreaterThan(0)
  })

  it("releases an owner claim if preparation exits before attachment", async () => {
    const data = await fixture()
    const failOnce = await Effect.runPromise(Ref.make(true))
    const server = await acquireResidentFixture(residentPaths(join(data.root, "runtime")), () => 1_000, {
      preparationControls: Layer.succeed(
        ResidentPreparationControls,
        ResidentPreparationControls.of({
          ...defaultPreparationControls,
          afterReuseBoundary: Effect.fn("PreparationFailureFixture.afterReuseBoundary")(function* (phase) {
            if (yield* Ref.getAndSet(failOnce, false)) yield* Effect.fail(new PreparationControlError({ phase }))
          })
        })
      )
    })
    const dispatch = data.dispatch(0)
    const first = await Effect.runPromise(server.admit(data.observation, dispatch))
    if (first.status !== "accepted") throw new Error("first not admitted")
    await Effect.runPromise(server.whenIdle())
    expect(Effect.runSync(server.accountingMetrics()).pendingEvaluations).toBe(0)
    const second = await Effect.runPromise(server.admit(data.observation, dispatch))
    if (second.status !== "accepted") throw new Error("second not admitted")
    await Effect.runPromise(server.whenIdle())
    expect(await collect(server, data, dispatch)).toEqual({ status: "empty" })
    expect(Effect.runSync(server.accountingMetrics())).toMatchObject({
      successfulCacheEntries: 1,
      pendingEvaluations: 0
    })
  })

  it("delivers findings without returning a aggregate terminal result", async () => {
    const data = await fixture()
    const server = await acquireResidentFixture(residentPaths(join(data.root, "runtime")))
    const dispatch = data.dispatch(0.9)
    const admission = await Effect.runPromise(server.admit(data.observation, dispatch))
    if (admission.status !== "accepted") throw new Error("not admitted")
    await Effect.runPromise(server.whenIdle())
    for (let index = 0; index < 16; index += 1) {
      const advice = await collect(server, data, dispatch)
      if (advice.status !== "advice") break
      expect((await Effect.runPromise(server.acknowledge(advice.token))).status).toBe("acknowledged")
      expect((await Effect.runPromise(server.finalize(advice.token))).status).toBe("finalized")
      expect((await Effect.runPromise(server.acknowledge(advice.token))).status).toBe("empty")
      expect((await Effect.runPromise(server.finalize(advice.token))).status).toBe("empty")
    }
    expect(await collect(server, data, dispatch)).toEqual({ status: "empty" })
  })

  it("keeps a mixed finding and failed unit separately visible after advice finalization", async () => {
    const data = await fixture()
    const secondPath = await put(data.root, "second.ts", "type SecondCount = number\n")
    const firstCandidate = data.observation.candidates[0]
    if (firstCandidate === undefined) throw new Error("no candidate")
    const observation = {
      ...data.observation,
      candidates: [firstCandidate, { ...firstCandidate, path: secondPath, addedLines: ["type SecondCount = number"] }]
    }
    const server = await acquireResidentFixture(residentPaths(join(data.root, "runtime")), undefined, {
      reviewControls: reviewControlsLayer({
        beforeEvaluate: (prepared) =>
          Effect.gen(function* () {
            if (prepared.input.path.endsWith("second.ts"))
              yield* Effect.fail(new ReviewControlError({ phase: "beforeEvaluate" }))
          })
      })
    })
    const activityPath = join(data.root, "mixed-activity")
    const dispatch = { ...data.dispatch(0.9), activityPath }
    const admission = await Effect.runPromise(server.admit(observation, dispatch))
    if (admission.status !== "accepted") throw new Error("not admitted")
    await Effect.runPromise(server.whenIdle())
    let delivered = false
    for (let index = 0; index < 16; index += 1) {
      const outcome = await collect(server, data, dispatch)
      if (outcome.status !== "advice") break
      if (outcome.findingCount > 0) delivered = true
      expect((await Effect.runPromise(server.acknowledge(outcome.token))).status).toBe("acknowledged")
      expect((await Effect.runPromise(server.finalize(outcome.token))).status).toBe("finalized")
    }
    expect(delivered).toBe(true)
    expect(await collect(server, data, dispatch)).toEqual({ status: "empty" })
    const activity = readActivity({
      statePath: activityPath,
      root: data.root,
      sessionId: data.observation.advicee.sessionId,
      resident: { available: true, lifetime: server.lifetime }
    })
    expect(activity.findings).toBeGreaterThan(0)
    expect(activity.counts.unavailable).toBeGreaterThan(0)
  })

  it("keeps advice pending for simultaneous collectors and failed acknowledgement", async () => {
    const data = await fixture()
    const server = await acquireResidentFixture(residentPaths(join(data.root, "runtime")), () => 1_000)
    const dispatch = data.dispatch(0.9)
    const admission = await Effect.runPromise(server.admit(data.observation, dispatch))
    if (admission.status !== "accepted") throw new Error("not admitted")
    await Effect.runPromise(server.whenIdle())
    const outcomes = await Promise.all([collect(server, data, dispatch), collect(server, data, dispatch)])
    expect(outcomes.filter((outcome) => outcome.status === "advice")).toHaveLength(1)
    expect(outcomes.filter((outcome) => outcome.status === "pending")).toHaveLength(1)
    const advice = outcomes.find((outcome) => outcome.status === "advice")
    if (advice?.status !== "advice") throw new Error("advice was not leased")
    await Effect.runPromise(server.releaseDelivery(advice.token))
    expect((await collect(server, data, dispatch)).status).toBe("advice")
  })

  it("leases eligible advice from another admission for the same Claude advicee", async () => {
    const data = await fixture()
    const server = await acquireResidentFixture(residentPaths(join(data.root, "runtime")))
    const dispatch = data.dispatch(0.9)
    const finding = await Effect.runPromise(server.admit(data.observation, dispatch))
    const skipped = await Effect.runPromise(
      server.admit(
        { ...data.observation, candidates: [{ operation: "delete", path: "type.ts", addedLines: [] }] },
        dispatch
      )
    )
    if (finding.status !== "accepted" || skipped.status !== "accepted") throw new Error("not admitted")
    await Effect.runPromise(server.whenIdle())
    const other = await collect(server, data, dispatch)
    expect(other.status).toBe("advice")
    expect((await collect(server, data, dispatch)).status).toBe("pending")
    if (other.status === "advice") await Effect.runPromise(server.releaseDelivery(other.token))
    expect((await collect(server, data, dispatch)).status).toBe("advice")
  })

  it("shares one identical finding with two admissions and does not return a terminal result", async () => {
    const data = await fixture()
    const server = await acquireResidentFixture(residentPaths(join(data.root, "runtime")))
    const dispatch = data.dispatch(0.9)
    const first = await Effect.runPromise(server.admit(data.observation, dispatch))
    if (first.status !== "accepted") throw new Error("first not admitted")
    await Effect.runPromise(server.whenIdle())
    const second = await Effect.runPromise(server.admit(data.observation, dispatch))
    if (second.status !== "accepted") throw new Error("second not admitted")
    await Effect.runPromise(server.whenIdle())
    let advice = await collect(server, data, dispatch)
    expect(advice.status).toBe("advice")
    for (let index = 0; index < 16 && advice.status === "advice"; index += 1) {
      expect((await Effect.runPromise(server.acknowledge(advice.token))).status).toBe("acknowledged")
      expect((await Effect.runPromise(server.finalize(advice.token))).status).toBe("finalized")
      advice = await collect(server, data, dispatch)
    }
    expect(advice).toEqual({ status: "empty" })
    expect(await collect(server, data, dispatch)).toEqual({ status: "empty" })
  })

  it("accounts for a cached clear on a later admission", async () => {
    const data = await fixture()
    const server = await acquireResidentFixture(residentPaths(join(data.root, "runtime")))
    const dispatch = data.dispatch(0)
    const first = await Effect.runPromise(server.admit(data.observation, dispatch))
    if (first.status !== "accepted") throw new Error("first not admitted")
    await Effect.runPromise(server.whenIdle())
    expect(await collect(server, data, dispatch)).toEqual({ status: "empty" })
    const second = await Effect.runPromise(server.admit(data.observation, dispatch))
    if (second.status !== "accepted") throw new Error("second not admitted")
    await Effect.runPromise(server.whenIdle())
    expect(await collect(server, data, dispatch)).toEqual({ status: "empty" })
  })

  it("returns quietly when file policy excludes the admitted edit", async () => {
    const data = await fixture()
    await put(data.root, ".hapsland.jsonc", '{"version":1,"excludes":["type.ts"]}\n')
    const server = await acquireResidentFixture(residentPaths(join(data.root, "runtime")))
    const dispatch = data.dispatch(0)
    const admission = await Effect.runPromise(server.admit(data.observation, dispatch))
    if (admission.status !== "accepted") throw new Error("not admitted")
    await Effect.runPromise(server.whenIdle())
    expect(await collect(server, data, dispatch)).toEqual({ status: "empty" })
  })

  it("keeps failure diagnostics out of Claude output", async () => {
    const data = await fixture()
    const server = await acquireResidentFixture(residentPaths(join(data.root, "runtime")))
    const failed = data.dispatch(0, "controlled backend failure")
    const first = await Effect.runPromise(server.admit(data.observation, failed))
    if (first.status !== "accepted") throw new Error("first not admitted")
    await Effect.runPromise(server.whenIdle())
    await put(data.root, ".hapsland.jsonc", '{"version":1,"excludes":["type.ts"]}\n')
    const second = await Effect.runPromise(server.admit(data.observation, failed))
    if (second.status !== "accepted") throw new Error("second not admitted")
    await Effect.runPromise(server.whenIdle())
    expect(await collect(server, data, failed)).toEqual({ status: "empty" })
    expect(Effect.runSync(server.stats()).pendingOperationalNotices).toBeGreaterThan(0)
    expect(await collect(server, data, failed)).toEqual({ status: "empty" })
    expect(await collect(server, data, failed)).toEqual({ status: "empty" })
  })
})
