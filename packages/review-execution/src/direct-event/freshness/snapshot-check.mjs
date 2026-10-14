import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { mkdtempSync, rmSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { pathToFileURL } from "node:url"
import { canonicalValue } from "@hapsland/review-definition/direct-event/model"

const temporary = mkdtempSync(join(tmpdir(), "hapsland-freshness-snapshot-"))
const tag = (value) => value.$.split(".").at(-1)
const sameInput = (left, right) => {
  const { sourceFingerprints: _leftCapture, rootLocation: _leftLocation, ...leftReview } = left
  const { sourceFingerprints: _rightCapture, rootLocation: _rightLocation, ...rightReview } = right
  return canonicalValue(leftReview) === canonicalValue(rightReview)
}
// The independent oracle retains the original filter/some and field ordering.
const reference = async (mode, prepared, engines) => {
  if (!(await engines.verifyRoot())) return false
  const names =
    mode === "SnapshotLine" ? undefined : new Map([[prepared.input.path, new Set([prepared.input.declaration.name])]])
  const latest = await engines.prepare(names)
  if (mode === "SnapshotLine") {
    const ready = latest.outcomes.filter((outcome) => outcome.status === "ready")
    return (
      ready.length === 1 &&
      ready.some(
        (outcome) =>
          outcome.status === "ready" &&
          outcome.prepared.identity === prepared.identity &&
          sameInput(outcome.prepared.input, prepared.input) &&
          canonicalValue(outcome.prepared.input.sourceFingerprints) ===
            canonicalValue(prepared.input.sourceFingerprints)
      )
    )
  }
  return latest.outcomes.some(
    (outcome) =>
      outcome.status === "ready" &&
      outcome.prepared.input.path === prepared.input.path &&
      outcome.prepared.identity === prepared.identity &&
      sameInput(outcome.prepared.input, prepared.input) &&
      canonicalValue(outcome.prepared.input.sourceFingerprints) === canonicalValue(prepared.input.sourceFingerprints)
  )
}
const unlist = (value) => {
  const items = []
  while (value.$ === "Con") {
    items.push(value.head)
    value = value.tail
  }
  assert.equal(value.$, "Nil")
  return items
}
try {
  const output = join(temporary, "freshness.mjs")
  execFileSync("taskset", ["-c", "11", "bend", join(import.meta.dirname, "Freshness.bend"), "-o", output], {
    timeout: 10000
  })
  const core = (await import(pathToFileURL(output))).default
  let requests = 0,
    rejectedReplies = 0,
    cases = 0
  const consume = async (mode, prepared, engines) => {
    const handles = new Map()
    let nextHandle = 0n
    const store = (value) => {
      const id = ++nextHandle
      handles.set(id, value)
      return id
    }
    const read = (lens) => unlist(lens.fields).reduce((value, key) => value[key], handles.get(lens.object))
    const input = {
      $: "Input",
      mode: { $: mode },
      observation: store({}),
      prepared: store(prepared),
      context: store({})
    }
    let step = core.initial(41n, input)
    for (let count = 0; ; count++) {
      assert.ok(count < 10000, "snapshot query loop terminates")
      if (tag(step) === "Completed") return step.current
      assert.equal(tag(step), "Await")
      const query = step.query
      let response
      switch (tag(query)) {
        case "VerifyRoot":
          response = { $: "Flag", value: await engines.verifyRoot() }
          break
        case "Read":
          response = { $: "Handle", value: store(read(query.value)) }
          break
        case "Prepare": {
          const names = unlist(query.names)
          response = {
            $: "Handle",
            value: store(
              await engines.prepare(
                mode === "SnapshotLine"
                  ? undefined
                  : new Map(names.map(({ path, name }) => [handles.get(path), new Set([handles.get(name)])]))
              )
            )
          }
          break
        }
        case "Length":
          response = { $: "Count", value: BigInt(handles.get(query.array).length) }
          break
        case "Element": {
          const array = handles.get(query.array)
          response = query.index in array ? { $: "Handle", value: store(array[query.index]) } : { $: "Missing" }
          break
        }
        case "TextIs":
          response = { $: "Flag", value: read(query.value) === query.expected }
          break
        case "Equal":
          response = { $: "Flag", value: read(query.left) === read(query.right) }
          break
        case "CanonicalEqual": {
          const left = read(query.left)
          const right = read(query.right)
          const equal = query.review_input ? sameInput(left, right) : canonicalValue(left) === canonicalValue(right)
          response = { $: "Flag", value: equal }
          break
        }
        default:
          assert.fail("Unexpected snapshot query " + query.$)
      }
      requests++
      for (const reply of [
        { $: "Reply", invocation: 42n, request: step.frame.request, response },
        { $: "Reply", invocation: 41n, request: step.frame.request + 1n, response },
        { $: "Reply", invocation: 41n, request: step.frame.request, response: { $: "Missing" } }
      ]) {
        if (
          tag(query) === "Element" &&
          reply.invocation === 41n &&
          reply.request === step.frame.request &&
          tag(reply.response) === "Missing"
        )
          continue
        assert.equal(tag(core.resume(step, reply)), "InvalidReply")
        rejectedReplies++
      }
      step = core.resume(step, { $: "Reply", invocation: 41n, request: step.frame.request, response })
    }
  }
  const original = {
    identity: "identity",
    input: { path: "src/a.ts", declaration: { name: "a" }, source: "original", sourceFingerprints: ["before"] }
  }
  const ready = (patch = {}) => ({ status: "ready", prepared: { ...original, ...patch } })
  const fixtures = [
    [],
    [{ status: "unsupported" }],
    [ready()],
    [ready(), ready()],
    [ready({ identity: "other" })],
    [ready({ input: { ...original.input, path: "src/b.ts" } })],
    [ready({ input: { ...original.input, source: "changed" } })],
    [ready({ input: { ...original.input, sourceFingerprints: ["after"] } })],
    [ready({ input: { ...original.input, rootLocation: "ignored" } })],
    [{ status: "unsupported" }, ready()],
    [ready({ identity: "other" }), ready()],
    Object.assign(new Array(2), { 1: ready() }),
    new Array(3),
    [undefined]
  ]
  const capture = async (run) => {
    try {
      return { value: await run() }
    } catch (error) {
      return { error: { name: error.name, message: error.message } }
    }
  }
  for (const mode of ["SnapshotLine", "SnapshotUnit"])
    for (const root of [false, true])
      for (const outcomes of fixtures) {
        const traces = []
        const lanes = []
        for (const implementation of [reference, consume]) {
          const trace = []
          const engines = {
            async verifyRoot() {
              trace.push("root")
              return root
            },
            async prepare(names) {
              trace.push([
                "prepare",
                names === undefined ? null : [...names].map(([path, names]) => [path, [...names]])
              ])
              return { outcomes }
            }
          }
          lanes.push(await capture(() => implementation(mode, original, engines)))
          traces.push(trace)
        }
        assert.deepEqual(lanes[1], lanes[0], mode + " root=" + root)
        assert.deepEqual(traces[1], traces[0])
        cases++
      }
  for (const mode of ["SnapshotLine", "SnapshotUnit"])
    for (const fault of ["root", "prepare", "status", "identity", "input", "fingerprints"]) {
      const originalError = new Error("original " + fault)
      const traces = []
      for (const implementation of [reference, consume]) {
        const trace = []
        const prepared = {
          get identity() {
            trace.push("identity")
            if (fault === "identity") throw originalError
            return original.identity
          },
          get input() {
            trace.push("input")
            if (fault === "input") throw originalError
            return {
              ...original.input,
              get sourceFingerprints() {
                trace.push("fingerprints")
                if (fault === "fingerprints") throw originalError
                return ["before"]
              }
            }
          }
        }
        const outcome = {
          get status() {
            trace.push("status")
            if (fault === "status") throw originalError
            return "ready"
          },
          prepared
        }
        await assert.rejects(
          implementation(mode, prepared, {
            async verifyRoot() {
              trace.push("root")
              if (fault === "root") throw originalError
              return true
            },
            async prepare() {
              trace.push("prepare")
              if (fault === "prepare") throw originalError
              return { outcomes: [outcome] }
            }
          }),
          (error) => error === originalError
        )
        traces.push(trace)
      }
      assert.deepEqual(traces[1], traces[0], mode + " " + fault)
      cases++
    }
  console.log(
    JSON.stringify({
      passed: true,
      cases,
      requests,
      rejectedReplies,
      scope:
        "complete lazy snapshot line/unit decisions and original error/read chronology; production Canonical integration, lazy Bend JSON, publication and universal correspondence remain open"
    })
  )
} finally {
  rmSync(temporary, { recursive: true, force: true })
}
