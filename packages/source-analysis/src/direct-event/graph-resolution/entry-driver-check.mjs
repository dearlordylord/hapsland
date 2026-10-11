import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { readFile, writeFile } from "node:fs/promises"
import * as path from "node:path"
import { pathToFileURL } from "node:url"
import { createHash } from "node:crypto"
import { list, unlist } from "@hapsland/source-artifacts/direct-event/value/codec"
import { pureReply } from "./frontend-codec.ts"

const label = (value) => value.$.split(".").at(-1)
const mapValues = (value, nominal = (tag) => tag) => {
  if (typeof value === "number") return BigInt(value)
  if (Array.isArray(value)) return value.map((item) => mapValues(item, nominal))
  if (!value || typeof value !== "object") return value
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      key === "$" && typeof item === "string" ? nominal(item) : mapValues(item, nominal)
    ])
  )
}
const graph = "../../../../agent-flow-bend/ImportGraph."
const nestedGraph = "../../../../../agent-flow-bend/ImportGraph."
const valueOwner = "../../../../source-artifacts/src/direct-event/value/Value."
const nestedValueOwner = "../../../../../source-artifacts/src/direct-event/value/Value."
const goNominal = (tag, toChild) => {
  if (toChild) {
    if (tag.startsWith("go-module/")) return tag.slice(10)
    if (/^(?:Types|traversal\/core)\./u.test(tag)) return "../" + tag
    return tag.replace(graph, nestedGraph).replace(valueOwner, nestedValueOwner)
  }
  if (/^(?:PreparationModel|Configuration|RawText|Input|Package|ArtifactProtocol)\./u.test(tag))
    return "go-module/" + tag
  return tag
    .replace(/^\.\.\//u, "")
    .replace(nestedGraph, graph)
    .replace(nestedValueOwner, valueOwner)
}
const pythonOwner = "../../../../../source-analysis/src/direct-event/graph-resolution/"
const pythonNominal = (tag, toChild) => {
  if (toChild) {
    if (/^(?:Types|python-module\/|traversal\/)/u.test(tag)) return pythonOwner + tag
    return tag.replace(valueOwner, nestedValueOwner).replace(graph, nestedGraph)
  }
  return tag.replace(pythonOwner, "").replace(nestedValueOwner, valueOwner).replace(nestedGraph, graph)
}

// Existing entry/expansion and specialized child continuations are separately emitted under
// their unchanged five-second deadlines. This relay owns no graph decisions.
export async function createEntryReferenceDriver({ temporary, go, python, artifactTransport }) {
  const emissions = []
  const compile = async (name) => {
    const output = path.join(temporary, name + ".mjs")
    execFileSync("bend", [path.join(import.meta.dirname, name + ".bend"), "-o", output], { timeout: 5000 })
    let source = await readFile(output, "utf8")
    const original = createHash("sha256").update(source).digest("hex")
    for (const kind of ["basename", "join", "dirname", "extension", "normalize", "relative"]) {
      const pattern = new RegExp("function \\$" + kind + "\\$\\(([^)]*)\\) \\{")
      const matches = [...source.matchAll(new RegExp(pattern.source, "g"))]
      assert.equal(matches.length, 1, kind + " unique mechanical path primitive")
      assert.equal(matches[0][1].split(",").length, kind === "relative" ? 2 : 1, kind + " path ABI arity")
      source = source.replace(
        pattern,
        (all, args) => all + `\n return globalThis.__hapslandEntryCheckPath(${JSON.stringify(kind)},[${args}]);`
      )
    }
    emissions.push({ name, original, patched: createHash("sha256").update(source).digest("hex") })
    await writeFile(output, source)
    return (await import(pathToFileURL(output))).default
  }
  const entry = await compile("EntryDriverCheck")
  const expansion = await compile("ExpansionDriverCheck")
  const incoming = (value) => mapValues(value)
  const outgoing = (value) => mapValues(value)
  const goIncoming = (value) => artifactTransport(mapValues(value, (tag) => goNominal(tag, true)))
  const goOutgoing = (value) => mapValues(artifactTransport(value, false), (tag) => goNominal(tag, false))
  const pythonIncoming = (value) => mapValues(value, (tag) => pythonNominal(tag, true))
  const pythonOutgoing = (value) => mapValues(value, (tag) => pythonNominal(tag, false))
  let invocation = 100000
  const counts = { cases: 0, requests: 0, transitions: 0 }
  const drive = async (session, input, options) => {
    counts.cases++
    assert.equal(input.invocation, BigInt(session.invocation))
    let progress = entry.initial(incoming(input))
    let child,
      savedRequest,
      requests = 0
    const previousPath = globalThis.__hapslandEntryCheckPath
    globalThis.__hapslandEntryCheckPath = (kind, args) =>
      kind === "join" ? path.join(...unlist(args[0])) : path[kind === "extension" ? "extname" : kind](...args)
    const receiveGo = () => {
      const view = goOutgoing(go.view(child))
      if (label(view) === "GoAwait") savedRequest = view.request
      else savedRequest = undefined
      if (["GoReturned", "GoFailed"].includes(label(view))) child = undefined
      progress = entry.go_child_completed(progress, view)
    }
    const receivePython = (fromExpansion) => {
      const view = pythonOutgoing(python.view(child))
      savedRequest = label(view) === "Await" ? view.request : undefined
      if (["Returned", "Failed"].includes(label(view))) child = undefined
      progress = fromExpansion
        ? entry.accept_expansion(progress, expansion.child_completed(progress.progress, view))
        : entry.python_child_completed(progress, view)
    }
    const relayPython = (current, fromExpansion) => {
      assert.ok(python, "Python child artifact is required")
      if (["EntryPythonChildBegin", "DriverChildBegin"].includes(label(current))) {
        assert.equal(child, undefined, "Python begin must not overwrite a live continuation")
        child = python.begin(pythonIncoming(current.command))
      } else {
        assert.notEqual(child, undefined, "Python resume requires its retained continuation")
        assert.deepEqual(current.request, savedRequest, "Python complete saved request")
        child = python.resume(child, pythonIncoming(current.reply))
      }
      receivePython(fromExpansion)
    }
    try {
      for (let steps = 0; steps < 100000; steps++) {
        counts.transitions++
        if (options?.signal?.aborted) progress = entry.cancel(progress)
        const accepted = entry.accepted_result(progress)
        if (label(accepted) === "Some") {
          assert.equal(child, undefined, "accepted entry must not retain a child continuation")
          return { result: outgoing(accepted.value) }
        }
        let current = progress
        switch (label(progress)) {
          case "EntryPythonChildBegin":
          case "EntryPythonChildResume":
            relayPython(progress, false)
            continue
          case "EntryGoChildBegin":
            assert.equal(child, undefined, "Go begin must not overwrite a live continuation")
            child = go.begin(goIncoming(progress.command))
            receiveGo()
            continue
          case "EntryGoChildAdvance":
            assert.notEqual(child, undefined, "Go advance requires its retained continuation")
            child = go.advance(child)
            receiveGo()
            continue
          case "EntryGoChildResume":
            assert.notEqual(child, undefined, "Go resume requires its retained continuation")
            assert.deepEqual(progress.request, savedRequest, "resume must retain the complete saved request")
            child = go.resume(child, goIncoming(progress.reply))
            receiveGo()
            continue
          case "EntryExpanding":
            current = progress.progress
            if (["DriverChildBegin", "DriverChildResume"].includes(label(current))) {
              relayPython(current, true)
              continue
            }
            if (["DriverReady", "DriverSelected"].includes(label(current))) {
              progress = entry.accept_expansion(progress, expansion.advance(current))
              continue
            }
            if (label(current) === "DriverFinished") {
              progress = entry.accept_expansion(progress, current)
              continue
            }
            break
          case "EntryReady":
          case "EntrySelected":
            progress = entry.advance(progress)
            continue
        }
        if (["EntryFailed", "DriverFailed"].includes(label(current))) {
          const failure = outgoing(current.failure)
          if (label(failure) === "ForeignProviderFailure") throw session.exception(failure.exception)
          return { failure }
        }
        assert.ok(
          ["EntryWaiting", "EntryGoChildWaiting", "EntryPythonChildWaiting", "DriverWaiting"].includes(label(current)),
          "unexpected reference entry phase " + label(current)
        )
        const request = outgoing(current.exchange.request)
        assert.equal(request.invocation, input.invocation, "entry request invocation")
        assert.equal(request.id, BigInt(++requests), "contiguous whole-entry request sequence")
        counts.requests++
        const reply = pureReply(await session.perform(request, options))
        assert.equal(reply.invocation, request.invocation)
        assert.equal(reply.id, request.id)
        const completion = {
          $: "Environment.Completion",
          lease: current.exchange.lease,
          world: current.exchange.state.world,
          outcome: incoming(reply.outcome),
          effects: list([])
        }
        progress =
          label(current) === "DriverWaiting"
            ? entry.accept_expansion(progress, expansion.complete(current, completion))
            : entry.complete(progress, completion)
      }
      throw new Error("reference entry evaluation bound exhausted")
    } finally {
      child = undefined
      savedRequest = undefined
      session.close()
      if (previousPath === undefined) delete globalThis.__hapslandEntryCheckPath
      else globalThis.__hapslandEntryCheckPath = previousPath
    }
  }
  return { drive, counts, emissions, allocateInvocation: () => ++invocation, onConstructionFailure: () => undefined }
}
