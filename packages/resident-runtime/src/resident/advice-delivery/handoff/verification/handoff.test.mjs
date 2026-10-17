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

const reconcileInput = (overrides = {}) => ({
  $: "RInput",
  finish: true,
  provisional_findings: true,
  advice: true,
  findings: 3,
  can_write: true,
  same_token: true,
  ...overrides
})
const reconcile = (initial, perform) => {
  let step = core.reconcile_initial(89, initial)
  const trace = []
  for (let count = 0; step.$ === "RAwait" && count < 20; count++) {
    const request = step.request
    trace.push(request.command)
    const reply = { $: "RReply", invocation: request.invocation, id: request.id, response: perform(request.command) }
    assert.deepEqual(core.reconcile_resume(step, { ...reply, id: request.id + 1 }), { $: "RRejected" })
    assert.deepEqual(core.reconcile_resume(step, { ...reply, invocation: 90 }), { $: "RRejected" })
    step = core.reconcile_resume(step, reply)
  }
  assert.ok(step.$ === "RFinal" || step.$ === "REmpty")
  assert.deepEqual(core.reconcile_resume(step, { $: "RReply", invocation: 89, id: 1, response: { $: "RAck" } }), {
    $: "RRejected"
  })
  return { step, trace }
}
const rAck = { $: "RAck" }

it("finish reconciliation keeps early no-op and failed revoke release-before-allow", () => {
  for (const overrides of [{ finish: false }, { provisional_findings: false }]) {
    assert.deepEqual(
      reconcile(reconcileInput(overrides), () => assert.fail("no-op performed IO")),
      { step: { $: "RFinal" }, trace: [] }
    )
  }
  const result = reconcile(reconcileInput(), (command) =>
    command.$ === "RRevoke" ? { $: "RTruth", value: false } : rAck
  )
  assert.deepEqual(result.trace, [
    { $: "RRevoke" },
    { $: "RRelease", provisional: true },
    { $: "RAllow", reason: { $: "RUnavailable" } }
  ])
  assert.deepEqual(result.step, { $: "REmpty" })
})

it("finish binding preserves selected order, physical round facts, first pending match and write fencing", () => {
  for (const round of [false, true])
    for (const same_round of [false, true])
      for (const work of [false, true])
        for (const delivery of [false, true])
          for (const findings of [0, 2, 3, 4])
            for (const can_write of [false, true])
              for (const same_token of [false, true]) {
                const snapshots = [
                  { $: "RSnapshot", handle: 7, owned: true, same_round, work, delivery, count: 2, operation: 10 },
                  {
                    $: "RSnapshot",
                    handle: 8,
                    owned: false,
                    same_round: false,
                    work: false,
                    delivery: false,
                    count: 100,
                    operation: 12
                  },
                  {
                    $: "RSnapshot",
                    handle: 9,
                    owned: true,
                    same_round: true,
                    work: true,
                    delivery: true,
                    count: 1,
                    operation: 11
                  }
                ]
                const result = reconcile(reconcileInput({ findings, can_write, same_token }), (command) => {
                  switch (command.$) {
                    case "RRevoke":
                      return { $: "RTruth", value: true }
                    case "RRound":
                      return { $: "RTruth", value: round }
                    case "RSnapshots":
                      return { $: "RSnapshotValues", values: list(snapshots) }
                    case "RPendingFindings":
                      return {
                        $: "RPendingValues",
                        values: list([
                          { $: "RPending", operation: 10, count: 2 },
                          { $: "RPending", operation: 10, count: 0 },
                          { $: "RPending", operation: 11, count: 1 }
                        ])
                      }
                    case "RClock":
                      return rAck
                    case "RDecide":
                      assert.deepEqual(unlist(command.selected), [7, 9])
                      assert.equal(
                        command.binding,
                        findings === 0 || (round && findings === 3 && same_round && work && delivery)
                      )
                      assert.equal(command.can_write, can_write && same_token)
                      return { $: "RDecided", decision: { $: "RReserved" } }
                    default:
                      assert.fail(`reserved finish performed ${command.$}`)
                  }
                })
                assert.deepEqual(result.step, { $: "RFinal" })
                assert.deepEqual(
                  result.trace.map((command) => command.$),
                  ["RRevoke", "RRound", "RSnapshots", "RPendingFindings", "RClock", "RDecide"]
                )
              }
})

it("finish refusal releases only final advice and preserves allowed reasons; non-advice skips snapshots", () => {
  for (const advice of [false, true])
    for (const decision of [
      { $: "RFailed" },
      { $: "RNotices" },
      { $: "RAllowed", reason: { $: "RNoAdvice" } },
      { $: "RAllowed", reason: { $: "RDeadline" } },
      { $: "RAllowed", reason: { $: "RUnavailable" } }
    ]) {
      const result = reconcile(reconcileInput({ advice, findings: 0 }), (command) => {
        switch (command.$) {
          case "RRevoke":
            return { $: "RTruth", value: true }
          case "RRound":
            return { $: "RTruth", value: false }
          case "RSnapshots":
            assert.equal(advice, true)
            return { $: "RSnapshotValues", values: list([]) }
          case "RPendingFindings":
            return { $: "RPendingValues", values: list([]) }
          case "RClock":
            return rAck
          case "RDecide":
            assert.equal(command.binding, true)
            assert.equal(command.can_write, advice)
            return { $: "RDecided", decision }
          case "RRelease":
            assert.equal(advice, true)
            assert.equal(command.provisional, false)
            return rAck
          case "RAllow":
            assert.deepEqual(command.reason, decision.$ === "RAllowed" ? decision.reason : { $: "RUnavailable" })
            return rAck
        }
      })
      assert.deepEqual(result.step, { $: "REmpty" })
      assert.equal(result.trace.filter((command) => command.$ === "RRelease").length, advice ? 1 : 0)
      assert.equal(result.trace.at(-1).$, "RAllow")
    }
})

it("prepare completes every workspace barrier before partition admission and removes unavailable partitions", () => {
  const items = [0, 1, 2].map((handle) => ({
    $: "PItem",
    handle,
    identity: handle,
    root: handle,
    partition: handle < 2 ? 0 : 1,
    work: false
  }))
  const trace = []
  let step = core.prepare_initial(99, true)
  while (step.$ === "PAwait") {
    const held = step.request,
      command = held.command
    trace.push(command)
    let response
    switch (command.$) {
      case "PAdvice":
        response = { $: "PHandles", values: list([0, 1, 2]) }
        break
      case "PFacts":
        response = { $: "PAdviceFacts", item: items[command.advice], owned: true }
        break
      case "PStartWorkspace":
        response = { $: "PWorkspace", workspace: { $: "Some", value: command.advice } }
        break
      case "PCheckWorkspace":
        response = { $: "PTruth", value: true }
        break
      case "PReservePartition":
        assert.equal(trace.filter((event) => event.$ === "PCheckWorkspace").length, 3)
        assert.deepEqual(unlist(command.members), command.advice === 0 ? [0, 1] : [2])
        response = { $: "PTruth", value: command.advice === 2 }
        break
      case "PVerifyAll":
        assert.deepEqual(unlist(command.admitted), [2])
        assert.deepEqual(core.prepare_member(command.frame, 0), { $: "None" })
        assert.equal(core.prepare_source(command.frame, 2).value.handle, 2)
        response = { $: "PVerifiedAll", frame: core.prepare_reservation(false, command.frame, 1).frame }
        break
      case "PDeleteUnavailable":
        assert.deepEqual(unlist(command.members), [0, 1, 2])
        response = { $: "PAck" }
        break
      default:
        assert.fail(command.$)
    }
    const reply = { $: "PReply", invocation: 99, id: held.id, response }
    assert.deepEqual(core.prepare_resume(step, { ...reply, invocation: 100 }), { $: "PRejected" })
    assert.deepEqual(core.prepare_resume(step, { ...reply, id: held.id + 1 }), { $: "PRejected" })
    step = core.prepare_resume(step, reply)
  }
  assert.deepEqual(step, { $: "PDone" })
  assert.deepEqual(
    trace.filter((command) => command.$ === "PReservePartition").map((command) => command.advice),
    [0, 2]
  )
})

it("prepare commit keeps work before advice and retains original delivery indices before observation", () => {
  for (const accepted of [false, true]) {
    const trace = []
    let step = core.prepare_commit_initial(111, true)
    while (step.$ === "KAwait") {
      const held = step.request,
        command = held.command
      trace.push(command)
      const response =
        command.$ === "KReviseWork"
          ? { $: "KTruth", value: accepted }
          : command.$ === "KFindingKeys"
            ? { $: "KKeys", retained: list(["b", "c"]), delivery: list(["a", "b", "c", "b"]) }
            : { $: "KAck" }
      const reply = { $: "KReply", invocation: 111, id: held.id, response }
      assert.deepEqual(core.prepare_commit_resume(step, { ...reply, id: held.id + 1 }), { $: "KRejected" })
      step = core.prepare_commit_resume(step, reply)
    }
    assert.deepEqual(step, { $: "KDone", accepted })
    assert.deepEqual(
      trace.map((command) => command.$),
      accepted ? ["KReviseWork", "KReviseAdvice", "KFindingKeys", "KUpdateDelivery", "KObserve"] : ["KReviseWork"]
    )
    if (accepted) assert.deepEqual(unlist(trace[3].indices), [1, 2, 3])
  }
  assert.deepEqual(core.prepare_validation(false, { $: "PStaleValidation" }), { $: "PStaleResult" })
  assert.deepEqual(core.prepare_validation(false, { $: "PUnavailableValidation" }), { $: "PNoResult" })
  assert.deepEqual(core.prepare_validation(true, { $: "PCurrentValidation" }), { $: "PNoResult" })
})

it("provisional reservation keeps notices, releases failed advice without allow and preserves non-advice", () => {
  for (const advice of [false, true])
    for (const kind of ["RReserved", "RNotices", "RFailed", "RAllowed"]) {
      let step = core.reserve_finish_initial(201, reconcileInput({ advice }))
      const trace = []
      while (step.$ === "RAwait") {
        const held = step.request,
          command = held.command
        trace.push(command.$)
        let response
        switch (command.$) {
          case "RRound":
            response = { $: "RTruth", value: false }
            break
          case "RSnapshots":
            response = { $: "RSnapshotValues", values: list([]) }
            break
          case "RPendingFindings":
            response = { $: "RPendingValues", values: list([]) }
            break
          case "RDecide":
            assert.equal(command.provisional, true)
            assert.equal(command.can_write, true)
            response = {
              $: "RDecided",
              decision: kind === "RAllowed" ? { $: kind, reason: { $: "RDeadline" } } : { $: kind }
            }
            break
          case "RClock":
          case "RRelease":
          case "RAllow":
            response = rAck
            break
          default:
            assert.fail(command.$)
        }
        const reply = { $: "RReply", invocation: 201, id: held.id, response }
        assert.deepEqual(core.reconcile_resume(step, { ...reply, id: held.id + 1 }), { $: "RRejected" })
        step = core.reconcile_resume(step, reply)
      }
      assert.equal(trace.includes("RRevoke"), false)
      assert.equal(trace.includes("RSnapshots"), advice)
      assert.equal(trace.includes("RRelease"), advice && (kind === "RFailed" || kind === "RAllowed"))
      assert.equal(trace.includes("RAllow"), kind === "RAllowed")
      assert.equal(step.$, kind === "RFailed" || (advice && kind === "RAllowed") ? "REmpty" : "RFinal")
      if (advice && kind === "RAllowed") assert.ok(trace.indexOf("RRelease") < trace.indexOf("RAllow"))
    }
})

it("collection finish gate expires only matching deliveries and discards before allow", () => {
  for (const round of [false, true])
    for (const discarded of [false, true])
      for (const limited of [false, true]) {
        let step = core.collection_gate_initial(202, { $: "GInput", composed: true, turn_end: true, finish: true })
        const trace = []
        while (step.$ === "GAwait") {
          const held = step.request,
            command = held.command
          trace.push(command)
          let response
          switch (command.$) {
            case "GOwnStop":
              response = { $: "GTruth", value: true }
              break
            case "GPruneNotices":
            case "GRelease":
            case "GAllow":
              response = { $: "GAck" }
              break
            case "GAdvice":
              response = {
                $: "GLeases",
                leases: list([
                  { $: "GLease", handle: 0, partition: false, delivery: true },
                  { $: "GLease", handle: 1, partition: true, delivery: false },
                  { $: "GLease", handle: 2, partition: true, delivery: true },
                  { $: "GLease", handle: 3, partition: true, delivery: true }
                ])
              }
              break
            case "GExpired":
              response = { $: "GTruth", value: command.advice === 2 }
              break
            case "GRound":
              response = { $: "GTruth", value: round }
              break
            case "GTotalUnfinished":
              response = { $: "GCount", value: 3 }
              break
            case "GOwnUnfinished":
              response = { $: "GCount", value: 5 }
              break
            case "GGate":
              assert.equal(command.extra, round ? 0 : 3)
              response = { $: "GCutoff", limited }
              break
            case "GDiscard":
              response = { $: "GTruth", value: discarded }
              break
            default:
              assert.fail(command.$)
          }
          const reply = { $: "GReply", invocation: 202, id: held.id, response }
          assert.deepEqual(core.collection_gate_resume(step, { ...reply, id: held.id + 1 }), { $: "GRejected" })
          assert.deepEqual(core.collection_gate_resume(step, { ...reply, invocation: 203 }), { $: "GRejected" })
          step = core.collection_gate_resume(step, reply)
        }
        assert.deepEqual(
          trace.filter((c) => c.$ === "GExpired").map((c) => c.advice),
          [2, 3]
        )
        assert.deepEqual(
          trace.filter((c) => c.$ === "GRelease").map((c) => c.advice),
          [2]
        )
        const allow = trace.find((c) => c.$ === "GAllow")
        const refused = round && !discarded
        assert.deepEqual(step, { $: "GDone", result: { $: refused || limited ? "GEmpty" : "GCollect" } })
        assert.equal(
          trace.some((c) => c.$ === "GDiscard"),
          round
        )
        if (refused || limited) assert.equal(allow.reason.$, refused ? "GUnavailable" : "GLimit")
        else assert.equal(allow, undefined)
        if (round && allow)
          assert.ok(trace.findIndex((c) => c.$ === "GDiscard") < trace.findIndex((c) => c.$ === "GAllow"))
      }
  assert.deepEqual(
    core.collection_gate_initial(202, { $: "GInput", composed: false, turn_end: false, finish: false }),
    { $: "GDone", result: { $: "GUnsupported" } }
  )
  assert.deepEqual(core.collection_gate_initial(202, { $: "GInput", composed: true, turn_end: false, finish: false }), {
    $: "GDone",
    result: { $: "GCollect" }
  })
})
