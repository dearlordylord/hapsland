import { it } from "@effect/vitest"
import { afterEach, describe, expect } from "vitest"
import { Effect } from "effect"
import * as TestClock from "effect/testing/TestClock"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { makeResidentState } from "@hapsland/resident-runtime/resident/capacity"
import {
  DEFAULT_EDIT_PERMIT_LIMITS,
  DEFAULT_VIRTUAL_ROUND_QUIET_MS
} from "@hapsland/runtime-inputs/configuration/types"
import { makeReviewSettings, settingsSource } from "@hapsland/review-definition/runtime/review-settings"

const directories: string[] = []
afterEach(async () => {
  await Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true, force: true })))
})
const rule = (message: string) =>
  JSON.stringify({
    version: 1,
    id: "domain",
    question: "Is the domain value a bare primitive?",
    criteria: { false: "No", true: "Yes" },
    threshold: 0.7,
    message,
    inputs: [{ languages: ["typescript"], kind: "type", requires: ["root-declaration"] }]
  })
const fixture = Effect.promise(async () => {
  const root = await mkdtemp(join(tmpdir(), "hapsland-settings-"))
  directories.push(root)
  const user = join(root, "user.jsonc")
  const project = join(root, ".hapsland.jsonc")
  const rulePath = join(root, "rule.jsonc")
  await writeFile(user, JSON.stringify({ version: 1, claudeFeedbackMode: "block-current-findings" }))
  await writeFile(project, JSON.stringify({ version: 1, rules: [{ path: "rule.jsonc" }] }))
  await writeFile(rulePath, rule("original"))
  return { root, user, project, rulePath, source: settingsSource(root, user) }
})

describe("edit settings cache", () => {
  it.effect("shares compiled snapshots, expires five seconds after loading, and hits do not extend TTL", () =>
    Effect.gen(function* () {
      const f = yield* fixture
      const settings = yield* makeReviewSettings()
      const original = yield* settings.capture(f.source)
      yield* TestClock.adjust("4 seconds")
      yield* Effect.promise(() => writeFile(f.rulePath, rule("updated")))
      yield* Effect.promise(() => writeFile(f.user, JSON.stringify({ version: 1, claudeFeedbackMode: "advisory" })))
      const hit = yield* settings.capture(settingsSource(join(f.root, "."), f.user))
      expect(hit).toBe(original)
      expect(hit.rules[0]?.message).toBe("original")
      expect(hit.rules[0]?.decision).toBe(original.rules[0]?.decision)
      yield* TestClock.adjust("1 second")
      const updated = yield* settings.capture(f.source)
      expect(updated).not.toBe(original)
      expect(updated.rules[0]?.message).toBe("updated")
      expect(updated.configuration.policy.claudeFeedbackMode.value).toBe("advisory")
      expect(original.rules[0]?.message).toBe("original")
      expect(original.configuration.policy.claudeFeedbackMode.value).toBe("block-current-findings")
      expect(Object.isFrozen(original)).toBe(true)
      expect(Object.isFrozen(original.rules)).toBe(true)
      expect(Object.isFrozen(original.rules[0]?.decision)).toBe(true)
      expect(Object.isFrozen(original.configuration.policy.layers)).toBe(true)
    })
  )

  it.effect("deduplicates concurrent loads and keys by project and actual user configuration path", () =>
    Effect.gen(function* () {
      const f = yield* fixture
      const settings = yield* makeReviewSettings()
      const snapshots = yield* Effect.forEach(
        Array.from({ length: 12 }),
        () => settings.capture(settingsSource(f.root, f.user)),
        { concurrency: "unbounded" }
      )
      expect(snapshots.every((snapshot) => snapshot === snapshots[0])).toBe(true)
      const otherUser = join(f.root, "other-user.jsonc")
      yield* Effect.promise(() => writeFile(otherUser, JSON.stringify({ version: 1, claudeFeedbackMode: "advisory" })))
      const other = yield* settings.capture(settingsSource(f.root, otherUser))
      expect(other).not.toBe(snapshots[0])
      expect(other.configuration.policy.claudeFeedbackMode.value).toBe("advisory")
      const otherProject = yield* fixture
      expect(yield* settings.capture(otherProject.source)).not.toBe(snapshots[0])
    })
  )

  it.effect("fails an expired snapshot with invalid rules and retries immediately after repair", () =>
    Effect.gen(function* () {
      const f = yield* fixture
      const settings = yield* makeReviewSettings()
      const original = yield* settings.capture(f.source)
      yield* Effect.promise(() => writeFile(f.rulePath, "{"))
      expect(yield* settings.capture(f.source)).toBe(original)
      yield* TestClock.adjust("5 seconds")
      expect((yield* Effect.exit(settings.capture(f.source)))._tag).toBe("Failure")
      yield* Effect.promise(() => writeFile(f.rulePath, rule("repaired")))
      expect((yield* settings.capture(f.source)).rules[0]?.message).toBe("repaired")
      yield* TestClock.adjust("5 seconds")
      yield* Effect.promise(() => writeFile(f.project, "{"))
      expect((yield* Effect.exit(settings.capture(f.source)))._tag).toBe("Failure")
      yield* Effect.promise(() => writeFile(f.project, JSON.stringify({ version: 1, rules: [] })))
      expect((yield* settings.capture(f.source)).rules).toEqual([])
    })
  )
  it.effect("preserves the first permit snapshot across cache expiry and duplicate registration", () =>
    Effect.gen(function* () {
      const f = yield* fixture
      const settings = yield* makeReviewSettings()
      const owner = yield* makeResidentState()
      const delivery = owner.delivery()
      const original = yield* settings.capture(f.source)
      expect(
        yield* delivery.registerEditDecision(
          "agent",
          "edit",
          100,
          110,
          DEFAULT_EDIT_PERMIT_LIMITS,
          DEFAULT_VIRTUAL_ROUND_QUIET_MS,
          original
        )
      ).toEqual({ accepted: true })
      yield* TestClock.adjust("5 seconds")
      yield* Effect.promise(() => writeFile(f.rulePath, rule("updated")))
      const updated = yield* settings.capture(f.source)
      expect(updated).not.toBe(original)
      expect(
        yield* delivery.registerEditDecision(
          "agent",
          "edit",
          120,
          130,
          DEFAULT_EDIT_PERMIT_LIMITS,
          DEFAULT_VIRTUAL_ROUND_QUIET_MS,
          updated
        )
      ).toEqual({ accepted: true })
      const admission = yield* delivery.admitEdit("agent", "edit", 140, true)
      expect(admission?.settings).toBe(original)
      expect(admission?.settings?.rules[0]?.message).toBe("original")
      expect(yield* delivery.registeredEditSettings("agent", "edit")).toBeUndefined()
    })
  )
})
