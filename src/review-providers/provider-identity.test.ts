import { describe, expect, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Deferred from "effect/Deferred"
import * as Fiber from "effect/Fiber"
import * as Schema from "effect/Schema"
import owner from "@hapsland/agent-flow-bend/canonical-resolver-owner"
import type { Step } from "@hapsland/agent-flow-bend/canonical-resolver-owner"
import { ownerList } from "@hapsland/canonical-policy/canonical/child-execution"
import { REVIEW_PROVIDERS, ReviewBackendSettings } from "@hapsland/runtime-environment/runtime/backend"
import { createNativeSessionRegistry } from "@hapsland/runtime-environment/runtime/native-session-registry"
import { nativeProviderIdentity as providerIdentity } from "@hapsland/review-definition/testing/native-provider-identity"
import {
  createProviderIdentityForVerification,
  resolveProviderIdentity,
  type ProviderIdentitySession
} from "@hapsland/review-definition/testing/provider-identity"

const traceOwner = (source: typeof owner) => {
  const steps: Step[] = []
  const record = (step: Step) => {
    steps.push(step)
    return step
  }
  return {
    steps,
    owner: {
      ...source,
      launch_settings: (...args: Parameters<typeof source.launch_settings>) => record(source.launch_settings(...args)),
      provider_completed: (...args: Parameters<typeof source.provider_completed>) =>
        record(source.provider_completed(...args)),
      terminal: (...args: Parameters<typeof source.terminal>) => record(source.terminal(...args)),
      cancel: (...args: Parameters<typeof source.cancel>) => record(source.cancel(...args))
    }
  }
}
const actions = (steps: readonly Step[]) =>
  steps.flatMap((step) => (step.$ === "Advanced" ? ownerList(step.actions) : []))
describe("compiled provider identity through Canonical settings custody", () => {
  it.effect("does not issue an invocation when input construction fails", () =>
    Effect.gen(function* () {
      const original = new Error("selection getter")
      const trace = traceOwner(owner)
      const resolve = createProviderIdentityForVerification({ owner: trace.owner, encodeComponent: encodeURIComponent })
      const selection = {
        get provider(): "jev" {
          throw original
        }
      }
      const exit = yield* Effect.exit(resolve(selection))
      expect(trace.steps).toEqual([])
      expect(exit._tag).toBe("Failure")
      if (exit._tag === "Failure") {
        expect(exit.cause.reasons).toHaveLength(1)
        expect(exit.cause.reasons[0]).toMatchObject({ _tag: "Die", defect: original })
      }
    })
  )
  it.effect("matches native identity for every declared provider/model", () =>
    Effect.gen(function* () {
      for (const provider of Object.values(REVIEW_PROVIDERS))
        for (const model of Object.keys(provider.models)) {
          const selection = Schema.decodeUnknownSync(ReviewBackendSettings)({
            provider: provider.id,
            model,
            accountId: "a".repeat(32)
          })
          expect(yield* resolveProviderIdentity(selection)).toEqual(providerIdentity(selection))
        }
      expect(yield* resolveProviderIdentity({ provider: "jev" })).toEqual(providerIdentity({ provider: "jev" }))
    })
  )
  it.effect("is lazy and accepts exactly once without observation or PostPreparation", () =>
    Effect.gen(function* () {
      const trace = traceOwner(owner)
      let calls = 0
      const resolve = createProviderIdentityForVerification({
        owner: trace.owner,
        encodeComponent: (value) => {
          calls++
          return encodeURIComponent(value)
        }
      })
      const effect = resolve({ provider: "cloudflare", model: "clef", accountId: "a".repeat(32) })
      expect(trace.steps).toEqual([])
      expect(calls).toBe(0)
      yield* effect
      const emitted = actions(trace.steps)
      expect(emitted.filter((action) => action.$ === "AcceptResult")).toHaveLength(1)
      expect(emitted.some((action) => action.$ === "LaunchPostPreparation")).toBe(false)
      expect(trace.steps.every((step) => step.$ === "Advanced" && ownerList(step.outputs).length === 0)).toBe(true)
      expect(calls).toBeGreaterThan(0)
    })
  )
  it.effect("preserves the exact URI engine defect once across terminal acceptance and close", () =>
    Effect.gen(function* () {
      const original = new URIError("engine identity")
      const resolve = createProviderIdentityForVerification({
        encodeComponent: () => {
          throw original
        }
      })
      const exit = yield* Effect.exit(resolve({ provider: "cloudflare", model: "clef", accountId: "a".repeat(32) }))
      expect(exit._tag).toBe("Failure")
      if (exit._tag === "Failure") {
        expect(exit.cause.reasons).toHaveLength(1)
        expect(exit.cause.reasons[0]).toMatchObject({ _tag: "Die", defect: original })
      }
    })
  )
  it.effect("cancels pending encoding, joins its late completion and never accepts it", () =>
    Effect.gen(function* () {
      const entered = yield* Deferred.make<void>()
      const aborted = yield* Deferred.make<void>()
      const trace = traceOwner(owner)
      let calls = 0
      const resolve = createProviderIdentityForVerification({
        owner: trace.owner,
        encodeComponent: (value, signal) =>
          new Promise<string>((complete) => {
            calls++
            if (!signal) throw new Error("Missing owned encoding signal")
            signal.addEventListener(
              "abort",
              () => {
                Effect.runSync(Deferred.succeed(aborted, undefined))
                complete(encodeURIComponent(value))
              },
              { once: true }
            )
            Effect.runSync(Deferred.succeed(entered, undefined))
          })
      })
      const fiber = yield* resolve({ provider: "cloudflare", model: "clef", accountId: "a".repeat(32) }).pipe(
        Effect.forkChild
      )
      yield* Deferred.await(entered)
      yield* Fiber.interrupt(fiber)
      yield* Deferred.await(aborted)
      const exit = yield* Fiber.await(fiber)
      expect(exit._tag).toBe("Failure")
      if (exit._tag === "Failure") expect(exit.cause.reasons.every((reason) => reason._tag === "Interrupt")).toBe(true)
      const emitted = actions(trace.steps)
      expect(emitted.filter((action) => action.$ === "AcceptResult")).toHaveLength(0)
      expect(emitted.filter((action) => action.$ === "Resume")).toHaveLength(0)
      expect(emitted.filter((action) => action.$ === "CleanupProvider")).toHaveLength(1)
      expect(calls).toBe(1)
    })
  )
  it.effect("fences a late engine rejection after interruption and settles custody", () =>
    Effect.gen(function* () {
      const entered = yield* Deferred.make<void>()
      const original = new Error("late encoder")
      const trace = traceOwner(owner)
      const resolve = createProviderIdentityForVerification({
        owner: trace.owner,
        encodeComponent: (_value, signal) =>
          new Promise<string>((_complete, fail) => {
            if (!signal) throw new Error("Missing owned encoding signal")
            signal.addEventListener("abort", () => fail(original), { once: true })
            Effect.runSync(Deferred.succeed(entered, undefined))
          })
      })
      const fiber = yield* resolve({ provider: "cloudflare", model: "clef", accountId: "a".repeat(32) }).pipe(
        Effect.forkChild
      )
      yield* Deferred.await(entered)
      yield* Fiber.interrupt(fiber)
      const exit = yield* Fiber.await(fiber)
      expect(exit._tag).toBe("Failure")
      if (exit._tag === "Failure") {
        expect(exit.cause.reasons.some((reason) => reason._tag === "Interrupt")).toBe(true)
        expect(exit.cause.reasons.every((reason) => reason._tag === "Interrupt")).toBe(true)
      }
      const emitted = actions(trace.steps)
      expect(emitted.some((action) => action.$ === "AcceptResult" || action.$ === "Resume")).toBe(false)
      expect(emitted.filter((action) => action.$ === "CleanupProvider")).toHaveLength(1)
    })
  )
  it.effect("retains the cleanup defect with interruption after late completion", () =>
    Effect.gen(function* () {
      const entered = yield* Deferred.make<void>()
      const original = new Error("encoding cleanup")
      let cleanupAttempts = 0
      const trace = traceOwner(owner)
      const resolve = createProviderIdentityForVerification({
        owner: trace.owner,
        createRegistry: () => {
          const registry = createNativeSessionRegistry<ProviderIdentitySession>()
          return {
            ...registry,
            async retryCleanup() {
              cleanupAttempts++
              await registry.retryCleanup()
              throw original
            }
          }
        },
        encodeComponent: (value, signal) =>
          new Promise<string>((complete) => {
            if (!signal) throw new Error("Missing owned encoding signal")
            signal.addEventListener("abort", () => complete(encodeURIComponent(value)), { once: true })
            Effect.runSync(Deferred.succeed(entered, undefined))
          })
      })
      const fiber = yield* resolve({ provider: "cloudflare", model: "clef", accountId: "a".repeat(32) }).pipe(
        Effect.forkChild
      )
      yield* Deferred.await(entered)
      yield* Fiber.interrupt(fiber)
      const exit = yield* Fiber.await(fiber)
      expect(exit._tag).toBe("Failure")
      if (exit._tag === "Failure") {
        expect(exit.cause.reasons.some((reason) => reason._tag === "Interrupt")).toBe(true)
        expect(exit.cause.reasons.filter((reason) => reason._tag === "Die" && reason.defect === original)).toHaveLength(
          1
        )
      }
      expect(cleanupAttempts).toBe(1)
      expect(actions(trace.steps).some((action) => action.$ === "AcceptResult" || action.$ === "Resume")).toBe(false)
    })
  )
})
