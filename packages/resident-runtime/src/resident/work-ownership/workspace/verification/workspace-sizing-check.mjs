import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { mkdtemp, rm } from "node:fs/promises"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import { MAX_SOURCE_BYTES } from "@hapsland/native-observation/direct-event/capture"
import { runWorkspaceSizing } from "../workspace-sizing.ts"
import { analysisWorkspaceBytes, captureWorkspaceBytes } from "./native-workspace.ts"

const temporary = await mkdtemp("/tmp/hapsland-workspace-sizing-")
const list = (values) => values.reduceRight((tail, head) => ({ $: "Con", head, tail }), { $: "Nil" })
const result = (run) => {
  try {
    return { returned: true, value: run() }
  } catch (error) {
    return { returned: false, error }
  }
}
let cases = 0
try {
  const output = join(temporary, "workspace.mjs")
  execFileSync("taskset", ["-c", "10", "bend", join(import.meta.dirname, "../WorkspaceSizing.bend"), "-o", output], {
    timeout: 10000
  })
  const core = (await import(pathToFileURL(output))).default
  const compare = (factory, mode, faultAt, thrown) => {
    const traces = [[], []]
    const run = (index, execute) => {
      const trace = traces[index]
      const mark = (name) => {
        trace.push(name)
        if (trace.length === faultAt) throw thrown
      }
      const args = factory(mark)
      return result(() => execute(...args))
    }
    const native = run(0, mode === "WorkspaceCapture" ? captureWorkspaceBytes : analysisWorkspaceBytes)
    const candidate = run(1, (...args) => runWorkspaceSizing(core, { $: mode }, ...args))
    assert.deepEqual(traces[1], traces[0])
    assert.equal(candidate.returned, native.returned)
    if (native.returned) assert.ok(Object.is(candidate.value, native.value))
    else if (native.error === thrown) assert.equal(candidate.error, thrown)
    else {
      assert.equal(candidate.error?.constructor, native.error?.constructor)
      assert.equal(candidate.error?.message, native.error?.message)
    }
    cases++
    return traces[0].length
  }
  const sourceValues = [
    undefined,
    0,
    -0,
    1,
    1024,
    MAX_SOURCE_BYTES,
    MAX_SOURCE_BYTES + 1,
    -1,
    0.5,
    NaN,
    Infinity,
    -Infinity,
    Number.MAX_SAFE_INTEGER + 1,
    null,
    false,
    "1",
    1n,
    Symbol("source"),
    {}
  ]
  for (const path of ["", "a.ts", "λ😀\ud800.ts"]) {
    for (const source of sourceValues) {
      compare(() => [path, source], "WorkspaceCapture")
      for (const preflight of [
        undefined,
        null,
        {},
        { declarations: 0, hasImports: false, expandedUnitBytes: 0 },
        { declarations: 2, hasImports: true, expandedUnitBytes: 42 },
        { declarations: null, hasImports: "truthy", expandedUnitBytes: null },
        { declarations: NaN, hasImports: 0, expandedUnitBytes: -0 }
      ]) {
        compare(() => [path, source, preflight, [{ id: "rule", nested: [undefined, "λ"] }]], "WorkspaceAnalysis")
      }
    }
  }
  const rawThrows = [undefined, null, false, 0, "", Symbol("fault"), { fault: true }]
  for (const declarations of [undefined, null, 0, -0, NaN, 1.25, "2", 2n, Symbol("declarations"), "coerce"]) {
    for (const expanded of [undefined, null, 0, "expanded", "coerce"]) {
      const factory = (mark) => {
        const coercible = (name) => ({
          [Symbol.toPrimitive](hint) {
            mark(name + ":" + hint)
            return 3
          }
        })
        const path = new Proxy(
          { z: "z", a: "λ" },
          {
            ownKeys(target) {
              mark("path.keys")
              return Reflect.ownKeys(target)
            },
            getOwnPropertyDescriptor(target, key) {
              mark("path.descriptor:" + String(key))
              return Reflect.getOwnPropertyDescriptor(target, key)
            },
            get(target, key, receiver) {
              mark("path.get:" + String(key))
              return Reflect.get(target, key, receiver)
            }
          }
        )
        const rules = new Proxy(
          { z: 1, a: ["λ", undefined] },
          {
            ownKeys(target) {
              mark("rules.keys")
              return Reflect.ownKeys(target)
            },
            getOwnPropertyDescriptor(target, key) {
              mark("rules.descriptor:" + String(key))
              return Reflect.getOwnPropertyDescriptor(target, key)
            },
            get(target, key, receiver) {
              mark("rules.get:" + String(key))
              return Reflect.get(target, key, receiver)
            }
          }
        )
        const preflight = {
          get declarations() {
            mark("declarations")
            return declarations === "coerce" ? coercible("declarations.coerce") : declarations
          },
          get hasImports() {
            mark("imports")
            return {}
          },
          get expandedUnitBytes() {
            mark("expanded")
            return expanded === "coerce" ? coercible("expanded.coerce") : expanded
          }
        }
        return [path, 1, preflight, rules]
      }
      const length = compare(factory, "WorkspaceAnalysis")
      for (let faultAt = 1; faultAt <= length; faultAt++) {
        for (const thrown of rawThrows) compare(factory, "WorkspaceAnalysis", faultAt, thrown)
      }
    }
  }
  // Declaration access precedes invalid-source refusal; capture path measurement does not.
  for (const thrown of rawThrows) {
    compare(
      (mark) => [
        "p",
        -1,
        {
          get declarations() {
            mark("declarations")
            throw thrown
          }
        },
        []
      ],
      "WorkspaceAnalysis",
      undefined,
      thrown
    )
  }
  // Closed cursor protocol: no fabricated receipt may pass a branch/error/terminal.
  const nil = list([])
  for (const operation of [
    { $: "WorkspaceConstant", target: 5, value: { $: "WorkspaceMaxSource" } },
    { $: "WorkspaceReadOptional", target: 4, source: 2, field: "declarations" },
    { $: "WorkspaceCall", target: 9, primitive: { $: "WorkspaceMultiply" }, arguments: list([1, 2]) }
  ]) {
    const step = { $: "WorkspaceAwait", operation, remaining: nil, result: 9 }
    assert.equal(core.resume(step, { $: "WorkspaceAck" }).$, "WorkspaceDone")
    for (const value of [false, true])
      assert.equal(core.resume(step, { $: "WorkspaceFlag", value }).$, "WorkspaceRejected")
    cases++
  }
  const branch = {
    $: "WorkspaceAwait",
    operation: {
      $: "WorkspaceBranch",
      primitive: { $: "WorkspaceTruthy" },
      arguments: nil,
      yes: list([{ $: "WorkspaceInvalidSource" }]),
      no: nil
    },
    remaining: nil,
    result: 9
  }
  assert.equal(core.resume(branch, { $: "WorkspaceAck" }).$, "WorkspaceRejected")
  assert.equal(core.resume(branch, { $: "WorkspaceFlag", value: true }).operation.$, "WorkspaceInvalidSource")
  assert.equal(core.resume(branch, { $: "WorkspaceFlag", value: false }).$, "WorkspaceDone")
  for (const step of [
    { $: "WorkspaceDone", result: 9 },
    { $: "WorkspaceRejected" },
    { $: "WorkspaceAwait", operation: { $: "WorkspaceInvalidSource" }, remaining: nil, result: 9 }
  ]) {
    for (const reply of [
      { $: "WorkspaceAck" },
      { $: "WorkspaceFlag", value: false },
      { $: "WorkspaceFlag", value: true }
    ]) {
      assert.equal(core.resume(step, reply).$, "WorkspaceRejected")
      cases++
    }
  }
  console.log(
    JSON.stringify({
      passed: true,
      cases,
      scope:
        "Actual emitted workspace recipe versus independent native formula; ordered primitive/getter/coercion and raw-fault traces. Full Source/resident/handoff integration and whole migration acceptance are separate."
    })
  )
} finally {
  await rm(temporary, { recursive: true, force: true })
}
