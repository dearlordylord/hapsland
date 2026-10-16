import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { mkdirSync, mkdtempSync, writeFileSync, rmSync, readdirSync, readlinkSync } from "node:fs"
import { join } from "node:path"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Cause from "effect/Cause"
import { resolveCanonicalGraphFixture as bend } from "@hapsland/source-analysis/testing/canonical-graph"
import { captureStable } from "@hapsland/native-observation/direct-event/capture"
import { discoverPhysicalWorkingTreeRoot } from "@hapsland/native-observation/repository/root"
import { eligibleNamedPath, DEFAULT_DIRECT_FILE_POLICY } from "@hapsland/native-observation/direct-event/selection"
assert.equal(process.platform, "linux", "descriptor observations are Linux qualification only")
const temporary = mkdtempSync("/tmp/hapsland-stable-cancellation-")
const bounded = (promise, label) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(label + " deadline")), 5000)
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (error) => {
        clearTimeout(timer)
        reject(error)
      }
    )
  })
function rootDescriptors(root) {
  return readdirSync("/proc/self/fd").flatMap((fd) => {
    try {
      const target = readlinkSync("/proc/self/fd/" + fd)
      return target === root || target.startsWith(root + "/") ? [{ fd, target }] : []
    } catch {
      return []
    }
  })
}
try {
  const root = join(temporary, "repository")
  execFileSync("git", ["init", "-q", root])
  writeFileSync(join(root, "root.py"), "class Root:\n    value: str")
  writeFileSync(join(root, "a.ts"), "export interface A {}")
  const { rootIdentity } = await Effect.runPromise(discoverPhysicalWorkingTreeRoot(root))
  const selected = await Effect.runPromise(eligibleNamedPath(root, "root.py", DEFAULT_DIRECT_FILE_POLICY, rootIdentity))
  assert.ok(selected)
  const captured = await Effect.runPromise(captureStable(root, selected, {}, rootIdentity))
  assert.equal(captured.status, "captured")
  const observations = []
  for (const [point, throwAt, limits] of [
    ["start", 0, undefined],
    ["preparation", 1, undefined],
    ["root", 2, undefined],
    ["preparation-before-empty-budget", 1, { files: 0 }]
  ]) {
    const defect = new Error("injected " + point + " clock defect", { cause: new Error("underlying clock defect") })
    {
      const mode = "canonical"
      const events = [],
        cache = new Map()
      let tick = 0
      const context = {
        root,
        rootIdentity,
        policy: DEFAULT_DIRECT_FILE_POLICY,
        branch: "type",
        captureCache: cache,
        limits,
        now: () => {
          const current = tick++
          events.push(["clock", current])
          if (current === throwAt) throw defect
          return 0
        },
        captureSource: () => {
          throw new Error("clock failure must precede capture")
        }
      }
      const candidate = bend
      const exit = await bounded(
        Effect.runPromiseExit(candidate("root.py", captured.capture, "Root", context)),
        mode + " " + point + " clock failure"
      )
      assert.ok(Exit.isFailure(exit))
      assert.equal(Cause.squash(exit.cause), defect)
      assert.equal(Cause.squash(exit.cause).cause, defect.cause)
      assert.deepEqual(
        exit.cause.reasons.map((reason) => ({ kind: reason._tag, defect: reason.defect })),
        [{ kind: "Die", defect }]
      )
      assert.deepEqual(
        events,
        Array.from({ length: throwAt + 1 }, (_, index) => ["clock", index])
      )
      // The binding asserts complete Canonical/registry cleanup on every exit.
      // Python preparation inserts the root after its first clock read. A later
      // root-admission failure retains that exact capture in the caller cache.
      assert.deepEqual([...cache.keys()], point === "root" ? ["root.py"] : [])
      if (point === "root") assert.equal(cache.get("root.py"), captured.capture)
      assert.deepEqual(rootDescriptors(root), [])
      observations.push({
        mode,
        point,
        events,
        originalErrorIdentity: true,
        originalUnderlyingCauseIdentity: true,
        causeKind: "Die",
        registryEmpty: true
      })
    }
  }
  const record = {
    passed: true,
    cases: observations.length,
    at: new Date().toISOString(),
    runtime: typeof Bun === "undefined" ? "node" : "bun",
    observations,
    scope:
      "Actual Canonical-owned Python Effect resolver: start/preparation/root clock defects, including preparation before zero-file admission; exact clock prefix and original error/cause identity; exact root cache retention, empty registry and no repository descriptors. No whole proof or performance claim."
  }
  const evidenceDirectory = join(import.meta.dirname, "../../../../../../../.test-runs/bend-migration")
  mkdirSync(evidenceDirectory, { recursive: true })
  writeFileSync(
    join(evidenceDirectory, "python-clock-failure-" + record.runtime + "-evidence.json"),
    JSON.stringify(record, null, 2) + "\n"
  )
  console.log(JSON.stringify(record))
} finally {
  rmSync(temporary, { recursive: true, force: true })
}
