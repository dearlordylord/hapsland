import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { mkdtemp, rm, readFile, writeFile } from "node:fs/promises"
import { rmSync } from "node:fs"
import { randomUUID } from "node:crypto"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import { createPreparationMachine } from "./preparation-dispatcher.ts"
import * as Effect from "effect/Effect"
import { productValue } from "@hapsland/source-artifacts/direct-event/value/codec"
import { createPhysicalPreparationCapability } from "../../../dist/direct-event/preparation/physical-effects.mjs"

// The physical reply preserves the accepted Graph tree, including its identity.
{
  const path = "/graph-handoff.ts"
  const capture = { text: "type Root = string", contentHash: "fixture", byteLength: 18 }
  const unit = productValue({ root: { artifact: { id: "Root", kind: "type", name: "Root" } } })
  const nil = { $: "Nil" }
  const unused = () => {
    throw new Error("Unrequested provider crossed Graph handoff")
  }
  const capability = createPhysicalPreparationCapability({
    root: "/",
    rootIdentity: {},
    context: {},
    settings: {},
    cache: new Map([[path, capture]]),
    canonicalGate: unused,
    runFinalization: unused,
    admitMaterialization: unused,
    rejectMaterializationCapacity: unused,
    recordMaterializationCapacity: unused,
    resolveRoot: (_request, facts) => {
      assert.equal(facts.capture, capture)
      return Effect.succeed({ unit, references: nil })
    }
  })
  const response = await Effect.runPromise(
    capability.performEffect(
      {
        invocation: 1,
        id: 7,
        command: {
          $: "ResolveRoot",
          capture: { handle: 1, path },
          root: { name: "Root" },
          contract: { $: "PreparationSelection.TypeContract" }
        }
      },
      { ownerLease: { invocation: 1, request: 7 } }
    )
  )
  assert.equal(response.response.$, "RootResolved")
  assert.equal(response.response.unit.$, "Some")
  assert.equal(response.response.unit.value, unit)
  console.log(JSON.stringify({ graphProductHandoffIdentity: true }))
}

// Closed ABI transport must touch only Graph references, never source payloads.
{
  const list = (values) => values.reduceRight((tail, head) => ({ $: "Con", head, tail }), { $: "Nil" })
  const array = (value) => {
    const out = []
    while (value.$ === "Con") {
      out.push(value.head)
      value = value.tail
    }
    return out
  }
  let received
  const failed = { $: "Failed", reason: "probe" }
  const core = {
    initial_settled(_invocation, input) {
      received = input
      return { $: "Some", value: failed }
    },
    resume_settled(_step, reply) {
      received = reply
      return { $: "Some", value: failed }
    }
  }
  const dispatcher = createPreparationMachine(core)
  const input = { candidates: { $: "Nil" } }
  dispatcher.initial({ invocation: 1, preparation: input })
  assert.equal(received, input)
  const owner = "../../../../source-analysis/src/direct-event/graph-resolution/traversal/core."
  const planned = [
    { $: "traversal/core.Included", identity: "same" },
    { $: "traversal/core.Expanded", node: 7 },
    ...["Unresolved", "UnsupportedTarget", "ReferenceLimit", "Unavailable"].map((reason) => ({
      $: "traversal/core.Omitted",
      reason: { $: "traversal/core." + reason },
      target_name: "Target"
    }))
  ]
  const payload = { $: "Value.ProductText", value: "Types.Payload" }
  Object.defineProperty(payload, "unread", {
    enumerable: true,
    get() {
      throw new Error("unexpected payload traversal")
    }
  })
  const references = planned.map((reference) => ({
    $: "traversal/core.ReferenceSlot",
    owner: 1,
    index: 2,
    symbol: "symbol",
    reference
  }))
  for (const slots of [[], references, Array.from({ length: 25000 }, (_, i) => references[i % references.length])]) {
    const reply = {
      $: "Reply",
      invocation: 1,
      id: 2,
      response: {
        $: "RootResolved",
        unit: { $: "Some", value: payload },
        captures: { $: "Nil" },
        references: list(slots)
      }
    }
    dispatcher.resume(failed, { $: "Types.ServiceReply", reply })
    assert.equal(received.response.unit, reply.response.unit)
    const encoded = array(received.response.references)
    assert.equal(encoded.length, slots.length)
    encoded.forEach((slot, index) => {
      const source = slots[index]
      assert.equal(slot.$, owner + "ReferenceSlot")
      assert.equal(slot.owner, source.owner)
      assert.equal(slot.index, source.index)
      assert.equal(slot.symbol, source.symbol)
      const expected = { ...source.reference, $: owner + source.reference.$.slice("traversal/core.".length) }
      if (source.reference.reason)
        expected.reason = { $: owner + source.reference.reason.$.slice("traversal/core.".length) }
      assert.deepEqual(slot.reference, expected)
    })
  }
  for (const response of [{ $: "Ack" }, { $: "SourceUnavailable", diagnostic: payload }]) {
    dispatcher.resume(failed, { $: "Types.ServiceReply", reply: { $: "Reply", invocation: 1, id: 2, response } })
    assert.equal(received.response, response)
  }
  assert.throws(() => dispatcher.resume(failed, { $: "wrong" }), { message: "Invalid preparation reply envelope" })
  const bad = {
    $: "RootResolved",
    unit: { $: "None" },
    captures: { $: "Nil" },
    references: list([{ ...references[0], reference: { $: "traversal/core.Unknown" } }])
  }
  assert.throws(
    () =>
      dispatcher.resume(failed, {
        $: "Types.ServiceReply",
        reply: { $: "Reply", invocation: 1, id: 2, response: bad }
      }),
    /Invalid Graph planned reference/
  )
  for (const method of ["initial_settled", "resume_settled"]) {
    const guarded = createPreparationMachine({ ...core, [method]: () => ({ $: "None" }) })
    assert.throws(
      () =>
        method === "initial_settled"
          ? guarded.initial({ invocation: 1, preparation: input })
          : guarded.resume(failed, {
              $: "Types.ServiceReply",
              reply: { $: "Reply", invocation: 1, id: 2, response: { $: "Ack" } }
            }),
      /Preparation internal dispatch did not settle/
    )
  }
  assert.throws(() => dispatcher.view({ $: "Internal" }), /Unsettled preparation projection/)
  assert.throws(() => dispatcher.accepted({ $: "Types.AwaitService" }), /Invalid accepted preparation projection/)
  console.log(
    JSON.stringify({
      closedPreparationAbi: true,
      referenceVariants: 6,
      longReferenceList: 25000,
      payloadNotTraversed: true
    })
  )
}
const temporary = await mkdtemp("/tmp/hapsland-preparation-machine-")
try {
  const emitted = join(temporary, "preparation.mjs")
  execFileSync("taskset", ["-c", "10", "bend", join(import.meta.dirname, "./Preparation.bend"), "-o", emitted], {
    timeout: 10000
  })
  const machine = (await import(pathToFileURL(emitted))).default
  const list = (values) => values.reduceRight((tail, head) => ({ $: "Con", head, tail }), { $: "Nil" })
  const array = (value) => {
    const values = []
    while (value.$ === "Con") {
      values.push(value.head)
      value = value.tail
    }
    assert.equal(value.$, "Nil")
    return values
  }
  const none = { $: "None" },
    some = (value) => ({ $: "Some", value }),
    text = (value) => ({ $: "../../../../source-artifacts/src/direct-event/value/Value.ProductText", value })
  const contract = { $: "PreparationSelection.TypeContract" },
    functionContract = { $: "PreparationSelection.FunctionContract" }
  const limits = {
    $: "../../../../agent-flow-bend/ImportGraph.Limits",
    version: 1,
    source_bytes: 2097152,
    tree_bytes: 16777216,
    files: 64,
    read_bytes: 16777216,
    outgoing_edges: 256,
    depth: 32,
    work: 10000
  }
  const candidate = (path, operation = "CandidateAdd", lines = ["changed"]) => ({
    $: "Candidate",
    path,
    operation: { $: operation },
    added_lines: list(lines)
  })
  const input = (candidates, overrides = {}) => ({
    $: "Input",
    candidates: list(candidates),
    contracts: list([contract]),
    limits,
    frozen: none,
    line: none,
    verified: none,
    native_patch: none,
    advicee_host: "codex",
    before_analyze: true,
    ...overrides
  })
  const roots = (path, count) =>
    Array.from({ length: count }, (_, index) => ({
      $: "PreparationSelection.Root",
      id: path + ":" + index,
      declaration: {
        $: "../../../../native-observation/src/direct-event/edit-attribution/RootAttribution.Declaration",
        path,
        kind: "class",
        name: "Root" + index,
        location: {
          $: "../../../../native-observation/src/direct-event/edit-attribution/RootAttribution.Location",
          start: {
            $: "../../../../native-observation/src/direct-event/edit-attribution/RootAttribution.Position",
            line: 1,
            column: 1
          },
          end: {
            $: "../../../../native-observation/src/direct-event/edit-attribution/RootAttribution.Position",
            line: 1,
            column: 2
          }
        },
        selection_locations: none
      }
    }))
  let pumpComparisons = 0
  const originalPump = (step, fuel = 10000) => {
    for (let count = 0; count < fuel; count++) {
      if (step.$ !== "Internal") return some(step)
      step = machine.advance(step.state)
    }
    return none
  }
  const checkPump = (step) => {
    for (const fuel of [0, 1, 2, 9999, 10000]) {
      assert.deepEqual(machine.settle(fuel, step), originalPump(step, fuel))
      pumpComparisons++
    }
  }
  const emptyStart = machine.initial(1, input([], { contracts: list([]) }))
  checkPump(emptyStart)
  checkPump(machine.advance(emptyStart.state))
  checkPump({ $: "Failed", reason: "retained-failure" })
  let longPumpBoundaries = 0
  const dispatcher = createPreparationMachine(machine)
  for (const contracts of [4999, 5000]) {
    const configuration = input([], { contracts: list(Array(contracts).fill(contract)) })
    const start = machine.initial(1, configuration)
    const bounded = machine.initial_settled(1, configuration)
    assert.equal(bounded.$, contracts === 4999 ? "Some" : "None")
    longPumpBoundaries++
    if (contracts === 4999) {
      assert.equal(dispatcher.initial({ invocation: 1, preparation: configuration }).$, "Finished")
      assert.equal(machine.settle(9999, start).$, "None")
      assert.equal(bounded.value.$, "Finished")
      assert.equal(bounded.value.result.selected, 0)
      assert.deepEqual(array(bounded.value.result.units), [])
      longPumpBoundaries++
    } else {
      assert.throws(() => dispatcher.initial({ invocation: 1, preparation: configuration }), {
        message: "Preparation internal dispatch did not settle"
      })
      const afterFirst = machine.advance(start.state)
      assert.equal(machine.settle(10000, afterFirst).$, "None")
      const accepted = machine.settle(10001, afterFirst)
      assert.equal(accepted.$, "Some")
      assert.equal(accepted.value.$, "Finished")
      assert.deepEqual(array(accepted.value.result.units), [])
      longPumpBoundaries += 2
    }
  }
  let cases = 0,
    totalRequests = 0
  function run(configuration, options = {}) {
    let step = machine.initial(1, configuration),
      last = -1
    assert.deepEqual(machine.initial_settled(1, configuration), originalPump(step))
    pumpComparisons++
    const captures = []
    const requests = []
    for (let fuel = 0; fuel < 10000; fuel++) {
      if (step.$ === "Internal") {
        step = machine.advance(step.state)
        continue
      }
      if (step.$ !== "Await") {
        return { step, requests }
      }
      const request = step.request,
        command = request.command
      assert.equal(request.invocation, 1)
      assert.equal(request.id, last + 1)
      last = request.id
      requests.push(command)
      totalRequests++
      assert.equal(
        machine.resume(step, { $: "Reply", invocation: 2, id: request.id, response: { $: "Cancelled" } }).reason,
        "wrong-correlation"
      )
      let response
      switch (command.$) {
        case "InspectPath":
          response = { $: "PathAllowed", path: command.candidate.path, selection: 1 }
          break
        case "CaptureSource": {
          const capture = {
            $: "Capture",
            path: command.path,
            handle: captures.length + 1,
            text: "x",
            content_hash: "hash",
            bytes: 1
          }
          captures.push(capture)
          response = { $: "SourceCaptured", capture }
          break
        }
        case "Preflight":
          response = { $: "PreflightDone", value: text("preflight") }
          break
        case "AdmitMaterialization":
          response = {
            $: "MaterializationDone",
            requested: 1024,
            result:
              options.materializationResult ??
              (options.refuseMaterialization
                ? { $: "CapacityRefused", constraint: "resident-ledger" }
                : { $: "Resized" })
          }
          break
        case "RejectMaterializationCapacity":
        case "RecordMaterializationCapacity":
          response = { $: "Ack" }
          break
        case "ExtractSource": {
          const declarations = roots(command.capture.path, options.rootCount ?? 2)
          response = {
            $: "SourceExtracted",
            extraction: {
              $: "Extraction",
              graph: some(list(declarations)),
              functions: some({
                $: "FunctionFile",
                failure: none,
                functions: list(
                  declarations.map((root) => ({
                    ...root,
                    id: root.id + ":fn",
                    declaration: {
                      ...root.declaration,
                      kind: "function",
                      name: root.declaration.name.replace("Root", "Fn")
                    }
                  }))
                ),
                exclusions: list([])
              }),
              type_file: { $: "TypeAnalyzed", analyses: list([]) }
            }
          }
          break
        }
        case "ResolveRoot": {
          const ordinal = requests.filter((value) => value.$ === "ResolveRoot").length
          if (options.cancelAtRoot === ordinal) response = { $: "Cancelled" }
          else if (options.failAtRoot === ordinal) response = { $: "TechnicalFailure", message: "provider exploded" }
          else
            response = {
              $: "RootResolved",
              unit:
                options.refuseFirst && ordinal === 1
                  ? none
                  : some(text(command.capture.path + ":" + command.root.name)),
              references: list(
                options.omitted && ordinal === 1
                  ? [
                      {
                        $: "../../../../source-analysis/src/direct-event/graph-resolution/traversal/core.ReferenceSlot",
                        owner: 1,
                        index: 0,
                        symbol: "missing",
                        reference: {
                          $: "../../../../source-analysis/src/direct-event/graph-resolution/traversal/core.Omitted",
                          reason: {
                            $: "../../../../source-analysis/src/direct-event/graph-resolution/traversal/core.Unresolved"
                          },
                          target_name: "missing"
                        }
                      }
                    ]
                  : []
              ),
              captures: list(captures)
            }
          break
        }
        case "RenderUnits":
          response = {
            $: "UnitsRendered",
            outcomes: list([
              { $: "OutcomeReady", path: command.context.capture.path, prepared: text(command.context.capture.path) }
            ])
          }
          break
        case "ClassifyAmbiguity":
          response = { $: "AmbiguityClassified", reason: none }
          break
        default:
          throw new Error("Unexpected provider " + command.$)
      }
      const reply = { $: "Reply", invocation: 1, id: request.id, response }
      const resumed = machine.resume(step, reply)
      assert.deepEqual(machine.resume_settled(step, reply), originalPump(resumed))
      pumpComparisons++
      step = resumed
    }
    throw new Error("Preparation did not settle")
  }
  const finished = (result) => {
    assert.equal(result.step.$, "Finished")
    cases++
    return result.step.result
  }
  const count = (result, tag) => result.requests.filter((value) => value.$ === tag).length
  let check = run(input([candidate("a.py"), candidate("b.py")], { contracts: list([contract, functionContract]) })),
    result = finished(check)
  assert.equal(result.complete, true)
  assert.equal(result.selected, 8)
  assert.equal(array(result.units).length, 8)
  for (const tag of ["CaptureSource", "Preflight", "AdmitMaterialization"]) assert.equal(count(check, tag), 2)
  assert.equal(count(check, "ExtractSource"), 4)
  assert.deepEqual(
    array(result.paths).map((path) => path.path),
    ["a.py", "b.py"]
  )
  assert.deepEqual(
    array(result.units).map((value) => value.value),
    ["a.py:Root0", "a.py:Root1", "b.py:Root0", "b.py:Root1", "a.py:Fn0", "a.py:Fn1", "b.py:Fn0", "b.py:Fn1"]
  )
  check = run(input([candidate("a.py")], { contracts: list([contract, functionContract]) }), {
    refuseMaterialization: true
  })
  result = finished(check)
  assert.equal(result.complete, false)
  for (const tag of ["CaptureSource", "Preflight", "AdmitMaterialization"]) assert.equal(count(check, tag), 1)
  assert.equal(count(check, "ExtractSource"), 0)
  assert.equal(array(result.paths)[0].diagnostic.value.$, "MaterializationRefused")
  for (const status of ["InvalidReservation", "InvalidMeasurement"]) {
    check = run(input([candidate("a.py")]), { materializationResult: { $: status } })
    result = finished(check)
    assert.equal(result.complete, false)
    assert.equal(array(result.paths)[0].diagnostic.value.$, "PreparationPanic")
    for (const tag of ["RejectMaterializationCapacity", "RecordMaterializationCapacity", "ExtractSource"])
      assert.equal(count(check, tag), 0)
  }
  check = run(input([candidate("a.py")], { contracts: list([contract, functionContract]) }), {
    rootCount: 40,
    refuseFirst: true
  })
  result = finished(check)
  assert.equal(result.selected, 64)
  assert.equal(count(check, "ResolveRoot"), 64)
  assert.equal(array(result.units).length, 63)
  assert.equal(result.complete, false)
  assert.equal(array(result.paths)[0].failures.head.reason, "missing-evidence")
  assert.equal(array(array(result.paths)[0].failures).filter((value) => value.reason === "reference-limit").length, 16)
  check = run(input([candidate("a.py")]), { omitted: true })
  result = finished(check)
  assert.equal(result.complete, false)
  assert.equal(array(result.units).length, 2)
  assert.equal(array(array(result.paths)[0].failures)[0].reason, "missing-evidence")
  for (const option of [{ cancelAtRoot: 2 }, { failAtRoot: 2 }]) {
    check = run(input([candidate("a.py")]), option)
    assert.equal(check.step.$, "Failed")
    assert.equal(count(check, "ResolveRoot"), 2)
    assert.equal(count(check, "RenderUnits"), 0)
    cases++
  }
  check = run(
    input([
      candidate("a.py", "CandidateDelete"),
      candidate("b.py", "CandidateMove"),
      candidate("c.py", "CandidateUpdate", [" \uFEFF"])
    ])
  )
  result = finished(check)
  assert.equal(check.requests.length, 0)
  assert.deepEqual(
    array(result.paths).map((path) => path.reason.value),
    ["unsupported-operation", "unsupported-operation", "metadata-only"]
  )
  check = run(input([candidate("a.py")], { frozen: some(list([])) }))
  result = finished(check)
  assert.equal(array(result.paths).length, 0)
  assert.equal(count(check, "CaptureSource"), 0)
  check = run(input([candidate("a.py")], { frozen: some(list([{ $: "FrozenPath", path: "a.py", names: list([]) }])) }))
  result = finished(check)
  assert.equal(array(result.paths).length, 1)
  assert.equal(result.selected, 0)
  for (let index = 0; index < 2; index++) {
    result = finished(run(input([candidate("fresh.py")]), { rootCount: 65 }))
    assert.equal(result.selected, 64)
    assert.equal(array(result.units).length, 64)
  }
  check = run(input([candidate("a.py")], { before_analyze: false }))
  finished(check)
  assert.equal(count(check, "Preflight"), 0)
  assert.equal(count(check, "AdmitMaterialization"), 0)
  const proofPath = join(import.meta.dirname, "PreparationPumpProof.bend")
  const sourcePath = join(import.meta.dirname, "Preparation.bend")
  const source = await readFile(sourcePath, "utf8")
  const proof = await readFile(proofPath, "utf8")
  const verdict = (path, mode) =>
    execFileSync("taskset", ["-c", "11", "bend", path, mode], { timeout: 10000, encoding: "utf8" })
  assert.match(verdict(proofPath, "--verdict"), /ALL PROOFS CHECK/u)
  const mutations = [
    ["exhausted", "    case 0n: None{}", "    case 0n: Some{step}"],
    [
      "internal_step",
      "case Internal{state}: settle(rest, advance(state))",
      'case Internal{state}: settle(rest, Failed{"mutant-skipped-advance"})'
    ],
    ["first_external", "case _: Some{step}", "case _: None{}"],
    ["initial_allowance", "settle(10000n, initial(invocation, input))", "settle(9999n, initial(invocation, input))"],
    ["resume_allowance", "settle(10000n, resume(step, reply))", "settle(9999n, resume(step, reply))"]
  ]
  const temporarySources = new Set()
  const cleanupSources = () => {
    for (const path of temporarySources) rmSync(path, { force: true })
  }
  const stopSources = () => {
    cleanupSources()
    process.exit(143)
  }
  process.once("exit", cleanupSources)
  process.once("SIGTERM", stopSources)
  let proofMutants = 0
  try {
    const pumpStart = source.indexOf("def settle(")
    assert.ok(pumpStart >= 0)
    const pump = source.slice(pumpStart)
    for (const [location, before, after] of mutations) {
      assert.equal(pump.split(before).length, 2, "unique existing pump mutation anchor")
      const identity = randomUUID()
      const mutatedName = "PreparationPumpMutant-" + identity + ".bend"
      const mutatedPath = join(import.meta.dirname, mutatedName)
      const mutatedProof = join(import.meta.dirname, "PreparationPumpMutantProof-" + identity + ".bend")
      temporarySources.add(mutatedPath)
      temporarySources.add(mutatedProof)
      await writeFile(mutatedPath, source.slice(0, pumpStart) + pump.replace(before, after))
      await writeFile(mutatedProof, proof.replace("./Preparation.bend", "./" + mutatedName))
      assert.match(verdict(mutatedPath, "--check-only"), /ALL PROOFS CHECK/u)
      let rejection
      try {
        verdict(mutatedProof, "--verdict")
      } catch (error) {
        rejection = error
      }
      assert.equal(rejection?.status, 1, "mathematical rejection; timeout is not qualification")
      const output = String(rejection.stdout) + String(rejection.stderr)
      assert.ok(output.includes("Location: " + location), "mutation must fail in its own obligation")
      assert.match(output, /expected/u)
      proofMutants++
      cleanupSources()
      temporarySources.clear()
    }
  } finally {
    cleanupSources()
    process.removeListener("exit", cleanupSources)
    process.removeListener("SIGTERM", stopSources)
  }
  assert.equal(await readFile(sourcePath, "utf8"), source)
  assert.equal(await readFile(proofPath, "utf8"), proof)
  console.log(
    JSON.stringify({
      passed: true,
      cases,
      requests: totalRequests,
      pumpComparisons,
      longPumpBoundaries,
      proofMutants,
      scope:
        "finite emitted whole preparation progression, contract/candidate order, shared cache/materialization refusal, quota-before-launch including refused root, fresh outer instances, cancellation/technical errors and frozen-path distinctions; simulated intermediate providers, no resident adoption or universal proof"
    })
  )
} finally {
  await rm(temporary, { recursive: true, force: true })
}
