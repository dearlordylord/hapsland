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
const deferred = () => {
  let resolve
  const promise = new Promise((done) => {
    resolve = done
  })
  return { promise, resolve }
}
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
const turn = () => new Promise((resolve) => setImmediate(resolve))
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
  writeFileSync(join(root, "root.ts"), "import type { A } from './a'; export interface Root { a: A }")
  writeFileSync(join(root, "a.ts"), "export interface A {}")
  const { rootIdentity } = await Effect.runPromise(discoverPhysicalWorkingTreeRoot(root))
  const selected = await Effect.runPromise(eligibleNamedPath(root, "root.ts", DEFAULT_DIRECT_FILE_POLICY, rootIdentity))
  assert.ok(selected)
  const captured = await Effect.runPromise(captureStable(root, selected, {}, rootIdentity))
  assert.equal(captured.status, "captured")
  const observations = []
  for (const point of ["between-reads", "first-descriptor-pass"]) {
    for (let repetition = 0; repetition < 3; repetition++) {
      {
        const mode = "canonical"
        const events = [],
          cache = new Map(),
          controller = new AbortController(),
          started = deferred(),
          finalized = deferred(),
          late = deferred()
        let first = true,
          descriptorObserved = []
        assert.deepEqual(rootDescriptors(root), [], mode + " before invocation descriptors")
        const hooks = {
          sourceRead(path) {
            events.push(["source-read", path])
            if (point === "first-descriptor-pass" && first) {
              first = false
              descriptorObserved = rootDescriptors(root)
              assert.ok(descriptorObserved.length >= 3, "actual root/git/source descriptors during read")
              events.push(["abort"])
              controller.abort()
              started.resolve()
            }
          },
          betweenReads: () =>
            Effect.ensuring(
              Effect.promise((signal) => {
                events.push(["between-reads"])
                assert.equal(signal.aborted, false)
                started.resolve()
                return late.promise.then(() => {
                  events.push(["late-hook-completion"])
                })
              }),
              Effect.sync(() => events.push(["hook-finalized"]))
            )
        }
        const context = {
          root,
          rootIdentity,
          policy: DEFAULT_DIRECT_FILE_POLICY,
          branch: "type",
          captureCache: cache,
          now: () => {
            events.push(["clock"])
            return 0
          },
          captureHooks: hooks,
          captureSource: (...args) =>
            Effect.ensuring(
              captureStable(...args),
              Effect.sync(() => {
                events.push(["capture-finalized"])
                finalized.resolve()
              })
            ),
          observeCaptureDiagnostic: (...args) => events.push(["diagnostic", ...args])
        }
        const candidate = bend
        const pending = Effect.runPromiseExit(candidate("root.ts", captured.capture, "Root", context), {
          signal: controller.signal
        })
        await bounded(
          Promise.race([
            started.promise,
            pending.then((exit) => {
              throw new Error(mode + " terminated before cancellation point: " + JSON.stringify(exit))
            })
          ]),
          mode + " started"
        )
        if (point === "between-reads") {
          assert.deepEqual(rootDescriptors(root), [], mode + " first pass descriptors closed before hook")
          events.push(["abort"])
          controller.abort()
        }
        const exit = await bounded(pending, mode + " interrupted")
        assert.ok(Exit.hasInterrupts(exit), mode + " original outer Effect interruption")
        await bounded(finalized.promise, mode + " actual capture finalizer")
        await turn()
        assert.deepEqual(rootDescriptors(root), [], mode + " after cleanup descriptors")
        assert.equal(events.filter((event) => event[0] === "capture-finalized").length, 1)
        assert.equal(
          events.filter((event) => event[0] === "source-read").length,
          1,
          "second descriptor pass must not begin after cancellation"
        )
        assert.equal(
          events.filter((event) => event[0] === "diagnostic").length,
          0,
          "interruption is not capture refusal"
        )
        assert.deepEqual(
          events,
          [
            ...Array.from({ length: 6 }, () => ["clock"]),
            ["source-read", "a.ts"],
            ...(point === "between-reads" ? [["between-reads"]] : []),
            ["abort"],
            ...(point === "between-reads" ? [["hook-finalized"]] : []),
            ["capture-finalized"]
          ],
          "authored ordered cancellation prefix"
        )
        const prefix = events.slice(),
          cachePrefix = [...cache]
        late.resolve()
        await turn()
        await turn()
        assert.deepEqual(
          events,
          point === "between-reads" ? [...prefix, ["late-hook-completion"]] : prefix,
          "no late resolver continuation or second read"
        )
        assert.deepEqual([...cache], cachePrefix)
        assert.deepEqual(cachePrefix, [], "interrupted capture not published")
        assert.deepEqual(rootDescriptors(root), [])
        observations.push({
          mode,
          point,
          repetition,
          prefix,
          afterLate: events.slice(),
          cache: cachePrefix,
          descriptorsDuringRead: descriptorObserved.length,
          interrupted: true,
          actualCaptureFinalizedOnce: true,
          registryEmpty: true,
          rootDescriptorsAfter: 0
        })
      }
    }
  }
  const providerDefectObservations = []
  const defect = new Error("injected capture defect", { cause: new Error("injected underlying cause") })
  {
    const mode = "canonical"
    const events = [],
      cache = new Map(),
      context = {
        root,
        rootIdentity,
        policy: DEFAULT_DIRECT_FILE_POLICY,
        branch: "type",
        captureCache: cache,
        now: () => {
          events.push("clock")
          return 0
        },
        captureSource: () =>
          Effect.ensuring(
            Effect.sync(() => {
              events.push("capture")
              throw defect
            }),
            Effect.sync(() => events.push("capture-finalized"))
          )
      }
    const candidate = bend
    const exit = await bounded(
      Effect.runPromiseExit(candidate("root.ts", captured.capture, "Root", context)),
      mode + " capture defect"
    )
    assert.ok(Exit.isFailure(exit))
    assert.equal(Cause.squash(exit.cause), defect)
    assert.equal(Cause.squash(exit.cause).cause, defect.cause)
    assert.deepEqual(
      exit.cause.reasons.map((reason) => ({ kind: reason._tag, defect: reason.defect })),
      [{ kind: "Die", defect }]
    )
    assert.deepEqual([...cache], [])
    assert.deepEqual(rootDescriptors(root), [])
    providerDefectObservations.push({
      mode,
      events,
      originalErrorIdentity: true,
      originalUnderlyingCauseIdentity: true,
      causeKind: "Die",
      registryEmpty: true
    })
  }
  assert.deepEqual(providerDefectObservations[0].events, [...Array(6).fill("clock"), "capture", "capture-finalized"])
  const record = {
    binding: "canonical-owned-effect",
    passed: true,
    cases: observations.length + providerDefectObservations.length,
    at: new Date().toISOString(),
    runtime: typeof Bun === "undefined" ? "node" : "bun",
    observations,
    providerDefectObservations,
    scope:
      "Actual Linux stable descriptor capture through the production Canonical Graph binding. Three repetitions of each interruption point; exact ordered clock/read/hook/finalizer/cache prefixes, outer interruption, no late continuation/publication, actual root/git/source descriptors observed during first pass and absent after cleanup. No universal cancellation, buffer-erasure instrumentation, other descriptors/platforms or performance parity claim."
  }
  const evidenceDirectory = join(import.meta.dirname, "../../../../../../.test-runs/bend-migration")
  mkdirSync(evidenceDirectory, { recursive: true })
  writeFileSync(
    join(evidenceDirectory, "stable-capture-cancellation-" + record.runtime + "-evidence.json"),
    JSON.stringify(record, null, 2) + "\n"
  )
  console.log(JSON.stringify(record))
} finally {
  rmSync(temporary, { recursive: true, force: true })
}
