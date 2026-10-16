import { preflightMutations } from "./mutations.mjs"
import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import { list, unlist } from "@hapsland/source-artifacts/direct-event/value/codec"

// Falsify the draft equations against the old native expression, including each
// measurement's fault prefix. This is not a proof or production qualification.
const temporary = mkdtempSync(join(tmpdir(), "hapsland-combined-preflight-spec-"))
try {
  const output = join(temporary, "specification.mjs")
  execFileSync(
    "timeout",
    ["10s", "taskset", "-c", "10", "bend", join(import.meta.dirname, "Specification.bend"), "-o", output],
    { timeout: 11000 }
  )
  const emitted = (await import(pathToFileURL(output))).default
  const normalize = (value) =>
    Array.isArray(value)
      ? value.map(normalize)
      : value !== null && typeof value === "object"
        ? Object.fromEntries(
            Object.entries(value).map(([key, item]) => [
              key,
              key === "$" && typeof item === "string" ? item.replace(/^(?:Model|Core)\./u, "") : normalize(item)
            ])
          )
        : value
  const spec = Object.fromEntries(
    Object.entries(emitted).map(([key, fn]) => [key, (...args) => normalize(fn(...args))])
  )
  const coreOutput = join(temporary, "core.mjs")
  execFileSync(
    "timeout",
    ["10s", "taskset", "-c", "10", "bend", join(import.meta.dirname, "Core.bend"), "-o", coreOutput],
    { timeout: 11000 }
  )
  const core = (await import(pathToFileURL(coreOutput))).default
  const verification = {}
  for (const name of ["Execution", "ProtocolReference"]) {
    const target = join(temporary, name + ".mjs")
    execFileSync(
      "timeout",
      ["10s", "taskset", "-c", "10", "bend", join(import.meta.dirname, name + ".bend"), "-o", target],
      { timeout: 11000 }
    )
    const module = (await import(pathToFileURL(target))).default
    verification[name] = Object.fromEntries(
      Object.entries(module).map(([key, fn]) => [key, (...args) => normalize(fn(...args))])
    )
  }
  // An imported Bend datatype carries the defining module's constructor name.
  // Keep this conversion in the verification ABI, outside production bindings.
  const coreConstructors = new Set([
    "Advance",
    "Engine",
    "AwaitSites",
    "AwaitRootImports",
    "AwaitTypeImports",
    "AwaitGo",
    "Completed",
    "InvalidReply",
    "Ack",
    "SitesObserved",
    "ImportsObserved",
    "GoInspected",
    "Functions",
    "FunctionSites",
    "Sites",
    "Finish",
    "Imports"
  ])
  const importedCore = (value) =>
    Array.isArray(value)
      ? value.map(importedCore)
      : value !== null && typeof value === "object"
        ? Object.fromEntries(
            Object.entries(value).map(([key, item]) => [
              key,
              key === "$" && coreConstructors.has(item) ? "Core." + item : importedCore(item)
            ])
          )
        : value
  const execution = verification.Execution,
    protocol = Object.fromEntries(
      Object.entries(verification.ProtocolReference).map(([key, fn]) => [
        key,
        (...args) => fn(...args.map(importedCore))
      ])
    )
  let protocolCases = 0
  const runCore = (
    initial,
    counts = [],
    rootImports = false,
    typeImports = false,
    goValid = false,
    grouped = false
  ) => {
    let step = initial,
      priorRequest = -1
    const operations = []
    for (let limit = 0; limit < 10000; limit++) {
      if (step.$ === "Completed") {
        assert.equal(core.resume(step, { $: "Ack", request: 0 }).$, "InvalidReply")
        assert.equal(core.resume_group(step, { $: "Ack", request: 0 }).$, "InvalidReply")
        return { decision: normalize(step.decision), operations }
      }
      if (step.$ === "Advance") {
        assert.equal(core.resume(step, { $: "Ack", request: step.request }).$, "InvalidReply")
        assert.equal(core.resume_group(step, { $: "Ack", request: step.request }).$, "InvalidReply")
        step = core.advance(step)
        continue
      }
      assert.equal(step.request, priorRequest + 1)
      priorRequest = step.request
      let reply
      switch (step.$) {
        case "Engine":
          operations.push(normalize(step.operation))
          reply = { $: "Ack", request: step.request }
          if (grouped) {
            operations.push(...unlist(step.remaining).map(normalize))
            priorRequest += unlist(step.remaining).length
            // Compare the exact Step, including the next request, against the
            // original scalar resume chain, not merely its terminal result.
            let sequential = step
            while (sequential.$ === "Engine")
              sequential = core.resume(sequential, { $: "Ack", request: sequential.request })
            assert.deepEqual(core.resume_group(step, reply), sequential)
            assert.equal(core.resume_group(step, { ...reply, request: step.request + 1 }).$, "InvalidReply")
            assert.equal(
              core.resume_group(step, { $: "SitesObserved", request: step.request, count: 0 }).$,
              "InvalidReply"
            )
          }
          assert.equal(core.resume(step, { $: "SitesObserved", request: step.request, count: 0 }).$, "InvalidReply")
          break
        case "AwaitSites":
          operations.push({ $: "ObserveSites", function_slot: step.slot })
          reply = { $: "SitesObserved", request: step.request, count: counts[step.slot] }
          break
        case "AwaitRootImports":
          operations.push({ $: "ObserveRootImports" })
          reply = { $: "ImportsObserved", request: step.request, present: rootImports }
          break
        case "AwaitTypeImports":
          operations.push({ $: "ReadTypeImports" })
          reply = { $: "ImportsObserved", request: step.request, present: typeImports }
          break
        case "AwaitGo":
          operations.push({ $: "InspectGo" })
          reply = { $: "GoInspected", request: step.request, valid: goValid }
          break
        default:
          assert.fail(step.$)
      }
      assert.equal(core.advance(step).$, "InvalidReply")
      assert.equal(core.resume(step, { ...reply, request: step.request + 1 }).$, "InvalidReply")
      if (step.$ !== "Engine") assert.equal(core.resume(step, { $: "Ack", request: step.request }).$, "InvalidReply")
      protocolCases++
      if (step.$ !== "Engine") assert.equal(core.resume_group(step, reply).$, "InvalidReply")
      step = grouped && step.$ === "Engine" ? core.resume_group(step, reply) : core.resume(step, reply)
    }
    assert.fail("finite fixture failed to terminate")
  }
  let groupEquivalenceCases = 0
  const initial = core.typescript(true, 0, 1, false)
  for (const count of [0, 1, 2, 12])
    for (const request of [0, 7, 65535, 2 ** 40]) {
      const step = { ...initial, request, remaining: list(Array.from({ length: count }, () => ({ $: "Model.Add" }))) }
      let sequential = step
      while (sequential.$ === "Engine") sequential = core.resume(sequential, { $: "Ack", request: sequential.request })
      assert.deepEqual(core.resume_group(step, { $: "Ack", request }), sequential)
      assert.equal(core.resume_group(step, { $: "Ack", request: request + 16 }).$, "InvalidReply")
      groupEquivalenceCases++
    }
  const operationEvents = (operations, fixture, fault, faultToken) => {
    const stack = [],
      events = []
    const read = (key, value) => {
      events.push(key)
      if (events.length === fault) throw faultToken
      return value
    }
    try {
      for (const operation of operations) {
        switch (operation.$) {
          case "Push":
            stack.push(operation.value)
            break
          case "MeasureArtifact":
            stack.push(read(`artifact:${operation.function_slot}`, fixture.artifact))
            break
          case "ObserveSites":
            read(`sites:${operation.function_slot}`, undefined)
            break
          case "MeasureRawSite":
            stack.push(read(`site:${operation.function_slot}:${operation.site_slot}`, fixture.site))
            break
          case "MeasureRawPath":
            stack.push(read("path", fixture.path))
            break
          case "ReadTypeBytes":
            stack.push(read("type", fixture.type ?? 0))
            break
          case "ObserveRootImports":
            read("root-imports", fixture.rootImports)
            break
          case "ReadTypeImports":
            read("type-imports", fixture.typeImports)
            break
          case "Swap": {
            const right = stack.pop(),
              left = stack.pop()
            stack.push(right, left)
            break
          }
          case "Add": {
            const right = stack.pop(),
              left = stack.pop()
            stack.push(left + right)
            break
          }
          case "Multiply": {
            const right = stack.pop(),
              left = stack.pop()
            stack.push(left * right)
            break
          }
          default:
            assert.fail(operation.$)
        }
      }
      assert.equal(stack.length, 1)
      return { value: stack[0], events }
    } catch (error) {
      return { error, events }
    }
  }
  const original = (counts, fixture, fault, faultToken) => {
    const events = []
    const read = (key, value) => {
      events.push(key)
      if (events.length === fault) throw faultToken
      return value
    }
    try {
      let total = 0
      for (let f = 0; f < counts.length; f++) {
        let bytes = read(`artifact:${f}`, fixture.artifact) + 1024
        read(`sites:${f}`, undefined)
        for (let s = 0; s < counts[f]; s++)
          bytes += 4 * (1024 + 6 * read(`site:${f}:${s}`, fixture.site) + 2 * read("path", fixture.path))
        total += bytes
      }
      const value = read("type", fixture.type ?? 0) + total
      read("root-imports", fixture.rootImports) || read("type-imports", fixture.typeImports)
      return { value, events }
    } catch (error) {
      return { error, events }
    }
  }
  let cases = 0
  for (const counts of [[], [0], [1], [3, 0, 2]]) {
    for (const type of [undefined, -0, 13, NaN, Infinity]) {
      const fixture = { type, artifact: 111, site: 17, path: 5, rootImports: type === 13, typeImports: true }
      const operations = unlist(spec.measured_operations(list(counts), fixture.rootImports))
      assert.deepEqual(
        runCore(core.typescript(true, 1, counts.length, true), counts, fixture.rootImports, fixture.typeImports)
          .operations,
        operations
      )
      assert.deepEqual(
        runCore(
          core.typescript(true, 1, counts.length, true),
          counts,
          fixture.rootImports,
          fixture.typeImports,
          false,
          true
        ).operations,
        operations
      )
      const expected = original(counts, fixture)
      assert.deepEqual(operationEvents(operations, fixture), expected)
      for (let fault = 1; fault <= expected.events.length; fault++) {
        const faultToken = Object.freeze({ fault })
        const actual = operationEvents(operations, fixture, fault, faultToken)
        assert.deepEqual(actual, original(counts, fixture, fault, faultToken))
        assert.equal(actual.error, faultToken)
      }
      cases += expected.events.length + 1
    }
  }
  for (const valid of [false, true])
    for (const types of [0, 1, 1024, 1025])
      for (const counts of [[], [0], [0, 1]])
        for (const bound of [false, true])
          for (const imports of [false, true])
            for (const typeImports of [false, true]) {
              const plan = spec.typescript(valid, types, list(counts), bound, imports, typeImports)
              assert.deepEqual(
                runCore(core.typescript(valid, types, counts.length, bound), counts, imports, typeImports),
                { decision: plan.decision, operations: unlist(plan.operations) }
              )
              assert.deepEqual(
                runCore(core.typescript(valid, types, counts.length, bound), counts, imports, typeImports, false, true),
                { decision: plan.decision, operations: unlist(plan.operations) }
              )
              assert.deepEqual(execution.typescript(valid, types, list(counts), bound, imports, typeImports), {
                $: "Some",
                value: plan
              })
              const count = types + counts.length
              const refused = !valid || count > 1024 || (count > 0 && types > 0 && !bound)
              assert.equal(plan.decision.$, refused ? "Unavailable" : count === 0 ? "MeasuredEmpty" : "Measured")
              if (refused) assert.deepEqual(unlist(plan.operations), [])
              else {
                assert.equal(plan.decision.imports, imports || typeImports)
                if (count > 0) assert.equal(plan.decision.declarations, count)
              }
              if (!refused && count === 0)
                assert.deepEqual(
                  unlist(plan.operations),
                  imports ? [{ $: "ObserveRootImports" }] : [{ $: "ObserveRootImports" }, { $: "ReadTypeImports" }]
                )
              cases++
            }
  for (const bound of [false, true])
    for (const valid of [false, true]) {
      const plan = spec.go(bound, valid)
      assert.deepEqual(runCore(core.go(bound), [], false, false, valid), {
        decision: plan.decision,
        operations: unlist(plan.operations)
      })
      assert.deepEqual(execution.go(bound, valid), { $: "Some", value: plan })
      assert.equal(plan.decision.$, bound ? "RetainBound" : valid ? "MeasuredEmpty" : "Unavailable")
      assert.deepEqual(unlist(plan.operations), bound ? [] : [{ $: "InspectGo" }])
      cases++
    }
  for (const bound of [false, true]) {
    assert.deepEqual(execution.passthrough(bound), { $: "Some", value: spec.passthrough(bound) })
    assert.deepEqual(runCore(core.passthrough(bound)), { decision: spec.passthrough(bound).decision, operations: [] })
    assert.deepEqual(spec.passthrough(bound), {
      $: "Plan",
      decision: { $: bound ? "RetainBound" : "Unavailable" },
      operations: list([])
    })
    cases++
  }
  let protocolReferenceCases = 0,
    advanceReferenceCases = 0
  for (const request of [0, 7, 2 ** 40]) {
    const phase = { $: "Finish", count: 7 }
    const phases = [
      phase,
      ...[false, true].map((empty) => ({ $: "Imports", count: 7, empty })),
      ...[0, 2].flatMap((remaining) => [
        { $: "Functions", slot: 2, remaining, count: 7 },
        { $: "Sites", slot: 2, site: 3, remaining, remaining_functions: 4, count: 7 }
      ]),
      { $: "FunctionSites", slot: 2, remaining_functions: 3, count: 7 }
    ]
    const states = [
      { $: "InvalidReply" },
      { $: "Completed", decision: { $: "Model.Unavailable" } },
      ...phases.map((phase) => ({ $: "Advance", phase, request })),
      {
        $: "Engine",
        operation: { $: "Model.Push", value: 4 },
        request,
        remaining: list([{ $: "Model.Add" }]),
        next: phase
      },
      { $: "AwaitSites", slot: 2, remaining_functions: 3, count: 7, request },
      ...[false, true].flatMap((empty) => [
        { $: "AwaitRootImports", count: 7, empty, request },
        { $: "AwaitTypeImports", count: 7, empty, request }
      ]),
      { $: "AwaitGo", request }
    ]
    for (const step of states) {
      assert.deepEqual(normalize(core.advance(step)), protocol.advance(step))
      advanceReferenceCases++
    }
    for (const step of states)
      for (const actual of [request, request + 1])
        for (const reply of [
          { $: "Ack", request: actual },
          { $: "SitesObserved", request: actual, count: 3 },
          ...[false, true].flatMap((present) => [
            { $: "ImportsObserved", request: actual, present },
            { $: "GoInspected", request: actual, valid: present }
          ])
        ]) {
          assert.deepEqual(normalize(core.resume(step, reply)), protocol.resume(step, reply))
          assert.deepEqual(normalize(core.resume_group(step, reply)), protocol.group(step, reply))
          protocolReferenceCases++
        }
  }
  assert.deepEqual(execution.started({ $: "InvalidReply" }, list([]), false, false), { $: "None" })
  assert.deepEqual(
    execution.started({ $: "Advance", phase: { $: "Finish", count: 0 }, request: 0 }, list([]), false, false),
    { $: "None" }
  )

  // Real, compiling Core mutations falsify the proposed whole/protocol laws.
  // Temporary copies are diagnostics, never source snapshots or recovery inputs.
  const mutations = preflightMutations
  for (const [name, from, to, law, entry, args] of mutations) {
    const directory = join(temporary, name)
    mkdirSync(directory)
    for (const file of ["Model.bend", "Core.bend", "Execution.bend"])
      copyFileSync(join(import.meta.dirname, file), join(directory, file))
    const path = join(directory, "Core.bend"),
      source = readFileSync(path, "utf8")
    assert.equal(source.split(from).length, 2, name + ": unique semantic anchor")
    writeFileSync(path, source.replace(from, to))
    const target = join(directory, "mutant.mjs")
    execFileSync(
      "timeout",
      ["10s", "taskset", "-c", "10", "bend", join(directory, entry ? "Execution.bend" : "Core.bend"), "-o", target],
      { timeout: 11000 }
    )
    const mutant = (await import(pathToFileURL(target))).default
    if (entry) {
      const inputs = entry === "typescript" ? args.map((value, index) => (index === 2 ? list(value) : value)) : args
      assert.notDeepEqual(normalize(mutant[entry](...inputs)), { $: "Some", value: spec[entry](...inputs) }, name)
    } else if (name === "advance_request_reset") {
      const step = { $: "Advance", phase: { $: "Imports", count: 7, empty: false }, request: 7 }
      assert.notDeepEqual(normalize(mutant.advance(step)), protocol.advance(step), name)
    } else {
      const scalar = law === "scalar_protocol_exact"
      const step = scalar
        ? { $: "AwaitSites", slot: 0, remaining_functions: 0, count: 1, request: 0 }
        : core.typescript(true, 0, 1, false)
      const reply = scalar
        ? { $: "SitesObserved", request: 1, count: 0 }
        : { $: "Ack", request: step.request + (name === "wrong_group_ack_accepted" ? 1 : 0) }
      assert.notDeepEqual(
        normalize(mutant[scalar ? "resume" : "resume_group"](step, reply)),
        protocol[scalar ? "resume" : "group"](step, reply),
        name
      )
    }
    console.log(
      JSON.stringify({
        mutant: name,
        law,
        rejected: true,
        scope: "finite executable falsification, not kernel proof mutation"
      })
    )
  }
  console.log(
    JSON.stringify({
      cases,
      protocolCases,
      groupEquivalenceCases,
      protocolReferenceCases,
      advanceReferenceCases,
      semanticMutants: mutations.length,
      scope:
        "draft combined preflight machine/spec agreement, native measurement/fault order, IEEE expression and reply correlation; whole grouped driver/spec agreement; universal proofs checked separately; whole acceptance remains open"
    })
  )
} finally {
  rmSync(temporary, { recursive: true, force: true })
}
