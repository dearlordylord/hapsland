import assert from "node:assert/strict"
import { canonicalValue } from "@hapsland/review-definition/direct-event/model"

import { pathToFileURL } from "node:url"
import { resolve } from "node:path"
// Optional emitted artifact is a focused compiler diagnostic. Normal gates
// always consume the ordinary compiled package output.
if (process.argv.length > 3) throw new Error("Expected at most one emitted-core diagnostic path")
const core = (
  await import(
    process.argv[2]
      ? pathToFileURL(resolve(process.argv[2])).href
      : "../../../dist/direct-event/freshness/freshness-core.js"
  )
).default
const tag = (value) => value.$.split(".").at(-1)
const sameInput = (left, right) => {
  const { sourceFingerprints: _leftCapture, rootLocation: _leftLocation, ...leftReview } = left
  const { sourceFingerprints: _rightCapture, rootLocation: _rightLocation, ...rightReview } = right
  return canonicalValue(leftReview) === canonicalValue(rightReview)
}
// The independent oracle retains the original filter/some and field ordering.
export const reference = async (mode, prepared, engines) => {
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
if (import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  let requests = 0,
    rejectedReplies = 0,
    cases = 0
  const consume = async (mode, prepared, engines, grouped = false) => {
    const handles = new Map()
    let nextHandle = 0
    const store = (value) => {
      const id = ++nextHandle
      handles.set(id, value)
      return id
    }
    const read = (lens) => unlist(lens.fields).reduce((value, key) => value[key], handles.get(lens.object))
    const primitive = (query) => {
      let response
      switch (tag(query)) {
        case "Read":
          response = { $: "Handle", value: store(read(query.value)) }
          return response
        case "Length":
          response = { $: "Count", value: (handles.get(query.array).length) }
          return response
        case "Element": {
          const array = handles.get(query.array)
          response = query.index in array ? { $: "Handle", value: store(array[query.index]) } : { $: "Missing" }
          return response
        }
        case "TextIs":
          response = { $: "Flag", value: read(query.value) === query.expected }
          return response
        case "Equal":
          response = { $: "Flag", value: read(query.left) === read(query.right) }
          return response
        case "CanonicalEqual": {
          // sameInput evaluates both arguments first; fingerprint equality
          // finishes left serialization before reading the right lens.
          const equal = query.review_input
            ? sameInput(read(query.left), read(query.right))
            : canonicalValue(read(query.left)) === canonicalValue(read(query.right))
          response = { $: "Flag", value: equal }
          return response
        }
        default:
          assert.fail("Unexpected snapshot query " + query.$)
      }
    }
    const nativeEngine = {
      $: "Engine",
      read(query) {
        const response = primitive(query)
        requests++
        return { $: "Tuple", fst: response, snd: nativeEngine }
      }
    }
    let engine = nativeEngine
    const input = {
      $: "Input",
      mode: { $: mode },
      observation: store({}),
      prepared: store(prepared),
      context: store({})
    }
    let step = core.initial(41, input)
    for (let count = 0; ; count++) {
      assert.ok(count < 10000, "snapshot query loop terminates")
      if (grouped) {
        const group = core.run_group(engine, step)
        step = group.fst
        engine = group.snd
      }
      if (tag(step) === "Completed") return step.current
      assert.equal(tag(step), "Await")
      if (grouped) assert.ok(["VerifyRoot", "Prepare"].includes(tag(step.query)), "group reaches original IO boundary")
      const query = step.query
      let response
      switch (tag(query)) {
        case "VerifyRoot":
          response = { $: "Flag", value: await engines.verifyRoot() }
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
        default:
          response = primitive(query)
      }
      requests++
      for (const reply of [
        { $: "Reply", invocation: 42, request: step.frame.request, response },
        { $: "Reply", invocation: 41, request: step.frame.request + 1, response },
        { $: "Reply", invocation: 41, request: step.frame.request, response: { $: "Missing" } }
      ]) {
        if (
          tag(query) === "Element" &&
          reply.invocation === 41 &&
          reply.request === step.frame.request &&
          tag(reply.response) === "Missing"
        )
          continue
        assert.equal(tag(core.resume(step, reply)), "InvalidReply")
        rejectedReplies++
      }
      step = core.resume(step, { $: "Reply", invocation: 41, request: step.frame.request, response })
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
    [undefined],
    Array.from({ length: 1024 }, () => ready({ identity: "other" }))
  ]
  const capture = async (run) => {
    try {
      return { value: await run() }
    } catch (error) {
      if (error instanceof RangeError && process.env.HAPSLAND_FRESHNESS_DIAGNOSTIC_STACK === "1")
        process.stderr.write(error.stack.split("\n").slice(0, 12).join("\n") + "\n")
      return { error: { name: error.name, message: error.message } }
    }
  }
  for (const mode of ["SnapshotLine", "SnapshotUnit"])
    for (const root of [false, true])
      for (const outcomes of fixtures) {
        const traces = []
        const lanes = []
        for (const implementation of [
          reference,
          consume,
          (mode, prepared, engines) => consume(mode, prepared, engines, true)
        ]) {
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
        assert.deepEqual(lanes[2], lanes[0], mode + " grouped root=" + root)
        assert.deepEqual(traces[2], traces[0])
        cases++
      }
  for (const mode of ["SnapshotLine", "SnapshotUnit"]) {
    const lanes = []
    for (const implementation of [
      reference,
      consume,
      (mode, prepared, engines) => consume(mode, prepared, engines, true)
    ]) {
      const trace = []
      let rightFingerprint = { revision: "old" }
      const prepared = {
        ...original,
        input: {
          ...original.input,
          get sourceFingerprints() {
            trace.push("right fingerprint read")
            return rightFingerprint
          }
        }
      }
      const item = ready()
      item.prepared.input.sourceFingerprints = {
        get revision() {
          trace.push("left fingerprint serialize")
          rightFingerprint = { revision: "new" }
          return "new"
        }
      }
      const result = await implementation(mode, prepared, {
        async verifyRoot() {
          return true
        },
        async prepare() {
          return { outcomes: [item] }
        }
      })
      lanes.push({ result, trace })
    }
    assert.equal(lanes[0].result, true)
    assert.deepEqual(lanes[1], lanes[0], mode + " fingerprint serialization chronology")
    assert.deepEqual(lanes[2], lanes[0], mode + " grouped fingerprint serialization chronology")
    cases++
  }
  for (const mode of ["SnapshotLine", "SnapshotUnit"])
    for (const fault of ["root", "prepare", "status", "identity", "input", "fingerprints"]) {
      const originalError = new Error("original " + fault)
      const traces = []
      for (const implementation of [
        reference,
        consume,
        (mode, prepared, engines) => consume(mode, prepared, engines, true)
      ]) {
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
      assert.deepEqual(traces[2], traces[0], mode + " grouped " + fault)
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
}
