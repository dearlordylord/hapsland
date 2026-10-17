import assert from "node:assert/strict"
import { readFileSync, mkdtempSync, rmSync } from "node:fs"
import { execFileSync, spawnSync } from "node:child_process"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
const temporary = mkdtempSync(join(tmpdir(), "hapsland-finalize-traces-"))
try {
  const compile = async (name) => {
    const output = join(temporary, name + ".mjs")
    execFileSync("taskset", ["-c", "10", "bend", join(import.meta.dirname, name + ".bend"), "-o", output], {
      timeout: 10000
    })
    return (await import(pathToFileURL(output))).default
  }
  const m = await compile("FinalizeSpecification"),
    execution = await compile("DeliveryExecution")
  const mutant = process.argv.includes("--mutant=skip-write")
  if (mutant) m["../Handoff.delivery_finalize_resume"] = (await compile("DeliveryMutants")).finalize_without_write
  const source = readFileSync(join(import.meta.dirname, "../Handoff.bend"), "utf8")
  const types = new Map()
  const split = (s) => {
    const out = []
    let level = 0,
      start = 0
    for (let i = 0; i < s.length; i++) {
      if (s[i] === "<") level++
      if (s[i] === ">") level--
      if (s[i] === "," && level === 0) {
        out.push(s.slice(start, i).trim())
        start = i + 1
      }
    }
    out.push(s.slice(start).trim())
    return out.filter(Boolean)
  }
  for (const [, name, body] of source.matchAll(/type (\w+) is Data:\n([\s\S]*?)(?=\n(?:type |def |#)|$)/g)) {
    types.set(
      name,
      [...body.matchAll(/(\w+)\{([^{}]*)\}/g)].map(([, name, fields]) => ({
        name,
        fields: split(fields).map((f) => f.split(":").map((s) => s.trim()))
      }))
    )
  }
  let seed = 1
  const rand = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    return seed
  }
  const h = (name, fields = {}) => ({ $: "../Handoff." + name, ...fields })
  function gen(type) {
    if (type === "Nat") return rand() % 4
    if (type === "Bool") return !!(rand() & 8)
    if (type === "String") return ["", "a", "b", "a"][rand() % 4]
    if (type.startsWith("List<")) {
      const inner = split(type.slice(5, -1))[1]
      let out = { $: "Nil" }
      for (let n = rand() % 4; n > 0; n--) out = { $: "Con", head: gen(inner), tail: out }
      return out
    }
    if (type.startsWith("Maybe<")) {
      return rand() & 8 ? { $: "Some", value: gen(split(type.slice(6, -1))[1]) } : { $: "None" }
    }
    const cs = types.get(type)
    if (!cs) throw new Error(type)
    return make(cs[rand() % cs.length])
  }
  function make(c) {
    return h(c.name, Object.fromEntries(c.fields.map(([name, type]) => [name, gen(type)])))
  }
  let count = 0
  const eq = (a, b, label) => {
    try {
      assert.deepEqual(a, b)
      count++
    } catch (e) {
      console.error("Mismatch", label)
      throw e
    }
  }
  for (let s = 0; s < 96; s++) {
    seed = s + 1
    const input = gen("FInput"),
      rin = gen("RInput")
    eq(m["../Handoff.finalize_initial"](7, input), m.finalize_spec_initial(7, input), ["F initial", s, input])
    for (const transport of [false, true])
      eq(
        m["../Handoff.delivery_finalize_initial"](7, transport, input),
        m.delivery_finalize_spec_initial(7, transport, input),
        ["D initial", s]
      )
    eq(m["../Handoff.reconcile_initial"](7, rin), m.reconcile_spec_initial(7, rin), ["R initial", s])
    eq(m["../Handoff.reserve_finish_initial"](7, rin), m.reserve_finish_spec_initial(7, rin), ["reserve", s])
    for (const [prefix, actual, spec] of [
      ["F", "finalize_resume", "finalize_spec_resume"],
      ["R", "reconcile_resume", "reconcile_spec_resume"],
      ["D", "delivery_finalize_resume", "delivery_finalize_spec_resume"]
    ]) {
      for (const pc of types.get(prefix + "Phase")) {
        const phase = make(pc),
          request = h(prefix + "Request", { invocation: 7, id: 19, command: gen(prefix + "Command") })
        const step =
          prefix === "F"
            ? h("FAwait", { state: h("FState", { invocation: 7, next: 19, phase }), request })
            : h(prefix + "Await", { invocation: 7, id: 19, phase, request })
        for (const rc of types.get(prefix + "Response")) {
          const response = make(rc)
          for (const [invocation, id] of [
            [7, 19],
            [8, 19],
            [7, 20]
          ]) {
            const reply = h(prefix + "Reply", { invocation, id, response })
            eq(m["../Handoff." + actual](step, reply), m[spec](step, reply), [prefix, s, phase, response])
          }
        }
      }
    }
  }

  const list = (values) => values.reduceRight((tail, head) => ({ $: "Con", head, tail }), { $: "Nil" })
  const unlist = (values) => {
    const out = []
    for (; values.$ === "Con"; values = values.tail) out.push(values.head)
    assert.equal(values.$, "Nil")
    return out
  }
  let traces = 0,
    prefixes = 0,
    terminal = 0
  const run = (kind, initial, specInitial) => {
    eq(initial, specInitial, ["initial", kind])
    const actualResume = kind === "finalize" ? "delivery_finalize_resume" : "reconcile_resume"
    const specResume = kind === "finalize" ? "delivery_finalize_spec_resume" : "reconcile_spec_resume"
    const prefix = kind === "finalize" ? "D" : "R"
    const replies = [],
      requests = []
    let step = initial,
      reference = specInitial
    for (let turn = 0; turn < 64 && step.$ === "../Handoff." + prefix + "Await"; turn++) {
      const request = step.request
      const candidates = types
        .get(prefix + "Response")
        .flatMap((c) =>
          c.name === "DFinalized"
            ? types.get("FResponse").map((f) => h("DFinalized", { response: make(f) }))
            : c.name === "DReconciled"
              ? types.get("RResponse").map((r) => h("DReconciled", { response: make(r) }))
              : [make(c)]
        )
      if (rand() & 8) candidates.reverse()
      let selected
      for (const response of candidates) {
        const reply = h(prefix + "Reply", { invocation: request.invocation, id: request.id, response })
        const next = m["../Handoff." + actualResume](step, reply)
        if (next.$ !== "../Handoff." + prefix + "Rejected") {
          selected = { reply, next }
          break
        }
      }
      assert.ok(selected, "at least one type-valid response must advance a reachable request")
      eq(execution["run_" + kind](list(replies), initial), m["run_" + kind](list(replies), specInitial), [
        "prefix",
        kind
      ])
      prefixes++
      requests.push(request)
      replies.push(selected.reply)
      reference = m[specResume](reference, selected.reply)
      step = selected.next
      eq(step, reference, ["step", kind])
    }
    const result = execution["run_" + kind](list(replies), initial)
    eq(result, m["run_" + kind](list(replies), specInitial), ["trace", kind])
    assert.deepEqual(unlist(result.requests), requests)
    assert.deepEqual(result.final, step)
    if (!("request" in step)) {
      const extra = h(prefix + "Reply", { invocation: 7, id: 999, response: gen(prefix + "Response") })
      const held = execution["run_" + kind](list([...replies, extra]), initial)
      eq(held, m["run_" + kind](list([...replies, extra]), specInitial), ["terminal", kind])
      assert.deepEqual(unlist(held.remaining), [extra])
      terminal++
    }
    traces++
  }
  for (let i = 0; i < 96; i++) {
    seed = i + 1
    const input = gen("FInput"),
      rin = gen("RInput")
    for (const transport of [false, true])
      run(
        "finalize",
        m["../Handoff.delivery_finalize_initial"](7, transport, input),
        m.delivery_finalize_spec_initial(7, transport, input)
      )
    run("reconcile", m["../Handoff.reconcile_initial"](7, rin), m.reconcile_spec_initial(7, rin))
    run("reconcile", m["../Handoff.reserve_finish_initial"](7, rin), m.reserve_finish_spec_initial(7, rin))
  }
  assert.ok(terminal > 0)
  assert.ok(prefixes > 0)
  assert.equal(mutant, false, "skip-write mutant escaped the independent checker")
  const rejected = spawnSync(process.execPath, [import.meta.filename, "--mutant=skip-write"], {
    encoding: "utf8",
    timeout: 20000
  })
  assert.equal(rejected.status, 1, rejected.stdout + rejected.stderr)
  assert.match(rejected.stderr, /Mismatch \[\s*'D'/u)
  assert.match(rejected.stderr, /DCanWrite/u)
  console.log(
    JSON.stringify({
      passed: true,
      cases: traces,
      comparisons: count,
      traces,
      prefixes,
      terminal,
      rejectedMutants: ["skip-can-write"],
      phases: Object.fromEntries(["F", "R", "D"].map((p) => [p, types.get(p + "Phase").length])),
      scope:
        "independent F/R/D transitions and full finite D/R tapes including unfinished and terminal states; typed variants and correlation faults; finite evidence, not universal proof or physical port validation"
    })
  )
} finally {
  rmSync(temporary, { recursive: true, force: true })
}
