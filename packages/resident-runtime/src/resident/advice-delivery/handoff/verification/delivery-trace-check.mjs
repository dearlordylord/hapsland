import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { pathToFileURL } from "node:url"

const temporary = mkdtempSync(join(tmpdir(), "hapsland-delivery-trace-"))
try {
  const compile = async (name) => {
    const output = join(temporary, name + ".mjs")
    execFileSync("taskset", ["-c", "10", "bend", join(import.meta.dirname, name + ".bend"), "-o", output], {
      timeout: 10000
    })
    return (await import(pathToFileURL(output))).default
  }
  const actual = await compile("DeliveryExecution"),
    specification = await compile("PrepareSpecification")
  const h = (name, fields = {}) => ({ $: "../Handoff." + name, ...fields })
  const list = (values) => values.reduceRight((tail, head) => ({ $: "Con", head, tail }), { $: "Nil" })
  const values = (items) => {
    const result = []
    for (; items.$ === "Con"; items = items.tail) result.push(items.head)
    assert.equal(items.$, "Nil")
    return result
  }
  const frame = (eligible = [], owners = [], unavailable = []) =>
    h("PFrame", { eligible: list(eligible), owners: list(owners), unavailable: list(unavailable) })
  const core = (name, ...args) => actual["../Handoff." + name](...args)
  const phases = new Set()
  let traces = 0,
    prefixes = 0,
    refusals = 0,
    callbacks = 0
  const compare = (kind, initial, reference, perform) => {
    assert.deepEqual(initial, reference)
    const resume = kind === "prepare" ? "prepare_resume" : "prepare_commit_resume"
    const specResume = kind === "prepare" ? "prepare_spec_resume" : "prepare_spec_commit_resume"
    const replyTag = kind === "prepare" ? "PReply" : "KReply"
    const requests = [],
      replies = []
    let step = initial,
      expected = reference
    for (let limit = 0; "request" in step; limit++) {
      assert.ok(limit < 100, "finite fixture must terminate")
      phases.add(step.phase.$)
      const request = step.request
      const response = perform(request.command)
      const reply = h(replyTag, { invocation: request.invocation, id: request.id, response })
      for (const wrong of [
        { ...reply, invocation: 8 },
        { ...reply, id: request.id + 1 }
      ]) {
        assert.deepEqual(core(resume, step, wrong), specification[specResume](expected, wrong))
        assert.match(core(resume, step, wrong).$, /Rejected$/)
        refusals++
      }
      for (const malformed of kind === "prepare"
        ? [h("PAck"), h("PTruth", { value: false }), h("PHandles", { values: list([]) })]
        : [h("KAck"), h("KTruth", { value: false }), h("KKeys", { retained: list([]), delivery: list([]) })]) {
        const other = { ...reply, response: malformed }
        assert.deepEqual(core(resume, step, other), specification[specResume](expected, other))
      }
      assert.deepEqual(
        actual["run_" + kind](list(replies), initial),
        specification["run_" + kind](list(replies), reference)
      )
      prefixes++
      requests.push(request)
      replies.push(reply)
      step = core(resume, step, reply)
      expected = specification[specResume](expected, reply)
      assert.deepEqual(step, expected)
    }
    assert.match(step.$, /Done$/)
    const terminalReply = h(replyTag, { invocation: 7, id: 999, response: h(kind === "prepare" ? "PAck" : "KAck") })
    assert.match(core(resume, step, terminalReply).$, /Rejected$/)
    const observed = actual["run_" + kind](list([...replies, terminalReply]), initial)
    assert.deepEqual(observed, specification["run_" + kind](list([...replies, terminalReply]), reference))
    assert.deepEqual(values(observed.requests), requests)
    assert.deepEqual(values(observed.remaining), [terminalReply])
    assert.deepEqual(observed.final, step)
    traces++
  }
  for (let seed = 0; seed < 32; seed++) {
    const items = [0, 1, 2, 3]
      .slice(0, seed % 5)
      .map((handle) =>
        h("PItem", { handle, identity: handle % 2, root: handle % 3, partition: handle % 2, work: handle % 2 === 0 })
      )
    for (const transport of [false, true])
      for (const advice of [false, true]) {
        const initial = transport ? "prepare_transport_initial" : "prepare_initial"
        const specInitial = transport ? "prepare_spec_transport_initial" : "prepare_spec_initial"
        compare("prepare", core(initial, 7, advice), specification[specInitial](7, advice), (command) => {
          switch (command.$) {
            case "../Handoff.PAdvice":
              return h("PHandles", { values: list(items.map((item) => item.handle)) })
            case "../Handoff.PFacts":
              return h("PAdviceFacts", { item: items[command.advice], owned: (seed & 1) === 0 || command.advice !== 1 })
            case "../Handoff.PStartWorkspace":
              return h("PWorkspace", {
                workspace: seed & 2 && command.advice === 0 ? { $: "None" } : { $: "Some", value: 70 + command.advice }
              })
            case "../Handoff.PCheckWorkspace":
              return h("PTruth", { value: !(seed & 4) || command.advice !== 1 })
            case "../Handoff.PReservePartition":
              return h("PTruth", { value: !(seed & 8) || command.advice !== 2 })
            case "../Handoff.PVerifyAll":
              return h("PVerifiedAll", {
                frame: seed & 16 ? { ...command.frame, unavailable: list([0, 1]) } : command.frame
              })
            default:
              return h("PAck")
          }
        })
      }
    const observed = frame(items, seed & 1 ? [0, 1] : [1], seed & 2 ? [0] : [])
    for (const key of [0, 1, 2, 999]) {
      for (const method of ["member", "source", "unavailable"]) {
        assert.deepEqual(
          core("prepare_" + method, observed, key),
          specification["prepare_spec_" + method](observed, key)
        )
        callbacks++
      }
    }
    for (const previous of [false, true])
      for (const resized of [false, true]) {
        assert.equal(
          core("prepare_capacity", previous, resized),
          specification.prepare_spec_capacity(previous, resized)
        )
        assert.deepEqual(
          core("prepare_reservation", resized, observed, 0),
          specification.prepare_spec_reservation(resized, observed, 0)
        )
        for (const status of ["PCurrentValidation", "PStaleValidation", "PUnavailableValidation"])
          assert.deepEqual(
            core("prepare_validation", previous, h(status)),
            specification.prepare_spec_validation(previous, h(status))
          )
        callbacks += 5
      }
    for (const work of [false, true])
      for (const accepted of [false, true])
        compare(
          "commit",
          core("prepare_commit_initial", 7, work),
          specification.prepare_spec_commit_initial(7, work),
          (command) => {
            switch (command.$) {
              case "../Handoff.KReviseWork":
                return h("KTruth", { value: accepted })
              case "../Handoff.KFindingKeys":
                return h("KKeys", {
                  retained: list(seed & 1 ? ["a", "a", "c"] : []),
                  delivery: list(["b", "a", "c", "a"])
                })
              default:
                return h("KAck")
            }
          }
        )
  }
  assert.deepEqual(
    [...phases].sort(),
    [
      "PResponseGated",
      "PResponseBarriered",
      "PAdviceRead",
      "PFactsRead",
      "PWorkspaceStarted",
      "PWorkspaceChecked",
      "PPartitionReserved",
      "PAllVerified",
      "PUnavailableDeleted",
      "KWorkRevised",
      "KAdviceRevised",
      "KKeysRead",
      "KDeliveryUpdated",
      "KObserved"
    ]
      .map((name) => h(name).$)
      .sort()
  )
  console.log(
    JSON.stringify({
      passed: true,
      cases: traces,
      traces,
      prefixes,
      refusals,
      callbacks,
      phases: phases.size,
      scope:
        "independent full Prepare and commit traces, finite exhaustion and terminal remainder; callback routing; finite evidence, not universal proof or nested callback wiring"
    })
  )
} finally {
  rmSync(temporary, { recursive: true, force: true })
}
