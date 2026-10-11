import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { readFile, writeFile } from "node:fs/promises"
import * as path from "node:path"
import { pathToFileURL } from "node:url"
import { createHash } from "node:crypto"
import { list, unlist } from "@hapsland/source-artifacts/direct-event/value/codec"
import { pureReply } from "../frontend-codec.ts"

const label = (value) => value.$.split(".").at(-1)
const graph = "../../../../agent-flow-bend/ImportGraph."
const nestedGraph = "../../../../../agent-flow-bend/ImportGraph."
const graphTags = (value, incoming) => {
  if (Array.isArray(value)) return value.map((item) => graphTags(item, incoming))
  if (!value || typeof value !== "object") return value
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      key === "$" && typeof item === "string"
        ? item.replace(incoming ? graph : nestedGraph, incoming ? nestedGraph : graph)
        : graphTags(item, incoming)
    ])
  )
}

// Existing entry/expansion and Go continuations are separately emitted under
// their unchanged five-second deadlines. This relay owns no graph decisions.
export async function createEntryReferenceDriver({ temporary, go, transport, artifactTransport }) {
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
        (all, args) => all + `\n return globalThis.__hapslandGoEntryPath(${JSON.stringify(kind)},[${args}]);`
      )
    }
    emissions.push({ name, original, patched: createHash("sha256").update(source).digest("hex") })
    await writeFile(output, source)
    return (await import(pathToFileURL(output))).default
  }
  const entry = await compile("EntryDriverCheck")
  const expansion = await compile("ExpansionDriverCheck")
  const incoming = (value) => graphTags(transport(value), true)
  const outgoing = (value) => graphTags(transport(value, true), false)
  let invocation = 100000
  const counts = { cases: 0, requests: 0, transitions: 0 }
  const drive = async (session, input, options) => {
    counts.cases++
    assert.equal(input.invocation, BigInt(session.invocation))
    let progress = entry.initial(incoming(input))
    let child,
      savedRequest,
      requests = 0
    const previousPath = globalThis.__hapslandGoEntryPath
    globalThis.__hapslandGoEntryPath = (kind, args) =>
      kind === "join" ? path.join(...unlist(args[0])) : path[kind === "extension" ? "extname" : kind](...args)
    const receiveGo = () => {
      const view = artifactTransport(go.view(child), false)
      if (label(view) === "GoAwait") savedRequest = view.request
      else savedRequest = undefined
      if (["GoReturned", "GoFailed"].includes(label(view))) child = undefined
      progress = entry.go_child_completed(progress, view)
    }
    try {
      for (let steps = 0; steps < 100000; steps++) {
        counts.transitions++
        if (options?.signal?.aborted) progress = entry.cancel(progress)
        const accepted = entry.accepted_result(progress)
        if (label(accepted) === "Some") {
          assert.equal(child, undefined, "accepted entry must not retain a Go continuation")
          return { result: outgoing(accepted.value) }
        }
        let current = progress
        switch (label(progress)) {
          case "EntryGoChildBegin":
            assert.equal(child, undefined, "Go begin must not overwrite a live continuation")
            child = go.begin(artifactTransport(progress.command))
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
            child = go.resume(child, artifactTransport(progress.reply))
            receiveGo()
            continue
          case "EntryExpanding":
            current = progress.progress
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
          ["EntryWaiting", "EntryGoChildWaiting", "DriverWaiting"].includes(label(current)),
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
          $: "../Environment.Completion",
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
      if (previousPath === undefined) delete globalThis.__hapslandGoEntryPath
      else globalThis.__hapslandGoEntryPath = previousPath
    }
  }
  return { drive, counts, emissions, allocateInvocation: () => ++invocation, onConstructionFailure: () => undefined }
}
