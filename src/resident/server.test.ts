import { REVIEW_FEEDBACK_HEADING, REVIEW_FEEDBACK_INSTRUCTIONS } from "@hapsland/delivery-output/feedback/message"
import { runClient } from "@hapsland/build-tooling/test-support/client-runtime"
import { reviewControlsLayer } from "@hapsland/build-tooling/test-support/review-controls"
import { ReviewControlError } from "@hapsland/resident-runtime/resident/review-controls"
import { nativeDeferred as deferred } from "@hapsland/build-tooling/test-support/native-deferred"
import { ResidentDispatchControls, DispatchControlError } from "@hapsland/resident-runtime/resident/dispatch-controls"
import { makeDispatchControls } from "@hapsland/build-tooling/test-support/dispatch-controls"
import { Layer } from "effect"
import {
  ResidentPreparationControls,
  PreparationControlError,
  defaultPreparationControls
} from "@hapsland/resident-runtime/resident/preparation-controls"
import { makePreparationControls } from "@hapsland/build-tooling/test-support/preparation-controls"
import { acquireResidentFixture, type ResidentRuntime } from "./runtime-fixture.ts"
import { monotonicNow } from "@hapsland/resident-transport/resident/hook-clock"
import { describe, expect, it, vi } from "vitest"
import * as Effect from "effect/Effect"
import { makeReviewSettings, settingsSource } from "@hapsland/review-definition/runtime/review-settings"
import * as Deferred from "effect/Deferred"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { spawn } from "node:child_process"
import { createHash } from "node:crypto"
import { join } from "node:path"
import { adaptCodexDirectEvent } from "@hapsland/native-observation/direct-event/adapter"
import {
  addEvent,
  makeReviewGitFixture as makeGitFixture,
  put,
  stageFiles,
  advicee
} from "@hapsland/build-tooling/test-support/test-fixtures"
import { configuredRules, connectDefaultRuleFixture } from "@hapsland/build-tooling/test-support/default-rules"
import { analyzerMaterializationPreflight } from "@hapsland/source-analysis/direct-event/analyzer"
import { readActivity } from "@hapsland/activity-observation/activity/status"
import { claudeHostOutputText } from "@hapsland/delivery-output/direct-event/claude-output"
import { residentPaths } from "@hapsland/resident-transport/resident/paths"
import { residentRequestEffect as residentRequest } from "@hapsland/resident-transport/resident/client"
import {
  DELIVERY_LEASE_MS,
  decodeResidentRequest,
  type ResidentDispatchContext,
  type ResidentRequest
} from "@hapsland/resident-transport/resident/protocol"

import { PARTITION_BYTE_LIMIT } from "@hapsland/resident-runtime/resident/capacity"
import { VIRTUAL_ROUND_QUIET_MS } from "@hapsland/resident-runtime/resident/composed-delivery"
import {
  MAX_COMBINED_RESPONSE_BYTES,
  PENDING_ADVICE_EXPIRY_MS,
  encodedHostOutputBytes
} from "@hapsland/resident-runtime/resident/collection"

const findingDispatch = (statePath: string): ResidentDispatchContext => ({
  statePath,
  userConfigPath: join(statePath, "absent-fixture-user.jsonc"),
  credential: null,
  controlled: {
    answers: Object.fromEntries(
      configuredRules.map((rule) => [
        rule.id,
        { _tag: "Probability", probability: rule.id === "bare_domain_value" ? 0.9 : 0 }
      ])
    )
  }
})

const allFindingsDispatch = (statePath: string): ResidentDispatchContext => ({
  statePath,
  userConfigPath: join(statePath, "absent-fixture-user.jsonc"),
  credential: null,
  controlled: {
    answers: Object.fromEntries(configuredRules.map((rule) => [rule.id, { _tag: "Probability", probability: 0.9 }]))
  }
})

const singleFindingDispatch = findingDispatch

describe("virtual round quiescence", () => {
  it("isolates resident dispatch fixtures from conflicting user default rules", async () => {
    const root = await makeGitFixture()
    const userRoot = join(root, "user-layer")
    mkdirSync(userRoot)
    const conflictingUserConfiguration = join(userRoot, "config.jsonc")
    connectDefaultRuleFixture(userRoot, conflictingUserConfiguration)
    const settings = await Effect.runPromise(makeReviewSettings())
    const conflicting = await Effect.runPromiseExit(
      settings.capture(settingsSource(root, conflictingUserConfiguration))
    )
    expect(conflicting._tag).toBe("Failure")
    for (const dispatch of [findingDispatch(join(root, "consent")), allFindingsDispatch(join(root, "consent"))]) {
      expect(dispatch.userConfigPath).not.toBeNull()
      const captured = await Effect.runPromise(settings.capture(settingsSource(root, dispatch.userConfigPath!)))
      expect(captured.rules).toHaveLength(configuredRules.length)
    }
  })

  it("retires a settled advice-free round without Stop", async () => {
    const root = await makeGitFixture()
    await put(root, "quiet.ts", "type QuietCount = number\n")
    const observation = await Effect.runPromise(adaptCodexDirectEvent(addEvent(root, ["quiet.ts"])))
    if (observation === undefined) throw new Error("missing fixture observation")
    const activityPath = join(root, "activity")
    const server = await acquireResidentFixture(residentPaths(join(root, "runtime")), () => performance.now())
    const dispatch = {
      ...findingDispatch(join(root, "consent")),
      activityPath,
      controlled: {
        answers: Object.fromEntries(
          configuredRules.map((rule) => [rule.id, { _tag: "Probability" as const, probability: 0 }])
        )
      }
    }
    try {
      expect((await Effect.runPromise(server.admit(observation, dispatch, true))).status).toBe("accepted")
      await Effect.runPromise(server.whenIdle())
      expect(await Effect.runPromise(server.pendingAdviceMetadata())).toEqual([])
      expect(Effect.runSync(server.sweepQuietRounds(1_000))).toBe(0)
      expect(Effect.runSync(server.sweepQuietRounds(1_000 + VIRTUAL_ROUND_QUIET_MS - 1))).toBe(0)
      expect(Effect.runSync(server.sweepQuietRounds(1_000 + VIRTUAL_ROUND_QUIET_MS))).toBe(1)
      const activity = readActivity({
        statePath: activityPath,
        root,
        sessionId: observation.advicee.sessionId,
        resident: { available: true, lifetime: server.lifetime }
      })
      expect(activity.roundClosures?.[0]?.reason).toBe("quiescent")
    } finally {
      await Effect.runPromise(server.close)
    }
  })
})

// Darwin's PATH_MAX requires shorter real paths. Linux keeps the original
// long path for revalidation workspace pressure.
const longNestedPath =
  process.platform === "darwin"
    ? `${Array.from({ length: 8 }, (_, index) => `segment-${index}-${"x".repeat(88)}`).join("/")}/types.ts`
    : `${Array.from({ length: 14 }, (_, index) => `segment-${index}-${"x".repeat(180)}`).join("/")}/types.ts`

const mutuallyReferencingTypes = (count = 17, darwinNamePadding = 100) =>
  Array.from({ length: count }, (_, index) => {
    const typeName = (target: number) =>
      `Type${target}${process.platform === "darwin" ? "n".repeat(darwinNamePadding) : ""}`
    const fields = Array.from({ length: 16 }, (_unused, offset) => {
      const target = (index + offset + 1) % count
      return `p${target}: ${typeName(target)}`
    }).join("; ")
    return `interface ${typeName(index)} { ${fields} }`
  }).join("\n")

const waitUntilIdle = async (server: ResidentRuntime): Promise<void> => {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const stats = Effect.runSync(server.stats())
    if (stats.queued === 0 && stats.running === 0 && stats.pendingEvaluations === 0) return
    await new Promise<void>((resolveImmediate) => setImmediate(resolveImmediate))
  }
  throw new Error("resident did not become idle")
}

describe("canonical resident capacity", () => {
  it.each([
    [0.7, "empty"],
    [0.7000000000000001, "advice"]
  ] as const)("routes resident probability %s to %s through bounded host output", async (probability, expected) => {
    const root = await makeGitFixture()
    const text = "type OrderCount = number\n"
    await put(root, "type.ts", text)
    const observation = await Effect.runPromise(adaptCodexDirectEvent(addEvent(root)))
    if (observation === undefined) throw new Error("missing fixture observation")
    const dispatch: ResidentDispatchContext = {
      ...findingDispatch(join(root, "state")),
      controlled: {
        answers: Object.fromEntries(configuredRules.map((rule) => [rule.id, { _tag: "Probability", probability }]))
      }
    }
    const started = deferred()
    const release = deferred()
    const captured: Array<string> = []
    let clock = 100
    const server = await acquireResidentFixture(residentPaths(join(root, "runtime")), () => clock, {
      captureSource: (_root, path) =>
        Effect.sync(() => {
          captured.push(path.relativePath)
          const bytes = new TextEncoder().encode(text)
          return {
            text,
            bytes,
            byteLength: bytes.byteLength,
            contentHash: createHash("sha256").update(bytes).digest("hex"),
            metadata: "rule-fixture"
          }
        }),
      reviewControls: reviewControlsLayer({
        beforeEvaluate: () =>
          Effect.gen(function* () {
            yield* started.complete()
            yield* release.wait
          })
      })
    })
    try {
      expect((await Effect.runPromise(server.admit(observation, dispatch, true))).status).toBe("accepted")
      await started.promise
      expect(captured).toEqual(["type.ts"])
      clock = 200
      release.resolve()
      await Effect.runPromise(server.whenIdle())
      const response = await Effect.runPromise(
        server.handle({
          requestRoute: "shared",
          operation: "collect",
          lifetime: server.lifetime,
          root,
          advicee: advicee(),
          dispatch,
          mode: "ordinary",
          composed: true
        })
      )
      expect(response.status).toBe(expected)
      if (response.status === "advice") {
        expect("hookSpecificOutput" in response.output).toBe(true)
        if ("hookSpecificOutput" in response.output) {
          expect(response.output.hookSpecificOutput.additionalContext.split("\n").slice(0, 2)).toEqual([
            REVIEW_FEEDBACK_HEADING,
            REVIEW_FEEDBACK_INSTRUCTIONS
          ])
          expect(
            response.output.hookSpecificOutput.additionalContext.split("\n").filter((line) => /^.+ :: .+: /.test(line))
          ).toHaveLength(configuredRules.length)
        }
        expect((await Effect.runPromise(server.beginComposedSubmission(response.token, "background"))).status).toBe(
          "submitting"
        )
        expect((await Effect.runPromise(server.acknowledge(response.token))).status).toBe("acknowledged")
        expect((await Effect.runPromise(server.finalize(response.token))).status).toBe("finalized")
      }
    } finally {
      release.resolve()
      await Effect.runPromise(server.close)
    }
  })

  it.each([
    ["build/blocked.ts", "safe.ts"],
    ["safe.ts", "build/blocked.ts"]
  ])("refuses a protected sibling before resident review in callback order %j, %j", async (first, second) => {
    const root = await makeGitFixture()
    await put(root, "safe.ts", "type SafeCount = number\n")
    await put(root, "build/blocked.ts", "type BlockedCount = number\n")
    const observation = await Effect.runPromise(adaptCodexDirectEvent(addEvent(root, [first, second])))
    if (observation === undefined) throw new Error("missing fixture observation")
    const started = deferred()
    const release = deferred()
    const evaluated: Array<string> = []
    const captured: Array<string> = []
    let clock = 100
    const server = await acquireResidentFixture(residentPaths(join(root, "runtime")), () => clock, {
      captureSource: (_root, path) =>
        Effect.sync(() => {
          captured.push(path.relativePath)
          const text = "type SafeCount = number\n"
          const bytes = new TextEncoder().encode(text)
          return {
            text,
            bytes,
            byteLength: bytes.byteLength,
            contentHash: createHash("sha256").update(bytes).digest("hex"),
            metadata: "fixture"
          }
        }),
      reviewControls: reviewControlsLayer({
        beforeEvaluate: (prepared) =>
          Effect.gen(function* () {
            evaluated.push(prepared.input.path)
            yield* started.complete()
            yield* release.wait
          })
      })
    })
    try {
      expect(
        (await Effect.runPromise(server.admit(observation, findingDispatch(join(root, "unused-grants"))))).status
      ).toBe("accepted")
      clock = 101
      await started.promise
      expect(captured).toEqual(["safe.ts"])
      expect(evaluated).toEqual(["safe.ts"])
      release.resolve()
      await Effect.runPromise(server.whenIdle())
      expect(captured).toEqual(["safe.ts"])
      expect((await Effect.runPromise(server.pendingAdviceMetadata())).map(({ path }) => path)).toEqual(["safe.ts"])
    } finally {
      release.resolve()
      await Effect.runPromise(server.close)
    }
  })

  it("waits for all findings from one edit when the second Jev result arrives first", async () => {
    const root = await makeGitFixture()
    await put(root, "first.ts", "type FirstCount = number\n")
    await put(root, "second.ts", "type SecondCount = number\n")
    const statePath = join(root, "consent")
    const observation = await Effect.runPromise(adaptCodexDirectEvent(addEvent(root, ["first.ts", "second.ts"])))
    if (observation === undefined) throw new Error("missing fixture observation")
    const firstStarted = deferred()
    const secondStarted = deferred()
    const firstGate = deferred()
    let clock = 100
    const server = await acquireResidentFixture(residentPaths(join(root, "runtime")), () => clock, {
      reviewControls: reviewControlsLayer({
        beforeEvaluate: (prepared) =>
          Effect.gen(function* () {
            if (prepared.input.path === "first.ts") {
              yield* firstStarted.complete()
              yield* firstGate.wait
            } else if (prepared.input.path === "second.ts") yield* secondStarted.complete()
          })
      })
    })
    try {
      expect((await Effect.runPromise(server.admit(observation, allFindingsDispatch(statePath)))).status).toBe(
        "accepted"
      )
      clock = 101
      await firstStarted.promise
      await secondStarted.promise
      for (
        let attempt = 0;
        attempt < 200 &&
        !(await Effect.runPromise(server.pendingAdviceMetadata())).some((item) => item.path === "second.ts");
        attempt += 1
      ) {
        await new Promise<void>((resolveTimeout) => setTimeout(resolveTimeout, 5))
      }
      expect((await Effect.runPromise(server.pendingAdviceMetadata())).map((item) => item.path)).toEqual(["second.ts"])
      expect(
        await Effect.runPromise(server.collect(root, observation.advicee, allFindingsDispatch(statePath)))
      ).toMatchObject({ status: "empty" })
      firstGate.resolve()
      await Effect.runPromise(server.whenIdle())
      const complete = await Effect.runPromise(
        server.collect(root, observation.advicee, allFindingsDispatch(statePath))
      )
      expect(complete.status).toBe("advice")
      if (complete.status === "advice") {
        expect(complete.output.hookSpecificOutput.additionalContext).toContain("first.ts")
        expect(complete.output.hookSpecificOutput.additionalContext).toContain("second.ts")
      }
    } finally {
      firstGate.resolve()
      await Effect.runPromise(server.close)
    }
  })

  it("fans one observation into two charged review outcomes under a fake clock", async () => {
    const root = await makeGitFixture()
    await put(root, "first.ts", "type FirstCount = number\n")
    await put(root, "second.ts", "type SecondCount = number\n")
    const statePath = join(root, "consent")
    const observation = await Effect.runPromise(adaptCodexDirectEvent(addEvent(root, ["first.ts", "second.ts"])))
    if (observation === undefined) throw new Error("missing fixture observation")
    let clock = 100
    const server = await acquireResidentFixture(residentPaths(join(root, "runtime")), () => clock)
    try {
      expect((await Effect.runPromise(server.admit(observation, allFindingsDispatch(statePath)))).status).toBe(
        "accepted"
      )
      clock = 101
      await Effect.runPromise(server.whenIdle())
      expect((await Effect.runPromise(server.pendingAdviceMetadata())).map((item) => item.path).sort()).toEqual([
        "first.ts",
        "second.ts"
      ])
      expect(await Effect.runPromise(server.pendingAdviceMetadata())).toHaveLength(2)
      expect(Effect.runSync(server.stats()).retainedBytes).toBeGreaterThan(0)
      expect(Effect.runSync(server.stats()).rejectedCapacity).toBe(0)
    } finally {
      await Effect.runPromise(server.close)
    }
    expect(Effect.runSync(server.stats()).retainedBytes).toBe(0)
  })

  it("keeps two advicees in one shared capacity ledger through preparation and cleanup", async () => {
    const root = await makeGitFixture()
    await put(root, "agent-a.ts", "type AgentACount = number\n")
    await put(root, "agent-b.ts", "type AgentBCount = number\n")
    const statePath = join(root, "consent")
    const a = await Effect.runPromise(
      adaptCodexDirectEvent(addEvent(root, ["agent-a.ts"], { session_id: "agent-a", tool_use_id: "edit-a" }))
    )
    const b = await Effect.runPromise(
      adaptCodexDirectEvent(addEvent(root, ["agent-b.ts"], { session_id: "agent-b", tool_use_id: "edit-b" }))
    )
    if (a === undefined || b === undefined) throw new Error("missing fixture observation")
    let clock = 100
    const server = await acquireResidentFixture(residentPaths(join(root, "runtime")), () => clock)
    const dispatch = allFindingsDispatch(statePath)
    try {
      expect((await Effect.runPromise(server.admit(a, dispatch))).status).toBe("accepted")
      expect((await Effect.runPromise(server.admit(b, dispatch))).status).toBe("accepted")
      expect(Effect.runSync(server.stats()).retainedBytes).toBeGreaterThan(0)
      clock = 101
      await Effect.runPromise(server.whenIdle())
      const metadata = await Effect.runPromise(server.pendingAdviceMetadata())
      expect(metadata).toHaveLength(2)
      expect(new Set(metadata.map((item) => item.partition)).size).toBe(2)
      expect(new Set(metadata.map((item) => item.path))).toEqual(new Set(["agent-a.ts", "agent-b.ts"]))
      expect(Effect.runSync(server.stats()).rejectedCapacity).toBe(0)
    } finally {
      await Effect.runPromise(server.close)
    }
    expect(Effect.runSync(server.stats()).retainedBytes).toBe(0)
  })
})

describe("resident delivery lease", () => {
  it("does not cancel a completed finding held in a running dispatch callback at Stop", async () => {
    const root = await makeGitFixture()
    await put(root, "held.ts", "type HeldCount = number\n")
    const statePath = join(root, "consent")
    const activityPath = join(root, "activity")
    const observation = await Effect.runPromise(adaptCodexDirectEvent(addEvent(root, ["held.ts"])))
    if (observation === undefined) throw new Error("missing fixture observation")
    const entered = deferred()
    const release = deferred()
    const server = await acquireResidentFixture(residentPaths(join(root, "runtime")), () => performance.now(), {
      reviewControls: reviewControlsLayer({
        afterAdvicePending: () =>
          Effect.gen(function* () {
            yield* entered.complete()
            yield* release.wait
          })
      })
    })
    const dispatch = { ...findingDispatch(statePath), activityPath }
    try {
      expect((await Effect.runPromise(server.admit(observation, dispatch, true))).status).toBe("accepted")
      await entered.promise
      expect(
        (
          await Effect.runPromise(
            server.handle({
              requestRoute: "shared",
              operation: "begin-stop",
              lifetime: server.lifetime,
              root,
              advicee: observation.advicee,
              token: "held"
            })
          )
        ).status
      ).toBe("advanced")
      await Effect.runPromise(
        server.handle({
          requestRoute: "shared",
          operation: "collect",
          lifetime: server.lifetime,
          root,
          advicee: observation.advicee,
          dispatch,
          mode: "turn-end",
          composed: true,
          finish: { token: "held", deadlineReached: true }
        })
      )
      expect(await Effect.runPromise(server.pendingAdviceMetadata())).toHaveLength(1)
      await Effect.runPromise(
        server.handle({
          requestRoute: "shared",
          operation: "finish-stop",
          lifetime: server.lifetime,
          root,
          advicee: observation.advicee,
          token: "held",
          close: true,
          reason: "no-advice"
        })
      )
      release.resolve()
      await Effect.runPromise(server.whenIdle())
      const activity = readActivity({
        statePath: activityPath,
        root,
        sessionId: observation.advicee.sessionId,
        resident: { available: true, lifetime: server.lifetime }
      })
      expect(activity.roundClosures?.[0]).toBeDefined()
      expect(activity.roundClosures?.[0]?.reason).not.toBe("unavailable")
    } finally {
      release.resolve()
      await Effect.runPromise(server.close)
    }
  })

  it("cancels a running review fanout without inventing a Jev wait queue", async () => {
    const root = await makeGitFixture()
    const paths = Array.from({ length: 12 }, (_, index) => `item-${index}.ts`)
    for (const [index, path] of paths.entries()) await put(root, path, `type Item${index}Count = number\n`)
    const statePath = join(root, "consent")
    const activityPath = join(root, "activity")
    const observation = await Effect.runPromise(adaptCodexDirectEvent(addEvent(root, paths)))
    if (observation === undefined) throw new Error("missing fixture observation")
    const started = deferred()
    const gate = deferred()
    const server = await acquireResidentFixture(residentPaths(join(root, "runtime")), () => performance.now(), {
      reviewControls: reviewControlsLayer({
        beforeEvaluate: () =>
          Effect.gen(function* () {
            yield* started.complete()
            yield* gate.wait
          })
      })
    })
    const dispatch = { ...findingDispatch(statePath), activityPath }
    try {
      expect((await Effect.runPromise(server.admit(observation, dispatch, true))).status).toBe("accepted")
      await started.promise
      expect(
        (
          await Effect.runPromise(
            server.handle({
              requestRoute: "shared",
              operation: "begin-stop",
              lifetime: server.lifetime,
              root,
              advicee: observation.advicee,
              token: "fanout"
            })
          )
        ).status
      ).toBe("advanced")
      const decision = await Effect.runPromise(
        server.handle({
          requestRoute: "shared",
          operation: "collect",
          lifetime: server.lifetime,
          root,
          advicee: observation.advicee,
          dispatch,
          mode: "turn-end",
          composed: true,
          finish: { token: "fanout", deadlineReached: true }
        })
      )
      expect(decision.status).toBe("empty")
      const activity = readActivity({
        statePath: activityPath,
        root,
        sessionId: observation.advicee.sessionId,
        resident: { available: true, lifetime: server.lifetime }
      })
      expect(activity.roundClosures?.[0]?.reason).toBe("deadline")
      // #148 refuses ready Jev work beyond eight permits immediately; it
      // does not retain those requests in a Jev wait queue.
      expect(activity.roundClosures?.[0]?.discarded?.queued).toBe(0)
      expect(activity.roundClosures?.[0]?.discarded?.running).toBeGreaterThan(0)
      gate.resolve()
      await Effect.runPromise(server.whenIdle())
      expect(await Effect.runPromise(server.pendingAdviceMetadata())).toEqual([])
    } finally {
      gate.resolve()
      await Effect.runPromise(server.close)
    }
  })

  it("holds the finish decision for all admitted work, then batches the findings", async () => {
    const root = await makeGitFixture()
    await put(root, "type.ts", "type OrderCount = number\n")
    await put(root, "second.ts", "type InvoiceCount = number\n")
    const statePath = join(root, "consent")
    const observation = await Effect.runPromise(adaptCodexDirectEvent(addEvent(root)))
    if (observation === undefined) throw new Error("missing fixture observation")
    const started = deferred()
    const gate = deferred()
    const server = await acquireResidentFixture(residentPaths(join(root, "runtime")), () => performance.now(), {
      reviewControls: reviewControlsLayer({
        beforeEvaluate: () =>
          Effect.gen(function* () {
            yield* started.complete()
            yield* gate.wait
          })
      })
    })
    const dispatch = findingDispatch(statePath)
    try {
      await Effect.runPromise(server.admit(observation, dispatch, true))
      await started.promise
      await Effect.runPromise(
        server.handle({
          requestRoute: "shared",
          operation: "begin-stop",
          lifetime: server.lifetime,
          root,
          advicee: observation.advicee,
          token: "finish"
        })
      )
      const request = {
        requestRoute: "shared" as const,
        operation: "collect" as const,
        lifetime: server.lifetime,
        root,
        advicee: observation.advicee,
        dispatch,
        mode: "turn-end" as const,
        composed: true as const,
        reportWorkState: true as const,
        finish: { token: "finish", deadlineReached: false }
      }
      expect((await Effect.runPromise(server.handle(request))).status).toBe("pending")
      gate.resolve()
      await Effect.runPromise(server.whenIdle())
      // A second admitted observation must keep already completed advice waiting.
      const next = {
        ...observation,
        advicee: { ...observation.advicee, toolUseId: "second" },
        candidates: [{ ...observation.candidates[0]!, path: "second.ts" }]
      }
      await Effect.runPromise(server.admit(next, dispatch, true))
      expect((await Effect.runPromise(server.handle(request))).status).toBe("pending")
      await Effect.runPromise(server.whenIdle())
      const decision = await Effect.runPromise(server.handle(request))
      expect(decision.status).toBe("advice")
      if (decision.status === "advice") expect(decision.findingCount).toBe(2)
    } finally {
      gate.resolve()
      await Effect.runPromise(server.close)
    }
  })

  it("cancels unfinished pre-decision work on block while preserving advice and fresh repair work", async () => {
    const root = await makeGitFixture()
    await put(root, "type.ts", "type OrderCount = number\n")
    await put(root, "second.ts", "type InvoiceCount = number\n")
    const statePath = join(root, "consent")
    const observation = await Effect.runPromise(adaptCodexDirectEvent(addEvent(root)))
    if (observation === undefined) throw new Error("missing fixture observation")
    const gate = deferred()
    const started = deferred()
    let hold = false
    const server = await acquireResidentFixture(residentPaths(join(root, "runtime")), () => performance.now(), {
      reviewControls: reviewControlsLayer({
        beforeEvaluate: () =>
          Effect.gen(function* () {
            if (hold) {
              yield* started.complete()
              yield* gate.wait
            }
          })
      })
    })
    const dispatch = findingDispatch(statePath)
    try {
      await Effect.runPromise(server.admit(observation, dispatch, true))
      await Effect.runPromise(server.whenIdle())
      hold = true
      const next = {
        ...observation,
        advicee: { ...observation.advicee, toolUseId: "second" },
        candidates: [{ ...observation.candidates[0]!, path: "second.ts" }]
      }
      await Effect.runPromise(server.admit(next, dispatch, true))
      await started.promise
      await Effect.runPromise(
        server.handle({
          requestRoute: "shared",
          operation: "begin-stop",
          lifetime: server.lifetime,
          root,
          advicee: observation.advicee,
          token: "finish"
        })
      )
      const decision = await Effect.runPromise(
        server.handle({
          requestRoute: "shared",
          operation: "collect",
          lifetime: server.lifetime,
          root,
          advicee: observation.advicee,
          dispatch,
          mode: "turn-end",
          composed: true,
          finish: { token: "finish", deadlineReached: true }
        })
      )
      expect(decision.status).toBe("advice")
      if (decision.status !== "advice") throw new Error("missing decision")
      expect(decision.findingCount).toBe(1)
      expect(Effect.runSync(server.stats()).pendingEvaluations).toBe(0)
      expect((await Effect.runPromise(server.beginComposedSubmission(decision.token, "stop"))).status).toBe(
        "submitting"
      )
      expect((await Effect.runPromise(server.acknowledge(decision.token))).status).toBe("acknowledged")
      expect((await Effect.runPromise(server.finalize(decision.token))).status).toBe("finalized")
      await Effect.runPromise(
        server.handle({
          requestRoute: "shared",
          operation: "finish-stop",
          lifetime: server.lifetime,
          root,
          advicee: observation.advicee,
          token: "finish",
          close: false
        })
      )
      gate.resolve()
      hold = false
      await Effect.runPromise(server.whenIdle())
      expect(Effect.runSync(server.stats()).pendingFindingBatches).toBe(1)
      expect(
        (
          await Effect.runPromise(
            server.admit({ ...next, advicee: { ...next.advicee, toolUseId: "repair" } }, dispatch, true)
          )
        ).status
      ).toBe("accepted")
      await Effect.runPromise(server.whenIdle())
      expect(Effect.runSync(server.stats()).pendingFindingBatches).toBe(2)
    } finally {
      gate.resolve()
      await Effect.runPromise(server.close)
    }
  })

  it("waits for a live background write, then suppresses it after submission", async () => {
    const root = await makeGitFixture()
    await put(root, "type.ts", "type OrderCount = number\n")
    const statePath = join(root, "consent")
    const observation = await Effect.runPromise(adaptCodexDirectEvent(addEvent(root)))
    if (observation === undefined) throw new Error("missing fixture observation")
    const server = await acquireResidentFixture(residentPaths(join(root, "runtime")))
    const dispatch = findingDispatch(statePath)
    try {
      await Effect.runPromise(server.admit(observation, dispatch, true))
      await Effect.runPromise(server.whenIdle())
      const background = await Effect.runPromise(
        server.handle({
          requestRoute: "shared",
          operation: "collect",
          lifetime: server.lifetime,
          root,
          advicee: observation.advicee,
          dispatch,
          mode: "ordinary",
          composed: true
        })
      )
      if (background.status !== "advice") throw new Error("missing background finding")
      expect((await Effect.runPromise(server.beginComposedSubmission(background.token, "background"))).status).toBe(
        "submitting"
      )
      expect((await Effect.runPromise(server.beginComposedSubmission(background.token, "background"))).status).toBe(
        "empty"
      )
      await Effect.runPromise(
        server.handle({
          requestRoute: "shared",
          operation: "begin-stop",
          lifetime: server.lifetime,
          root,
          advicee: observation.advicee,
          token: "finish"
        })
      )
      const request = {
        requestRoute: "shared" as const,
        operation: "collect" as const,
        lifetime: server.lifetime,
        root,
        advicee: observation.advicee,
        dispatch,
        mode: "turn-end" as const,
        composed: true as const,
        finish: { token: "finish", deadlineReached: false }
      }
      expect((await Effect.runPromise(server.handle(request))).status).toBe("pending")
      expect((await Effect.runPromise(server.acknowledge(background.token))).status).toBe("acknowledged")
      expect((await Effect.runPromise(server.finalize(background.token))).status).toBe("finalized")
      expect(
        (
          await Effect.runPromise(
            server.handle({ ...request, mode: "turn-end", finish: { token: "finish", deadlineReached: true } })
          )
        ).status
      ).toBe("empty")
      await Effect.runPromise(
        server.handle({
          requestRoute: "shared",
          operation: "finish-stop",
          lifetime: server.lifetime,
          root,
          advicee: observation.advicee,
          token: "finish",
          close: true
        })
      )
      await Effect.runPromise(
        server.handle({
          requestRoute: "shared",
          operation: "begin-stop",
          lifetime: server.lifetime,
          root,
          advicee: observation.advicee,
          token: "second-finish"
        })
      )
      expect(
        (
          await Effect.runPromise(
            server.handle({ ...request, mode: "turn-end", finish: { token: "second-finish", deadlineReached: false } })
          )
        ).status
      ).toBe("empty")
      expect(Effect.runSync(server.stats()).pendingAdvice).toBe(0)
    } finally {
      await Effect.runPromise(server.close)
    }
  })

  it("keeps a pending finish poll pending when the last result arrives before IPC handoff", async () => {
    const root = await makeGitFixture()
    await put(root, "type.ts", "type OrderCount = number\n")
    const statePath = join(root, "consent")
    const observation = await Effect.runPromise(adaptCodexDirectEvent(addEvent(root)))
    if (observation === undefined) throw new Error("missing fixture observation")
    const gate = deferred(),
      started = deferred()
    let armed = true
    const paths = residentPaths(join(root, "runtime"))
    const server = await acquireResidentFixture(paths, () => performance.now(), {
      reviewControls: reviewControlsLayer({
        beforeEvaluate: () =>
          Effect.gen(function* () {
            yield* started.complete()
            yield* gate.wait
          }),
        beforeResponseHandoff: () =>
          Effect.gen(function* () {
            if (!armed) return
            armed = false
            yield* gate.complete()
            yield* server.whenIdle()
          })
      })
    })
    const dispatch = findingDispatch(statePath)
    try {
      await Effect.runPromise(server.listen())
      await Effect.runPromise(server.admit(observation, dispatch, true))
      await started.promise
      await Effect.runPromise(
        server.handle({
          requestRoute: "shared",
          operation: "begin-stop",
          lifetime: server.lifetime,
          root,
          advicee: observation.advicee,
          token: "finish"
        })
      )
      const request = {
        requestRoute: "shared" as const,
        operation: "collect" as const,
        lifetime: server.lifetime,
        root,
        advicee: observation.advicee,
        dispatch,
        mode: "turn-end" as const,
        composed: true as const,
        reportWorkState: true as const,
        finish: { token: "finish", deadlineReached: false }
      }
      expect((await runClient(residentRequest(paths, request))).status).toBe("pending")
      expect((await runClient(residentRequest(paths, request))).status).toBe("advice")
    } finally {
      gate.resolve()
      await Effect.runPromise(server.close)
    }
  })

  it("decides a settled round after a diagnostic-only backend failure", async () => {
    const root = await makeGitFixture()
    await put(root, "type.ts", "type OrderCount = number\n")
    const statePath = join(root, "consent")
    const observation = await Effect.runPromise(adaptCodexDirectEvent(addEvent(root)))
    if (observation === undefined) throw new Error("missing fixture observation")
    const now = 0
    const server = await acquireResidentFixture(residentPaths(join(root, "runtime")), () => now)
    const dispatch = { ...findingDispatch(statePath), controlled: { failure: "fixture unavailable" } }
    try {
      await Effect.runPromise(server.admit(observation, dispatch, true))
      await Effect.runPromise(server.whenIdle())
      const collect = {
        requestRoute: "shared" as const,
        operation: "collect" as const,
        lifetime: server.lifetime,
        root,
        advicee: observation.advicee,
        dispatch,
        mode: "ordinary" as const,
        composed: true as const
      }
      expect((await Effect.runPromise(server.handle(collect))).status).toBe("empty")
      expect((await Effect.runPromise(server.accountingMetrics())).pendingOperationalNotices).toBeGreaterThan(0)
      await Effect.runPromise(
        server.handle({
          requestRoute: "shared",
          operation: "begin-stop",
          lifetime: server.lifetime,
          root,
          advicee: observation.advicee,
          token: "finish"
        })
      )
      const decision = await Effect.runPromise(
        server.handle({ ...collect, mode: "turn-end", finish: { token: "finish", deadlineReached: false } })
      )
      expect(decision.status).toBe("empty")
    } finally {
      await Effect.runPromise(server.close)
    }
  })

  it.each(["shared"] as const)("rejects noncomposed %s socket admission before any review", async (requestRoute) => {
    const root = await makeGitFixture()
    await put(root, "type.ts", "type OrderCount = number\n")
    const base = await Effect.runPromise(adaptCodexDirectEvent(addEvent(root)))
    if (base === undefined) throw new Error("missing fixture observation")
    const observation = {
      ...base,
      advicee: { ...base.advicee, host: "claude-code" as const, hostVersion: "2.1.218" as const, turnId: null }
    }
    let reviews = 0
    const paths = residentPaths(join(root, "runtime"))
    const server = await acquireResidentFixture(paths, undefined, {
      reviewControls: reviewControlsLayer({
        beforeEvaluate: () =>
          Effect.gen(function* () {
            reviews += 1
          })
      })
    })
    await Effect.runPromise(server.listen())
    try {
      const admission = {
        requestRoute,
        operation: "admit" as const,
        lifetime: server.lifetime,
        observation,
        dispatch: findingDispatch(join(root, "consent")),
        controlledWriter: true as const,
        composed: true as const
      } as ResidentRequest
      for (const composed of [undefined, false]) {
        const unsupported = { ...admission, composed } as unknown as ResidentRequest
        expect((await runClient(residentRequest(paths, unsupported))).status).toBe("unsupported")
        expect((await Effect.runPromise(server.handle(unsupported))).status).toBe("unsupported")
      }
      expect((await runClient(residentRequest(paths, admission))).status).toBe("rejected-stale")
      await Effect.runPromise(server.whenIdle())
      expect(reviews).toBe(0)
      expect(Effect.runSync(server.stats())).toMatchObject({ queued: 0, running: 0, pendingEvaluations: 0 })
      expect(
        (
          await runClient(
            residentRequest(paths, {
              requestRoute: "shared",
              operation: "register-edit",
              userConfigPath: join(root, "consent", "absent-fixture-user.jsonc"),
              lifetime: server.lifetime,
              root,
              advicee: observation.advicee,
              startedAt: monotonicNow()
            })
          )
        ).status
      ).toBe("advanced")
      expect(
        (await runClient(residentRequest(paths, { ...admission, composed: false } as unknown as ResidentRequest)))
          .status
      ).toBe("unsupported")
      expect((await runClient(residentRequest(paths, admission))).status).toBe("accepted")
      expect((await runClient(residentRequest(paths, admission))).status).toBe("rejected-stale")
      await Effect.runPromise(server.whenIdle())
      expect(reviews).toBeGreaterThan(0)
    } finally {
      await Effect.runPromise(server.close)
    }
  })

  it("rejects unsupported collection shapes and unreserved acknowledgements while preserving authorized Stop output", async () => {
    const root = await makeGitFixture()
    await put(root, "type.ts", "type OrderCount = number\n")
    const base = await Effect.runPromise(adaptCodexDirectEvent(addEvent(root)))
    if (base === undefined) throw new Error("missing fixture observation")
    const observation = {
      ...base,
      advicee: { ...base.advicee, host: "claude-code" as const, hostVersion: "2.1.218" as const, turnId: null }
    }
    const paths = residentPaths(join(root, "runtime"))
    const server = await acquireResidentFixture(paths)
    const dispatch = findingDispatch(join(root, "consent"))
    await Effect.runPromise(server.listen())
    try {
      expect(
        (
          await runClient(
            residentRequest(paths, {
              requestRoute: "shared",
              operation: "register-edit",
              userConfigPath: join(root, "consent", "absent-fixture-user.jsonc"),
              lifetime: server.lifetime,
              root,
              advicee: observation.advicee,
              startedAt: monotonicNow()
            })
          )
        ).status
      ).toBe("advanced")
      const admission = await runClient(
        residentRequest(paths, {
          requestRoute: "shared",
          operation: "admit",
          lifetime: server.lifetime,
          observation,
          dispatch,
          controlledWriter: true,
          composed: true
        })
      )
      if (admission.status !== "accepted") throw new Error("missing admission")
      await Effect.runPromise(server.whenIdle())
      const collect = {
        requestRoute: "shared" as const,
        operation: "collect" as const,
        lifetime: server.lifetime,
        root,
        advicee: observation.advicee,
        dispatch,
        composed: true as const
      }
      const ordinary = await runClient(residentRequest(paths, collect))
      if (ordinary.status !== "advice") throw new Error("missing ordinary advice")
      for (const operation of ["acknowledge", "finalize"] as const) {
        expect(
          (
            await runClient(
              residentRequest(paths, {
                requestRoute: "shared",
                operation,
                lifetime: server.lifetime,
                token: ordinary.token
              })
            )
          ).status
        ).toBe("empty")
      }
      await Effect.runPromise(server.releaseDelivery(ordinary.token))
      for (const requestRoute of ["shared"] as const) {
        for (const composed of [undefined, false, true]) {
          const unsupported = { ...collect, requestRoute, composed, mode: "turn-end" } as unknown as ResidentRequest
          expect((await runClient(residentRequest(paths, unsupported))).status).toBe("unsupported")
          expect((await Effect.runPromise(server.handle(unsupported))).status).toBe("unsupported")
        }
      }
      expect(
        (
          await runClient(
            residentRequest(paths, {
              requestRoute: "shared",
              operation: "begin-stop",
              lifetime: server.lifetime,
              root,
              advicee: observation.advicee,
              token: "finish"
            })
          )
        ).status
      ).toBe("advanced")
      const finished = await runClient(
        residentRequest(paths, { ...collect, mode: "turn-end", finish: { token: "finish", deadlineReached: false } })
      )
      if (finished.status !== "advice") throw new Error("missing authorized Stop advice")
      expect((await runClient(residentRequest(paths, collect))).status).toBe("empty")
      expect(
        (
          await runClient(
            residentRequest(paths, {
              requestRoute: "shared",
              operation: "begin-submission",
              lifetime: server.lifetime,
              token: finished.token,
              surface: "stop"
            })
          )
        ).status
      ).toBe("submitting")
      expect(
        (
          await runClient(
            residentRequest(paths, {
              requestRoute: "shared",
              operation: "acknowledge",
              lifetime: server.lifetime,
              token: finished.token
            })
          )
        ).status
      ).toBe("acknowledged")
      expect(
        (
          await runClient(
            residentRequest(paths, {
              requestRoute: "shared",
              operation: "finalize",
              lifetime: server.lifetime,
              token: finished.token
            })
          )
        ).status
      ).toBe("finalized")
    } finally {
      await Effect.runPromise(server.close)
    }
  })

  it("rejects OpenCode review IPC before permitting or evaluating work", async () => {
    const root = await makeGitFixture()
    await put(root, "type.ts", "type OrderCount = number\n")
    const base = await Effect.runPromise(adaptCodexDirectEvent(addEvent(root)))
    if (base === undefined) throw new Error("missing fixture observation")
    const observation = {
      ...base,
      advicee: {
        ...base.advicee,
        host: "opencode" as const,
        hostVersion: "1.14.44" as const,
        turnId: null,
        subagentId: null
      }
    }
    const paths = residentPaths(join(root, "runtime"))
    let reviews = 0
    const server = await acquireResidentFixture(paths, undefined, {
      reviewControls: reviewControlsLayer({
        beforeEvaluate: () =>
          Effect.gen(function* () {
            reviews += 1
          })
      })
    })
    const dispatch = findingDispatch(join(root, "consent"))
    await Effect.runPromise(server.listen())
    try {
      const requests: ResidentRequest[] = [
        {
          requestRoute: "shared",
          operation: "register-edit",
          userConfigPath: join(root, "consent", "absent-fixture-user.jsonc"),
          lifetime: server.lifetime,
          root,
          advicee: observation.advicee,
          startedAt: monotonicNow()
        },
        {
          requestRoute: "shared",
          operation: "admit",
          lifetime: server.lifetime,
          observation,
          dispatch,
          controlledWriter: true,
          composed: true
        },
        {
          requestRoute: "shared",
          operation: "collect",
          lifetime: server.lifetime,
          root,
          advicee: observation.advicee,
          dispatch,
          composed: true
        },
        {
          requestRoute: "shared",
          operation: "begin-stop",
          lifetime: server.lifetime,
          root,
          advicee: observation.advicee,
          token: "unsupported"
        }
      ]
      for (const request of requests) {
        expect((await runClient(residentRequest(paths, request))).status).toBe("unsupported")
        expect((await Effect.runPromise(server.handle(request))).status).toBe("unsupported")
      }
      await Effect.runPromise(server.whenIdle())
      expect(reviews).toBe(0)
      expect(Effect.runSync(server.stats())).toMatchObject({ queued: 0, running: 0, pendingEvaluations: 0 })
    } finally {
      await Effect.runPromise(server.close)
    }
  })

  it("requires the installed PreToolUse permit before admitting composed IPC", async () => {
    const root = await makeGitFixture()
    await put(root, "type.ts", "type OrderCount = number\n")
    const statePath = join(root, "consent")
    const observation = await Effect.runPromise(adaptCodexDirectEvent(addEvent(root)))
    if (observation === undefined) throw new Error("missing fixture observation")
    const paths = residentPaths(join(root, "runtime"))
    mkdirSync(paths.directory, { recursive: true, mode: 0o700 })
    const server = await acquireResidentFixture(paths)
    const dispatch = findingDispatch(statePath)
    const admission = {
      requestRoute: "shared" as const,
      operation: "admit" as const,
      lifetime: server.lifetime,
      observation,
      dispatch,
      controlledWriter: true as const,
      composed: true as const
    }
    expect((await Effect.runPromise(server.handle(admission))).status).toBe("rejected-stale")
    expect(
      (
        await Effect.runPromise(
          server.handle({
            requestRoute: "shared",
            operation: "register-edit",
            userConfigPath: join(root, "consent", "absent-fixture-user.jsonc"),
            lifetime: server.lifetime,
            root,
            advicee: observation.advicee,
            startedAt: monotonicNow()
          })
        )
      ).status
    ).toBe("advanced")
    writeFileSync(join(paths.directory, "repeat-edits.log"), "x".repeat(256 * 1024), { mode: 0o600 })
    expect(
      (
        await Effect.runPromise(
          server.handle({
            requestRoute: "shared",
            operation: "register-edit",
            userConfigPath: join(root, "consent", "absent-fixture-user.jsonc"),
            lifetime: server.lifetime,
            root,
            advicee: observation.advicee,
            startedAt: monotonicNow()
          })
        )
      ).status
    ).toBe("advanced")
    const repeatLog = join(paths.directory, "repeat-edits.log")
    expect(JSON.parse(readFileSync(repeatLog, "utf8").trim())).toMatchObject({
      kind: "repeat-edit-id",
      phase: "pending"
    })
    expect(readFileSync(repeatLog, "utf8")).not.toContain(observation.advicee.toolUseId)
    expect(readFileSync(join(paths.directory, "repeat-edits-observed"), "utf8")).toBe("1\n")
    expect(
      (
        await Effect.runPromise(
          server.handle({
            ...admission,
            observation: { ...observation, advicee: { ...observation.advicee, subagentId: "child" } }
          })
        )
      ).status
    ).toBe("rejected-stale")
    expect(
      await Effect.runPromise(
        server.handle({
          requestRoute: "shared",
          operation: "begin-stop",
          lifetime: server.lifetime,
          root,
          advicee: observation.advicee,
          token: "permit-only"
        })
      )
    ).toEqual({ status: "busy" })
    expect((await Effect.runPromise(server.handle(admission))).status).toBe("accepted")
    expect((await Effect.runPromise(server.handle(admission))).status).toBe("rejected-stale")
    expect(readFileSync(repeatLog, "utf8").trim().split("\n")).toHaveLength(2)
    await Effect.runPromise(server.whenIdle())
    await Effect.runPromise(server.close)
  })

  it("applies user-configured pending edit limits at the resident boundary", async () => {
    const root = await makeGitFixture()
    const userConfigPath = join(root, "user-config.jsonc")
    await put(root, "user-config.jsonc", '{"version":1,"editPermitLimits":{"perAdvicee":1,"resident":2}}')
    const observation = await Effect.runPromise(adaptCodexDirectEvent(addEvent(root)))
    if (observation === undefined) throw new Error("missing fixture observation")
    const server = await acquireResidentFixture(residentPaths(join(root, "runtime")))
    const register = (subagentId: string, toolUseId: string) =>
      Effect.runPromise(
        server.handle({
          requestRoute: "shared",
          operation: "register-edit",
          lifetime: server.lifetime,
          root,
          advicee: { ...observation.advicee, subagentId, toolUseId },
          startedAt: monotonicNow(),
          userConfigPath
        })
      )
    try {
      expect((await register("a", "a1")).status).toBe("advanced")
      expect(await register("a", "a2")).toMatchObject({ status: "rejected-stale", reason: "AdviceePermitLimit" })
      expect((await register("b", "b1")).status).toBe("advanced")
      expect(await register("c", "c1")).toMatchObject({ status: "rejected-stale", reason: "ResidentPermitLimit" })
    } finally {
      await Effect.runPromise(server.close)
    }
  })

  it("closes a composed round, cancels queued work and fences late results", async () => {
    const root = await makeGitFixture()
    await put(root, "type.ts", "type OrderCount = number\n")
    const statePath = join(root, "consent")
    const observation = await Effect.runPromise(adaptCodexDirectEvent(addEvent(root)))
    if (observation === undefined) throw new Error("missing fixture observation")
    const started = deferred()
    const gate = deferred()
    const server = await acquireResidentFixture(residentPaths(join(root, "runtime")), () => performance.now(), {
      reviewControls: reviewControlsLayer({
        beforeEvaluate: () =>
          Effect.gen(function* () {
            yield* started.complete()
            yield* gate.wait
          })
      })
    })
    const activityPath = join(root, "activity")
    const dispatch = { ...findingDispatch(statePath), activityPath }
    expect((await Effect.runPromise(server.admit(observation, dispatch, true))).status).toBe("accepted")
    await started.promise
    expect(
      await Effect.runPromise(
        server.handle({
          requestRoute: "shared",
          operation: "begin-stop",
          lifetime: server.lifetime,
          root,
          advicee: observation.advicee,
          token: "stop"
        })
      )
    ).toEqual({ status: "advanced" })
    await Effect.runPromise(
      server.handle({
        requestRoute: "shared",
        operation: "finish-stop",
        lifetime: server.lifetime,
        root,
        advicee: observation.advicee,
        token: "stop",
        close: true
      })
    )
    gate.resolve()
    await Effect.runPromise(server.whenIdle())
    expect(Effect.runSync(server.stats()).pendingAdvice).toBe(0)
    expect(Effect.runSync(server.stats()).pendingEvaluations).toBe(0)
    expect(
      (
        await Effect.runPromise(
          server.admit({ ...observation, advicee: { ...observation.advicee, toolUseId: "late" } }, dispatch, true)
        )
      ).status
    ).toBe("rejected-stale")
    expect(
      (
        await Effect.runPromise(
          server.handle({
            requestRoute: "shared",
            operation: "collect",
            lifetime: server.lifetime,
            root,
            advicee: observation.advicee,
            dispatch,
            mode: "ordinary",
            composed: true
          })
        )
      ).status
    ).toBe("empty")
    const activity = readActivity({
      statePath: activityPath,
      root,
      sessionId: observation.advicee.sessionId,
      resident: { available: true, lifetime: server.lifetime }
    })
    expect(activity.roundClosures).toHaveLength(1)
    expect(activity.roundClosures?.[0]?.reason).toBe("no-advice")
    expect(activity.roundClosures?.[0]?.discarded.running).toBe(1)
    expect(JSON.stringify(activity.roundClosures)).not.toContain(root)
    expect(JSON.stringify(activity.roundClosures)).not.toContain("OrderCount")
    expect(Effect.runSync(server.stats()).retainedBytes).toBe(0)
    await Effect.runPromise(server.close)
    expect(Effect.runSync(server.stats()).retainedBytes).toBe(0)
  })

  it("fences a delayed preparation callback after a successor round opens", async () => {
    const root = await makeGitFixture()
    await put(root, "type.ts", "type OrderCount = number\n")
    const observation = await Effect.runPromise(adaptCodexDirectEvent(addEvent(root)))
    if (observation === undefined) throw new Error("missing fixture observation")
    const controls = await Effect.runPromise(makePreparationControls())
    await Effect.runPromise(controls.holdNextOwner)
    const server = await acquireResidentFixture(residentPaths(join(root, "runtime")), undefined, {
      preparationControls: controls.layer
    })
    const dispatch = findingDispatch(join(root, "state"))
    try {
      expect((await Effect.runPromise(server.admit(observation, dispatch, true))).status).toBe("accepted")
      await Effect.runPromise(controls.ownerEntered)
      expect(
        await Effect.runPromise(
          server.handle({
            requestRoute: "shared",
            operation: "begin-stop",
            lifetime: server.lifetime,
            root,
            advicee: observation.advicee,
            token: "old-stop"
          })
        )
      ).toEqual({ status: "advanced" })
      await Effect.runPromise(
        server.handle({
          requestRoute: "shared",
          operation: "finish-stop",
          lifetime: server.lifetime,
          root,
          advicee: observation.advicee,
          token: "old-stop",
          close: true
        })
      )
      // Round closure fences starts through the next millisecond. Establish
      // that this successor starts beyond that fence, independent of speed.
      const closedBy = monotonicNow()
      await vi.waitUntil(() => monotonicNow() > closedBy + 1, { interval: 1, timeout: 1000 })
      const successor = { ...observation, advicee: { ...observation.advicee, toolUseId: "successor-edit" } }
      expect(
        await Effect.runPromise(
          server.handle({
            requestRoute: "shared",
            operation: "register-edit",
            userConfigPath: join(root, "consent", "absent-fixture-user.jsonc"),
            lifetime: server.lifetime,
            root,
            advicee: successor.advicee,
            startedAt: monotonicNow()
          })
        )
      ).toEqual({ status: "advanced" })
      expect((await Effect.runPromise(server.admit(successor, dispatch, true, true))).status).toBe("accepted")
      await Effect.runPromise(controls.releaseOwner)
      await Effect.runPromise(server.whenIdle())
      expect(Effect.runSync(server.stats()).pendingFindingBatches).toBe(1)
      expect(Effect.runSync(server.stats()).pendingEvaluations).toBe(0)
      expect(
        (
          await Effect.runPromise(
            server.handle({
              requestRoute: "shared",
              operation: "collect",
              lifetime: server.lifetime,
              root,
              advicee: successor.advicee,
              dispatch,
              mode: "ordinary",
              composed: true
            })
          )
        ).status
      ).toBe("advice")
    } finally {
      await Effect.runPromise(controls.releaseOwner)
      await Effect.runPromise(server.close)
    }
  })

  it("reoffers uncertain background advice once at Stop and clears every record on allow", async () => {
    const root = await makeGitFixture()
    await put(root, "type.ts", "type OrderCount = number\n")
    const statePath = join(root, "consent")
    const observation = await Effect.runPromise(adaptCodexDirectEvent(addEvent(root)))
    if (observation === undefined) throw new Error("missing fixture observation")
    const server = await acquireResidentFixture(residentPaths(join(root, "runtime")))
    const activityPath = join(root, "activity")
    const dispatch = { ...findingDispatch(statePath), activityPath }
    await Effect.runPromise(server.admit(observation, dispatch, true))
    await Effect.runPromise(server.whenIdle())
    const collect = () =>
      Effect.runPromise(
        server.handle({
          requestRoute: "shared",
          operation: "collect",
          lifetime: server.lifetime,
          root,
          advicee: observation.advicee,
          dispatch,
          mode: "ordinary",
          composed: true
        })
      )
    const background = await collect()
    expect(background.status).toBe("advice")
    if (background.status !== "advice") return
    expect(
      (
        await Effect.runPromise(
          server.handle({
            requestRoute: "shared",
            operation: "claim-background",
            lifetime: server.lifetime,
            root,
            advicee: observation.advicee,
            token: "background-worker"
          })
        )
      ).status
    ).toBe("background-claimed")
    expect((await Effect.runPromise(server.beginComposedSubmission(background.token, "background"))).status).toBe(
      "submitting"
    )
    expect(
      (
        await Effect.runPromise(
          server.handle({
            requestRoute: "shared",
            operation: "release-background",
            lifetime: server.lifetime,
            root,
            advicee: observation.advicee,
            token: "background-worker"
          })
        )
      ).status
    ).toBe("released")
    await Effect.runPromise(
      server.handle({
        requestRoute: "shared",
        operation: "begin-stop",
        lifetime: server.lifetime,
        root,
        advicee: observation.advicee,
        token: "reoffer"
      })
    )
    const stop = await Effect.runPromise(
      server.handle({
        requestRoute: "shared",
        operation: "collect",
        lifetime: server.lifetime,
        root,
        advicee: observation.advicee,
        dispatch,
        mode: "turn-end",
        composed: true,
        finish: { token: "reoffer", deadlineReached: true }
      })
    )
    expect(stop.status).toBe("advice")
    if (stop.status !== "advice") return
    expect((await Effect.runPromise(server.beginComposedSubmission(stop.token, "stop"))).status).toBe("submitting")
    await Effect.runPromise(server.acknowledge(stop.token))
    await Effect.runPromise(server.finalize(stop.token))
    await Effect.runPromise(
      server.handle({
        requestRoute: "shared",
        operation: "finish-stop",
        lifetime: server.lifetime,
        root,
        advicee: observation.advicee,
        token: "reoffer",
        close: false
      })
    )
    expect((await collect()).status).toBe("empty")
    await Effect.runPromise(
      server.handle({
        requestRoute: "shared",
        operation: "begin-stop",
        lifetime: server.lifetime,
        root,
        advicee: observation.advicee,
        token: "close"
      })
    )
    await Effect.runPromise(
      server.handle({
        requestRoute: "shared",
        operation: "finish-stop",
        lifetime: server.lifetime,
        root,
        advicee: observation.advicee,
        token: "close",
        close: true
      })
    )
    expect(Effect.runSync(server.stats()).pendingAdvice).toBe(0)
    expect(Effect.runSync(server.stats()).pendingEvaluations).toBe(0)
    const activity = readActivity({
      statePath: activityPath,
      root,
      sessionId: observation.advicee.sessionId,
      resident: { available: true, lifetime: server.lifetime }
    })
    expect(activity.roundClosures).toHaveLength(1)
    expect(activity.roundClosures?.[0]?.reason).toBe("no-advice")
    expect(activity.roundClosures?.[0]?.discarded).toMatchObject({ pendingAdvice: 1, submitted: 1, uncertain: 1 })
    expect(JSON.stringify(activity.roundClosures)).not.toContain(root)
    expect(JSON.stringify(activity.roundClosures)).not.toContain("OrderCount")
    expect(Effect.runSync(server.stats()).retainedBytes).toBe(0)
    await Effect.runPromise(server.close)
    expect(Effect.runSync(server.stats()).retainedBytes).toBe(0)
  })

  it("does not reoffer a live background writer when the Stop deadline forces a decision", async () => {
    const root = await makeGitFixture()
    await put(root, "type.ts", "type OrderCount = number\n")
    const statePath = join(root, "consent")
    const observation = await Effect.runPromise(adaptCodexDirectEvent(addEvent(root)))
    if (observation === undefined) throw new Error("missing fixture observation")
    const server = await acquireResidentFixture(residentPaths(join(root, "runtime")))
    try {
      const dispatch = findingDispatch(statePath)
      await Effect.runPromise(server.admit(observation, dispatch, true))
      await Effect.runPromise(server.whenIdle())
      const background = await Effect.runPromise(
        server.handle({
          requestRoute: "shared",
          operation: "collect",
          lifetime: server.lifetime,
          root,
          advicee: observation.advicee,
          dispatch,
          mode: "ordinary",
          composed: true
        })
      )
      if (background.status !== "advice") throw new Error("missing background finding")
      expect((await Effect.runPromise(server.beginComposedSubmission(background.token, "background"))).status).toBe(
        "submitting"
      )
      expect(
        (
          await Effect.runPromise(
            server.handle({
              requestRoute: "shared",
              operation: "begin-stop",
              lifetime: server.lifetime,
              root,
              advicee: observation.advicee,
              token: "deadline"
            })
          )
        ).status
      ).toBe("advanced")
      const decision = await Effect.runPromise(
        server.handle({
          requestRoute: "shared",
          operation: "collect",
          lifetime: server.lifetime,
          root,
          advicee: observation.advicee,
          dispatch,
          mode: "turn-end",
          composed: true,
          finish: { token: "deadline", deadlineReached: true }
        })
      )
      expect(decision.status).toBe("empty")
      expect((await Effect.runPromise(server.acknowledge(background.token))).status).toBe("empty")
    } finally {
      await Effect.runPromise(server.close)
    }
  })

  it("leases one composed finding to one concurrent collector and consumes successful delivery", async () => {
    const root = await makeGitFixture()
    await put(root, "type.ts", "type OrderCount = number\n")
    const statePath = join(root, "consent")
    const observation = await Effect.runPromise(adaptCodexDirectEvent(addEvent(root)))
    expect(observation).toBeDefined()
    if (observation === undefined) return
    const server = await acquireResidentFixture(residentPaths(join(root, "runtime")))
    const dispatch = findingDispatch(statePath)
    expect(await Effect.runPromise(server.admit(observation, dispatch, true))).toEqual({ status: "accepted" })
    await Effect.runPromise(server.whenIdle())
    const request = {
      requestRoute: "shared" as const,
      operation: "collect" as const,
      lifetime: server.lifetime,
      root,
      advicee: observation.advicee,
      dispatch,
      mode: "ordinary" as const,
      composed: true as const,
      reportWorkState: true as const
    }
    const [background, stop] = await Promise.all([
      Effect.runPromise(server.handle(request)),
      Effect.runPromise(server.handle(request))
    ])
    expect([background.status, stop.status].filter((status) => status === "advice")).toHaveLength(1)
    const winner = background.status === "advice" ? background : stop
    if (winner.status !== "advice") return
    await Effect.runPromise(
      server.handle({
        requestRoute: "shared",
        operation: "prompt-marker",
        lifetime: server.lifetime,
        root,
        advicee: observation.advicee,
        marker: "a".repeat(64),
        onlyIfMissing: true
      })
    )
    expect(
      await Effect.runPromise(
        server.handle({
          requestRoute: "shared",
          operation: "begin-submission",
          lifetime: server.lifetime,
          token: winner.token,
          surface: "background"
        })
      )
    ).toEqual({ status: "submitting" })
    expect(await Effect.runPromise(server.acknowledge(winner.token))).toEqual({ status: "acknowledged" })
    expect(await Effect.runPromise(server.finalize(winner.token))).toEqual({ status: "finalized" })
    await Effect.runPromise(
      server.handle({
        requestRoute: "shared",
        operation: "begin-stop",
        lifetime: server.lifetime,
        root,
        advicee: observation.advicee,
        token: "reoffer"
      })
    )
    const reoffer = await Effect.runPromise(
      server.handle({ ...request, mode: "turn-end", finish: { token: "reoffer", deadlineReached: true } })
    )
    expect(reoffer.status).toBe("empty")
    await Effect.runPromise(
      server.handle({
        requestRoute: "shared",
        operation: "finish-stop",
        lifetime: server.lifetime,
        root,
        advicee: observation.advicee,
        token: "reoffer",
        close: false
      })
    )
    expect((await Effect.runPromise(server.handle(request))).status).toBe("empty")
  })

  it("keeps composed findings addressed across Codex and Claude in one working root", async () => {
    const root = await makeGitFixture()
    await put(root, "codex.ts", "type CodexCount = number\n")
    await put(root, "claude.ts", "type ClaudeCount = number\n")
    const statePath = join(root, "consent")
    const codex = await Effect.runPromise(
      adaptCodexDirectEvent(addEvent(root, ["codex.ts"], { session_id: "codex-session", tool_use_id: "codex-tool" }))
    )
    const claudeBase = await Effect.runPromise(
      adaptCodexDirectEvent(addEvent(root, ["claude.ts"], { session_id: "claude-session", tool_use_id: "claude-tool" }))
    )
    expect(codex).toBeDefined()
    expect(claudeBase).toBeDefined()
    if (codex === undefined || claudeBase === undefined) return
    const claude = {
      ...claudeBase,
      advicee: {
        host: "claude-code" as const,
        hostVersion: "2.1.218" as const,
        sessionId: "claude-session",
        turnId: null,
        toolUseId: "claude-tool",
        subagentId: null
      }
    }
    const clock = 100
    const server = await acquireResidentFixture(residentPaths(join(root, "runtime")), () => clock)
    const dispatch = findingDispatch(statePath)
    expect(await Effect.runPromise(server.admit(codex, dispatch, true))).toEqual({ status: "accepted" })
    expect(await Effect.runPromise(server.admit(claude, dispatch, true))).toEqual({ status: "accepted" })
    await Effect.runPromise(server.whenIdle())
    const collect = (adviceeValue: typeof codex.advicee | typeof claude.advicee, mode: "ordinary" | "turn-end") =>
      Effect.runPromise(
        server.handle({
          requestRoute: "shared",
          operation: "collect",
          lifetime: server.lifetime,
          root,
          advicee: adviceeValue,
          dispatch,
          mode,
          composed: true
        })
      )
    const [codexReply, claudeReply] = await Promise.all([
      collect(codex.advicee, "ordinary"),
      collect(claude.advicee, "ordinary")
    ])
    expect(codexReply.status).toBe("advice")
    expect(claudeReply.status).toBe("advice")
    if (codexReply.status !== "advice" || claudeReply.status !== "advice") return
    const codexText = claudeHostOutputText(codexReply.output)
    const claudeText = claudeHostOutputText(claudeReply.output)
    expect(codexText).toContain("codex.ts")
    expect(codexText).not.toContain("claude.ts")
    expect(claudeText).toContain("claude.ts")
    expect(claudeText).not.toContain("codex.ts")
    await Effect.runPromise(
      server.handle({
        requestRoute: "shared",
        operation: "prompt-marker",
        lifetime: server.lifetime,
        root,
        advicee: codex.advicee,
        marker: "a".repeat(64),
        onlyIfMissing: true
      })
    )
    expect(
      await Effect.runPromise(
        server.handle({
          requestRoute: "shared",
          operation: "begin-submission",
          lifetime: server.lifetime,
          token: codexReply.token,
          surface: "background"
        })
      )
    ).toEqual({ status: "submitting" })
    await Effect.runPromise(
      server.handle({
        requestRoute: "shared",
        operation: "prompt-marker",
        lifetime: server.lifetime,
        root,
        advicee: claude.advicee,
        marker: "a".repeat(64),
        onlyIfMissing: true
      })
    )
    expect(
      await Effect.runPromise(
        server.handle({
          requestRoute: "shared",
          operation: "begin-submission",
          lifetime: server.lifetime,
          token: claudeReply.token,
          surface: "stop"
        })
      )
    ).toEqual({ status: "submitting" })
  })

  it("drops Claude composed advice after credential generation rotates", async () => {
    const root = await makeGitFixture()
    await put(root, "type.ts", "type OrderCount = number\n")
    const statePath = join(root, "consent")
    const credentialStatePath = join(root, "credential-state.json")
    writeFileSync(credentialStatePath, JSON.stringify({ version: 1, generation: 1, savedUseSuspended: false }))
    const base = await Effect.runPromise(adaptCodexDirectEvent(addEvent(root)))
    expect(base).toBeDefined()
    if (base === undefined) return
    const observation = {
      ...base,
      advicee: {
        host: "claude-code" as const,
        hostVersion: "2.1.218" as const,
        sessionId: "claude-session",
        turnId: null,
        toolUseId: "write-1",
        subagentId: null
      }
    }
    const server = await acquireResidentFixture(residentPaths(join(root, "runtime")))
    const dispatch: ResidentDispatchContext = {
      ...findingDispatch(statePath),
      credential: {
        name: "TYPESAFE_API_KEY",
        environmentValue: "synthetic-race-marker",

        generation: 1,
        statePath: credentialStatePath
      }
    }
    expect(await Effect.runPromise(server.admit(observation, dispatch))).toEqual({ status: "accepted" })
    await Effect.runPromise(server.whenIdle())
    expect(await Effect.runPromise(server.pendingAdviceMetadata())).toHaveLength(1)
    writeFileSync(credentialStatePath, JSON.stringify({ version: 1, generation: 2, savedUseSuspended: false }))
    const rotated = { ...dispatch, credential: { ...dispatch.credential!, generation: 2 } }
    const result = await Effect.runPromise(
      server.handle({
        requestRoute: "shared",
        operation: "collect",
        lifetime: server.lifetime,
        root,
        advicee: { ...observation.advicee, toolUseId: "later-tool" },
        dispatch: rotated,
        mode: "ordinary",
        composed: true
      })
    )
    expect(result.status).toBe("empty")
  })

  it("fences composed output when a credential rotates after collection or before write authorization", async () => {
    const root = await makeGitFixture()
    await put(root, "type.ts", "type OrderCount = number\n")
    const statePath = join(root, "consent")
    const credentialStatePath = join(root, "credential-state.json")
    const credentialState = (generation: number) => JSON.stringify({ version: 1, generation, savedUseSuspended: false })
    writeFileSync(credentialStatePath, credentialState(1))
    const observation = await Effect.runPromise(adaptCodexDirectEvent(addEvent(root)))
    if (observation === undefined) throw new Error("missing fixture observation")
    const dispatch: ResidentDispatchContext = {
      ...findingDispatch(statePath),
      credential: {
        name: "TYPESAFE_API_KEY",
        environmentValue: "synthetic-race-marker",

        generation: 1,
        statePath: credentialStatePath
      }
    }
    const paths = residentPaths(join(root, "runtime"))
    const server = await acquireResidentFixture(paths)
    expect(await Effect.runPromise(server.admit(observation, dispatch, true))).toEqual({ status: "accepted" })
    await Effect.runPromise(server.whenIdle())
    const collected = await Effect.runPromise(
      server.handle({
        requestRoute: "shared",
        operation: "collect",
        lifetime: server.lifetime,
        root,
        advicee: observation.advicee,
        dispatch,
        mode: "ordinary",
        composed: true
      })
    )
    if (collected.status !== "advice") throw new Error("missing fixture advice")
    writeFileSync(credentialStatePath, credentialState(2))
    expect(await Effect.runPromise(server.beginComposedSubmission(collected.token, "background"))).toEqual({
      status: "empty"
    })
    await Effect.runPromise(server.close)

    writeFileSync(credentialStatePath, credentialState(1))
    let rotateAtHandoff = true
    const gated = await acquireResidentFixture(paths, undefined, {
      reviewControls: reviewControlsLayer({
        beforeResponseHandoff: () =>
          Effect.gen(function* () {
            if (!rotateAtHandoff) return
            rotateAtHandoff = false
            writeFileSync(credentialStatePath, credentialState(2))
          })
      })
    })
    try {
      expect(await Effect.runPromise(gated.admit(observation, dispatch, true))).toEqual({ status: "accepted" })
      await Effect.runPromise(gated.whenIdle())
      await Effect.runPromise(gated.listen())
      const result = await runClient(
        residentRequest(paths, {
          requestRoute: "shared",
          operation: "collect",
          lifetime: gated.lifetime,
          root,
          advicee: observation.advicee,
          dispatch,
          mode: "ordinary",
          composed: true
        })
      )
      expect(result).toEqual({ status: "empty" })
    } finally {
      await Effect.runPromise(gated.close)
    }
  })

  it("releases an unwritten Stop slot when credentials rotate at the final IPC barrier", async () => {
    const root = await makeGitFixture()
    await put(root, "type.ts", "type OrderCount = number\n")
    const statePath = join(root, "consent")
    const activityPath = join(root, "activity")
    const credentialStatePath = join(root, "credential-state.json")
    const credentialState = (generation: number) => JSON.stringify({ version: 1, generation, savedUseSuspended: false })
    writeFileSync(credentialStatePath, credentialState(1))
    const observation = await Effect.runPromise(adaptCodexDirectEvent(addEvent(root)))
    if (observation === undefined) throw new Error("missing fixture observation")
    const dispatch: ResidentDispatchContext = {
      ...findingDispatch(statePath),
      activityPath,
      credential: {
        name: "TYPESAFE_API_KEY",
        environmentValue: "synthetic-race-marker",

        generation: 1,
        statePath: credentialStatePath
      }
    }
    const paths = residentPaths(join(root, "runtime"))
    const server = await acquireResidentFixture(paths, undefined, {
      reviewControls: reviewControlsLayer({
        beforeResponseHandoff: () =>
          Effect.gen(function* () {
            writeFileSync(credentialStatePath, credentialState(2))
          })
      })
    })
    try {
      expect(await Effect.runPromise(server.admit(observation, dispatch, true))).toEqual({ status: "accepted" })
      await Effect.runPromise(server.whenIdle())
      await Effect.runPromise(server.listen())
      expect(
        await Effect.runPromise(
          server.handle({
            requestRoute: "shared",
            operation: "begin-stop",
            lifetime: server.lifetime,
            root,
            advicee: observation.advicee,
            token: "finish"
          })
        )
      ).toEqual({ status: "advanced" })
      const result = await runClient(
        residentRequest(paths, {
          requestRoute: "shared",
          operation: "collect",
          lifetime: server.lifetime,
          root,
          advicee: observation.advicee,
          dispatch,
          mode: "turn-end",
          composed: true,
          finish: { token: "finish", deadlineReached: true }
        })
      )
      expect(result).toEqual({ status: "empty" })
      const activity = readActivity({
        statePath: activityPath,
        root,
        sessionId: observation.advicee.sessionId,
        resident: { available: true, lifetime: server.lifetime }
      })
      expect(activity.roundClosures?.[0]?.reservedContinuations).toBe(0)
    } finally {
      await Effect.runPromise(server.close)
    }
  })

  it("releases a provisional Stop slot if the stop closes during the IPC response gate", async () => {
    const root = await makeGitFixture()
    await put(root, "type.ts", "type OrderCount = number\n")
    const statePath = join(root, "consent")
    const activityPath = join(root, "activity")
    const observation = await Effect.runPromise(adaptCodexDirectEvent(addEvent(root)))
    if (observation === undefined) throw new Error("missing fixture observation")
    const dispatch = { ...findingDispatch(statePath), activityPath }
    const paths = residentPaths(join(root, "runtime"))
    const server: ResidentRuntime = await acquireResidentFixture(paths, undefined, {
      reviewControls: reviewControlsLayer({
        beforeResponseHandoff: () =>
          Effect.gen(function* () {
            expect(
              yield* server
                .handle({
                  requestRoute: "shared",
                  operation: "finish-stop",
                  lifetime: server.lifetime,
                  root,
                  advicee: observation.advicee,
                  token: "finish",
                  close: false
                })
                .pipe(Effect.mapError(() => new ReviewControlError({ phase: "beforeResponseHandoff" })))
            ).toEqual({ status: "advanced" })
          })
      })
    })
    try {
      expect(await Effect.runPromise(server.admit(observation, dispatch, true))).toEqual({ status: "accepted" })
      await Effect.runPromise(server.whenIdle())
      await Effect.runPromise(server.listen())
      expect(
        await Effect.runPromise(
          server.handle({
            requestRoute: "shared",
            operation: "begin-stop",
            lifetime: server.lifetime,
            root,
            advicee: observation.advicee,
            token: "finish"
          })
        )
      ).toEqual({ status: "advanced" })
      const result = await runClient(
        residentRequest(paths, {
          requestRoute: "shared",
          operation: "collect",
          lifetime: server.lifetime,
          root,
          advicee: observation.advicee,
          dispatch,
          mode: "turn-end",
          composed: true,
          finish: { token: "finish", deadlineReached: true }
        })
      )
      expect(result).toEqual({ status: "empty" })
      const activity = readActivity({
        statePath: activityPath,
        root,
        sessionId: observation.advicee.sessionId,
        resident: { available: true, lifetime: server.lifetime }
      })
      expect(activity.roundClosures?.[0]?.reservedContinuations).toBe(0)
    } finally {
      await Effect.runPromise(server.close)
    }
  })

  it("does not emit a notice-only token after final-gate finding invalidation closes Stop", async () => {
    const root = await makeGitFixture()
    await put(root, "type.ts", "type OrderCount = number\n")
    await put(root, "failure.ts", "type FailureCount = number\n")
    const statePath = join(root, "consent")
    const activityPath = join(root, "activity")
    const finding = await Effect.runPromise(
      adaptCodexDirectEvent(addEvent(root, ["type.ts"], { tool_use_id: "finding-tool", turn_id: "same-turn" }))
    )
    const failure = await Effect.runPromise(
      adaptCodexDirectEvent(addEvent(root, ["failure.ts"], { tool_use_id: "failure-tool", turn_id: "same-turn" }))
    )
    if (finding === undefined || failure === undefined) throw new Error("missing fixture observation")
    const dispatch = { ...findingDispatch(statePath), activityPath }
    const failedDispatch = { ...dispatch, controlled: { failure: "fixture unavailable" } }
    const paths = residentPaths(join(root, "runtime"))
    let invalidate = false
    let now = 0
    const server = await acquireResidentFixture(paths, () => now, {
      reviewControls: reviewControlsLayer({
        beforeResponseHandoff: () =>
          Effect.gen(function* () {
            if (invalidate) now = PENDING_ADVICE_EXPIRY_MS + 1
          })
      })
    })
    try {
      expect(await Effect.runPromise(server.admit(finding, dispatch, true))).toEqual({ status: "accepted" })
      await Effect.runPromise(server.whenIdle())
      now = Math.floor(PENDING_ADVICE_EXPIRY_MS / 2)
      expect(await Effect.runPromise(server.admit(failure, failedDispatch, false, true))).toEqual({
        status: "accepted"
      })
      await Effect.runPromise(server.whenIdle())
      await Effect.runPromise(server.listen())
      const request = {
        requestRoute: "shared" as const,
        operation: "collect" as const,
        lifetime: server.lifetime,
        root,
        advicee: finding.advicee,
        dispatch,
        mode: "ordinary" as const,
        composed: true as const
      }
      const mixed = await runClient(residentRequest(paths, request))
      expect(mixed.status).toBe("advice")
      if (mixed.status !== "advice") return
      expect(mixed.findingCount).toBe(1)
      expect(claudeHostOutputText(mixed.output)).not.toMatch(/unavailable/i)
      expect((await Effect.runPromise(server.accountingMetrics())).pendingOperationalNotices).toBeGreaterThan(0)
      await Effect.runPromise(server.releaseDelivery(mixed.token))
      expect(
        await Effect.runPromise(
          server.handle({
            requestRoute: "shared",
            operation: "begin-stop",
            lifetime: server.lifetime,
            root,
            advicee: finding.advicee,
            token: "finish"
          })
        )
      ).toEqual({ status: "advanced" })
      invalidate = true
      const final = await runClient(
        residentRequest(paths, { ...request, mode: "turn-end", finish: { token: "finish", deadlineReached: true } })
      )
      expect(final).toEqual({ status: "empty" })
      const activity = readActivity({
        statePath: activityPath,
        root,
        sessionId: finding.advicee.sessionId,
        resident: { available: true, lifetime: server.lifetime }
      })
      expect(activity.roundClosures?.[0]?.reservedContinuations).toBe(0)
    } finally {
      await Effect.runPromise(server.close)
    }
  })

  it("lets a later edit collect earlier advice through the same composed advicee partition", async () => {
    const root = await makeGitFixture()
    await put(root, "first.ts", "type OrderCount = number\n")
    const statePath = join(root, "consent")
    const first = await Effect.runPromise(
      adaptCodexDirectEvent(addEvent(root, ["first.ts"], { tool_use_id: "first-tool", turn_id: "first-turn" }))
    )
    expect(first).toBeDefined()
    if (first === undefined) return
    const server = await acquireResidentFixture(residentPaths(join(root, "runtime")))
    const dispatch = findingDispatch(statePath)
    expect(await Effect.runPromise(server.admit(first, dispatch))).toEqual({ status: "accepted" })
    await Effect.runPromise(server.whenIdle())
    const later = { ...first.advicee, toolUseId: "later-tool", turnId: "later-turn" }
    const collected = await Effect.runPromise(
      server.handle({
        requestRoute: "shared",
        operation: "collect",
        lifetime: server.lifetime,
        root,
        advicee: later,
        dispatch,
        mode: "ordinary",
        composed: true
      })
    )
    expect(collected.status).toBe("advice")
    if (collected.status === "advice") {
      expect(claudeHostOutputText(collected.output)).toContain("first.ts")
    }
  })

  it("shares Claude capacity and canonical round across edits and a common advice batch", async () => {
    const root = await makeGitFixture()
    await put(root, "first.ts", "type FirstCount = number\n")
    await put(root, "second.ts", "type SecondCount = number\n")
    const base = await Effect.runPromise(adaptCodexDirectEvent(addEvent(root, ["first.ts"])))
    if (base === undefined) throw new Error("missing fixture observation")
    const first = {
      ...base,
      advicee: {
        host: "claude-code" as const,
        hostVersion: "2.1.218" as const,
        sessionId: "claude-session",
        turnId: null,
        subagentId: null,
        toolUseId: "first"
      }
    }
    const second = {
      ...first,
      candidates: [{ ...first.candidates[0]!, path: "second.ts" }],
      advicee: { ...first.advicee, toolUseId: "second" }
    }
    const issued: Array<{ partition: string; round: number }> = []
    const server = await acquireResidentFixture(residentPaths(join(root, "runtime")), undefined, {
      jevRequestObserver: (event) => {
        if (event.stage === "issued") issued.push(event)
      }
    })
    const dispatch = findingDispatch(join(root, "state"))
    try {
      const admittedFirst = await Effect.runPromise(server.admit(first, dispatch, true))
      expect(admittedFirst.status).toBe("accepted")
      await Effect.runPromise(server.whenIdle())
      const admittedSecond = await Effect.runPromise(server.admit(second, dispatch, true))
      expect(admittedSecond.status).toBe("accepted")
      await Effect.runPromise(server.whenIdle())
      expect(issued).toHaveLength(2)
      expect(new Set(issued.map(({ partition }) => partition)).size).toBe(1)
      expect(new Set(issued.map(({ round }) => round)).size).toBe(1)
      expect(issued[0]?.partition).not.toContain("toolUseId")
      expect(issued[0]?.partition).not.toContain("round:")
      const collected = await Effect.runPromise(
        server.handle({
          requestRoute: "shared",
          operation: "collect",
          lifetime: server.lifetime,
          root,
          advicee: second.advicee,
          dispatch,
          composed: true
        })
      )
      expect(collected).toMatchObject({ status: "advice", findingCount: 2 })
    } finally {
      await Effect.runPromise(server.close)
    }
  })

  it("refuses a prepared two-advice Stop output when one advice expires before submission", async () => {
    const root = await makeGitFixture()
    await put(root, "a.ts", "type ACount = number\n")
    await put(root, "b.ts", "type BCount = number\n")
    const statePath = join(root, "consent")
    const first = await Effect.runPromise(
      adaptCodexDirectEvent(addEvent(root, ["a.ts"], { tool_use_id: "first", turn_id: "same-turn" }))
    )
    const second = await Effect.runPromise(
      adaptCodexDirectEvent(addEvent(root, ["b.ts"], { tool_use_id: "second", turn_id: "same-turn" }))
    )
    if (first === undefined || second === undefined) throw new Error("missing fixture observation")
    let now = 0
    const server = await acquireResidentFixture(residentPaths(join(root, "runtime")), () => now)
    const dispatch = findingDispatch(statePath)
    try {
      expect((await Effect.runPromise(server.admit(first, dispatch, true))).status).toBe("accepted")
      await Effect.runPromise(server.whenIdle())
      now = Math.floor(PENDING_ADVICE_EXPIRY_MS / 2)
      expect((await Effect.runPromise(server.admit(second, dispatch, true))).status).toBe("accepted")
      await Effect.runPromise(server.whenIdle())
      expect(Effect.runSync(server.stats()).pendingAdvice).toBe(2)
      expect(
        await Effect.runPromise(
          server.handle({
            requestRoute: "shared",
            operation: "begin-stop",
            lifetime: server.lifetime,
            root,
            advicee: first.advicee,
            token: "finish"
          })
        )
      ).toEqual({ status: "advanced" })
      const selected = await Effect.runPromise(
        server.handle({
          requestRoute: "shared",
          operation: "collect",
          lifetime: server.lifetime,
          root,
          advicee: first.advicee,
          dispatch,
          mode: "turn-end",
          composed: true,
          finish: { token: "finish", deadlineReached: true }
        })
      )
      expect(selected.status).toBe("advice")
      if (selected.status !== "advice") return
      expect(selected.findingCount).toBe(2)
      now = PENDING_ADVICE_EXPIRY_MS + 1
      expect(await Effect.runPromise(server.beginComposedSubmission(selected.token, "stop"))).toEqual({
        status: "empty"
      })
      expect(await Effect.runPromise(server.acknowledge(selected.token))).toEqual({ status: "empty" })
      expect((await Effect.runPromise(server.pendingAdviceMetadata())).map(({ path }) => path)).toEqual(["b.ts"])
    } finally {
      await Effect.runPromise(server.close)
    }
  })

  it("reoffers a lost background acknowledgement at Stop without waiting for another prompt", async () => {
    const root = await makeGitFixture()
    await put(root, "type.ts", "type OrderCount = number\n")
    const statePath = join(root, "consent")
    const observation = await Effect.runPromise(adaptCodexDirectEvent(addEvent(root)))
    expect(observation).toBeDefined()
    if (observation === undefined) return
    let clock = 100
    const server = await acquireResidentFixture(residentPaths(join(root, "runtime")), () => clock)
    const dispatch = findingDispatch(statePath)
    const collect = () =>
      Effect.runPromise(
        server.handle({
          requestRoute: "shared",
          operation: "collect",
          lifetime: server.lifetime,
          root,
          advicee: observation.advicee,
          dispatch,
          mode: "ordinary",
          composed: true
        })
      )
    const mark = (marker: string) =>
      Effect.runPromise(
        server.handle({
          requestRoute: "shared",
          operation: "prompt-marker",
          lifetime: server.lifetime,
          root,
          advicee: observation.advicee,
          marker
        })
      )
    expect(await mark("a".repeat(64))).toEqual({ status: "advanced" })
    expect(await Effect.runPromise(server.admit(observation, dispatch, true))).toEqual({ status: "accepted" })
    await Effect.runPromise(server.whenIdle())
    const first = await collect()
    expect(first.status).toBe("advice")
    if (first.status !== "advice") return
    await Effect.runPromise(
      server.handle({
        requestRoute: "shared",
        operation: "prompt-marker",
        lifetime: server.lifetime,
        root,
        advicee: observation.advicee,
        marker: "a".repeat(64),
        onlyIfMissing: true
      })
    )
    expect(
      await Effect.runPromise(
        server.handle({
          requestRoute: "shared",
          operation: "begin-submission",
          lifetime: server.lifetime,
          token: first.token,
          surface: "background"
        })
      )
    ).toEqual({ status: "submitting" })
    clock += DELIVERY_LEASE_MS
    expect(await Effect.runPromise(server.beginComposedSubmission(first.token, "background"))).toEqual({
      status: "empty"
    })
    await Effect.runPromise(
      server.handle({
        requestRoute: "shared",
        operation: "begin-stop",
        lifetime: server.lifetime,
        root,
        advicee: observation.advicee,
        token: "reoffer"
      })
    )
    const reoffer = await Effect.runPromise(
      server.handle({
        requestRoute: "shared",
        operation: "collect",
        lifetime: server.lifetime,
        root,
        advicee: observation.advicee,
        dispatch,
        mode: "turn-end",
        composed: true,
        finish: { token: "reoffer", deadlineReached: true }
      })
    )
    expect(reoffer.status).toBe("advice")
    if (reoffer.status === "advice") {
      expect(await Effect.runPromise(server.beginComposedSubmission(reoffer.token, "stop"))).toEqual({
        status: "submitting"
      })
      await Effect.runPromise(server.releaseComposedSubmission(reoffer.token))
    }
    await Effect.runPromise(
      server.handle({
        requestRoute: "shared",
        operation: "finish-stop",
        lifetime: server.lifetime,
        root,
        advicee: observation.advicee,
        token: "reoffer",
        close: false
      })
    )
    expect(await mark("b".repeat(64))).toEqual({ status: "advanced" })
    expect((await collect()).status).toBe("empty")
  })

  it("releases a known failed composed write for another collector in the same turn", async () => {
    const root = await makeGitFixture()
    await put(root, "type.ts", "type OrderCount = number\n")
    const statePath = join(root, "consent")
    const observation = await Effect.runPromise(adaptCodexDirectEvent(addEvent(root)))
    expect(observation).toBeDefined()
    if (observation === undefined) return
    const server = await acquireResidentFixture(residentPaths(join(root, "runtime")))
    const dispatch = findingDispatch(statePath)
    expect(await Effect.runPromise(server.admit(observation, dispatch, true))).toEqual({ status: "accepted" })
    await Effect.runPromise(server.whenIdle())
    const request = {
      requestRoute: "shared" as const,
      operation: "collect" as const,
      lifetime: server.lifetime,
      root,
      advicee: observation.advicee,
      dispatch,
      mode: "ordinary" as const,
      composed: true as const
    }
    const first = await Effect.runPromise(server.handle(request))
    expect(first.status).toBe("advice")
    if (first.status !== "advice") return
    await Effect.runPromise(
      server.handle({
        requestRoute: "shared",
        operation: "prompt-marker",
        lifetime: server.lifetime,
        root,
        advicee: observation.advicee,
        marker: "a".repeat(64),
        onlyIfMissing: true
      })
    )
    expect(
      await Effect.runPromise(
        server.handle({
          requestRoute: "shared",
          operation: "begin-submission",
          lifetime: server.lifetime,
          token: first.token,
          surface: "background"
        })
      )
    ).toEqual({ status: "submitting" })
    expect(
      await Effect.runPromise(
        server.handle({ requestRoute: "shared", operation: "release", lifetime: server.lifetime, token: first.token })
      )
    ).toEqual({ status: "released" })
    const retry = await Effect.runPromise(server.handle(request))
    expect(retry.status).toBe("advice")
    if (retry.status === "advice") expect(retry.token).not.toBe(first.token)
  })

  it("drops stale composed findings at the final handoff barrier", async () => {
    const root = await makeGitFixture()
    await put(root, "type.ts", "type OrderCount = number\n")
    const statePath = join(root, "consent")
    const observation = await Effect.runPromise(adaptCodexDirectEvent(addEvent(root)))
    expect(observation).toBeDefined()
    if (observation === undefined) return
    const server = await acquireResidentFixture(residentPaths(join(root, "runtime")))
    const dispatch = findingDispatch(statePath)
    expect(await Effect.runPromise(server.admit(observation, dispatch))).toEqual({ status: "accepted" })
    await Effect.runPromise(server.whenIdle())
    await put(root, "type.ts", 'type OrderCount = number & { readonly __brand: "OrderCount" }\n')
    expect(
      await Effect.runPromise(
        server.handle({
          requestRoute: "shared",
          operation: "collect",
          lifetime: server.lifetime,
          root,
          advicee: observation.advicee,
          dispatch,
          mode: "ordinary",
          composed: true
        })
      )
    ).toEqual({ status: "empty" })
    expect(Effect.runSync(server.stats()).pendingAdvice).toBe(0)
  })

  it("batches distinct current units for composed collection", async () => {
    const root = await makeGitFixture()
    await put(root, "first.ts", "type FirstCount = number\n")
    await put(root, "second.ts", "type SecondCount = number\n")
    const statePath = join(root, "consent")
    const observation = await Effect.runPromise(adaptCodexDirectEvent(addEvent(root, ["first.ts", "second.ts"])))
    expect(observation).toBeDefined()
    if (observation === undefined) return
    const server = await acquireResidentFixture(residentPaths(join(root, "runtime")))
    const dispatch = findingDispatch(statePath)
    expect(await Effect.runPromise(server.admit(observation, dispatch))).toEqual({ status: "accepted" })
    await Effect.runPromise(server.whenIdle())
    const collected = await Effect.runPromise(
      server.handle({
        requestRoute: "shared",
        operation: "collect",
        lifetime: server.lifetime,
        root,
        advicee: observation.advicee,
        dispatch,
        mode: "ordinary",
        composed: true
      })
    )
    expect(collected.status).toBe("advice")
    if (collected.status === "advice") {
      expect(collected.findingCount).toBe(2)
      expect(claudeHostOutputText(collected.output)).toContain("first.ts")
      expect(claudeHostOutputText(collected.output)).toContain("second.ts")
    }
  })

  it("retains composed backend failure in diagnostics without agent output", async () => {
    const root = await makeGitFixture()
    await put(root, "type.ts", "type OrderCount = number\n")
    const statePath = join(root, "consent")
    const observation = await Effect.runPromise(adaptCodexDirectEvent(addEvent(root)))
    expect(observation).toBeDefined()
    if (observation === undefined) return
    const server = await acquireResidentFixture(residentPaths(join(root, "runtime")))
    const dispatch = { ...findingDispatch(statePath), controlled: { failure: "fixture unavailable" } }
    expect(await Effect.runPromise(server.admit(observation, dispatch))).toEqual({ status: "accepted" })
    await Effect.runPromise(server.whenIdle())
    const collected = await Effect.runPromise(
      server.handle({
        requestRoute: "shared",
        operation: "collect",
        lifetime: server.lifetime,
        root,
        advicee: observation.advicee,
        dispatch,
        mode: "ordinary",
        composed: true
      })
    )
    expect(collected.status).toBe("empty")
    expect((await Effect.runPromise(server.accountingMetrics())).pendingOperationalNotices).toBeGreaterThan(0)
  })

  it("keeps submitted advice suppressed across prompt notifications in the same round", async () => {
    const root = await makeGitFixture()
    await put(root, "type.ts", "type OrderCount = number\n")
    const statePath = join(root, "consent")
    const observation = await Effect.runPromise(adaptCodexDirectEvent(addEvent(root)))
    expect(observation).toBeDefined()
    if (observation === undefined) return
    const server = await acquireResidentFixture(residentPaths(join(root, "runtime")))
    const dispatch = findingDispatch(statePath)
    const collect = () =>
      Effect.runPromise(
        server.handle({
          requestRoute: "shared",
          operation: "collect",
          lifetime: server.lifetime,
          root,
          advicee: observation.advicee,
          dispatch,
          mode: "ordinary",
          composed: true,
          reportWorkState: true
        })
      )
    const mark = (marker: string) =>
      Effect.runPromise(
        server.handle({
          requestRoute: "shared",
          operation: "prompt-marker",
          lifetime: server.lifetime,
          root,
          advicee: observation.advicee,
          marker
        })
      )
    expect(await mark("a".repeat(64))).toEqual({ status: "advanced" })
    expect(await Effect.runPromise(server.admit(observation, dispatch, true))).toEqual({ status: "accepted" })
    await Effect.runPromise(server.whenIdle())
    const first = await collect()
    expect(first.status).toBe("advice")
    if (first.status !== "advice") return
    await Effect.runPromise(
      server.handle({
        requestRoute: "shared",
        operation: "prompt-marker",
        lifetime: server.lifetime,
        root,
        advicee: observation.advicee,
        marker: "a".repeat(64),
        onlyIfMissing: true
      })
    )
    expect(
      await Effect.runPromise(
        server.handle({
          requestRoute: "shared",
          operation: "begin-submission",
          lifetime: server.lifetime,
          token: first.token,
          surface: "background"
        })
      )
    ).toEqual({ status: "submitting" })
    expect(await collect()).toEqual({ status: "pending" })
    expect(await Effect.runPromise(server.acknowledge(first.token))).toEqual({ status: "acknowledged" })
    expect(await Effect.runPromise(server.finalize(first.token))).toEqual({ status: "finalized" })
    expect(await collect()).toEqual({ status: "empty" })
    expect(await mark("a".repeat(64))).toEqual({ status: "advanced" })
    expect(await collect()).toEqual({ status: "empty" })
    expect(await mark("b".repeat(64))).toEqual({ status: "advanced" })
    const retry = await collect()
    expect(retry.status).toBe("empty")
  })

  it("shares background ownership across host adapters while isolating advicees", async () => {
    const root = await makeGitFixture()
    await put(root, "type.ts", "type OrderCount = number\n")
    const observation = await Effect.runPromise(adaptCodexDirectEvent(addEvent(root)))
    if (observation === undefined) throw new Error("missing fixture observation")
    const dispatch = findingDispatch(join(root, "consent"))
    const server = await acquireResidentFixture(residentPaths(join(root, "runtime")))
    const codex = advicee({ sessionId: "codex-session" })
    const claude = {
      host: "claude-code" as const,
      hostVersion: "2.1.218" as const,
      sessionId: "claude-session",
      turnId: null,
      toolUseId: "prompt",
      subagentId: null
    }
    const marker = "a".repeat(64)
    for (const selected of [codex, claude]) {
      await Effect.runPromise(
        server.handle({
          requestRoute: "shared",
          operation: "prompt-marker",
          lifetime: server.lifetime,
          root,
          advicee: selected,
          marker
        })
      )
      const firstToken = "00000000-0000-4000-8000-000000000001"
      const secondToken = "00000000-0000-4000-8000-000000000002"
      expect(
        await Effect.runPromise(
          server.handle({
            requestRoute: "shared",
            operation: "claim-background",
            lifetime: server.lifetime,
            root,
            advicee: selected,
            token: firstToken
          })
        )
      ).toEqual({ status: "busy" })
      expect(
        await Effect.runPromise(
          server.handle({
            requestRoute: "shared",
            operation: "register-edit",
            userConfigPath: join(root, "consent", "absent-fixture-user.jsonc"),
            lifetime: server.lifetime,
            root,
            advicee: selected,
            startedAt: monotonicNow() - 1
          })
        )
      ).toEqual({ status: "advanced" })
      expect(
        await Effect.runPromise(server.admit({ ...observation, advicee: selected }, dispatch, true, true))
      ).toEqual({ status: "accepted" })
      expect(
        await Effect.runPromise(
          server.handle({
            requestRoute: "shared",
            operation: "claim-background",
            lifetime: server.lifetime,
            root,
            advicee: selected,
            token: firstToken
          })
        )
      ).toEqual({ status: "background-claimed" })
      expect(
        await Effect.runPromise(
          server.handle({
            requestRoute: "shared",
            operation: "claim-background",
            lifetime: server.lifetime,
            root,
            advicee: { ...selected, toolUseId: "next-tool" },
            token: secondToken
          })
        )
      ).toEqual({ status: "busy" })
      expect(
        await Effect.runPromise(
          server.handle({
            requestRoute: "shared",
            operation: "release-background",
            lifetime: server.lifetime,
            root,
            advicee: selected,
            token: firstToken
          })
        )
      ).toEqual({ status: "released" })
      expect(
        await Effect.runPromise(
          server.handle({
            requestRoute: "shared",
            operation: "claim-background",
            lifetime: server.lifetime,
            root,
            advicee: selected,
            token: secondToken
          })
        )
      ).toEqual({ status: "background-claimed" })
      expect(
        await Effect.runPromise(
          server.handle({
            requestRoute: "shared",
            operation: "prompt-marker",
            lifetime: server.lifetime,
            root,
            advicee: selected,
            marker
          })
        )
      ).toEqual({ status: "advanced" })
    }
    await Effect.runPromise(server.whenIdle())
    await Effect.runPromise(server.close)
  })

  it.each(["codex-cli", "claude-code"] as const)(
    "rejects legacy %s continuation replay without consuming Stop budget",
    async (host) => {
      const root = await makeGitFixture()
      await put(root, "type.ts", "type OrderCount = number\n")
      const base = await Effect.runPromise(adaptCodexDirectEvent(addEvent(root)))
      if (base === undefined) throw new Error("missing fixture observation")
      const selected =
        host === "codex-cli"
          ? advicee({ subagentId: "child" })
          : {
              host,
              hostVersion: "2.1.218" as const,
              sessionId: "session",
              turnId: null,
              toolUseId: "edit",
              subagentId: "child"
            }
      const observation = { ...base, advicee: selected }
      const dispatch = findingDispatch(join(root, "consent"))
      const paths = residentPaths(join(root, "runtime"))
      const server = await acquireResidentFixture(paths)
      await Effect.runPromise(server.listen())
      try {
        expect(
          (
            await runClient(
              residentRequest(paths, {
                requestRoute: "shared",
                operation: "register-edit",
                userConfigPath: join(root, "consent", "absent-fixture-user.jsonc"),
                lifetime: server.lifetime,
                root,
                advicee: selected,
                startedAt: monotonicNow()
              })
            )
          ).status
        ).toBe("advanced")
        expect(
          (
            await runClient(
              residentRequest(paths, {
                requestRoute: "shared",
                operation: "admit",
                lifetime: server.lifetime,
                observation,
                controlledWriter: true,
                dispatch,
                composed: true
              })
            )
          ).status
        ).toBe("accepted")
        await Effect.runPromise(server.whenIdle())
        const legacy = {
          requestRoute: "shared",
          operation: "consume-stop",
          lifetime: server.lifetime,
          root,
          advicee: selected
        } as unknown as ResidentRequest
        for (let attempt = 0; attempt < 5; attempt += 1) {
          expect(decodeResidentRequest(JSON.stringify(legacy))).toBeUndefined()
          expect((await runClient(residentRequest(paths, legacy))).status).toBe("unsupported")
          expect((await Effect.runPromise(server.handle(legacy))).status).toBe("unsupported")
        }
        expect(
          (
            await runClient(
              residentRequest(paths, {
                requestRoute: "shared",
                operation: "begin-stop",
                lifetime: server.lifetime,
                root,
                advicee: selected,
                token: "finish"
              })
            )
          ).status
        ).toBe("advanced")
        const result = await runClient(
          residentRequest(paths, {
            requestRoute: "shared",
            operation: "collect",
            lifetime: server.lifetime,
            root,
            advicee: selected,
            dispatch,
            composed: true,
            mode: "turn-end",
            finish: { token: "finish", deadlineReached: false }
          })
        )
        expect(result.status).toBe("advice")
        if (result.status !== "advice") throw new Error("missing authorized Stop advice")
        expect(
          (
            await runClient(
              residentRequest(paths, {
                requestRoute: "shared",
                operation: "begin-submission",
                lifetime: server.lifetime,
                token: result.token,
                surface: "stop"
              })
            )
          ).status
        ).toBe("submitting")
        expect(
          (
            await runClient(
              residentRequest(paths, {
                requestRoute: "shared",
                operation: "acknowledge",
                lifetime: server.lifetime,
                token: result.token
              })
            )
          ).status
        ).toBe("acknowledged")
        expect(
          (
            await runClient(
              residentRequest(paths, {
                requestRoute: "shared",
                operation: "finalize",
                lifetime: server.lifetime,
                token: result.token
              })
            )
          ).status
        ).toBe("finalized")
      } finally {
        await Effect.runPromise(server.close)
      }
    }
  )

  it("reports pending work only to its advicee during composed collection", async () => {
    const root = await makeGitFixture()
    await put(root, "type.ts", "type OrderCount = number\n")
    const statePath = join(root, "consent")
    const observation = await Effect.runPromise(adaptCodexDirectEvent(addEvent(root)))
    expect(observation).toBeDefined()
    if (observation === undefined) return
    const controls = await Effect.runPromise(makePreparationControls())
    await Effect.runPromise(controls.holdNextPreparation)
    const server = await acquireResidentFixture(residentPaths(join(root, "runtime")), undefined, {
      preparationControls: controls.layer
    })
    const dispatch = findingDispatch(statePath)
    expect(await Effect.runPromise(server.admit(observation, dispatch, true))).toEqual({ status: "accepted" })
    const collect = (adviceeValue: typeof observation.advicee, reportWorkState?: true) =>
      Effect.runPromise(
        server.handle({
          requestRoute: "shared",
          operation: "collect",
          lifetime: server.lifetime,
          root,
          advicee: adviceeValue,
          dispatch,
          composed: true,
          ...(reportWorkState === true ? { reportWorkState: true as const } : {})
        })
      )
    expect(await collect(observation.advicee)).toEqual({ status: "empty" })
    expect(await collect(observation.advicee, true)).toEqual({ status: "pending" })
    expect(await collect({ ...observation.advicee, sessionId: "other" }, true)).toEqual({ status: "empty" })
    await Effect.runPromise(controls.releasePreparation)
    await Effect.runPromise(server.whenIdle())
    expect((await collect(observation.advicee, true)).status).toBe("advice")
  })

  it("rejects a separate-process generation change after credential resolution at the provider boundary", async () => {
    const root = await makeGitFixture()
    await put(root, "type.ts", "type OrderCount = number\n")
    const statePath = join(root, "consent")
    const credentialStatePath = join(root, "credential-state.json")
    const capturePath = join(root, "provider-calls.txt")
    writeFileSync(credentialStatePath, JSON.stringify({ version: 1, generation: 1, savedUseSuspended: false }))
    const observation = await Effect.runPromise(adaptCodexDirectEvent(addEvent(root)))
    expect(observation).toBeDefined()
    if (observation === undefined) return
    const controls = await Effect.runPromise(makeDispatchControls())
    await Effect.runPromise(controls.holdNext("credentialResolved"))
    const server = await acquireResidentFixture(residentPaths(join(root, "runtime")), undefined, {
      dispatchControls: controls.layer
    })
    const dispatch: ResidentDispatchContext = {
      statePath,
      userConfigPath: join(statePath, "absent-fixture-user.jsonc"),
      credential: {
        name: "TYPESAFE_API_KEY",
        environmentValue: "synthetic-race-marker",

        generation: 1,
        statePath: credentialStatePath
      },
      controlled: {
        requireCredential: true,
        capturePath,
        answers: Object.fromEntries(configuredRules.map((rule) => [rule.id, { _tag: "Probability", probability: 0.9 }]))
      }
    }
    expect(await Effect.runPromise(server.admit(observation, dispatch))).toEqual({ status: "accepted" })
    expect(await Effect.runPromise(controls.entered)).toBe("credentialResolved")
    const child = spawn(
      process.execPath,
      [
        "-e",
        `
      require("node:fs").writeFileSync(process.argv[1], JSON.stringify({version:1,generation:2,savedUseSuspended:false}));
    `,
        credentialStatePath
      ],
      { stdio: "ignore" }
    )
    await new Promise<void>((resolveExit, rejectExit) => {
      child.once("exit", (code) => (code === 0 ? resolveExit() : rejectExit(new Error("credential update failed"))))
      child.once("error", rejectExit)
    })
    await Effect.runPromise(controls.release)
    await waitUntilIdle(server)
    expect(existsSync(capturePath)).toBe(false)
    expect(Effect.runSync(server.stats())).toMatchObject({ pendingEvaluations: 0 })
  })

  it("aggregates findings from distinct production units in one event", async () => {
    const root = await makeGitFixture()
    await put(root, "a.ts", "type ACount = number\n")
    await put(root, "b.ts", "type BCount = number\n")
    const statePath = join(root, "consent")
    const activityPath = join(root, "activity")
    const observation = await Effect.runPromise(adaptCodexDirectEvent(addEvent(root, ["a.ts", "b.ts"])))
    expect(observation).toBeDefined()
    if (observation === undefined) return
    const server = await acquireResidentFixture(residentPaths(join(root, "runtime")))
    expect(
      (await Effect.runPromise(server.admit(observation, { ...findingDispatch(statePath), activityPath }))).status
    ).toBe("accepted")
    await Effect.runPromise(server.whenIdle())
    expect(
      readActivity({
        statePath: activityPath,
        root,
        sessionId: observation.advicee.sessionId,
        resident: { available: true, lifetime: server.lifetime }
      })
    ).toMatchObject({ kind: "findings", findings: 2, counts: { findings: 1 } })
  })

  it("commits an idle lifetime to retiring before returning cleanup success", async () => {
    const root = await makeGitFixture()
    await put(root, "type.ts", "type OrderCount = number\n")
    const statePath = join(root, "consent")
    const observation = await Effect.runPromise(adaptCodexDirectEvent(addEvent(root)))
    expect(observation).toBeDefined()
    if (observation === undefined) return
    const dispatch = findingDispatch(statePath)
    const server = await acquireResidentFixture(residentPaths(join(root, "runtime")))

    expect(
      await Effect.runPromise(
        server.handle({ requestRoute: "shared", operation: "cleanup", lifetime: server.lifetime })
      )
    ).toEqual({ status: "cleaned" })
    expect(await Effect.runPromise(server.handle({ requestRoute: "shared", operation: "hello" }))).toEqual({
      status: "obsolete-lifetime"
    })
    expect(
      await Effect.runPromise(
        server.handle({
          requestRoute: "shared",
          operation: "admit",
          composed: true,
          lifetime: server.lifetime,
          observation,
          controlledWriter: true,
          dispatch
        })
      )
    ).toEqual({ status: "obsolete-lifetime" })
    expect(
      await Effect.runPromise(
        server.handle({
          requestRoute: "shared",
          operation: "collect",
          composed: true,
          lifetime: server.lifetime,
          root,
          advicee: advicee(),
          dispatch
        })
      )
    ).toEqual({ status: "obsolete-lifetime" })
    expect(
      await Effect.runPromise(
        server.handle({
          requestRoute: "shared",
          operation: "acknowledge",
          lifetime: server.lifetime,
          token: "old-token"
        })
      )
    ).toEqual({ status: "obsolete-lifetime" })
    expect(
      await Effect.runPromise(
        server.handle({ requestRoute: "shared", operation: "finalize", lifetime: server.lifetime, token: "old-token" })
      )
    ).toEqual({ status: "obsolete-lifetime" })
    expect(
      await Effect.runPromise(server.handle({ requestRoute: "shared", operation: "stats", lifetime: server.lifetime }))
    ).toEqual({ status: "obsolete-lifetime" })
    expect(Effect.runSync(server.cleanup())).toBe("busy")
    expect(Effect.runSync(server.stats())).toMatchObject({
      queued: 0,
      running: 0,
      pendingAdvice: 0,
      retainedBytes: 0,
      pendingEvaluations: 0,
      currentWork: 0
    })
  })

  it("reclaims disconnected collection and unfinalized acknowledgement deterministically", async () => {
    const root = await makeGitFixture()
    await put(root, "type.ts", "type OrderCount = number\n")
    const statePath = join(root, "consent")
    const capturePath = join(root, "backend-called")
    const observation = await Effect.runPromise(adaptCodexDirectEvent(addEvent(root)))
    expect(observation).toBeDefined()
    if (observation === undefined) return
    const dispatch: ResidentDispatchContext = {
      statePath,
      userConfigPath: join(statePath, "absent-fixture-user.jsonc"),
      credential: null,
      controlled: {
        capturePath,
        answers: Object.fromEntries(
          configuredRules.map((rule) => [
            rule.id,
            { _tag: "Probability", probability: rule.id === "bare_domain_value" ? 0.9 : 0 }
          ])
        )
      }
    }
    let clock = 100
    const server = await acquireResidentFixture(residentPaths(join(root, "runtime")), () => clock)
    expect((await Effect.runPromise(server.admit(observation, dispatch))).status).toBe("accepted")
    await Effect.runPromise(server.whenIdle())
    expect(Effect.runSync(server.stats())).toMatchObject({ pendingAdvice: 1, running: 0 })

    const first = await Effect.runPromise(
      server.collect(root, advicee({ turnId: "later", toolUseId: "collect-1" }), dispatch)
    )
    expect(first.status).toBe("advice")
    if (first.status !== "advice") return
    await Effect.runPromise(server.releaseDelivery(first.token))
    const afterDisconnect = await Effect.runPromise(
      server.collect(root, advicee({ turnId: "later", toolUseId: "collect-2" }), dispatch)
    )
    expect(afterDisconnect.status).toBe("advice")
    if (afterDisconnect.status !== "advice") return

    expect((await Effect.runPromise(server.acknowledge(afterDisconnect.token))).status).toBe("acknowledged")
    clock += DELIVERY_LEASE_MS
    const afterFailedAck = await Effect.runPromise(
      server.collect(root, advicee({ turnId: "later", toolUseId: "collect-3" }), dispatch)
    )
    expect(afterFailedAck.status).toBe("advice")
    if (afterFailedAck.status !== "advice") return
    expect((await Effect.runPromise(server.acknowledge(afterFailedAck.token))).status).toBe("acknowledged")
    expect((await Effect.runPromise(server.finalize(afterFailedAck.token))).status).toBe("finalized")
    expect(Effect.runSync(server.stats())).toMatchObject({
      pendingAdvice: 0,
      retainedBytes: (await Effect.runPromise(server.accountingMetrics())).successfulCacheBytes
    })
  })

  it("releases promised outcome space after malformed backend output", async () => {
    const root = await makeGitFixture()
    await put(root, "type.ts", "type OrderCount = number\n")
    const statePath = join(root, "consent")
    const observation = await Effect.runPromise(adaptCodexDirectEvent(addEvent(root)))
    expect(observation).toBeDefined()
    if (observation === undefined) return
    const dispatch: ResidentDispatchContext = {
      statePath,
      userConfigPath: join(statePath, "absent-fixture-user.jsonc"),
      credential: null,
      controlled: {
        answers: Object.fromEntries(configuredRules.map((rule) => [rule.id, { _tag: "Probability", probability: 9 }]))
      }
    }
    const server = await acquireResidentFixture(residentPaths(join(root, "runtime")))
    expect((await Effect.runPromise(server.admit(observation, dispatch))).status).toBe("accepted")
    await Effect.runPromise(server.whenIdle())
    expect(Effect.runSync(server.stats())).toMatchObject({ queued: 0, running: 0, pendingAdvice: 1 })
    expect(Effect.runSync(server.stats()).retainedBytes).toBe(
      (await Effect.runPromise(server.accountingMetrics())).operationalNoticeBytes
    )
  })

  it("bounds 16-path/64-unit preparation and accounts accepted units exactly", async () => {
    const root = await makeGitFixture()
    const paths = Array.from({ length: 16 }, (_, index) => `types-${index}.ts`)
    for (const [fileIndex, path] of paths.entries()) {
      await put(
        root,
        path,
        Array.from({ length: 64 }, (_, declarationIndex) => `type Shape${fileIndex}_${declarationIndex} = number`).join(
          "\n"
        )
      )
    }
    await put(
      root,
      "rules.jsonc",
      JSON.stringify({
        version: 1,
        id: "large",
        question: "Does this declaration use a primitive?",
        criteria: { false: "No", true: "Yes" },
        threshold: 0.7,
        message: "x".repeat(1024),
        inputs: [
          {
            languages: ["typescript", "rust", "bend"],
            kind: "type",

            requires: ["root-declaration", "resolved-outbound-types"]
          }
        ]
      })
    )
    await put(
      root,
      ".review.jsonc",
      JSON.stringify({ version: 1, rules: [{ path: "rules.jsonc", includes: ["**/*.ts"] }] })
    )
    await stageFiles(root, paths)
    const statePath = join(root, "consent")
    const capturePath = join(root, "backend-calls")
    const observation = await Effect.runPromise(adaptCodexDirectEvent(addEvent(root, paths)))
    expect(observation).toBeDefined()
    if (observation === undefined) return
    const dispatch: ResidentDispatchContext = {
      statePath,
      userConfigPath: join(statePath, "absent-fixture-user.jsonc"),
      credential: null,
      controlled: {
        capturePath,
        answers: {
          ...Object.fromEntries(configuredRules.map((rule) => [rule.id, { _tag: "Probability", probability: 0.9 }])),
          large: { _tag: "Probability", probability: 0.9 }
        }
      }
    }
    const server = await acquireResidentFixture(residentPaths(join(root, "runtime")))
    expect((await Effect.runPromise(server.admit(observation, dispatch))).status).toBe("accepted")
    await Effect.runPromise(server.whenIdle())

    const metadata = await Effect.runPromise(server.pendingAdviceMetadata())
    const stats = Effect.runSync(server.stats())
    expect(metadata.length).toBeGreaterThanOrEqual(8)
    expect(metadata.length).toBeLessThanOrEqual(16)
    expect(stats).toMatchObject({ pendingAdvice: metadata.length })
    expect(stats.rejectedCapacity).toBeGreaterThan(0)
    expect(stats.retainedBytes).toBe(
      metadata.reduce((total, item) => total + item.retainedBytes, 0) +
        (await Effect.runPromise(server.accountingMetrics())).successfulCacheBytes
    )
    expect(readFileSync(capturePath, "utf8").trim().split("\n")).toHaveLength(metadata.length)
    expect(metadata.map((item) => item.sequence)).toEqual(
      [...metadata.map((item) => item.sequence)].sort((left, right) => left - right)
    )
    expect(await Effect.runPromise(server.accountingMetrics())).toMatchObject({ maxMaterializedPreparedUnits: 64 })
    expect((await Effect.runPromise(server.accountingMetrics())).peakLedgerBytes).toBeLessThanOrEqual(
      PARTITION_BYTE_LIMIT
    )
  })

  it("reserves large valid outcomes before evaluation and rejects unreservable outcomes without a call", async () => {
    const run = async (messageBytes: number) => {
      const root = await makeGitFixture()
      await put(root, "type.ts", "type LargeFinding = number\n")
      await put(
        root,
        "rules.jsonc",
        JSON.stringify({
          version: 1,
          id: "large",
          question: "Does this declaration use a primitive?",
          criteria: { false: "No", true: "Yes" },
          threshold: 0.7,
          message: "x".repeat(messageBytes),
          inputs: [
            {
              languages: ["typescript", "rust", "bend"],
              kind: "type",

              requires: ["root-declaration", "resolved-outbound-types"]
            }
          ]
        })
      )
      await put(
        root,
        ".hapsland.jsonc",
        JSON.stringify({ version: 1, rules: [{ path: "rules.jsonc", includes: ["**/*.ts"] }] })
      )
      const statePath = join(root, "consent")
      const capturePath = join(root, "backend-calls")
      const observation = await Effect.runPromise(adaptCodexDirectEvent(addEvent(root)))
      expect(observation).toBeDefined()
      if (observation === undefined) throw new Error("fixture adaptation failed")
      const dispatch: ResidentDispatchContext = {
        statePath,
        userConfigPath: join(statePath, "absent-fixture-user.jsonc"),
        credential: null,
        controlled: {
          capturePath,
          answers: {
            ...Object.fromEntries(configuredRules.map((rule) => [rule.id, { _tag: "Probability", probability: 0 }])),
            large: { _tag: "Probability", probability: 1 }
          }
        }
      }
      const server = await acquireResidentFixture(residentPaths(join(root, "runtime")))
      expect((await Effect.runPromise(server.admit(observation, dispatch))).status).toBe("accepted")
      await Effect.runPromise(server.whenIdle())
      return { root, statePath, capturePath, dispatch, server }
    }

    const retained = await run(20 * 1024)
    expect(Effect.runSync(retained.server.stats())).toMatchObject({ pendingAdvice: 1, rejectedCapacity: 0 })
    expect(readFileSync(retained.capturePath, "utf8").trim()).toBe("called")
    const delivered = await Effect.runPromise(
      retained.server.collect(retained.root, advicee({ turnId: "later", toolUseId: "large" }), retained.dispatch)
    )
    expect(delivered).toMatchObject({ status: "empty" })
    expect((await Effect.runPromise(retained.server.accountingMetrics())).pendingOperationalNotices).toBeGreaterThan(0)
    expect(Effect.runSync(retained.server.stats())).toMatchObject({ pendingAdvice: 2 })

    const rejected = await run(2 * 1024 * 1024)
    expect(Effect.runSync(rejected.server.stats()).rejectedCapacity).toBeGreaterThan(0)
    expect(existsSync(rejected.capturePath)).toBe(false)
    expect(
      (await Effect.runPromise(rejected.server.accountingMetrics())).maxMaterializedPreparedUnits
    ).toBeLessThanOrEqual(1)
    expect((await Effect.runPromise(rejected.server.accountingMetrics())).peakLedgerBytes).toBeLessThanOrEqual(
      PARTITION_BYTE_LIMIT
    )

    const transportRejected = await run(300 * 1024)
    expect(Effect.runSync(transportRejected.server.stats())).toMatchObject({ pendingAdvice: 1, rejectedCapacity: 1 })
    expect(Effect.runSync(transportRejected.server.stats()).retainedBytes).toBe(
      (await Effect.runPromise(transportRejected.server.accountingMetrics())).operationalNoticeBytes
    )
    expect(existsSync(transportRejected.capturePath)).toBe(false)
  })

  it("removes concurrent collection results by stable advice identity", async () => {
    const root = await makeGitFixture()
    await put(root, "a.ts", "type FirstShape = number\n")
    await put(root, "b.ts", "type SecondShape = number\n")
    const statePath = join(root, "consent")
    const observation = await Effect.runPromise(adaptCodexDirectEvent(addEvent(root, ["a.ts", "b.ts"])))
    expect(observation).toBeDefined()
    if (observation === undefined) return
    const dispatch: ResidentDispatchContext = {
      statePath,
      userConfigPath: join(statePath, "absent-fixture-user.jsonc"),
      credential: null,
      controlled: {
        answers: Object.fromEntries(
          configuredRules.map((rule) => [
            rule.id,
            { _tag: "Probability", probability: rule.id === "bare_domain_value" ? 0.9 : 0 }
          ])
        )
      }
    }
    const entered: Array<string> = []
    const releases = new Map<string, Effect.Effect<void>>()
    const server = await acquireResidentFixture(residentPaths(join(root, "runtime")), () => 100, {
      reviewControls: reviewControlsLayer({
        beforeRevalidate: (id) =>
          Effect.gen(function* () {
            const release = yield* Deferred.make<void>()
            entered.push(id)
            releases.set(id, Deferred.succeed(release, undefined).pipe(Effect.asVoid))
            yield* Deferred.await(release)
          })
      })
    })
    expect((await Effect.runPromise(server.admit(observation, dispatch))).status).toBe("accepted")
    await Effect.runPromise(server.whenIdle())
    const [first, second] = await Effect.runPromise(server.pendingAdviceMetadata())
    expect(first).toBeDefined()
    expect(second).toBeDefined()
    if (first === undefined || second === undefined) return
    await put(root, "a.ts", "type FirstShape = string\n")

    const collectFirst = Effect.runPromise(server.collect(root, advicee({ turnId: "c1", toolUseId: "c1" }), dispatch))
    while (entered.length < 1) await Promise.resolve()
    const collectSecond = Effect.runPromise(server.collect(root, advicee({ turnId: "c2", toolUseId: "c2" }), dispatch))
    while (entered.length < 2) await Promise.resolve()
    expect(entered).toEqual([first.id, second.id])

    Effect.runSync(releases.get(second.id) ?? Effect.void)
    const secondResult = await collectSecond
    expect(secondResult.status).toBe("advice")
    if (secondResult.status === "advice") {
      expect((await Effect.runPromise(server.acknowledge(secondResult.token))).status).toBe("acknowledged")
      expect((await Effect.runPromise(server.finalize(secondResult.token))).status).toBe("finalized")
    }
    Effect.runSync(releases.get(first.id) ?? Effect.void)
    await expect(collectFirst).resolves.toMatchObject({ status: "empty" })
    expect(Effect.runSync(server.stats())).toMatchObject({
      pendingAdvice: 0,
      retainedBytes: (await Effect.runPromise(server.accountingMetrics())).successfulCacheBytes
    })
  })

  it("rejects adversarial long-ID expansion before recursive unit materialization", async () => {
    const root = await makeGitFixture()
    const source = mutuallyReferencingTypes(64, 120)
    await put(root, longNestedPath, source)
    const preflight = analyzerMaterializationPreflight(longNestedPath, source)
    expect(preflight?.declarations).toBe(64)
    expect(preflight?.expandedUnitBytes).toBeGreaterThan(PARTITION_BYTE_LIMIT)
    const statePath = join(root, "consent")
    const capturePath = join(root, "backend-calls")
    const observation = await Effect.runPromise(adaptCodexDirectEvent(addEvent(root, [longNestedPath])))
    expect(observation).toBeDefined()
    if (observation === undefined) return
    const dispatch: ResidentDispatchContext = {
      statePath,
      userConfigPath: join(statePath, "absent-fixture-user.jsonc"),
      credential: null,
      controlled: { capturePath }
    }
    const server = await acquireResidentFixture(residentPaths(join(root, "runtime")))
    expect((await Effect.runPromise(server.admit(observation, dispatch))).status).toBe("accepted")
    await Effect.runPromise(server.whenIdle())
    expect(Effect.runSync(server.stats())).toMatchObject({ pendingAdvice: 0, rejectedCapacity: 1, retainedBytes: 0 })
    expect((await Effect.runPromise(server.accountingMetrics())).maxMaterializedPreparedUnits).toBe(0)
    expect((await Effect.runPromise(server.accountingMetrics())).peakLedgerBytes).toBeLessThanOrEqual(
      PARTITION_BYTE_LIMIT
    )
    expect(existsSync(capturePath)).toBe(false)
  })

  it("retires A when replacement B registers before A completes", async () => {
    const root = await makeGitFixture()
    await put(root, "type.ts", "type OrderCount = number\n")
    const statePath = join(root, "consent")
    const first = await Effect.runPromise(adaptCodexDirectEvent(addEvent(root)))
    expect(first).toBeDefined()
    if (first === undefined) return
    const dispatch = findingDispatch(statePath)
    const controls = await Effect.runPromise(makePreparationControls())
    await Effect.runPromise(controls.holdNextPreparation)
    const oldEvaluationEntered = deferred()
    const releaseOldEvaluation = deferred()
    let heldOldEvaluation = false
    const server = await acquireResidentFixture(residentPaths(join(root, "runtime")), () => 100, {
      preparationControls: controls.layer,
      reviewControls: reviewControlsLayer({
        beforeEvaluate: (prepared) =>
          Effect.gen(function* () {
            if (!heldOldEvaluation && prepared.input.declaration.source.includes("number")) {
              heldOldEvaluation = true
              yield* oldEvaluationEntered.complete()
              yield* releaseOldEvaluation.wait
            }
          })
      })
    })
    expect((await Effect.runPromise(server.admit(first, dispatch))).status).toBe("accepted")
    expect(await Effect.runPromise(controls.nextPreparation)).toBe(1)
    await put(root, "type.ts", "type OrderCount = string\n")
    const replacement = await Effect.runPromise(
      adaptCodexDirectEvent(addEvent(root, ["type.ts"], { tool_use_id: "replacement" }))
    )
    expect(replacement).toBeDefined()
    if (replacement === undefined) return
    expect((await Effect.runPromise(server.admit(replacement, dispatch))).status).toBe("accepted")
    await Effect.runPromise(controls.releasePreparation)
    await oldEvaluationEntered.promise
    expect(await Effect.runPromise(controls.nextPreparation)).toBe(2)
    releaseOldEvaluation.resolve()
    await Effect.runPromise(server.whenIdle())

    const metadata = await Effect.runPromise(server.pendingAdviceMetadata())
    expect(metadata).toHaveLength(1)
    expect(metadata[0]?.generation).toBe(2)
    expect(Effect.runSync(server.stats()).currentWork).toBe(1)
    const delivered = await Effect.runPromise(
      server.collect(root, advicee({ turnId: "later", toolUseId: "replacement-collect" }), dispatch)
    )
    expect(delivered.status).toBe("advice")
  })

  it("joins equivalent pending complete inputs before another evaluation reservation", async () => {
    const root = await makeGitFixture()
    await put(root, "type.ts", "type OrderCount = number\n")
    const statePath = join(root, "consent")
    const first = await Effect.runPromise(adaptCodexDirectEvent(addEvent(root)))
    expect(first).toBeDefined()
    if (first === undefined) return
    const server = await acquireResidentFixture(residentPaths(join(root, "runtime")))
    const capturePath = join(root, "backend-calls")
    const dispatch: ResidentDispatchContext = {
      statePath,
      userConfigPath: join(statePath, "absent-fixture-user.jsonc"),
      credential: null,
      controlled: {
        capturePath,
        answers: Object.fromEntries(configuredRules.map((rule) => [rule.id, { _tag: "Probability", probability: 0.9 }]))
      }
    }
    expect((await Effect.runPromise(server.admit(first, dispatch))).status).toBe("accepted")
    const huge = "x".repeat(32 * 1024)
    for (let index = 0; index < 6; index += 1) {
      const duplicate = {
        ...first,
        advicee: { ...first.advicee, turnId: `${index}:${huge}`, toolUseId: `${index}:${huge}` },
        candidates: first.candidates.map((candidate) =>
          candidate.operation === "add" ? { ...candidate, addedLines: [huge] } : candidate
        )
      }
      expect((await Effect.runPromise(server.admit(duplicate, dispatch))).status).toBe("accepted")
    }
    await Effect.runPromise(server.whenIdle())
    const metadata = await Effect.runPromise(server.pendingAdviceMetadata())
    expect(metadata).toHaveLength(1)
    expect(new Set(metadata.map(({ generation }) => generation))).toEqual(new Set([1]))
    expect(new Set(metadata.flatMap(({ evaluationIdentities }) => evaluationIdentities)).size).toBe(1)
    expect(readFileSync(capturePath, "utf8").trim().split("\n")).toHaveLength(1)
    expect((await Effect.runPromise(server.accountingMetrics())).pendingEvaluations).toBe(0)
    expect(Effect.runSync(server.stats()).retainedBytes).toBe(
      (metadata[0]?.retainedBytes ?? 0) + (await Effect.runPromise(server.accountingMetrics())).successfulCacheBytes
    )
    expect((await Effect.runPromise(server.accountingMetrics())).peakLedgerBytes).toBeLessThanOrEqual(
      PARTITION_BYTE_LIMIT
    )
    await expect(
      Effect.runPromise(server.collect(root, advicee({ turnId: "after-storm", toolUseId: "after-storm" }), dispatch))
    ).resolves.toMatchObject({ status: "advice" })
  })

  it("uses stable advice identity when replacement arrives during collection", async () => {
    const root = await makeGitFixture()
    await put(root, "type.ts", "type OrderCount = number\n")
    const statePath = join(root, "consent")
    const first = await Effect.runPromise(adaptCodexDirectEvent(addEvent(root)))
    expect(first).toBeDefined()
    if (first === undefined) return
    const entered = deferred()
    const release = deferred()
    let held = false
    const server = await acquireResidentFixture(residentPaths(join(root, "runtime")), () => 100, {
      reviewControls: reviewControlsLayer({
        beforeRevalidate: () =>
          Effect.gen(function* () {
            if (held) return
            held = true
            yield* entered.complete()
            yield* release.wait
          })
      })
    })
    const dispatch = findingDispatch(statePath)
    expect((await Effect.runPromise(server.admit(first, dispatch))).status).toBe("accepted")
    await Effect.runPromise(server.whenIdle())
    const collecting = Effect.runPromise(
      server.collect(root, advicee({ turnId: "collecting", toolUseId: "collecting" }), dispatch)
    )
    await entered.promise

    await put(root, "type.ts", "type OrderCount = string\n")
    const replacement = await Effect.runPromise(
      adaptCodexDirectEvent(addEvent(root, ["type.ts"], { tool_use_id: "replacement-during-collect" }))
    )
    expect(replacement).toBeDefined()
    if (replacement === undefined) return
    expect((await Effect.runPromise(server.admit(replacement, dispatch))).status).toBe("accepted")
    await Effect.runPromise(server.whenIdle())
    release.resolve()
    await expect(collecting).resolves.toMatchObject({ status: "empty" })

    const metadata = await Effect.runPromise(server.pendingAdviceMetadata())
    expect(metadata).toHaveLength(1)
    expect(metadata[0]?.generation).toBe(2)
    await expect(
      Effect.runPromise(server.collect(root, advicee({ turnId: "later", toolUseId: "replacement" }), dispatch))
    ).resolves.toMatchObject({ status: "advice" })
  })

  it("keeps retired advice workspace charged until active revalidation finalizes", async () => {
    const root = await makeGitFixture()
    await put(root, "type.ts", "type OrderCount = number\n")
    const statePath = join(root, "consent")
    const first = await Effect.runPromise(adaptCodexDirectEvent(addEvent(root)))
    expect(first).toBeDefined()
    if (first === undefined) return
    const workspaceReserved = deferred()
    const releaseRevalidation = deferred()
    let held = false
    const server = await acquireResidentFixture(residentPaths(join(root, "runtime")), () => 100, {
      reviewControls: reviewControlsLayer({
        afterRevalidationWorkspaceReserved: () =>
          Effect.gen(function* () {
            if (held) return
            held = true
            yield* workspaceReserved.complete()
            yield* releaseRevalidation.wait
          })
      })
    })
    const dispatch = findingDispatch(statePath)
    expect((await Effect.runPromise(server.admit(first, dispatch))).status).toBe("accepted")
    await Effect.runPromise(server.whenIdle())
    const baseBytes = Effect.runSync(server.stats()).retainedBytes
    const collecting = Effect.runPromise(
      server.collect(root, advicee({ turnId: "collecting", toolUseId: "collecting" }), dispatch)
    )
    await workspaceReserved.promise
    expect(Effect.runSync(server.stats()).retainedBytes).toBeGreaterThan(baseBytes)

    await put(root, "type.ts", "type OrderCount = string\n")
    const replacement = await Effect.runPromise(
      adaptCodexDirectEvent(addEvent(root, ["type.ts"], { tool_use_id: "replacement-during-active-revalidation" }))
    )
    expect(replacement).toBeDefined()
    if (replacement === undefined) return
    expect((await Effect.runPromise(server.admit(replacement, dispatch))).status).toBe("accepted")
    await Effect.runPromise(server.whenIdle())
    const replacementAdvice = await Effect.runPromise(server.pendingAdviceMetadata())
    expect(replacementAdvice).toHaveLength(1)
    expect(replacementAdvice[0]?.generation).toBe(2)
    expect(Effect.runSync(server.stats()).currentWork).toBe(1)
    const replacementBytes = replacementAdvice[0]?.retainedBytes ?? 0
    expect(Effect.runSync(server.stats()).retainedBytes).toBeGreaterThan(replacementBytes)

    releaseRevalidation.resolve()
    await expect(collecting).resolves.toMatchObject({ status: "empty" })
    expect(Effect.runSync(server.stats())).toMatchObject({
      pendingAdvice: 1,
      currentWork: 1,
      retainedBytes: replacementBytes + (await Effect.runPromise(server.accountingMetrics())).successfulCacheBytes
    })
    const delivered = await Effect.runPromise(
      server.collect(root, advicee({ turnId: "later", toolUseId: "replacement" }), dispatch)
    )
    expect(delivered.status).toBe("advice")
    if (delivered.status !== "advice") return
    expect((await Effect.runPromise(server.acknowledge(delivered.token))).status).toBe("acknowledged")
    expect((await Effect.runPromise(server.finalize(delivered.token))).status).toBe("finalized")
    expect(Effect.runSync(server.stats())).toMatchObject({
      pendingAdvice: 0,
      currentWork: 0,
      retainedBytes: (await Effect.runPromise(server.accountingMetrics())).successfulCacheBytes
    })
  })

  it("does not let late A cleanup delete C after cached-clear B removes current state", async () => {
    const root = await makeGitFixture()
    const statePath = join(root, "consent")
    const capturePath = join(root, "backend-calls")
    const clearDispatch: ResidentDispatchContext = {
      statePath,
      userConfigPath: join(statePath, "absent-fixture-user.jsonc"),
      credential: null,
      controlled: { capturePath }
    }
    const finding: ResidentDispatchContext = {
      ...findingDispatch(statePath),
      controlled: {
        capturePath,
        answers: Object.fromEntries(configuredRules.map((rule) => [rule.id, { _tag: "Probability", probability: 0.9 }]))
      }
    }
    const revalidationHeld = deferred()
    const releaseRevalidation = deferred()
    let holdNextRevalidation = true
    const server = await acquireResidentFixture(residentPaths(join(root, "runtime")), () => 100, {
      reviewControls: reviewControlsLayer({
        afterRevalidationWorkspaceReserved: () =>
          Effect.gen(function* () {
            if (!holdNextRevalidation) return
            holdNextRevalidation = false
            yield* revalidationHeld.complete()
            yield* releaseRevalidation.wait
          })
      })
    })
    const admitSource = async (source: string, toolUseId: string, dispatch: ResidentDispatchContext) => {
      await put(root, "type.ts", source)
      const observation = await Effect.runPromise(
        adaptCodexDirectEvent(addEvent(root, ["type.ts"], { tool_use_id: toolUseId }))
      )
      expect(observation).toBeDefined()
      if (observation !== undefined)
        expect((await Effect.runPromise(server.admit(observation, dispatch))).status).toBe("accepted")
      await Effect.runPromise(server.whenIdle())
    }

    await admitSource("type OrderCount = boolean\n", "seed-B-clear", clearDispatch)
    expect((await Effect.runPromise(server.accountingMetrics())).successfulCacheEntries).toBe(1)
    await admitSource("type OrderCount = number\n", "A", finding)
    expect(await Effect.runPromise(server.pendingAdviceMetadata())).toHaveLength(1)

    const collectingA = Effect.runPromise(
      server.collect(root, advicee({ turnId: "held-A", toolUseId: "held-A" }), finding)
    )
    await revalidationHeld.promise

    await admitSource("type OrderCount = boolean\n", "cached-B", finding)
    expect(await Effect.runPromise(server.pendingAdviceMetadata())).toHaveLength(0)
    await admitSource("type OrderCount = string\n", "new-C", finding)
    const currentC = await Effect.runPromise(server.pendingAdviceMetadata())
    expect(currentC).toHaveLength(1)
    const cGeneration = currentC[0]?.generation

    releaseRevalidation.resolve()
    await expect(collectingA).resolves.toMatchObject({ status: "empty" })
    expect(await Effect.runPromise(server.pendingAdviceMetadata())).toMatchObject([{ generation: cGeneration }])
    const deliveredC = await Effect.runPromise(server.collect(root, advicee({ turnId: "C", toolUseId: "C" }), finding))
    expect(deliveredC.status).toBe("advice")
    expect(readFileSync(capturePath, "utf8").trim().split("\n")).toHaveLength(3)
  })

  it("skips stale unit advice and returns an independently current multi-file unit", async () => {
    const root = await makeGitFixture()
    await put(root, "b.ts", "type BCount = number\n")
    await put(root, "a.ts", "type ACount = number\n")
    const statePath = join(root, "consent")
    const observation = await Effect.runPromise(adaptCodexDirectEvent(addEvent(root, ["b.ts", "a.ts"])))
    expect(observation).toBeDefined()
    if (observation === undefined) return
    const server = await acquireResidentFixture(residentPaths(join(root, "runtime")))
    const dispatch = findingDispatch(statePath)
    expect((await Effect.runPromise(server.admit(observation, dispatch))).status).toBe("accepted")
    await Effect.runPromise(server.whenIdle())
    expect(await Effect.runPromise(server.pendingAdviceMetadata())).toHaveLength(2)
    await put(root, "b.ts", "type BCount = string\n")

    const delivered = await Effect.runPromise(
      server.collect(root, advicee({ turnId: "later", toolUseId: "multi" }), dispatch)
    )
    expect(delivered.status).toBe("advice")
    if (delivered.status === "advice") {
      expect(delivered.output.hookSpecificOutput.additionalContext).toContain("a.ts :: ACount")
      expect(delivered.output.hookSpecificOutput.additionalContext).not.toContain("b.ts :: BCount")
    }
    expect(Effect.runSync(server.stats()).pendingAdvice).toBe(1)
  })

  it("keeps addressed advice pending when current revalidation is unavailable", async () => {
    const root = await makeGitFixture()
    await put(root, "type.ts", "type OrderCount = number\n")
    const statePath = join(root, "consent")
    const observation = await Effect.runPromise(adaptCodexDirectEvent(addEvent(root)))
    expect(observation).toBeDefined()
    if (observation === undefined) return
    const server = await acquireResidentFixture(residentPaths(join(root, "runtime")))
    const dispatch = findingDispatch(statePath)
    expect((await Effect.runPromise(server.admit(observation, dispatch))).status).toBe("accepted")
    await Effect.runPromise(server.whenIdle())
    await put(root, "type.ts", "interface Broken { value: Missing }\n")
    await expect(
      Effect.runPromise(server.collect(root, advicee({ turnId: "later", toolUseId: "unavailable" }), dispatch))
    ).resolves.toMatchObject({ status: "empty" })
    expect(Effect.runSync(server.stats()).pendingAdvice).toBe(1)
    expect(
      await Effect.runPromise(
        server.collect(root, advicee({ subagentId: "other", turnId: "other", toolUseId: "other" }), dispatch)
      )
    ).toMatchObject({ status: "empty" })
    expect(Effect.runSync(server.stats()).pendingAdvice).toBe(1)
  })

  it("delivers resident advice with its original rules after rule files change", async () => {
    const root = await makeGitFixture()
    await put(root, "type.ts", "type OrderCount = number\n")
    const rules = (message: string) =>
      JSON.stringify({
        version: 1,
        id: "primitive",
        question: "Does this declaration use a primitive?",
        criteria: { false: "No", true: "Yes" },
        threshold: 0.7,
        message,
        inputs: [
          {
            languages: ["typescript", "rust", "bend"],
            kind: "type",

            requires: ["root-declaration", "resolved-outbound-types"]
          }
        ]
      })
    await put(root, "rules.jsonc", rules("first recommendation"))
    await put(
      root,
      ".hapsland.jsonc",
      JSON.stringify({ version: 1, rules: [{ path: "rules.jsonc", includes: ["**/*.ts"] }] })
    )
    const statePath = join(root, "consent")
    const observation = await Effect.runPromise(adaptCodexDirectEvent(addEvent(root)))
    expect(observation).toBeDefined()
    if (observation === undefined) return
    const dispatch: ResidentDispatchContext = {
      ...findingDispatch(statePath),
      controlled: {
        answers: {
          ...Object.fromEntries(configuredRules.map((rule) => [rule.id, { _tag: "Probability", probability: 0.9 }])),
          primitive: { _tag: "Probability", probability: 0.9 }
        }
      }
    }
    const server = await acquireResidentFixture(residentPaths(join(root, "runtime")))
    expect((await Effect.runPromise(server.admit(observation, dispatch))).status).toBe("accepted")
    await Effect.runPromise(server.whenIdle())
    expect(Effect.runSync(server.stats()).pendingAdvice).toBe(1)
    await put(root, "rules.jsonc", rules("changed recommendation"))
    await expect(
      Effect.runPromise(server.collect(root, advicee({ turnId: "later", toolUseId: "rules" }), dispatch))
    ).resolves.toMatchObject({
      status: "advice",
      output: { hookSpecificOutput: { additionalContext: expect.stringContaining("first recommendation") } }
    })
    expect(Effect.runSync(server.stats()).pendingAdvice).toBe(1)
  })

  it("revalidates and finalizes at the 16-item partition saturation boundary", async () => {
    const root = await makeGitFixture()
    const paths = Array.from({ length: 16 }, (_, index) => `type-${index}.ts`)
    for (const [index, path] of paths.entries()) {
      await put(root, path, `type Count${index} = number\n`)
    }
    await stageFiles(root, paths)
    const statePath = join(root, "consent")
    const observation = await Effect.runPromise(adaptCodexDirectEvent(addEvent(root, paths)))
    expect(observation).toBeDefined()
    if (observation === undefined) return
    const dispatch = findingDispatch(statePath)
    const server = await acquireResidentFixture(residentPaths(join(root, "runtime")))
    expect((await Effect.runPromise(server.admit(observation, dispatch))).status).toBe("accepted")
    await Effect.runPromise(server.whenIdle())
    const saturated = Effect.runSync(server.stats())
    // Every attempted unit either retains advice or is refused by the
    // partition ledger, whose successful cache entries also consume space.
    expect(saturated.pendingAdvice + saturated.rejectedCapacity).toBe(16)
    expect(saturated.pendingAdvice).toBeGreaterThan(0)
    const beforeItems = await Effect.runPromise(server.pendingAdviceMetadata())

    const collected = await Effect.runPromise(
      server.collect(root, advicee({ turnId: "saturated", toolUseId: "saturated" }), dispatch)
    )
    expect(collected.status).toBe("advice")
    if (collected.status !== "advice") return
    expect((await Effect.runPromise(server.acknowledge(collected.token))).status).toBe("acknowledged")
    expect((await Effect.runPromise(server.finalize(collected.token))).status).toBe("finalized")
    expect(Effect.runSync(server.stats())).toMatchObject({
      pendingAdvice: saturated.pendingAdvice - collected.findingCount
    })
    expect(Effect.runSync(server.stats()).retainedBytes).toBe(
      saturated.retainedBytes -
        beforeItems.slice(0, collected.findingCount).reduce((total, item) => total + item.retainedBytes, 0)
    )
  })

  // Four 16-item partitions attempt 64 real repository parses; the shared
  // global limit is 512 and is covered by the capacity ledger tests. The finite
  // 30-second fixture budget includes parsing and revalidation under coverage:
  // measured completion was 13–17s in focused and exact-order runs, while a
  // full covered run exceeded 20s. This does not change production deadlines.
  it("revalidates and finalizes across four saturated partitions", async () => {
    const root = await makeGitFixture()
    const statePath = join(root, "consent")
    const dispatch = findingDispatch(statePath)
    const server = await acquireResidentFixture(residentPaths(join(root, "runtime")))
    for (let partition = 0; partition < 4; partition += 1) {
      const paths = Array.from({ length: 16 }, (_, index) => `p${partition}-${index}.ts`)
      for (const [index, path] of paths.entries()) {
        await put(root, path, `type Count${partition}_${index} = number\n`)
      }
      await stageFiles(root, paths)
      const observation = await Effect.runPromise(
        adaptCodexDirectEvent(
          addEvent(root, paths, { agent_id: `agent-${partition}`, tool_use_id: `partition-${partition}` })
        )
      )
      expect(observation).toBeDefined()
      if (observation === undefined) return
      expect((await Effect.runPromise(server.admit(observation, dispatch))).status).toBe("accepted")
      await Effect.runPromise(server.whenIdle())
      const progress = Effect.runSync(server.stats())
      expect(progress.pendingAdvice + progress.rejectedCapacity).toBe((partition + 1) * 16)
    }
    const saturated = Effect.runSync(server.stats())
    expect(saturated.pendingAdvice + saturated.rejectedCapacity).toBe(64)
    expect(saturated.pendingAdvice).toBeGreaterThan(0)
    const beforeItems = (await Effect.runPromise(server.pendingAdviceMetadata())).filter(({ partition }) =>
      partition.includes('"subagentId":"agent-0"')
    )

    const collected = await Effect.runPromise(
      server.collect(root, advicee({ subagentId: "agent-0", turnId: "global", toolUseId: "global" }), dispatch)
    )
    expect(collected.status).toBe("advice")
    if (collected.status !== "advice") return
    expect((await Effect.runPromise(server.acknowledge(collected.token))).status).toBe("acknowledged")
    expect((await Effect.runPromise(server.finalize(collected.token))).status).toBe("finalized")
    expect(Effect.runSync(server.stats())).toMatchObject({
      pendingAdvice: saturated.pendingAdvice - collected.findingCount
    })
    expect(Effect.runSync(server.stats()).retainedBytes).toBe(
      saturated.retainedBytes -
        beforeItems.slice(0, collected.findingCount).reduce((total, item) => total + item.retainedBytes, 0)
    )
  }, 30_000)

  it("scans past unavailable advice to independently current advice once per collection", async () => {
    const root = await makeGitFixture()
    await put(root, "a.ts", "type ACount = number\n")
    await put(root, "b.ts", "type BCount = number\n")
    const statePath = join(root, "consent")
    const observation = await Effect.runPromise(adaptCodexDirectEvent(addEvent(root, ["a.ts", "b.ts"])))
    expect(observation).toBeDefined()
    if (observation === undefined) return
    const dispatch = findingDispatch(statePath)
    const visits: Array<string> = []
    const server = await acquireResidentFixture(residentPaths(join(root, "runtime")), () => 100, {
      reviewControls: reviewControlsLayer({
        beforeRevalidate: (id) =>
          Effect.gen(function* () {
            visits.push(id)
          })
      })
    })
    expect((await Effect.runPromise(server.admit(observation, dispatch))).status).toBe("accepted")
    await Effect.runPromise(server.whenIdle())
    const before = await Effect.runPromise(server.pendingAdviceMetadata())
    expect(before.map(({ path }) => path)).toEqual(["a.ts", "b.ts"])
    await put(root, "a.ts", "interface Broken { value: Missing }\n")

    const collected = await Effect.runPromise(
      server.collect(root, advicee({ turnId: "scan", toolUseId: "scan" }), dispatch)
    )
    expect(collected.status).toBe("advice")
    if (collected.status !== "advice") return
    expect(collected.output.hookSpecificOutput.additionalContext).toContain("b.ts :: BCount")
    expect(visits).toEqual(before.map(({ id }) => id))
    const after = await Effect.runPromise(server.pendingAdviceMetadata())
    expect(after.find(({ path }) => path === "a.ts")?.delivery).toBe("available")
    expect(after.find(({ path }) => path === "b.ts")?.delivery).toBe("leased-unacknowledged")
    expect((await Effect.runPromise(server.acknowledge(collected.token))).status).toBe("acknowledged")
    expect((await Effect.runPromise(server.finalize(collected.token))).status).toBe("finalized")
    expect(await Effect.runPromise(server.pendingAdviceMetadata())).toMatchObject([
      { path: "a.ts", delivery: "available" }
    ])
  })

  it("reuses successful clear evaluations but never failures or malformed responses", async () => {
    const root = await makeGitFixture()
    await put(root, "type.ts", "type OrderCount = number\n")
    const statePath = join(root, "consent")
    const server = await acquireResidentFixture(residentPaths(join(root, "runtime")))
    const clearCalls = join(root, "clear-calls")
    const clearDispatch: ResidentDispatchContext = {
      statePath,
      userConfigPath: join(statePath, "absent-fixture-user.jsonc"),
      credential: null,
      controlled: { capturePath: clearCalls }
    }
    for (const [index, toolUseId] of ["clear-1", "clear-2"].entries()) {
      if (index === 1) {
        await put(root, "type.ts", "// a different whole-file snapshot\ntype OrderCount = number\n")
      }
      const observation = await Effect.runPromise(
        adaptCodexDirectEvent(addEvent(root, ["type.ts"], { tool_use_id: toolUseId }))
      )
      expect(observation).toBeDefined()
      if (observation !== undefined)
        expect((await Effect.runPromise(server.admit(observation, clearDispatch))).status).toBe("accepted")
      await Effect.runPromise(server.whenIdle())
    }
    expect(readFileSync(clearCalls, "utf8").trim().split("\n")).toHaveLength(1)
    expect(Effect.runSync(server.stats()).pendingAdvice).toBe(0)
    expect(await Effect.runPromise(server.accountingMetrics())).toMatchObject({ successfulCacheEntries: 1 })

    const malformedCalls = join(root, "malformed-calls")
    const malformedDispatch: ResidentDispatchContext = {
      ...clearDispatch,
      controlled: {
        capturePath: malformedCalls,
        answers: Object.fromEntries(configuredRules.map((rule) => [rule.id, { _tag: "Probability", probability: 9 }]))
      }
    }
    await put(root, "type.ts", "type OrderCount = string\n")
    for (const toolUseId of ["malformed-1", "malformed-2"]) {
      const observation = await Effect.runPromise(
        adaptCodexDirectEvent(addEvent(root, ["type.ts"], { tool_use_id: toolUseId }))
      )
      expect(observation).toBeDefined()
      if (observation !== undefined)
        expect((await Effect.runPromise(server.admit(observation, malformedDispatch))).status).toBe("accepted")
      await Effect.runPromise(server.whenIdle())
    }
    expect(readFileSync(malformedCalls, "utf8").trim().split("\n")).toHaveLength(2)
    expect((await Effect.runPromise(server.accountingMetrics())).successfulCacheEntries).toBe(1)
  })

  it("restores cached A after A to B to A without retaining delivery history", async () => {
    const root = await makeGitFixture()
    const statePath = join(root, "consent")
    const capturePath = join(root, "backend-calls")
    const dispatch: ResidentDispatchContext = {
      statePath,
      userConfigPath: join(statePath, "absent-fixture-user.jsonc"),
      credential: null,
      controlled: {
        capturePath,
        answers: Object.fromEntries(configuredRules.map((rule) => [rule.id, { _tag: "Probability", probability: 0.9 }]))
      }
    }
    const server = await acquireResidentFixture(residentPaths(join(root, "runtime")))
    const admitSource = async (source: string, toolUseId: string) => {
      await put(root, "type.ts", source)
      const observation = await Effect.runPromise(
        adaptCodexDirectEvent(addEvent(root, ["type.ts"], { tool_use_id: toolUseId }))
      )
      expect(observation).toBeDefined()
      if (observation !== undefined)
        expect((await Effect.runPromise(server.admit(observation, dispatch))).status).toBe("accepted")
      await Effect.runPromise(server.whenIdle())
    }
    await admitSource("type OrderCount = number\n", "A-1")
    const firstAIdentity = (await Effect.runPromise(server.pendingAdviceMetadata()))[0]?.evaluationIdentities[0]
    const deliveredA = await Effect.runPromise(server.collect(root, advicee({ turnId: "A", toolUseId: "A" }), dispatch))
    expect(deliveredA.status).toBe("advice")
    if (deliveredA.status === "advice") {
      expect((await Effect.runPromise(server.acknowledge(deliveredA.token))).status).toBe("acknowledged")
      expect((await Effect.runPromise(server.finalize(deliveredA.token))).status).toBe("finalized")
    }
    await admitSource("type OrderCount = string\n", "B")
    expect(await Effect.runPromise(server.pendingAdviceMetadata())).toHaveLength(1)
    await admitSource("type OrderCount = number\n", "A-2")
    const restored = await Effect.runPromise(server.pendingAdviceMetadata())
    expect(restored).toHaveLength(1)
    expect(restored[0]?.evaluationIdentities).toEqual([firstAIdentity])
    expect(readFileSync(capturePath, "utf8").trim().split("\n")).toHaveLength(2)
    expect(await Effect.runPromise(server.accountingMetrics())).toMatchObject({
      successfulCacheEntries: 2,
      pendingEvaluations: 0
    })
  })

  it("bounds successful reuse by entry and byte limits and reevaluates evicted input", async () => {
    const root = await makeGitFixture()
    const statePath = join(root, "consent")
    const capturePath = join(root, "backend-calls")
    const dispatch: ResidentDispatchContext = {
      statePath,
      userConfigPath: join(statePath, "absent-fixture-user.jsonc"),
      credential: null,
      controlled: { capturePath }
    }
    const server = await acquireResidentFixture(residentPaths(join(root, "runtime")))
    const admit = async (index: number, toolUseId: string) => {
      await put(root, "type.ts", `type Shape${index} = ${index}\n`)
      const observation = await Effect.runPromise(
        adaptCodexDirectEvent(addEvent(root, ["type.ts"], { tool_use_id: toolUseId }))
      )
      expect(observation).toBeDefined()
      if (observation !== undefined)
        expect((await Effect.runPromise(server.admit(observation, dispatch))).status).toBe("accepted")
      await Effect.runPromise(server.whenIdle())
    }
    for (let index = 0; index < 10; index += 1) await admit(index, `unique-${index}`)
    expect((await Effect.runPromise(server.accountingMetrics())).successfulCacheEntries).toBeLessThanOrEqual(8)
    expect((await Effect.runPromise(server.accountingMetrics())).successfulCacheBytes).toBeLessThanOrEqual(128 * 1024)
    await admit(0, "restored-evicted")
    expect(readFileSync(capturePath, "utf8").trim().split("\n")).toHaveLength(11)
  })

  // Large near-frame identities and full revalidation batches measure at 5.0-5.2
  // seconds on the supported arm64 host, so only these stress cases get 10 seconds.
  it("charges a valid near-frame identity for every admitted unit", async () => {
    const root = await makeGitFixture()
    await put(root, "type.ts", Array.from({ length: 8 }, (_, index) => `type NearFrame${index} = number`).join("\n"))
    const statePath = join(root, "consent")
    const capturePath = join(root, "backend-calls")
    const base = await Effect.runPromise(adaptCodexDirectEvent(addEvent(root)))
    expect(base).toBeDefined()
    if (base === undefined) return
    // Both identifiers are valid at the 16,384-code-unit protocol ceiling
    // while their combined UTF-8 representation is 96 KiB.
    const sessionId = "漢".repeat(16_384)
    const subagentId = "界".repeat(16_384)
    const padding = "p".repeat(56 * 1024)
    const observation = {
      ...base,
      advicee: { ...base.advicee, sessionId, subagentId },
      candidates: base.candidates.map((candidate) =>
        candidate.operation === "add" ? { ...candidate, addedLines: [padding] } : candidate
      )
    }
    const dispatch: ResidentDispatchContext = {
      statePath,
      userConfigPath: join(statePath, "absent-fixture-user.jsonc"),
      credential: null,
      controlled: {
        capturePath,
        answers: Object.fromEntries(configuredRules.map((rule) => [rule.id, { _tag: "Probability", probability: 0.9 }]))
      }
    }
    const server = await acquireResidentFixture(residentPaths(join(root, "runtime")))
    const encoded = JSON.stringify({
      requestRoute: "shared",
      operation: "admit",
      composed: true,
      lifetime: server.lifetime,
      observation,
      controlledWriter: true,
      dispatch
    })
    expect(Buffer.byteLength(encoded, "utf8")).toBeGreaterThan(150 * 1024)
    const decoded = decodeResidentRequest(encoded)
    expect(decoded?.operation).toBe("admit")
    if (decoded?.operation !== "admit") return
    expect((await Effect.runPromise(server.admit(decoded.observation, decoded.dispatch))).status).toBe("accepted")
    await Effect.runPromise(server.whenIdle())

    const metadata = await Effect.runPromise(server.pendingAdviceMetadata())
    expect(metadata).toHaveLength(8)
    expect(Effect.runSync(server.stats()).rejectedCapacity).toBe(0)
    expect(Effect.runSync(server.stats()).retainedBytes).toBe(
      metadata.reduce((total, item) => total + item.retainedBytes, 0) +
        (await Effect.runPromise(server.accountingMetrics())).successfulCacheBytes +
        (await Effect.runPromise(server.accountingMetrics())).operationalNoticeBytes
    )
    expect(Effect.runSync(server.stats()).retainedBytes).toBeLessThanOrEqual(PARTITION_BYTE_LIMIT)
    expect((await Effect.runPromise(server.accountingMetrics())).peakLedgerBytes).toBeLessThanOrEqual(
      PARTITION_BYTE_LIMIT
    )
    expect(readFileSync(capturePath, "utf8").trim().split("\n")).toHaveLength(metadata.length)

    expect(
      await Effect.runPromise(
        server.collect(root, { ...observation.advicee, subagentId: `${subagentId.slice(0, -1)}z` }, dispatch)
      )
    ).toMatchObject({ status: "empty" })
    expect(
      (await Effect.runPromise(server.pendingAdviceMetadata())).map(({ id, delivery }) => ({ id, delivery }))
    ).toEqual(metadata.map(({ id }) => ({ id, delivery: "available" })))
    const otherRoot = await makeGitFixture()
    expect(await Effect.runPromise(server.collect(otherRoot, observation.advicee, dispatch))).toMatchObject({
      status: "empty"
    })
    expect(
      (await Effect.runPromise(server.pendingAdviceMetadata())).map(({ id, delivery }) => ({ id, delivery }))
    ).toEqual(metadata.map(({ id }) => ({ id, delivery: "available" })))
  })
})

describe("resident bounded advice batches", () => {
  it("delivers all seven default findings from one unit when they fit", async () => {
    const root = await makeGitFixture()
    await put(root, "type.ts", "type OrderCount = number\n")
    const statePath = join(root, "consent")
    const observation = await Effect.runPromise(adaptCodexDirectEvent(addEvent(root)))
    expect(observation).toBeDefined()
    if (observation === undefined) return
    const dispatch = allFindingsDispatch(statePath)
    const server = await acquireResidentFixture(residentPaths(join(root, "runtime")), () => 100)
    expect((await Effect.runPromise(server.admit(observation, dispatch))).status).toBe("accepted")
    await Effect.runPromise(server.whenIdle())
    const first = await Effect.runPromise(
      server.collect(root, advicee({ turnId: "first", toolUseId: "first" }), dispatch)
    )
    expect(first.status).toBe("advice")
    if (first.status !== "advice") return
    expect(first.output.hookSpecificOutput.additionalContext.split("\n").slice(0, 2)).toEqual([
      REVIEW_FEEDBACK_HEADING,
      REVIEW_FEEDBACK_INSTRUCTIONS
    ])
    expect(
      first.output.hookSpecificOutput.additionalContext.split("\n").filter((line) => /^.+ :: .+: /.test(line))
    ).toHaveLength(7)
    expect(await Effect.runPromise(server.pendingAdviceMetadata())).toMatchObject([
      { pendingFindings: 7, deliveryFindings: 7 }
    ])
    expect((await Effect.runPromise(server.acknowledge(first.token))).status).toBe("acknowledged")
    expect((await Effect.runPromise(server.finalize(first.token))).status).toBe("finalized")
    expect(await Effect.runPromise(server.pendingAdviceMetadata())).toEqual([])
    expect(Effect.runSync(server.stats())).toMatchObject({
      pendingAdvice: 0,
      retainedBytes: (await Effect.runPromise(server.accountingMetrics())).successfulCacheBytes
    })
  })

  it("revalidates the final selection after later candidate work completes", async () => {
    const root = await makeGitFixture()
    await put(root, "a.ts", "type ACount = number\n")
    await put(root, "b.ts", "type BCount = number\n")
    const statePath = join(root, "consent")
    const observation = await Effect.runPromise(adaptCodexDirectEvent(addEvent(root, ["a.ts", "b.ts"])))
    expect(observation).toBeDefined()
    if (observation === undefined) return
    const dispatch = singleFindingDispatch(statePath)
    const blocked = deferred()
    const release = deferred()
    let bId = ""
    const server = await acquireResidentFixture(residentPaths(join(root, "runtime")), () => 100, {
      reviewControls: reviewControlsLayer({
        beforeRevalidate: (id) =>
          Effect.gen(function* () {
            if (id !== bId) return
            yield* blocked.complete()
            yield* release.wait
          })
      })
    })
    expect((await Effect.runPromise(server.admit(observation, dispatch))).status).toBe("accepted")
    await Effect.runPromise(server.whenIdle())
    const metadata = await Effect.runPromise(server.pendingAdviceMetadata())
    bId = metadata.find(({ path }) => path === "b.ts")?.id ?? ""
    expect(bId).not.toBe("")

    const collecting = Effect.runPromise(
      server.collect(root, advicee({ turnId: "collect", toolUseId: "collect" }), dispatch)
    )
    await blocked.promise
    // A passed the first revalidation before B blocked. The final pass must
    // observe this change rather than publishing A's now-stale finding.
    await put(root, "a.ts", "type ACount = string\n")
    release.resolve()
    const collected = await collecting
    expect(collected.status).toBe("advice")
    if (collected.status !== "advice") return
    expect(collected.output.hookSpecificOutput.additionalContext).not.toContain("a.ts :: ACount")
    expect(collected.output.hookSpecificOutput.additionalContext).toContain("b.ts :: BCount")
    expect((await Effect.runPromise(server.pendingAdviceMetadata())).map(({ path }) => path)).toEqual(["b.ts"])
  })

  it("filters an earlier item that reaches expiry while a later final revalidation waits", async () => {
    const root = await makeGitFixture()
    await put(root, "a.ts", "type ACount = number\n")
    await put(root, "b.ts", "type BCount = number\n")
    const statePath = join(root, "consent")
    const firstObservation = await Effect.runPromise(adaptCodexDirectEvent(addEvent(root, ["a.ts"])))
    const secondObservation = await Effect.runPromise(
      adaptCodexDirectEvent(addEvent(root, ["b.ts"], { tool_use_id: "expiry-b" }))
    )
    expect(firstObservation).toBeDefined()
    expect(secondObservation).toBeDefined()
    if (firstObservation === undefined || secondObservation === undefined) return
    let clock = 0
    let bId = ""
    const blocked = deferred()
    const release = deferred()
    const server = await acquireResidentFixture(residentPaths(join(root, "runtime")), () => clock, {
      reviewControls: reviewControlsLayer({
        beforeFinalRevalidate: (id) =>
          Effect.gen(function* () {
            if (id !== bId) return
            yield* blocked.complete()
            yield* release.wait
          })
      })
    })
    const dispatch = singleFindingDispatch(statePath)
    expect((await Effect.runPromise(server.admit(firstObservation, dispatch))).status).toBe("accepted")
    await Effect.runPromise(server.whenIdle())
    clock = 1
    expect((await Effect.runPromise(server.admit(secondObservation, dispatch))).status).toBe("accepted")
    await Effect.runPromise(server.whenIdle())
    bId = (await Effect.runPromise(server.pendingAdviceMetadata())).find(({ path }) => path === "b.ts")?.id ?? ""
    expect(bId).not.toBe("")

    clock = PENDING_ADVICE_EXPIRY_MS - 1
    const collecting = Effect.runPromise(
      server.collect(root, advicee({ turnId: "expiry", toolUseId: "expiry" }), dispatch)
    )
    await blocked.promise
    clock = PENDING_ADVICE_EXPIRY_MS
    release.resolve()
    const collected = await collecting
    expect(collected.status).toBe("advice")
    if (collected.status !== "advice") return
    expect(collected.output.hookSpecificOutput.additionalContext).not.toContain("a.ts :: ACount")
    expect(collected.output.hookSpecificOutput.additionalContext).toContain("b.ts :: BCount")
    expect((await Effect.runPromise(server.pendingAdviceMetadata())).map(({ path }) => path)).toEqual(["b.ts"])
  })

  it("filters an earlier item superseded while a later final revalidation waits", async () => {
    const root = await makeGitFixture()
    await put(root, "a.ts", "type ACount = number\n")
    await put(root, "b.ts", "type BCount = number\n")
    const statePath = join(root, "consent")
    const observation = await Effect.runPromise(adaptCodexDirectEvent(addEvent(root, ["a.ts", "b.ts"])))
    expect(observation).toBeDefined()
    if (observation === undefined) return
    let bId = ""
    const blocked = deferred()
    const release = deferred()
    const server = await acquireResidentFixture(residentPaths(join(root, "runtime")), () => 100, {
      reviewControls: reviewControlsLayer({
        beforeFinalRevalidate: (id) =>
          Effect.gen(function* () {
            if (id !== bId) return
            yield* blocked.complete()
            yield* release.wait
          })
      })
    })
    const dispatch = singleFindingDispatch(statePath)
    expect((await Effect.runPromise(server.admit(observation, dispatch))).status).toBe("accepted")
    await Effect.runPromise(server.whenIdle())
    const initial = await Effect.runPromise(server.pendingAdviceMetadata())
    const oldAId = initial.find(({ path }) => path === "a.ts")?.id ?? ""
    bId = initial.find(({ path }) => path === "b.ts")?.id ?? ""
    expect(oldAId).not.toBe("")
    expect(bId).not.toBe("")

    const collecting = Effect.runPromise(
      server.collect(root, advicee({ turnId: "replacement", toolUseId: "replacement" }), dispatch)
    )
    await blocked.promise
    await put(root, "a.ts", "type ACount = string\n")
    const replacement = await Effect.runPromise(
      adaptCodexDirectEvent(addEvent(root, ["a.ts"], { tool_use_id: "replacement-a" }))
    )
    expect(replacement).toBeDefined()
    if (replacement === undefined) return
    expect((await Effect.runPromise(server.admit(replacement, dispatch))).status).toBe("accepted")
    await Effect.runPromise(server.whenIdle())
    expect(
      (await Effect.runPromise(server.pendingAdviceMetadata())).some(({ id, path }) => path === "a.ts" && id !== oldAId)
    ).toBe(true)
    expect(Effect.runSync(server.stats()).currentWork).toBe(2)
    release.resolve()

    const collected = await collecting
    expect(collected.status).toBe("advice")
    if (collected.status !== "advice") return
    expect(collected.output.hookSpecificOutput.additionalContext).not.toContain("a.ts :: ACount")
    expect(collected.output.hookSpecificOutput.additionalContext).toContain("b.ts :: BCount")
    expect((await Effect.runPromise(server.pendingAdviceMetadata())).some(({ id }) => id === oldAId)).toBe(false)
    expect(Effect.runSync(server.stats()).currentWork).toBe(2)
  })

  it("does not send part of a later edit after an earlier edit was delivered", async () => {
    const root = await makeGitFixture()
    await put(root, "a.ts", "type ACount = number\n")
    await put(root, "b.ts", "type BCount = number\n")
    await put(root, "c.ts", "type CCount = number\n")
    const statePath = join(root, "consent")
    const firstObservation = await Effect.runPromise(adaptCodexDirectEvent(addEvent(root, ["a.ts"])))
    const secondObservation = await Effect.runPromise(
      adaptCodexDirectEvent(addEvent(root, ["b.ts", "c.ts"], { tool_use_id: "second-cycle" }))
    )
    expect(firstObservation).toBeDefined()
    expect(secondObservation).toBeDefined()
    if (firstObservation === undefined || secondObservation === undefined) return
    let clock = 100
    const cEntered = deferred()
    const releaseC = deferred()
    const bPending = deferred()
    let pendingCount = 0
    const server = await acquireResidentFixture(residentPaths(join(root, "runtime")), () => clock, {
      reviewControls: reviewControlsLayer({
        beforeEvaluate: (prepared) =>
          Effect.gen(function* () {
            if (prepared.input.path !== "c.ts") return
            yield* cEntered.complete()
            yield* releaseC.wait
          }),
        afterAdvicePending: () =>
          Effect.gen(function* () {
            pendingCount += 1
            if (pendingCount === 2) yield* bPending.complete()
          })
      })
    })
    expect((await Effect.runPromise(server.admit(firstObservation, allFindingsDispatch(statePath)))).status).toBe(
      "accepted"
    )
    await Effect.runPromise(server.whenIdle())
    const first = await Effect.runPromise(
      server.collect(root, advicee({ turnId: "cycle-1", toolUseId: "cycle-1" }), allFindingsDispatch(statePath))
    )
    expect(first.status).toBe("advice")
    if (first.status !== "advice") return
    expect((await Effect.runPromise(server.acknowledge(first.token))).status).toBe("acknowledged")
    expect((await Effect.runPromise(server.finalize(first.token))).status).toBe("finalized")
    expect(await Effect.runPromise(server.pendingAdviceMetadata())).toEqual([])

    expect((await Effect.runPromise(server.admit(secondObservation, singleFindingDispatch(statePath)))).status).toBe(
      "accepted"
    )
    await cEntered.promise
    await bPending.promise
    const overlap = await Effect.runPromise(
      server.collect(root, advicee({ turnId: "overlap", toolUseId: "overlap" }), singleFindingDispatch(statePath))
    )
    expect(overlap.status).toBe("empty")
    await expect(
      Effect.runPromise(
        server.collect(root, advicee({ turnId: "too-early", toolUseId: "too-early" }), singleFindingDispatch(statePath))
      )
    ).resolves.toMatchObject({ status: "empty" })

    clock += 50
    const stillWaiting = await Effect.runPromise(
      server.collect(root, advicee({ turnId: "aged", toolUseId: "aged" }), singleFindingDispatch(statePath))
    )
    expect(stillWaiting.status).toBe("empty")
    releaseC.resolve()
    await Effect.runPromise(server.whenIdle())
    const complete = await Effect.runPromise(
      server.collect(root, advicee({ turnId: "complete", toolUseId: "complete" }), singleFindingDispatch(statePath))
    )
    expect(complete.status).toBe("advice")
    if (complete.status === "advice") {
      expect(complete.output.hookSpecificOutput.additionalContext).toContain("b.ts :: BCount")
      expect(complete.output.hookSpecificOutput.additionalContext).toContain("c.ts :: CCount")
    }
  })

  it("holds one edit together despite staggered review completion", async () => {
    const root = await makeGitFixture()
    await put(root, "a.ts", "type ACount = number\n")
    await put(root, "b.ts", "type BCount = number\n")
    await put(root, "c.ts", "type CCount = number\n")
    const statePath = join(root, "consent")
    const observation = await Effect.runPromise(adaptCodexDirectEvent(addEvent(root, ["a.ts", "b.ts", "c.ts"])))
    expect(observation).toBeDefined()
    if (observation === undefined) return
    let clock = 10_000
    const releases = new Map<string, Effect.Effect<void>>()
    const entered: Array<string> = []
    const firstTwoEntered = deferred()
    const allEntered = deferred()
    const firstAdvicePending = deferred()
    const secondAdvicePending = deferred()
    let pending = 0
    const server = await acquireResidentFixture(residentPaths(join(root, "runtime")), () => clock, {
      reviewControls: reviewControlsLayer({
        beforeEvaluate: (prepared) =>
          Effect.gen(function* () {
            const release = yield* Deferred.make<void>()
            entered.push(prepared.input.path)
            releases.set(prepared.input.path, Deferred.succeed(release, undefined).pipe(Effect.asVoid))
            if (entered.length === 2) yield* firstTwoEntered.complete()
            if (entered.length === 3) yield* allEntered.complete()
            yield* Deferred.await(release)
          }),
        afterAdvicePending: () =>
          Effect.gen(function* () {
            pending += 1
            if (pending === 1) yield* firstAdvicePending.complete()
            if (pending === 2) yield* secondAdvicePending.complete()
          })
      })
    })
    const dispatch = findingDispatch(statePath)
    expect((await Effect.runPromise(server.admit(observation, dispatch))).status).toBe("accepted")
    await firstTwoEntered.promise
    Effect.runSync(releases.get("a.ts") ?? Effect.void)
    await firstAdvicePending.promise
    await allEntered.promise
    expect(await Effect.runPromise(server.pendingAdviceMetadata())).toMatchObject([{ path: "a.ts", pendingAt: 10_000 }])

    await expect(
      Effect.runPromise(server.collect(root, advicee({ turnId: "early", toolUseId: "early" }), dispatch))
    ).resolves.toMatchObject({ status: "empty" })
    clock += 49
    await expect(
      Effect.runPromise(server.collect(root, advicee({ turnId: "before", toolUseId: "before" }), dispatch))
    ).resolves.toMatchObject({ status: "empty" })
    Effect.runSync(releases.get("b.ts") ?? Effect.void)
    await secondAdvicePending.promise
    clock += 1
    await expect(
      Effect.runPromise(server.collect(root, advicee({ turnId: "at", toolUseId: "at" }), dispatch))
    ).resolves.toMatchObject({ status: "empty" })
    Effect.runSync(releases.get("c.ts") ?? Effect.void)
    await Effect.runPromise(server.whenIdle())
    const complete = await Effect.runPromise(
      server.collect(root, advicee({ turnId: "complete", toolUseId: "complete" }), dispatch)
    )
    expect(complete.status).toBe("advice")
    if (complete.status === "advice") {
      const text = complete.output.hookSpecificOutput.additionalContext
      for (const path of ["a.ts", "b.ts", "c.ts"]) expect(text).toContain(`${path} ::`)
    }
  })

  it("returns the ready subset and interrupts a suspended review after the checked Stop deadline", async () => {
    const root = await makeGitFixture()
    await put(root, "a.ts", "type ACount = number\n")
    await put(root, "b.ts", "type BCount = number\n")
    const statePath = join(root, "consent")
    const observation = await Effect.runPromise(adaptCodexDirectEvent(addEvent(root, ["a.ts", "b.ts"])))
    expect(observation).toBeDefined()
    if (observation === undefined) return
    const releases = new Map<string, Effect.Effect<void>>()
    const bothEntered = deferred()
    const ready = deferred()
    const cancelled = deferred()
    let entered = 0
    const server = await acquireResidentFixture(residentPaths(join(root, "runtime")), () => 100, {
      reviewControls: reviewControlsLayer({
        beforeEvaluate: (prepared) =>
          Effect.gen(function* () {
            const release = yield* Deferred.make<void>()
            releases.set(prepared.input.path, Deferred.succeed(release, undefined).pipe(Effect.asVoid))
            entered += 1
            if (entered === 2) yield* bothEntered.complete()
            yield* Deferred.await(release).pipe(Effect.onInterrupt(() => cancelled.complete()))
          }),
        afterAdvicePending: () =>
          Effect.gen(function* () {
            yield* ready.complete()
          })
      })
    })
    const dispatch = findingDispatch(statePath)
    expect((await Effect.runPromise(server.admit(observation, dispatch, true))).status).toBe("accepted")
    await bothEntered.promise
    Effect.runSync(releases.get("a.ts") ?? Effect.void)
    await ready.promise
    await expect(
      Effect.runPromise(
        server.collect(root, advicee({ turnId: "turn-end", toolUseId: "turn-end" }), dispatch, "ordinary")
      )
    ).resolves.toMatchObject({ status: "empty" })
    expect(
      (
        await Effect.runPromise(
          server.handle({
            requestRoute: "shared",
            operation: "begin-stop",
            lifetime: server.lifetime,
            root,
            advicee: observation.advicee,
            token: "partial-stop"
          })
        )
      ).status
    ).toBe("advanced")
    const turnEnd = await Effect.runPromise(
      server.handle({
        requestRoute: "shared",
        operation: "collect",
        lifetime: server.lifetime,
        root,
        advicee: observation.advicee,
        dispatch,
        mode: "turn-end",
        composed: true,
        finish: { token: "partial-stop", deadlineReached: true }
      })
    )
    expect(turnEnd.status).toBe("advice")
    await cancelled.promise
    expect(Effect.runSync(server.stats())).toMatchObject({ running: 0, pendingAdvice: 1 })
    if (turnEnd.status === "advice") await Effect.runPromise(server.releaseDelivery(turnEnd.token))
    await Effect.runPromise(server.whenIdle())
  })

  it("combines six deterministic findings when they fit within the byte bound", async () => {
    const root = await makeGitFixture()
    const paths = Array.from({ length: 6 }, (_, index) => `type-${index}.ts`)
    for (const [index, path] of paths.entries()) await put(root, path, `type Count${index} = number\n`)
    const statePath = join(root, "consent")
    const observation = await Effect.runPromise(adaptCodexDirectEvent(addEvent(root, paths)))
    expect(observation).toBeDefined()
    if (observation === undefined) return
    const dispatch = singleFindingDispatch(statePath)
    const server = await acquireResidentFixture(residentPaths(join(root, "runtime")), () => 500)
    expect((await Effect.runPromise(server.admit(observation, dispatch))).status).toBe("accepted")
    await Effect.runPromise(server.whenIdle())

    const first = await Effect.runPromise(
      server.collect(root, advicee({ turnId: "batch-1", toolUseId: "batch-1" }), dispatch)
    )
    expect(first.status).toBe("advice")
    if (first.status !== "advice") return
    expect(encodedHostOutputBytes(first.output)).toBeLessThanOrEqual(MAX_COMBINED_RESPONSE_BYTES)
    for (let index = 0; index < 6; index += 1) {
      expect(first.output.hookSpecificOutput.additionalContext).toContain(`type-${index}.ts :: Count${index}`)
    }
    expect(
      (await Effect.runPromise(server.pendingAdviceMetadata())).filter(({ delivery }) => delivery !== "available")
    ).toHaveLength(6)
    await Effect.runPromise(server.releaseDelivery(first.token))
    expect(
      (await Effect.runPromise(server.pendingAdviceMetadata())).every(({ delivery }) => delivery === "available")
    ).toBe(true)
    const retried = await Effect.runPromise(
      server.collect(root, advicee({ turnId: "batch-retry", toolUseId: "batch-retry" }), dispatch)
    )
    expect(retried.status).toBe("advice")
    if (retried.status !== "advice") return
    expect(retried.output).toEqual(first.output)
    expect((await Effect.runPromise(server.acknowledge(retried.token))).status).toBe("acknowledged")
    expect((await Effect.runPromise(server.finalize(retried.token))).status).toBe("finalized")
    expect(await Effect.runPromise(server.pendingAdviceMetadata())).toEqual([])

    const second = await Effect.runPromise(
      server.collect(root, advicee({ turnId: "batch-2", toolUseId: "batch-2" }), dispatch)
    )
    expect(second.status).toBe("empty")
  })

  it("expires pending advice just before, at, and after the relevance boundary", async () => {
    const run = async (age: number) => {
      const root = await makeGitFixture()
      await put(root, "type.ts", "type OrderCount = number\n")
      const statePath = join(root, "consent")
      const observation = await Effect.runPromise(adaptCodexDirectEvent(addEvent(root)))
      expect(observation).toBeDefined()
      if (observation === undefined) throw new Error("fixture adaptation failed")
      let clock = 1_000
      const server = await acquireResidentFixture(residentPaths(join(root, "runtime")), () => clock)
      const dispatch = findingDispatch(statePath)
      expect((await Effect.runPromise(server.admit(observation, dispatch))).status).toBe("accepted")
      await Effect.runPromise(server.whenIdle())
      clock += age
      const collected = await Effect.runPromise(
        server.collect(root, advicee({ turnId: `age-${age}`, toolUseId: `age-${age}` }), dispatch)
      )
      return { collected, server }
    }

    const before = await run(PENDING_ADVICE_EXPIRY_MS - 1)
    expect(before.collected.status).toBe("advice")
    const at = await run(PENDING_ADVICE_EXPIRY_MS)
    expect(at.collected.status).toBe("empty")
    expect(Effect.runSync(at.server.stats())).toMatchObject({
      pendingAdvice: 0,
      retainedBytes: (await Effect.runPromise(at.server.accountingMetrics())).successfulCacheBytes
    })
    const after = await run(PENDING_ADVICE_EXPIRY_MS + 1)
    expect(after.collected.status).toBe("empty")
    expect(Effect.runSync(after.server.stats())).toMatchObject({
      pendingAdvice: 0,
      retainedBytes: (await Effect.runPromise(after.server.accountingMetrics())).successfulCacheBytes
    })
  })
})

describe("Effect dispatch ownership", () => {
  it.each(["authorized", "credentialResolved"] as const)(
    "releases charged work when the %s control fails",
    async (phase) => {
      const root = await makeGitFixture()
      await put(root, "a.ts", "type OrderCount = number\n")
      const observation = await Effect.runPromise(adaptCodexDirectEvent(addEvent(root, ["a.ts"])))
      if (observation === undefined) throw new Error("missing fixture observation")
      const capturePath = join(root, "provider-calls")
      const server = await acquireResidentFixture(residentPaths(join(root, "runtime")), undefined, {
        dispatchControls: Layer.succeed(
          ResidentDispatchControls,
          ResidentDispatchControls.of({
            atBoundary: Effect.fn("DispatchFailureFixture.atBoundary")(function* (boundary) {
              if (boundary === phase) yield* Effect.fail(new DispatchControlError({ phase }))
            })
          })
        )
      })
      try {
        expect(
          (
            await Effect.runPromise(
              server.admit(observation, {
                ...findingDispatch(join(root, "consent")),
                controlled: { ...findingDispatch(join(root, "consent")).controlled, capturePath }
              })
            )
          ).status
        ).toBe("accepted")
        await Effect.runPromise(server.whenIdle())
        expect(existsSync(capturePath)).toBe(false)
        expect(Effect.runSync(server.stats())).toMatchObject({
          queued: 0,
          running: 0,
          retainedBytes: 0,
          pendingEvaluations: 0
        })
      } finally {
        await Effect.runPromise(server.close)
      }
    }
  )

  it.each(["authorized", "credentialResolved"] as const)(
    "closes a held %s boundary without an external release",
    async (phase) => {
      const root = await makeGitFixture()
      await put(root, "a.ts", "type OrderCount = number\n")
      const observation = await Effect.runPromise(adaptCodexDirectEvent(addEvent(root, ["a.ts"])))
      if (observation === undefined) throw new Error("missing fixture observation")
      const controls = await Effect.runPromise(makeDispatchControls())
      await Effect.runPromise(controls.holdNext(phase))
      const server = await acquireResidentFixture(residentPaths(join(root, "runtime")), undefined, {
        dispatchControls: controls.layer
      })
      let deadline: ReturnType<typeof setTimeout> | undefined
      try {
        expect(
          (await Effect.runPromise(server.admit(observation, findingDispatch(join(root, "consent"))))).status
        ).toBe("accepted")
        expect(await Effect.runPromise(controls.entered)).toBe(phase)
        await Promise.race([
          Effect.runPromise(server.close),
          new Promise<never>((_, reject) => {
            deadline = setTimeout(() => reject(new Error("resident did not cancel its held dispatch")), 2_000)
          })
        ])
        await Effect.runPromise(controls.retired)
        expect(Effect.runSync(server.stats())).toMatchObject({
          queued: 0,
          running: 0,
          retainedBytes: 0,
          pendingEvaluations: 0
        })
      } finally {
        clearTimeout(deadline)
        await Effect.runPromise(controls.release)
        await Effect.runPromise(server.close)
      }
    }
  )
})

describe("Effect preparation ownership", () => {
  it.each(["owner", "prepared"] as const)(
    "closes a held %s barrier without an external gate release",
    async (phase) => {
      const root = await makeGitFixture()
      await put(root, "a.ts", "type OrderCount = number\n")
      const observation = await Effect.runPromise(adaptCodexDirectEvent(addEvent(root, ["a.ts"])))
      if (observation === undefined) throw new Error("missing fixture observation")
      const controls = await Effect.runPromise(makePreparationControls())
      await Effect.runPromise(phase === "owner" ? controls.holdNextOwner : controls.holdNextPreparation)
      const server = await acquireResidentFixture(residentPaths(join(root, "runtime")), undefined, {
        preparationControls: controls.layer
      })
      let deadline: ReturnType<typeof setTimeout> | undefined
      try {
        expect(
          (await Effect.runPromise(server.admit(observation, findingDispatch(join(root, "consent"))))).status
        ).toBe("accepted")
        await Effect.runPromise(
          phase === "owner" ? controls.ownerEntered : controls.nextPreparation.pipe(Effect.asVoid)
        )
        // Bound failure cleanup without releasing the gate on the success path.
        await Promise.race([
          Effect.runPromise(server.close),
          new Promise<never>((_, reject) => {
            deadline = setTimeout(() => reject(new Error("resident did not cancel its held preparation")), 2_000)
          })
        ])
        await Effect.runPromise(controls.retired)
        expect(Effect.runSync(server.stats())).toMatchObject({
          queued: 0,
          running: 0,
          retainedBytes: 0,
          pendingEvaluations: 0
        })
      } finally {
        clearTimeout(deadline)
        await Effect.runPromise(controls.releaseOwner.pipe(Effect.andThen(controls.releasePreparation)))
        await Effect.runPromise(server.close)
      }
    }
  )

  it("releases preparation workspace and reuse claims after a claim barrier fails", async () => {
    const root = await makeGitFixture()
    await put(root, "a.ts", "type OrderCount = number\n")
    const observation = await Effect.runPromise(adaptCodexDirectEvent(addEvent(root, ["a.ts"])))
    if (observation === undefined) throw new Error("missing fixture observation")
    const server = await acquireResidentFixture(residentPaths(join(root, "runtime")), undefined, {
      preparationControls: Layer.succeed(
        ResidentPreparationControls,
        ResidentPreparationControls.of({
          ...defaultPreparationControls,
          afterReuseBoundary: Effect.fn("PreparationFailureFixture.afterReuseBoundary")((phase) =>
            Effect.fail(new PreparationControlError({ phase }))
          )
        })
      )
    })
    try {
      expect((await Effect.runPromise(server.admit(observation, findingDispatch(join(root, "consent"))))).status).toBe(
        "accepted"
      )
      await Effect.runPromise(server.whenIdle())
      expect(Effect.runSync(server.stats()).retainedBytes).toBe(0)
      expect(Effect.runSync(server.stats()).pendingEvaluations).toBe(0)
      expect(Effect.runSync(server.stats()).currentWork).toBe(0)
    } finally {
      await Effect.runPromise(server.close)
    }
  })

  it("releases charged capture workspace when resident shutdown interrupts capture", async () => {
    const root = await makeGitFixture()
    await put(root, "a.ts", "type OrderCount = number\n")
    const observation = await Effect.runPromise(adaptCodexDirectEvent(addEvent(root, ["a.ts"])))
    if (observation === undefined) throw new Error("missing fixture observation")
    const entered = Deferred.makeUnsafe<void>()
    const server = await acquireResidentFixture(residentPaths(join(root, "runtime")), undefined, {
      captureSource: () => Deferred.succeed(entered, undefined).pipe(Effect.andThen(Effect.never))
    })
    expect((await Effect.runPromise(server.admit(observation, findingDispatch(join(root, "consent"))))).status).toBe(
      "accepted"
    )
    await Effect.runPromise(Deferred.await(entered))
    expect(Effect.runSync(server.stats()).retainedBytes).toBeGreaterThan(0)
    await Effect.runPromise(server.close)
    expect(Effect.runSync(server.stats()).retainedBytes).toBe(0)
    expect(Effect.runSync(server.stats()).pendingEvaluations).toBe(0)
  })
})
