import assert from "node:assert/strict"
import { execFileSync, spawnSync } from "node:child_process"
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { pathToFileURL } from "node:url"

const temporary = mkdtempSync(join(tmpdir(), "hapsland-root-traces-"))
try {
  const compile = async (name) => {
    const output = join(temporary, name + ".mjs")
    execFileSync("taskset", ["-c", "10", "bend", join(import.meta.dirname, name + ".bend"), "-o", output], {
      timeout: 10000
    })
    return (await import(pathToFileURL(output))).default
  }
  const m = await compile("RootSpecification"),
    execution = await compile("DeliveryExecution")
  const prefix = (name) => {
    const key = Object.keys(m).find((key) => key.endsWith(name))
    assert.ok(key, "missing authored entry " + name)
    return key.slice(0, key.lastIndexOf(".") + 1)
  }
  const modules = {
    root: {
      path: "../CollectionHandoff.bend",
      prefix: prefix("CollectionHandoff.resume"),
      imports: { Handoff: "handoff", Collection: "collection" }
    },
    handoff: { path: "../Handoff.bend", prefix: prefix("Handoff.collection_gate_resume"), imports: {} },
    collection: { path: "../../Collection.bend", prefix: prefix("Collection.collect_resume"), imports: {} }
  }
  const collectionSpec = prefix("CollectionSpecification.collection_spec_resume")
  const mutant = process.argv.find((arg) => arg.startsWith("--mutant="))?.slice(9)
  if (mutant) {
    const negative = await compile("DeliveryMutants")
    if (mutant === "skip-second-pass") m[modules.collection.prefix + "resume"] = negative.selection_without_second_pass
    else if (mutant === "cutoff-not-atomic") m[modules.root.prefix + "atomic"] = negative.root_without_cutoff_atomic
    else assert.fail("unknown mutant " + mutant)
  }
  const tagged = (module, name, fields = {}) => ({ $: modules[module].prefix + name, ...fields })
  const list = (items) => items.reduceRight((tail, head) => ({ $: "Con", head, tail }), { $: "Nil" })
  const unlist = (items) => {
    const values = []
    for (; items.$ === "Con"; items = items.tail) values.push(items.head)
    assert.equal(items.$, "Nil")
    return values
  }
  const split = (text) => {
    const parts = []
    let depth = 0,
      start = 0
    for (let at = 0; at < text.length; at++) {
      if (text[at] === "<") depth++
      if (text[at] === ">") depth--
      if (text[at] === "," && depth === 0) {
        parts.push(text.slice(start, at).trim())
        start = at + 1
      }
    }
    parts.push(text.slice(start).trim())
    return parts.filter(Boolean)
  }
  const types = new Map()
  for (const [module, declaration] of Object.entries(modules)) {
    const source = readFileSync(join(import.meta.dirname, declaration.path), "utf8")
    for (const [, name, body] of source.matchAll(/type (\w+) is Data:\n([\s\S]*?)(?=\n(?:type |def |#)|$)/g))
      types.set(
        module + "." + name,
        [...body.matchAll(/(\w+)\{([^{}]*)\}/g)].map(([, name, fields]) => ({
          name,
          fields: split(fields).map((field) => field.split(":").map((part) => part.trim()))
        }))
      )
  }
  let seed = 1
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    return seed
  }
  const constructors = (module, type) => {
    const values = types.get(module + "." + type)
    assert.ok(values?.length, "missing nominal fixture type " + module + "." + type)
    return values
  }
  const make = (module, constructor) =>
    tagged(
      module,
      constructor.name,
      Object.fromEntries(constructor.fields.map(([name, type]) => [name, generate(module, type)]))
    )
  const generate = (module, type) => {
    if (type === "Nat") return random() % 4
    if (type === "Bool") return !!(random() & 8)
    if (type === "String") return ["", "a", "b", "a"][random() % 4]
    if (type.startsWith("List<"))
      return list(Array.from({ length: random() % 4 }, () => generate(module, split(type.slice(5, -1))[1])))
    if (type.startsWith("Maybe<"))
      return random() & 8 ? { $: "Some", value: generate(module, split(type.slice(6, -1))[1]) } : { $: "None" }
    if (type.includes(".")) {
      const [owner, name] = type.split(".")
      return generate(modules[module].imports[owner], name)
    }
    const variants = constructors(module, type)
    return make(module, variants[random() % variants.length])
  }
  const actual = (module, method, ...args) => m[modules[module].prefix + method](...args)
  let comparisons = 0,
    prefixes = 0,
    traces = 0,
    terminal = 0,
    unfinished = 0
  const equal = (actual, expected, label) => {
    assert.deepEqual(actual, expected, JSON.stringify(label))
    comparisons++
  }
  const suites = [
    {
      module: "collection",
      phase: "Phase",
      response: "Response",
      command: "Command",
      reply: "Reply",
      resume: "resume",
      spec: collectionSpec + "selection_spec_resume",
      state: "State",
      awaiting: "Await",
      request: "Request",
      atomic: "atomic",
      specAtomic: collectionSpec + "selection_spec_atomic"
    },
    {
      module: "collection",
      phase: "FlowPhase",
      response: "FlowResponse",
      command: "FlowCommand",
      reply: "FlowReply",
      resume: "collect_resume",
      spec: collectionSpec + "collection_spec_resume",
      state: "FlowState",
      awaiting: "FlowAwait",
      request: "FlowRequest",
      atomic: "collect_atomic",
      specAtomic: collectionSpec + "collection_spec_atomic"
    },
    {
      module: "handoff",
      phase: "GPhase",
      response: "GResponse",
      command: "GCommand",
      reply: "GReply",
      resume: "collection_gate_resume",
      spec: "gate_resume",
      awaiting: "GAwait",
      request: "GRequest",
      atomic: "collection_gate_atomic",
      specAtomic: "gate_atomic"
    },
    {
      module: "root",
      phase: "RootPhase",
      response: "RootResponse",
      command: "RootCommand",
      reply: "RootReply",
      resume: "resume",
      spec: "root_spec_resume",
      awaiting: "RootAwait",
      request: "RootRequest",
      atomic: "atomic",
      specAtomic: "root_spec_atomic"
    }
  ]
  const cutoffCommand = tagged("handoff", "GGate", { extra: 0 })
  const cutoff = tagged("root", "RootAwait", {
    invocation: 7,
    id: 19,
    phase: tagged("root", "RootGating", {
      step: tagged("handoff", "GAwait", {
        invocation: 7,
        id: 19,
        phase: tagged("handoff", "GGateRead", { round: true }),
        request: tagged("handoff", "GRequest", { invocation: 7, id: 19, command: cutoffCommand })
      }),
      composed: true,
      turn_end: true,
      flags: tagged("root", "RootFlags", { finish: true, report: false })
    }),
    request: tagged("root", "RootRequest", {
      invocation: 7,
      id: 19,
      command: tagged("root", "RootGate", { command: cutoffCommand })
    })
  })
  equal(actual("root", "atomic", cutoff), m.root_spec_atomic(cutoff), ["cutoff-atomic"])
  assert.equal(actual("root", "atomic", cutoff), true)
  for (let round = 0; round < 32; round++) {
    seed = round + 1
    for (const suite of suites)
      for (const variant of constructors(suite.module, suite.phase)) {
        const phase = make(suite.module, variant),
          request = tagged(suite.module, suite.request, {
            invocation: 7,
            id: 19,
            command: generate(suite.module, suite.command)
          })
        const fields = suite.state
          ? { state: tagged(suite.module, suite.state, { invocation: 7, next: 19, phase }), request }
          : { invocation: 7, id: 19, phase, request }
        const step = tagged(suite.module, suite.awaiting, fields)
        equal(actual(suite.module, suite.atomic, step), m[suite.specAtomic](step), [
          suite.phase,
          variant.name,
          "atomic"
        ])
        for (const response of constructors(suite.module, suite.response))
          for (const [invocation, id] of [
            [7, 19],
            [8, 19],
            [7, 20]
          ]) {
            const reply = tagged(suite.module, suite.reply, { invocation, id, response: make(suite.module, response) })
            equal(actual(suite.module, suite.resume, step, reply), m[suite.spec](step, reply), [
              round,
              suite.phase,
              variant.name,
              response.name,
              invocation,
              id
            ])
            if (invocation === 7 && id === 19)
              for (const header of [
                { ...request, invocation: 8 },
                { ...request, id: 20 }
              ]) {
                const inconsistent = { ...step, request: header }
                equal(actual(suite.module, suite.resume, inconsistent, reply), m[suite.spec](inconsistent, reply), [
                  suite.phase,
                  "duplicate-request-header"
                ])
              }
          }
      }
  }
  const flowResponses = () =>
    constructors("collection", "FlowResponse").flatMap((variant) =>
      variant.name === "RPrimitive"
        ? constructors("collection", "Response").map((inner) =>
            tagged("collection", "RPrimitive", { response: make("collection", inner) })
          )
        : [make("collection", variant)]
    )
  const rootResponses = () =>
    constructors("root", "RootResponse").flatMap((variant) => {
      if (variant.name === "RootCollected")
        return flowResponses().map((response) => tagged("root", variant.name, { response }))
      if (variant.name === "RootGated")
        return constructors("handoff", "GResponse").map((inner) =>
          tagged("root", variant.name, { response: make("handoff", inner) })
        )
      if (variant.name === "RootReserved")
        return constructors("handoff", "RResponse").map((inner) =>
          tagged("root", variant.name, { response: make("handoff", inner) })
        )
      return [make("root", variant)]
    })
  const run = (initial, reference, label) => {
    equal(initial, reference, [label, "initial"])
    let step = initial,
      expected = reference
    const tape = [],
      observations = []
    for (let turn = 0; turn < 64 && step.$ === tagged("root", "RootAwait").$; turn++) {
      equal(execution.run_root(list(tape), initial), m.run_root(list(tape), reference), [label, "prefix", turn])
      prefixes++
      const candidates = rootResponses()
      if (random() & 8) candidates.reverse()
      let chosen
      for (const response of candidates) {
        if (seed % 3 && ["RootEditTimedOut", "RootEditLost"].some((name) => response.$ === tagged("root", name).$))
          continue
        const reply = tagged("root", "RootReply", {
          invocation: step.request.invocation,
          id: step.request.id,
          response
        })
        const next = actual("root", "resume", step, reply)
        if (next.$ !== tagged("root", "RootRejected").$) {
          chosen = { reply, next }
          break
        }
      }
      assert.ok(chosen, "reachable root phase must accept a typed response")
      observations.push({ $: "DeliveryTrace.RootEvent", request: step.request, atomic: actual("root", "atomic", step) })
      tape.push(chosen.reply)
      expected = m.root_spec_resume(expected, chosen.reply)
      step = chosen.next
      equal(step, expected, [label, "advance", turn])
    }
    const observed = execution.run_root(list(tape), initial)
    equal(observed, m.run_root(list(tape), reference), [label, "whole"])
    equal(unlist(observed.requests), observations, [label, "order/atomic"])
    equal(observed.final, step, [label, "final"])
    if (step.$ === tagged("root", "RootAwait").$) unfinished++
    else {
      const extra = tagged("root", "RootReply", { invocation: 7, id: 999, response: generate("root", "RootResponse") })
      const held = execution.run_root(list([...tape, extra]), initial)
      equal(held, m.run_root(list([...tape, extra]), reference), [label, "terminal"])
      equal(unlist(held.remaining), [extra], [label, "unconsumed"])
      terminal++
    }
    traces++
  }
  for (let round = 0; round < 32; round++) {
    seed = round + 1
    const input = generate("root", "RootInput")
    run(actual("root", "initial", 7, input), m.root_spec_initial(7, input), "request")
    for (const composed of [false, true])
      for (const turnEnd of [false, true])
        run(
          actual("root", "direct_initial", 7, composed, turnEnd),
          m.root_spec_direct_initial(7, composed, turnEnd),
          "direct"
        )
    for (const partition of ["", "a", "b"]) {
      run(actual("root", "edit_initial", 7, partition), m.root_spec_edit_initial(7, partition), "edit")
      run(actual("root", "status_initial", 7, partition), m.root_spec_status_initial(7, partition), "status")
    }
  }
  assert.ok(prefixes > 0 && terminal > 0)
  assert.equal(mutant, undefined, "mutant escaped the independent checker")
  for (const name of ["skip-second-pass", "cutoff-not-atomic"]) {
    const rejected = spawnSync(process.execPath, [import.meta.filename, "--mutant=" + name], {
      encoding: "utf8",
      timeout: 30000
    })
    assert.equal(rejected.status, 1, rejected.stdout + rejected.stderr)
    assert.match(rejected.stderr, /AssertionError/u)
    assert.doesNotMatch(rejected.stderr, /mutant escaped/u)
    assert.match(rejected.stderr, name === "cutoff-not-atomic" ? /cutoff-atomic/u : /Phase/u)
  }
  console.log(
    JSON.stringify({
      passed: true,
      cases: traces,
      comparisons,
      prefixes,
      traces,
      terminal,
      unfinished,
      rejectedMutants: ["skip-second-pass", "cutoff-not-atomic"],
      phases: Object.fromEntries(suites.map((suite) => [suite.phase, constructors(suite.module, suite.phase).length])),
      scope:
        "independent complete Collection/selection/G/Root transitions and finite request/direct/edit/status traces, atomic boundaries and terminal remainder; finite evidence, not universal proof or physical custody"
    })
  )
} finally {
  rmSync(temporary, { recursive: true, force: true })
}
