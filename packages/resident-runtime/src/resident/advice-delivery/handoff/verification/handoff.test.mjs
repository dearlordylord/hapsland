import assert from "node:assert/strict"
import { it } from "node:test"
import core from "../../../../../dist/resident/advice-delivery/handoff/handoff-core.js"

const list = (items) => items.reduceRight((tail, head) => ({ $: "Con", head, tail }), { $: "Nil" })
const unlist = (items) => {
  const result = []
  for (; items.$ === "Con"; items = items.tail) result.push(items.head)
  assert.equal(items.$, "Nil")
  return result
}
const input = (blocking = false) => ({
  $: "FInput",
  request: { $: "FSharedCollect", composed: false, claude: false, turn_end: false, finish: false, report: false },
  response: { $: "FAdviceResponse" },
  authority: { $: blocking ? "FBlockingAuthority" : "FNoAuthority" }
})
const ack = { $: "FAck" }
const truth = (value) => ({ $: "FTruth", value })
const handles = (values) => ({ $: "FHandles", handles: list(values) })
const run = (initial, perform) => {
  let step = initial
  for (let count = 0; count < 300 && step.$ === "FAwait"; count++) {
    const before = JSON.stringify(step),
      request = step.request
    const response = perform(request.command)
    const reply = { $: "FReply", invocation: request.invocation, id: request.id, response }
    assert.deepEqual(core.finalize_resume(step, { ...reply, invocation: request.invocation + 1 }), { $: "FRejected" })
    assert.deepEqual(core.finalize_resume(step, { ...reply, id: request.id + 1 }), { $: "FRejected" })
    assert.equal(JSON.stringify(step), before)
    step = core.finalize_resume(step, reply)
  }
  assert.equal(step.$, "FDone")
  assert.deepEqual(core.finalize_resume(step, { $: "FReply", invocation: 71, id: 1, response: ack }), {
    $: "FRejected"
  })
  return step.result
}

it("rejects a wrong response before advancing and leaves the held request usable", () => {
  const step = core.finalize_initial(71, input())
  assert.equal(step.request.command.$, "FClock")
  assert.deepEqual(
    core.finalize_resume(step, { $: "FReply", invocation: 71, id: 1, response: { $: "FCount", count: 0 } }),
    { $: "FRejected" }
  )
  const next = core.finalize_resume(step, { $: "FReply", invocation: 71, id: 1, response: ack })
  assert.equal(next.request.command.$, "FExpire")
  assert.equal(next.request.id, 2)
})

it("generation refusal skips credential IO and later advice before releasing the batch", () => {
  const trace = []
  const result = run(core.finalize_initial(71, input()), (command) => {
    trace.push(command)
    switch (command.$) {
      case "FClock":
      case "FExpire":
      case "FPrune":
      case "FReleaseComposed":
        return ack
      case "FAdvice":
        return handles([7, 8])
      case "FDelivery":
        assert.equal(command.advice, 7)
        return { $: "FDeliveryFacts", present: true, owned: true, findings: list([70]), round: true, work: true }
      case "FCredentialFacts":
        return truth(false)
      case "FObserveCredential":
        assert.equal(command.generation, false)
        assert.equal(command.authorized, false)
        return truth(true)
      case "FCredentialGate":
        assert.equal(command.invalid, true)
        return truth(false)
      default:
        assert.fail(`unexpected effect after generation refusal: ${command.$}`)
    }
  })
  assert.deepEqual(result, { $: "FEmpty" })
  assert.equal(trace.filter((command) => command.$ === "FDelivery").length, 1)
  assert.equal(trace.at(-1).$, "FReleaseComposed")
})

it("refits once after blocking advice disappears and captures all contents before projecting findings", () => {
  const deliveries = new Map([
      [7, [70]],
      [8, [80]]
    ]),
    captured = new Map()
  const trace = [],
    surfaces = []
  const result = run(core.finalize_initial(71, input(true)), (command) => {
    trace.push(command)
    switch (command.$) {
      case "FClock":
      case "FExpire":
      case "FPrune":
      case "FRenewAdvice":
      case "FObserveMessage":
        return ack
      case "FAdvice":
        return handles([7, 8])
      case "FDelivery":
        return {
          $: "FDeliveryFacts",
          present: deliveries.has(command.advice),
          owned: deliveries.has(command.advice),
          findings: list(deliveries.get(command.advice) ?? []),
          round: true,
          work: true
        }
      case "FCredentialFacts":
      case "FCredentialAuthority":
      case "FCredentialGate":
      case "FRoundActive":
      case "FWorkCurrent":
        return truth(true)
      case "FObserveCredential":
      case "FExpired":
        return truth(false)
      case "FSourceCurrent":
        return { $: "FSource", present: true, current: true }
      case "FRoute":
        return { $: "FRouted", route: { $: "FRetain" } }
      case "FAllowsBlocking":
        return truth(command.advice === 7)
      case "FOffers":
        return handles(deliveries.get(command.advice) ?? [])
      case "FFit":
        surfaces.push(command.surface.$)
        assert.equal(unlist(command.offers).length, surfaces.length === 1 ? 2 : 1)
        return handles(surfaces.length === 1 ? [1] : [0])
      case "FUpdate":
        deliveries.set(command.advice, unlist(command.findings))
        return ack
      case "FReleaseAdvice":
        deliveries.delete(command.advice)
        return ack
      case "FContent": {
        const handle = 1000 + command.advice
        captured.set(handle, [...(deliveries.get(command.advice) ?? [])])
        return { $: "FHandle", handle }
      }
      case "FContentFindings":
        assert.equal(captured.size, 2)
        return handles(captured.get(command.content))
      case "FNotices":
        return handles([])
      case "FCollectorGate":
        return { $: "FOptionalResponse", response: { $: "None" } }
      case "FBuildResponse":
        assert.equal(command.blocking, false)
        assert.deepEqual(unlist(command.findings), [80])
        return { $: "FHandle", handle: 900 }
      default:
        assert.fail(`unexpected finalization effect: ${command.$}`)
    }
  })
  assert.deepEqual(result, { $: "FResponseHandle", response: 900 })
  assert.deepEqual(surfaces, ["FBlockingSurface", "FAdvisorySurface"])
  const lastContent = trace.findLastIndex((command) => command.$ === "FContent")
  const firstProjection = trace.findIndex((command) => command.$ === "FContentFindings")
  assert.ok(lastContent < firstProjection)
  assert.equal(trace.filter((command) => command.$ === "FObserveMessage").length, 1)
})
