import { artifactTransport as goArtifactTransport } from "./go-module/artifact-check-codec.mjs"
import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { readFile, writeFile } from "node:fs/promises"
import * as path from "node:path"
import { pathToFileURL } from "node:url"
import { createHash } from "node:crypto"
import { list, unlist } from "@hapsland/source-artifacts/direct-event/value/codec"
import { encodeGraphReply } from "./reply-codec.ts"

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
const pythonNominal = (tag, toChild) => {
  if (toChild) {
    if (/^(?:Types|python-module\/|traversal\/)/u.test(tag)) return "../" + tag
    return tag.replace(valueOwner, nestedValueOwner).replace(graph, nestedGraph)
  }
  return tag
    .replace(/^\.\.\//u, "")
    .replace(nestedValueOwner, valueOwner)
    .replace(nestedGraph, graph)
}

// Existing entry/expansion and specialized child continuations are separately emitted under
// their unchanged five-second deadlines. This relay owns no graph decisions.
export async function createEntryReferenceDriver({ temporary, go, python, artifactTransport = goArtifactTransport }) {
  const emissions = []
  const compile = async (name) => {
    const output = path.join(temporary, name + ".mjs")
    execFileSync("bend", [path.join(import.meta.dirname, name + ".bend"), "-o", output], { timeout: 10000 })
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
  const preparation = await compile("PreparationDriverCheck")
  const incoming = (value) => mapValues(value)
  const outgoing = (value) => mapValues(value)
  const goIncoming = (value) => artifactTransport(mapValues(value, (tag) => goNominal(tag, true)))
  const goOutgoing = (value) => mapValues(artifactTransport(value, false), (tag) => goNominal(tag, false))
  const pythonIncoming = (value) => mapValues(value, (tag) => pythonNominal(tag, true))
  const pythonOutgoing = (value) => mapValues(value, (tag) => pythonNominal(tag, false))
  let invocation = 100000
  const counts = { cases: 0, requests: 0, transitions: 0 }
  const createProgram = ({ onPythonResult = () => undefined, onGoResult = () => undefined } = {}) => {
    let child, savedRequest, command
    const receiveGo = (progress) => {
      const view = goOutgoing(go.view(child))
      savedRequest = label(view) === "GoAwait" ? view.request : undefined
      if (["GoReturned", "GoFailed"].includes(label(view))) {
        child = undefined
        onGoResult(command, view)
        command = undefined
      }
      return entry.go_child_completed(progress, view)
    }
    const relayPython = (progress, current, fromExpansion) => {
      assert.ok(python, "Python child artifact is required")
      if (["EntryPythonChildBegin", "DriverChildBegin"].includes(label(current))) {
        assert.equal(child, undefined, "Python begin must not overwrite a live continuation")
        command = current.command
        child = python.begin(pythonIncoming(command))
      } else {
        assert.notEqual(child, undefined, "Python resume requires its retained continuation")
        assert.deepEqual(current.request, savedRequest, "Python complete saved request")
        child = python.resume(child, pythonIncoming(current.reply))
      }
      const view = pythonOutgoing(python.view(child))
      savedRequest = label(view) === "Await" ? view.request : undefined
      if (["Returned", "Failed"].includes(label(view))) {
        child = undefined
        onPythonResult(command, view)
        command = undefined
      }
      return fromExpansion
        ? entry.accept_expansion(progress, expansion.child_completed(progress.progress, view))
        : entry.python_child_completed(progress, view)
    }
    return {
      initial: (input) => entry.initial(incoming(input)),
      accepted_result: entry.accepted_result,
      cancel: entry.cancel,
      advance(progress) {
        switch (label(progress)) {
          case "EntryPythonChildBegin":
          case "EntryPythonChildResume":
            return relayPython(progress, progress, false)
          case "EntryGoChildBegin":
            assert.equal(child, undefined, "Go begin must not overwrite a live continuation")
            command = progress.command
            child = go.begin(goIncoming(command))
            return receiveGo(progress)
          case "EntryGoChildAdvance":
            assert.notEqual(child, undefined, "Go advance requires its retained continuation")
            child = go.advance(child)
            return receiveGo(progress)
          case "EntryGoChildResume":
            assert.notEqual(child, undefined, "Go resume requires its retained continuation")
            assert.deepEqual(progress.request, savedRequest, "Go complete saved request")
            child = go.resume(child, goIncoming(progress.reply))
            return receiveGo(progress)
          case "EntryPreparing":
            return entry.accept_preparation(progress, preparation.advance(progress.progress))
          case "EntryExpanding":
            return ["DriverChildBegin", "DriverChildResume"].includes(label(progress.progress))
              ? relayPython(progress, progress.progress, true)
              : entry.accept_expansion(progress, expansion.advance(progress.progress))
          default:
            return entry.advance(progress)
        }
      },
      complete(progress, completion) {
        switch (label(progress)) {
          case "EntryPreparing":
            return entry.accept_preparation(progress, preparation.complete(progress.progress, completion))
          case "EntryExpanding":
            return entry.accept_expansion(progress, expansion.complete(progress.progress, completion))
          default:
            return entry.complete(progress, completion)
        }
      },
      assertClean() {
        assert.equal(child, undefined, "accepted entry must not retain a child continuation")
      },
      close() {
        child = undefined
        savedRequest = undefined
        command = undefined
      }
    }
  }
  const drive = async (session, input, options) => {
    counts.cases++
    assert.equal(input.invocation, BigInt(session.invocation))
    const program = createProgram()
    let progress = program.initial(input),
      requests = 0
    const previousPath = globalThis.__hapslandEntryCheckPath
    globalThis.__hapslandEntryCheckPath = (kind, args) =>
      kind === "join" ? path.join(...unlist(args[0])) : path[kind === "extension" ? "extname" : kind](...args)
    try {
      for (let steps = 0; steps < 100000; steps++) {
        counts.transitions++
        if (options?.signal?.aborted) progress = program.cancel(progress)
        const accepted = program.accepted_result(progress)
        if (label(accepted) === "Some") {
          program.assertClean()
          return { result: outgoing(accepted.value) }
        }
        const current = ["EntryExpanding", "EntryPreparing"].includes(label(progress)) ? progress.progress : progress
        if (["EntryFailed", "DriverFailed", "PreparationFailed"].includes(label(current))) {
          const failure = outgoing(current.failure)
          if (label(failure) === "ForeignProviderFailure") throw session.exception(failure.exception)
          return { failure }
        }
        if (
          [
            "EntryReady",
            "EntrySelected",
            "EntryGoChildBegin",
            "EntryGoChildAdvance",
            "EntryGoChildResume",
            "EntryPythonChildBegin",
            "EntryPythonChildResume",
            "DriverReady",
            "DriverSelected",
            "DriverChildBegin",
            "DriverChildResume",
            "PreparationReady"
          ].includes(label(current))
        ) {
          progress = program.advance(progress)
          continue
        }
        assert.ok(
          [
            "EntryWaiting",
            "EntryGoChildWaiting",
            "EntryPythonChildWaiting",
            "DriverWaiting",
            "PreparationWaiting"
          ].includes(label(current)),
          "unexpected reference entry phase " + label(current)
        )
        const request = outgoing(current.exchange.request)
        assert.equal(request.invocation, input.invocation, "entry request invocation")
        assert.equal(request.id, BigInt(++requests), "contiguous whole-entry request sequence")
        counts.requests++
        const reply = encodeGraphReply(await session.perform(request, options))
        assert.equal(reply.invocation, request.invocation)
        assert.equal(reply.id, request.id)
        progress = program.complete(progress, {
          $: "Environment.Completion",
          lease: current.exchange.lease,
          world: current.exchange.state.world,
          outcome: incoming(reply.outcome),
          effects: list([])
        })
      }
      throw new Error("reference entry evaluation bound exhausted")
    } finally {
      program.close()
      session.close()
      if (previousPath === undefined) delete globalThis.__hapslandEntryCheckPath
      else globalThis.__hapslandEntryCheckPath = previousPath
    }
  }
  return {
    createProgram,
    drive,
    counts,
    emissions,
    allocateInvocation: () => ++invocation,
    onConstructionFailure: () => undefined
  }
}
