import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs"
import { join } from "node:path"
import * as Effect from "effect/Effect"
import { projectImportGraph } from "@hapsland/canonical-policy/canonical/graph-adapter"
import { resolveGraphUnit } from "../../../dist/direct-event/graph-resolution/verification/native-graph-resolver.js"
import { DEFAULT_DIRECT_FILE_POLICY } from "../../../../native-observation/dist/direct-event/selection.js"
import { GRAPH_LIMIT_CEILINGS } from "../../../../canonical-policy/dist/canonical/graph-limits.js"
const root = mkdtempSync("/tmp/hapsland-whole-budget-")
try {
  execFileSync("git", ["init", "-q", root])
  const sources = new Map([
    ["root.ts", "import type { A } from './a'; import type { B } from './b'; export interface Root { a: A; b: B }"],
    ["a.ts", "interface X {} interface Y {} interface Z {} export interface A { x: X; y: Y; z: Z }"],
    ["b.ts", "interface W {} export interface B { w: W }"]
  ])
  for (const [path, source] of sources) writeFileSync(join(root, path), source)
  const capture = (path) => ({ text: sources.get(path), byteLength: Buffer.byteLength(sources.get(path)) }),
    reads = []
  const cache = new Map()
  const context = {
    root,
    captureCache: cache,
    policy: DEFAULT_DIRECT_FILE_POLICY,
    limits: { ...GRAPH_LIMIT_CEILINGS, work: 5, outgoingEdges: 2 },
    now: () => 0,
    captureSource: (_root, selected) => {
      reads.push(selected.relativePath)
      return Effect.succeed({ status: "captured", capture: capture(selected.relativePath) })
    }
  }
  const errorShape = (error) => ({
    name: error.name,
    message: error.message,
    cause: error.cause ? { name: error.cause.name, message: error.cause.message } : null
  })
  let baselineError
  try {
    await Effect.runPromise(resolveGraphUnit("root.ts", capture("root.ts"), "Root", context))
  } catch (error) {
    baselineError = error
  }
  assert.ok(baselineError instanceof TypeError)
  assert.equal(baselineError.message, "invalid Bend boundary value")
  const baselineReads = [...reads],
    baselineCacheKeys = [...cache.keys()]
  reads.length = 0
  cache.clear()
  const trace = []
  let observedFrame
  const verification = {
    observeFrame(frame) {
      observedFrame = frame
    },
    inspect(session, path, source, branch) {
      // Root inspection precedes frame construction; child inspection follows
      // the original graphWork assignment and retains the same session call.
      if (observedFrame !== undefined)
        trace.push({
          localWork: observedFrame.budget.work,
          graphWork: observedFrame.budget.graphWork,
          graphSpent: projectImportGraph(observedFrame.state).work
        })
      return session.inspect(path, source, branch)
    }
  }
  let observedError
  try {
    await Effect.runPromise(resolveGraphUnit("root.ts", capture("root.ts"), "Root", { ...context, verification }))
  } catch (error) {
    observedError = error
  }
  assert.ok(observedError)
  assert.deepEqual(errorShape(observedError), errorShape(baselineError))
  assert.deepEqual(reads, baselineReads)
  assert.deepEqual([...cache.keys()], baselineCacheKeys)
  assert.ok(trace.some((x) => x.graphWork < 0))
  assert.deepEqual(
    trace.map((x) => x.graphWork),
    [1, -1]
  )
  assert.deepEqual(baselineCacheKeys, ["a.ts", "b.ts"])
  const record = {
    at: new Date().toISOString(),
    runtime: typeof Bun === "undefined" ? "node" : "bun",
    trace,
    reads,
    cacheKeys: baselineCacheKeys,
    error: errorShape(baselineError),
    firstRejected: true,
    secondChildTechnicalError: true,
    instrumentedEqualsUnmodifiedConsumer: true,
    scope:
      "actual native graph resolver and parsers with physical Git/path fixture and deterministic supplied captures; negative-budget native TypeError preserved as baseline; no native stable-capture or Bend composition parity claim"
  }
  const evidence = new URL("../../../../../../.test-runs/bend-migration/diagnostics/", import.meta.url)
  mkdirSync(evidence, { recursive: true })
  writeFileSync(
    new URL("budget-counterexample-" + record.runtime + ".json", evidence),
    JSON.stringify(record, null, 2) + "\n"
  )
  console.log(JSON.stringify(record))
} finally {
  rmSync(root, { recursive: true, force: true })
}
