import assert from "node:assert/strict"
import { observeRetainedAdvice } from "../../evaluation/retained-observation.ts"
import { captureInspectionFate } from "@hapsland/review-execution/inspection/capture"
import { selectPostValue } from "../post-selection.mjs"
import { execFileSync } from "node:child_process"
import { mkdtemp, rm } from "node:fs/promises"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
const temporary = await mkdtemp("/tmp/hapsland-postflow-")
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
const some = (value) => ({ $: "Some", value }),
  none = { $: "None" }
try {
  const output = join(temporary, "postflow.mjs")
  execFileSync("taskset", ["-c", "10", "bend", join(import.meta.dirname, "../PostPreparation.bend"), "-o", output], {
    timeout: 10000
  })
  const core = (await import(pathToFileURL(output))).default
  const routes = ["Owner", "CachedClear", "CachedFinding", "JoinedAdvice", "JoinedPending", "JoinedClaimed"]
  const outcomes = routes.map((route, index) => ({
    $: "Outcome",
    handle: Number(BigInt(index + 1)),
    ready: true,
    fits: true,
    reservation_bytes: 100
  }))
  let cases = 0,
    requests = 0
  const settledValue = (value) => {
    assert.equal(value.$, "Some")
    return value.value
  }
  const finishedState = {
    $: "State",
    invocation: 1,
    next: 0,
    round_bound: true,
    incomplete: false,
    delivery_refused: false,
    phase: { $: "NextUnit", planned: list([]), retained: list([]), slots: list([]) }
  }
  for (const step of [
    { $: "Internal", state: finishedState },
    { $: "Finished" },
    { $: "Rejected" },
    { $: "Stopped", reason: { $: "Inactive" } },
    core.initial(1, true, list([]), false)
  ]) {
    for (const fuel of [0, 1, 2, 10000]) {
      assert.deepEqual(
        core.settle(Number(BigInt(fuel)), step),
        fuel === 0 || (fuel === 1 && step.$ === "Internal")
          ? none
          : some(step.$ === "Internal" ? { $: "Finished" } : step)
      )
      cases++
    }
  }
  for (const ready of [false, true])
    for (const fits of [false, true]) {
      const outcome = { $: "Outcome", handle: 77, ready, fits, reservation_bytes: 101 }
      const state = {
        $: "State",
        invocation: 9,
        next: 13,
        round_bound: true,
        incomplete: false,
        delivery_refused: false,
        phase: { $: "Begin", outcomes: list([]) }
      }
      const admission = core.admission_next(state, list([outcome]), list([]))
      const delivery = core.delivering_next(state, list([outcome]), list([]))
      assert.equal(admission.request.command.allowed, true)
      assert.equal(delivery.request.command.allowed, fits)
      assert.equal(admission.request.id, 13)
      assert.equal(delivery.state.next, 14)
      assert.deepEqual(admission.state.phase, { $: "Admitting", outcome, rest: list([]), ready: list([]) })
      assert.deepEqual(delivery.state.phase, { $: "Delivering", outcome, rest: list([]), accepted: list([]) })
      cases++
    }
  for (const bound of [false, true])
    for (const incomplete of [false, true]) {
      const initial = core.initial(3, bound, list(outcomes), incomplete)
      assert.deepEqual(core.initial_settled(3, bound, list(outcomes), incomplete), some(initial))
      for (const response of [{ $: "Ack" }, { $: "Failed", token: 7 }]) {
        const reply = { $: "Reply", invocation: 3, id: initial.request.id, response }
        const resumed = settledValue(core.resume_settled(initial, reply))
        assert.equal(resumed.$, "Await")
        assert.equal(resumed.request.invocation, 3)
        assert.equal(resumed.request.id, 1)
        assert.equal(resumed.request.command.$, response.$ === "Ack" ? "CheckActive" : "Cleanup")
        if (response.$ === "Failed") assert.deepEqual(resumed.state.phase.reason, { $: "TechnicalFailure", token: 7 })
        cases++
      }
    }
  const flagOperations = ["RetainedReadReceipt", "RetainedCheckEnabled", "RetainedReadEvaluation"]
  const ackOperations = ["RetainedPrepareBase", "RetainedAttachEvaluation", "RetainedOffer", "RetainedComplete"]
  for (const operation of flagOperations) {
    assert.deepEqual(
      core.retained_observation_resume(
        { $: "RetainedObservationAwait", operation: { $: operation } },
        { $: "RetainedObservationAck" }
      ),
      { $: "RetainedObservationRejected" }
    )
    cases++
  }
  for (const operation of ackOperations)
    for (const value of [false, true]) {
      assert.deepEqual(
        core.retained_observation_resume(
          { $: "RetainedObservationAwait", operation: { $: operation } },
          { $: "RetainedObservationFlag", value }
        ),
        { $: "RetainedObservationRejected" }
      )
      cases++
    }
  for (const terminal of ["RetainedObservationDone", "RetainedObservationRejected"])
    for (const response of [
      { $: "RetainedObservationAck" },
      { $: "RetainedObservationFlag", value: false },
      { $: "RetainedObservationFlag", value: true }
    ]) {
      assert.deepEqual(core.retained_observation_resume({ $: terminal }, response), {
        $: "RetainedObservationRejected"
      })
      cases++
    }
  const observationTraces = [
    ["tail.get:unit", "tail.unit.get:inspectionReceipt", "tail.unit.set:completed", "tail.unit.descriptor:completed"],
    [
      "tail.get:unit",
      "tail.unit.get:inspectionReceipt",
      "inspection",
      "tail.unit.get:inspectionReceipt",
      "tail.unit.inspectionReceipt.get:scope",
      "tail.unit.inspectionReceipt.scope.get:root",
      "isEnabled:/repo",
      "tail.unit.set:completed",
      "tail.unit.descriptor:completed"
    ],
    [
      "tail.get:unit",
      "tail.unit.get:inspectionReceipt",
      "inspection",
      "tail.unit.get:inspectionReceipt",
      "tail.unit.inspectionReceipt.get:scope",
      "tail.unit.inspectionReceipt.scope.get:root",
      "isEnabled:/repo",
      "inspection",
      "offerMethod",
      "tail.unit.get:inspectionReceipt",
      "tail.unit.inspectionReceipt.get:scope",
      "tail.unit.get:inspectionReceipt",
      "tail.unit.inspectionReceipt.get:correlation",
      "tail.unit.inspectionReceipt.correlation.keys",
      "tail.unit.inspectionReceipt.correlation.descriptor:stale",
      "tail.unit.inspectionReceipt.correlation.get:stale",
      "tail.unit.inspectionReceipt.correlation.descriptor:evaluationId",
      "tail.unit.inspectionReceipt.correlation.get:evaluationId",
      "tail.unit.inspectionReceipt.correlation.descriptor:__proto__",
      "tail.unit.inspectionReceipt.correlation.get:__proto__",
      "tail.unit.inspectionReceipt.correlation.descriptor:Symbol(post-observation-marker)",
      "tail.unit.inspectionReceipt.correlation.get:Symbol(post-observation-marker)",
      "tail.unit.get:inspectionEvaluationId",
      "tail.get:evaluation",
      "tail.evaluation.get:findings",
      "tail.get:receipt",
      "tail.receipt.get:capability",
      "tail.receipt.capability.get:id",
      "tail.evaluation.findings.get:length",
      "tail.evaluation.findings.get:map",
      "tail.evaluation.findings.get:length",
      "tail.evaluation.findings.get:constructor",
      "offer",
      "tail.unit.set:completed",
      "tail.unit.descriptor:completed"
    ],
    [
      "tail.get:unit",
      "tail.unit.get:inspectionReceipt",
      "inspection",
      "tail.unit.get:inspectionReceipt",
      "tail.unit.inspectionReceipt.get:scope",
      "tail.unit.inspectionReceipt.scope.get:root",
      "isEnabled:/repo",
      "inspection",
      "offerMethod",
      "tail.unit.get:inspectionReceipt",
      "tail.unit.inspectionReceipt.get:scope",
      "tail.unit.get:inspectionReceipt",
      "tail.unit.inspectionReceipt.get:correlation",
      "tail.unit.inspectionReceipt.correlation.keys",
      "tail.unit.inspectionReceipt.correlation.descriptor:stale",
      "tail.unit.inspectionReceipt.correlation.get:stale",
      "tail.unit.inspectionReceipt.correlation.descriptor:evaluationId",
      "tail.unit.inspectionReceipt.correlation.get:evaluationId",
      "tail.unit.inspectionReceipt.correlation.descriptor:__proto__",
      "tail.unit.inspectionReceipt.correlation.get:__proto__",
      "tail.unit.inspectionReceipt.correlation.descriptor:Symbol(post-observation-marker)",
      "tail.unit.inspectionReceipt.correlation.get:Symbol(post-observation-marker)",
      "tail.unit.get:inspectionEvaluationId",
      "tail.get:evaluation",
      "tail.evaluation.get:findings",
      "tail.get:receipt",
      "tail.receipt.get:capability",
      "tail.receipt.capability.get:id",
      "tail.evaluation.findings.get:length",
      "tail.evaluation.findings.get:map",
      "tail.evaluation.findings.get:length",
      "tail.evaluation.findings.get:constructor"
    ],
    [
      "tail.get:unit",
      "tail.unit.get:inspectionReceipt",
      "inspection",
      "tail.unit.get:inspectionReceipt",
      "tail.unit.inspectionReceipt.get:scope",
      "tail.unit.inspectionReceipt.scope.get:root",
      "isEnabled:/repo",
      "inspection",
      "offerMethod",
      "tail.unit.get:inspectionReceipt",
      "tail.unit.inspectionReceipt.get:scope",
      "tail.unit.get:inspectionReceipt",
      "tail.unit.inspectionReceipt.get:correlation",
      "tail.unit.inspectionReceipt.correlation.keys",
      "tail.unit.inspectionReceipt.correlation.descriptor:stale",
      "tail.unit.inspectionReceipt.correlation.get:stale",
      "tail.unit.inspectionReceipt.correlation.descriptor:evaluationId",
      "tail.unit.inspectionReceipt.correlation.get:evaluationId",
      "tail.unit.inspectionReceipt.correlation.descriptor:__proto__",
      "tail.unit.inspectionReceipt.correlation.get:__proto__",
      "tail.unit.inspectionReceipt.correlation.descriptor:Symbol(post-observation-marker)",
      "tail.unit.inspectionReceipt.correlation.get:Symbol(post-observation-marker)",
      "tail.unit.get:inspectionEvaluationId",
      "tail.unit.get:inspectionEvaluationId",
      "tail.get:evaluation",
      "tail.evaluation.get:findings",
      "tail.get:receipt",
      "tail.receipt.get:capability",
      "tail.receipt.capability.get:id",
      "tail.evaluation.findings.get:length",
      "tail.evaluation.findings.get:map",
      "tail.evaluation.findings.get:length",
      "tail.evaluation.findings.get:constructor",
      "offer",
      "tail.unit.set:completed",
      "tail.unit.descriptor:completed"
    ],
    [
      "tail.get:unit",
      "tail.unit.get:inspectionReceipt",
      "inspection",
      "tail.unit.get:inspectionReceipt",
      "tail.unit.inspectionReceipt.get:scope",
      "tail.unit.inspectionReceipt.scope.get:root",
      "isEnabled:/repo",
      "inspection",
      "offerMethod",
      "tail.unit.get:inspectionReceipt",
      "tail.unit.inspectionReceipt.get:scope",
      "tail.unit.get:inspectionReceipt",
      "tail.unit.inspectionReceipt.get:correlation",
      "tail.unit.inspectionReceipt.correlation.keys",
      "tail.unit.inspectionReceipt.correlation.descriptor:stale",
      "tail.unit.inspectionReceipt.correlation.get:stale",
      "tail.unit.inspectionReceipt.correlation.descriptor:evaluationId",
      "tail.unit.inspectionReceipt.correlation.get:evaluationId",
      "tail.unit.inspectionReceipt.correlation.descriptor:__proto__",
      "tail.unit.inspectionReceipt.correlation.get:__proto__",
      "tail.unit.inspectionReceipt.correlation.descriptor:Symbol(post-observation-marker)",
      "tail.unit.inspectionReceipt.correlation.get:Symbol(post-observation-marker)",
      "tail.unit.get:inspectionEvaluationId",
      "tail.unit.get:inspectionEvaluationId",
      "tail.get:evaluation",
      "tail.evaluation.get:findings",
      "tail.get:receipt",
      "tail.receipt.get:capability",
      "tail.receipt.capability.get:id",
      "tail.evaluation.findings.get:length",
      "tail.evaluation.findings.get:map",
      "tail.evaluation.findings.get:length",
      "tail.evaluation.findings.get:constructor"
    ]
  ]
  const observationTraceCases = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 3, 4, 5]
  const observationFixture = (options, faultAt = 0, thrown) => {
    const trace = [],
      memo = new WeakMap(),
      offers = [],
      controller = new AbortController()
    const mark = (event) => {
      trace.push(event)
      if (trace.length === faultAt) {
        controller.abort()
        throw thrown
      }
    }
    const wrap = (value, path) => {
      if (value === null || typeof value !== "object") return value
      if (memo.has(value)) return memo.get(value)
      const proxy = new Proxy(value, {
        get(target, field, receiver) {
          mark(path + ".get:" + String(field))
          return wrap(Reflect.get(target, field, receiver), path + "." + String(field))
        },
        ownKeys(target) {
          mark(path + ".keys")
          return Reflect.ownKeys(target)
        },
        getOwnPropertyDescriptor(target, field) {
          mark(path + ".descriptor:" + String(field))
          return Reflect.getOwnPropertyDescriptor(target, field)
        },
        set(target, field, value, receiver) {
          mark(path + ".set:" + String(field))
          return Reflect.set(target, field, value, receiver)
        }
      })
      memo.set(value, proxy)
      return proxy
    }
    const marker = Symbol.for("post-observation-marker")
    const correlation = { stale: "kept", evaluationId: "old", [marker]: "symbol" }
    Object.defineProperty(correlation, "__proto__", { value: "data", enumerable: true })
    const unit = {
      ...(options.receipt ? { inspectionReceipt: { scope: { root: "/repo" }, correlation } } : {}),
      ...(options.evaluation ? { inspectionEvaluationId: "evaluation" } : {})
    }
    const tail = wrap({ unit, evaluation: { findings: [] }, receipt: { capability: { id: "advice" } } }, "tail")
    const recorder = {
      isEnabled(root) {
        mark("isEnabled:" + root)
        return options.enabled
      },
      get offer() {
        mark("offerMethod")
        if (options.noncallable) return undefined
        return function (scope, metadata, fate) {
          mark("offer")
          assert.equal(this, recorder)
          offers.push({ scope, metadata, fate })
        }
      }
    }
    const readInspection = () => {
      mark("inspection")
      return recorder
    }
    return { tail, readInspection, trace, offers, unit, controller }
  }
  const runObservation = (implementation, options, faultAt = 0, thrown) => {
    const fixture = observationFixture(options, faultAt, thrown)
    let error,
      failed = false
    try {
      implementation(fixture.tail, fixture.readInspection)
    } catch (caught) {
      error = caught
      failed = true
    }
    return {
      trace: fixture.trace.slice(),
      completed: fixture.unit.completed,
      offers: fixture.offers,
      failed,
      error,
      aborted: fixture.controller.signal.aborted
    }
  }
  for (const receipt of [false, true])
    for (const enabled of [false, true])
      for (const evaluation of [false, true])
        for (const noncallable of [false, true]) {
          const options = { receipt, enabled, evaluation, noncallable }
          const candidate = (tail, inspection) => observeRetainedAdvice(core, tail, inspection)
          const traceIndex =
            (Number(receipt) << 3) | (Number(enabled) << 2) | (Number(evaluation) << 1) | Number(noncallable)
          const trace = observationTraces[observationTraceCases[traceIndex]]
          const current = runObservation(candidate, options)
          const active = receipt && enabled
          const failed = active && noncallable
          assert.deepEqual(current.trace, trace)
          assert.equal(current.completed, failed ? undefined : true)
          assert.equal(current.failed, failed)
          if (failed) assert.ok(current.error instanceof TypeError)
          else
            assert.deepEqual(
              current.offers,
              active
                ? [
                    {
                      scope: { root: "/repo" },
                      metadata: {
                        stale: "kept",
                        evaluationId: evaluation ? "evaluation" : "old",
                        ["__proto__"]: "data",
                        [Symbol.for("post-observation-marker")]: "symbol"
                      },
                      fate: captureInspectionFate([], "retained", "pending-advice", "advice")
                    }
                  ]
                : []
            )
          cases++
          for (let faultAt = 1; faultAt <= trace.length; faultAt++)
            for (const thrown of [undefined, null, false, 0, "", Symbol("raw"), {}]) {
              const actual = runObservation(candidate, options, faultAt, thrown)
              assert.deepEqual(actual.trace, trace.slice(0, faultAt))
              assert.equal(actual.failed, true)
              assert.strictEqual(actual.error, thrown)
              assert.equal(actual.completed, undefined)
              assert.equal(actual.aborted, true)
              cases++
            }
        }
  function run(options = {}) {
    let step = settledValue(
        core.initial_settled(1, options.bound ?? true, list(options.outcomes ?? outcomes), options.incomplete ?? false)
      ),
      ordinal = 0
    const commands = [],
      cleanup = [],
      enqueued = [],
      settled = []
    for (let fuel = 0; fuel < 1000; fuel++) {
      if (step.$ === "Internal") throw new Error("Settled Post entry returned an internal continuation")
      if (step.$ !== "Await") return { step, commands, cleanup, enqueued, settled }
      const request = step.request,
        command = request.command
      commands.push(command)
      requests++
      ordinal++
      assert.equal(
        core.resume(step, { $: "Reply", invocation: 2, id: request.id, response: { $: "Ack" } }).$,
        "Rejected"
      )
      let response = { $: "Ack" }
      switch (command.$) {
        case "CheckActive":
          response = { $: "Active", value: options.inactiveAt !== ordinal }
          break
        case "Offer":
          response = { $: "Offered", accepted: command.outcome.ready && command.allowed }
          break
        case "LookupReuse": {
          const index = Number(command.outcome.handle) - 1
          response = {
            $: "Routed",
            key: command.outcome.handle,
            route: { $: routes[index].startsWith("Cached") ? "CachedEntry" : routes[index] }
          }
          break
        }
        case "ReadCached":
          response = { $: "CachedFacts", evaluation: 999, findings: command.item.key === 2 ? 0 : 1 }
          break
        case "ReadPending":
          response = { $: "PendingOwner", owner: 700 }
          break
        case "CompletePreparation":
          response = {
            $: "Reserved",
            allocations: list(
              array(command.retained).map((item) =>
                options.capacityRefused
                  ? none
                  : some({ $: "Allocation", operation: 100 + item.key, reservation: 200 + item.key })
              )
            )
          }
          break
        case "ReadLiveAdvice":
          response = { $: "AdviceOwner", owner: command.item.key === 4 ? some(800) : none }
          break
        case "PublishJoinedAdvice":
          response = { $: "Published", publication: 900 }
          break
        case "ReadCurrentAdvice":
          response = { $: "FindingCount", findings: 2 }
          break
        case "ReadJoinedPending":
          response = { $: "JoinOwner", owner: command.item.key === 5 ? some(700) : none }
          break
        case "RegisterClear":
          response = { $: "Revision", token: 302 }
          break
        case "RegisterRevision":
          response = { $: "Revision", token: 300 + command.slot.item.key }
          break
        case "RegisterWork":
          response = { $: "Work", token: options.noWork ? none : some(400 + command.slot.item.key) }
          break
        case "AttachOwner":
          response = { $: "Attached", accepted: !options.attachRefused }
          break
        case "Enqueue":
          response = { $: "Queued", accepted: !options.enqueueRefused }
          break
        case "StartCachedReview":
        case "CompleteCachedReview":
          response = { $: "ReviewAccepted", value: true }
          break
        case "CheckCachedActive":
          response = { $: "Active", value: true }
          break
        case "ReadCachedAdvice":
          response = { $: "AdviceOwner", owner: none }
          break
        case "InsertCachedAdvice":
          response = { $: "AdviceInserted", tail: 1000 }
          break
        case "Cleanup":
          cleanup.push(command)
          response = {
            $: "CleanupInventory",
            facts: list(
              array(command.actions).map((action) => {
                switch (action.$) {
                  case "ReleaseCleanupRevision":
                    return { $: "CleanupRevision", handle: action.handle, present: true, transferred: false }
                  case "ReleaseCleanupReservation":
                    return {
                      $: "CleanupReservation",
                      handle: action.handle,
                      present: true,
                      transferred: false,
                      discharged: false
                    }
                  case "ReleaseCleanupClaim":
                    return { $: "CleanupClaim", handle: action.handle, present: true, transferred: false }
                  case "InvalidCleanupAllocation":
                    return { $: "CleanupInvalidAllocation" }
                  default:
                    throw new Error("Invalid cleanup action in fixture")
                }
              })
            )
          }
          break
      }
      if (options.failAt === ordinal && command.$ !== "Cleanup") response = { $: "Failed", token: 77 }
      if (options.defectAt === ordinal && command.$ !== "Cleanup") response = { $: "Defect", token: 89 }
      if (options.cancelAt === ordinal && command.$ !== "Cleanup") response = { $: "Cancelled", token: 88 }
      if (options.cleanupFailOnce && command.$ === "Cleanup" && cleanup.length === 1)
        response = { $: "Failed", token: 99 }
      if (command.$ === "Enqueue" && response.$ === "Queued" && response.accepted) enqueued.push(command.slot.item.key)
      if (command.$ === "FinalizeCachedUnit" && response.$ === "Ack") settled.push(command.slot.item.key)
      step = settledValue(core.resume_settled(step, { $: "Reply", invocation: 1, id: request.id, response }))
    }
    throw new Error("Postflow did not terminate")
  }
  for (const incomplete of [false, true]) {
    const empty = run({ outcomes: [], incomplete })
    assert.equal(empty.step.$, "Finished")
    assert.deepEqual(
      empty.commands.slice(0, 5).map((command) => command.$),
      ["ObservePreparation", "CheckActive", "ReportEmptyAnalytics", "ReportEmptyActivity", "ObserveReady"]
    )
    assert.equal(empty.commands[2].incomplete, incomplete)
    assert.equal(empty.commands[3].incomplete, incomplete)
    cases++
  }
  const success = run()
  assert.equal(success.step.$, "Finished")
  assert.deepEqual(success.enqueued, [1])
  assert.deepEqual(success.settled, [3])
  assert.deepEqual(
    success.commands.filter((command) => command.$ === "LookupReuse").map((command) => command.outcome.handle),
    [1, 2, 3, 4, 5, 6]
  )
  assert.equal(success.commands.filter((command) => command.$ === "OwnerBarrier").length, 1)
  assert.equal(success.commands.filter((command) => command.$ === "JoinedBarrier").length, 1)
  assert.equal(
    success.commands.some((command) => command.$ === "ReportDeliverabilityNotice"),
    false
  )
  cases++
  for (const refused of [[1], [1, 3]]) {
    const result = run({
      outcomes: outcomes.map((outcome) => ({ ...outcome, fits: !refused.includes(outcome.handle) }))
    })
    assert.equal(result.step.$, "Finished")
    assert.equal(
      result.commands.filter((command) => command.$ === "ReportDeliverabilityCapacity").length,
      refused.length
    )
    assert.equal(result.commands.filter((command) => command.$ === "ReportDeliverabilityNotice").length, 1)
    assert.ok(
      result.commands.findIndex((command) => command.$ === "ReportDeliverabilityNotice") >
        result.commands.findIndex((command) => command.$ === "CompletePreparation")
    )
    assert.deepEqual(
      result.commands.filter((command) => command.$ === "LookupReuse").map((command) => command.outcome.handle),
      outcomes.filter((outcome) => !refused.includes(outcome.handle)).map((outcome) => outcome.handle)
    )
    cases++
    for (const kind of ["failAt", "cancelAt", "defectAt"]) {
      const failed = run({
        outcomes: outcomes.map((outcome) => ({ ...outcome, fits: !refused.includes(outcome.handle) })),
        [kind]: result.commands.findIndex((command) => command.$ === "ReportDeliverabilityNotice") + 1
      })
      assert.equal(failed.step.$, "Stopped")
      assert.equal(failed.cleanup.length, 1)
      assert.deepEqual(
        array(failed.cleanup[0].actions)
          .filter((action) => action.$ === "ReleaseCleanupReservation")
          .map((action) => action.handle - 200),
        refused.includes(3) ? [] : [3]
      )
      cases++
    }
  }
  for (const [options, check] of [
    [
      { capacityRefused: true },
      (result) => assert.equal(result.commands.filter((command) => command.$ === "ReportCapacity").length, 2)
    ],
    [
      { noWork: true },
      (result) => assert.equal(result.commands.filter((command) => command.$ === "ReleaseUnspawned").length, 2)
    ],
    [{ noWork: true, bound: false }, (result) => assert.deepEqual(result.enqueued, [1])],
    [
      { enqueueRefused: true },
      (result) => assert.equal(result.commands.filter((command) => command.$ === "ReleaseAttached").length, 1)
    ],
    [
      { attachRefused: true },
      (result) => {
        assert.equal(result.step.$, "Stopped")
        assert.equal(result.step.reason.$, "TechnicalFailure")
        assert.equal(result.cleanup.length, 1)
        assert.ok(
          array(result.cleanup[0].actions).some(
            (action) => action.$ === "ReleaseCleanupReservation" && action.handle === 201
          )
        )
      }
    ]
  ]) {
    const result = run(options)
    check(result)
    cases++
  }
  for (let ordinal = 1; ordinal <= success.commands.length; ordinal++)
    for (const kind of ["failAt", "cancelAt", "defectAt"]) {
      const result = run({ [kind]: ordinal, cleanupFailOnce: true })
      assert.equal(result.step.$, "Stopped")
      assert.equal(
        result.step.reason.$,
        kind === "failAt" ? "TechnicalFailure" : kind === "defectAt" ? "DefectFailure" : "CancelledReason"
      )
      assert.equal(result.step.reason.token, kind === "failAt" ? 77 : kind === "defectAt" ? 89 : 88)
      assert.equal(result.cleanup.length, 2)
      assert.deepEqual(result.cleanup[0], result.cleanup[1])
      for (const command of result.cleanup)
        for (const action of array(command.actions)) {
          if (action.$ !== "ReleaseCleanupReservation") continue
          const key = action.handle - 200
          assert.ok(!result.enqueued.includes(key), "cleanup touched transferred dispatcher owner")
          assert.ok(
            array(command.actions).some((other) => other.$ === "ReleaseCleanupClaim" && other.handle === key),
            "cleanup lost its bound claim"
          )
        }
      cases++
    }
  for (const index of success.commands
    .map((command, index) => (command.$ === "CheckActive" ? index : -1))
    .filter((index) => index >= 0)
    .slice(0, 2)) {
    const inactive = run({ inactiveAt: index + 1 })
    assert.equal(inactive.step.reason.$, "Inactive")
    assert.equal(inactive.commands[index + 1].$, "ReleaseWorkspace")
    cases++
    for (const kind of ["failAt", "cancelAt", "defectAt"]) {
      const failed = run({ inactiveAt: index + 1, [kind]: index + 2 })
      assert.equal(
        failed.step.reason.$,
        kind === "failAt" ? "TechnicalFailure" : kind === "defectAt" ? "DefectFailure" : "CancelledReason"
      )
      cases++
    }
  }
  for (let mask = 0; mask < 512; mask++) {
    const bit = (index) => Boolean(mask & (1 << index))
    const facts = [
      { $: "CleanupTail", handle: 1, started: bit(0) },
      { $: "CleanupWork", handle: 2, cached: bit(1), completed: bit(2), round_bound: bit(3), work_bound: bit(4) },
      { $: "CleanupReservation", handle: 3, present: bit(5), transferred: bit(6), discharged: bit(7) },
      { $: "CleanupRevision", handle: 4, present: bit(5), transferred: bit(6) },
      { $: "CleanupClaim", handle: 5, present: bit(7), transferred: bit(8) },
      { $: "CleanupWorkspace", source_owned: bit(8), active: bit(0) }
    ]
    const expected = []
    if (!bit(0)) expected.push({ $: "DrainCleanupTail", handle: 1 })
    if (bit(1) && !bit(2) && bit(3) && bit(4)) expected.push({ $: "RetireCleanupWork", handle: 2 })
    if (!bit(6)) {
      if (bit(5)) expected.push({ $: "ReleaseCleanupReservation", handle: 3 })
      else if (!bit(7)) expected.push({ $: "InvalidCleanupReservation" })
    }
    if (bit(5) && !bit(6)) expected.push({ $: "ReleaseCleanupRevision", handle: 4 })
    if (bit(7) && !bit(8)) expected.push({ $: "ReleaseCleanupClaim", handle: 5 })
    if (!bit(8) && bit(0)) expected.push({ $: "ReleaseCleanupWorkspace" })
    for (const mode of ["RetryCleanup", "CollectCleanup"]) {
      let cursor = core.cleanup_initial({ $: mode }, list(facts))
      for (const [index, action] of expected.entries()) {
        assert.equal(cursor.$, "CleanupAwait")
        assert.deepEqual(cursor.action, action)
        const failed = core.cleanup_reply(cursor, false)
        if (mode === "RetryCleanup") assert.deepEqual(failed, cursor, "main cleanup must not skip a failed obligation")
        else assert.equal(failed.$, index === expected.length - 1 ? "CleanupDone" : "CleanupAwait")
        cursor = core.cleanup_reply(cursor, true)
      }
      assert.equal(cursor.$, "CleanupDone")
      cases++
    }
  }
  let finish = core.cleanup_finish_initial()
  const stages = [
    "CleanupTails",
    "CleanupWorks",
    "CleanupReservations",
    "CleanupRevisions",
    "CleanupClaims",
    "CleanupWorkspaceStage"
  ]
  for (const stage of stages) {
    assert.deepEqual(finish, { $: "CleanupFinishRead", stage: { $: stage } })
    // Each stage is requested only after the preceding action settles, including failures.
    finish = core.cleanup_finish_inventory(
      finish,
      list([{ $: "CleanupClaim", handle: 33, present: true, transferred: false }])
    )
    assert.equal(finish.$, "CleanupFinishRun")
    assert.deepEqual(finish.cursor.action, { $: "ReleaseCleanupClaim", handle: 33 })
    finish = core.cleanup_finish_reply(finish, false)
  }
  assert.equal(finish.$, "CleanupFinishDone")
  cases++
  // Fixed operation fixtures cover every original fact-axis combination.
  const releasePlans = [
    ["ReleaseReadTransfer"],
    [
      "ReleaseReadTransfer",
      "ReleaseReadOwner",
      "ReleaseSlotReservation",
      "ReleaseForgetReservation",
      "ReleaseAcquisition"
    ],
    [
      "ReleaseReadTransfer",
      "ReleaseReadOwner",
      "ReleaseReadPlanClaim",
      "ReleaseForgetPlanClaim",
      "ReleaseSlotReservation",
      "ReleaseForgetReservation",
      "ReleaseAcquisition"
    ],
    [
      "ReleaseReadTransfer",
      "ReleaseReadOwner",
      "ReleaseReadPlanClaim",
      "ReleasePlanClaim",
      "ReleaseForgetPlanClaim",
      "ReleaseSlotReservation",
      "ReleaseForgetReservation",
      "ReleaseAcquisition"
    ],
    [
      "ReleaseReadTransfer",
      "ReleaseBuildUnit",
      "ReleaseReadUnitClaim",
      "ReleaseUnitReservation",
      "ReleaseCurrentWork",
      "ReleaseForgetAcquisition",
      "ReleaseMarkUnit",
      "ReleaseForgetUnitClaim",
      "ReleaseForgetReservation"
    ],
    [
      "ReleaseReadTransfer",
      "ReleaseBuildUnit",
      "ReleaseReadUnitClaim",
      "ReleaseCapacityClaim",
      "ReleaseUnitReservation",
      "ReleaseCurrentWork",
      "ReleaseForgetAcquisition",
      "ReleaseMarkUnit",
      "ReleaseForgetUnitClaim",
      "ReleaseForgetReservation"
    ],
    ["ReleaseSlotReservation", "ReleaseAcquisition", "ReleaseBuildUnit", "ReleaseMarkUnit", "ReleaseForgetReservation"],
    ["ReleaseBuildUnit", "ReleaseReadWorkBound", "ReleaseReadCompleted"],
    ["ReleaseBuildUnit", "ReleaseReadWorkBound", "ReleaseReadCompleted", "ReleaseReadRound"],
    [
      "ReleaseBuildUnit",
      "ReleaseReadWorkBound",
      "ReleaseReadCompleted",
      "ReleaseReadRound",
      "ReleaseRetireWork",
      "ReleaseReadReleased"
    ],
    [
      "ReleaseBuildUnit",
      "ReleaseReadWorkBound",
      "ReleaseReadCompleted",
      "ReleaseReadRound",
      "ReleaseRetireWork",
      "ReleaseReadReleased",
      "ReleaseUnitReservation",
      "ReleaseCurrentWork",
      "ReleaseForgetAcquisition",
      "ReleaseMarkUnit"
    ]
  ]
  const releasePlanCases = {
    UnspawnedRelease: [1, 0, 2, 0, 1, 0, 3, 0],
    AttachedRelease: [4, 0, 4, 0, 5, 0, 5, 0],
    CachedRelease: [6, 6, 6, 6, 6, 6, 6, 6],
    FinalizedRelease: [8, 7, 8, 7, 8, 7, 10, 7, 8, 7, 8, 7, 8, 7, 9, 7, 8, 7, 8, 7, 8, 7, 9, 7, 8, 7, 8, 7, 8, 7, 9, 7]
  }
  for (let mask = 0; mask < 512; mask++) {
    const bit = (index) => Boolean(mask & (1 << index))
    for (const kind of ["UnspawnedRelease", "AttachedRelease", "CachedRelease", "FinalizedRelease"]) {
      const fault = new Error("release primitive fault")
      const exercise = (plan, failAt, after) => {
        const trace = [],
          state = {
            claim: bit(2),
            unassigned: true,
            reservation: true,
            revision: true,
            acquired: true,
            reserved: true,
            built: false,
            released: bit(6)
          }
        let failure
        const operation = (name) => {
          trace.push(name)
          if (trace.length === failAt && !after) throw fault
          let value
          switch (name) {
            case "ReleaseReadTransfer":
              value = bit(0)
              break
            case "ReleaseReadOwner":
              value = bit(1)
              break
            case "ReleaseReadPlanClaim":
            case "ReleaseReadUnitClaim":
              value = state.claim
              break
            case "ReleaseBuildUnit":
              state.built = true
              break
            case "ReleasePlanClaim":
            case "ReleaseCapacityClaim":
            case "ReleaseForgetPlanClaim":
            case "ReleaseForgetUnitClaim":
              state.claim = false
              state.unassigned = false
              break
            case "ReleaseSlotReservation":
            case "ReleaseUnitReservation":
              state.reserved = false
              break
            case "ReleaseForgetReservation":
              state.reservation = false
              break
            case "ReleaseAcquisition":
              if (state.acquired && !bit(7)) {
                state.acquired = false
                state.revision = false
              }
              break
            case "ReleaseCurrentWork":
              state.revision = false
              break
            case "ReleaseForgetAcquisition":
              state.acquired = false
              break
            case "ReleaseMarkUnit":
              state.released = true
              break
            case "ReleaseReadWorkBound":
              value = bit(5)
              break
            case "ReleaseReadCompleted":
              value = bit(3)
              break
            case "ReleaseReadRound":
              value = bit(4)
              break
            case "ReleaseRetireWork":
              if (bit(8)) state.released = true
              break
            case "ReleaseReadReleased":
              value = state.released
              break
            default:
              throw new Error("Unknown release primitive " + name)
          }
          if (trace.length === failAt && after) throw fault
          return value
        }
        try {
          if (plan) for (const name of plan) operation(name)
          else {
            let release = core.release_initial({ $: kind })
            while (release.$ === "ReleaseAwait") {
              const value = operation(release.operation.$)
              release = core.release_resume(
                release,
                value === undefined ? { $: "ReleaseAck" } : { $: "ReleaseFlag", value }
              )
            }
            assert.equal(release.$, "ReleaseDone")
          }
        } catch (error) {
          failure = error
        }
        return { trace, state, failure }
      }
      const fixtureIndex = kind === "FinalizedRelease" ? ((mask >> 3) & 15) | (((mask >> 8) & 1) << 4) : mask & 7
      const plan = releasePlans[releasePlanCases[kind][fixtureIndex]]
      const expected = exercise(plan, 0, false)
      assert.deepEqual(expected.trace, plan)
      assert.deepEqual(exercise(undefined, 0, false), expected)
      cases++
      for (let index = 1; index <= plan.length; index++)
        for (const after of [false, true]) {
          const expected = exercise(plan, index, after),
            actual = exercise(undefined, index, after)
          assert.strictEqual(actual.failure, fault)
          assert.deepEqual(actual.trace, plan.slice(0, index))
          assert.deepEqual(actual, expected, `${kind} primitive ${index}, after=${after}, mask=${mask}`)
          cases++
        }
    }
  }
  const routeCases = [
    ["Owner", "owner", undefined, "fresh", "FreshInspection"],
    ["CachedEntry", "cached", undefined, "cached", "CachedInspection"],
    ["CachedClear", "cached", undefined, "cached", "CachedInspection"],
    ["CachedFinding", "cached", undefined, "cached", "CachedInspection"],
    ["JoinedAdvice", "joined", "advice", "existing-advice", "AdviceInspection"],
    ["JoinedPending", "joined", "pending", "joined-pending", "PendingInspection"],
    ["JoinedClaimed", "joined", "claimed", "joined-claimed", "ClaimedInspection"]
  ]
  const routeNames = Object.fromEntries(routeCases.map((entry) => [entry[4], entry[3]]))
  for (const [tag, kind, join] of routeCases) {
    const route = tag === "CachedFinding" ? { $: tag, evaluation: 99 } : { $: tag }
    assert.equal(core.route_cached(route), kind === "cached")
    assert.deepEqual(
      array(core.native_plan_actions(route)).map((x) => x.$),
      kind === "owner" ? ["StoreNativePlan", "TrackNativeClaim"] : ["StoreNativePlan"]
    )
    assert.equal(
      core.reuse_observation(route).$,
      kind === "owner"
        ? "InvalidReuseObservation"
        : kind === "cached"
          ? "CachedReuseObservation"
          : "JoinedReuseObservation"
    )
    for (const policy of [false, true])
      for (const observation of [false, true]) {
        assert.equal(
          core.planned_work(route, policy, observation).$,
          !policy || !observation ? "NoPlannedWork" : kind === "cached" ? "CachedPlannedWork" : "SpawnPlannedWork"
        )
        cases++
      }
    for (const receiptPresent of [false, true])
      for (const enabled of [false, true])
        for (const id of [undefined, "", "id"]) {
          const fault = new Error("plan observation fault")
          const exercise = (failAt) => {
            const trace = [],
              offers = []
            const call = (name, value) => {
              trace.push(name)
              if (trace.length === failAt) throw fault
              return value
            }
            const receipt = { scope: { root: "root" }, correlation: { invocation: "test" } }
            const context = {
              job: {
                get inspectionReceipt() {
                  return call("receipt", receiptPresent ? receipt : undefined)
                }
              },
              deps: {
                residentInspection: {
                  forgetOrigin: () => call("forget"),
                  registerOrigin: () => call("register"),
                  evaluationId: () => call("evaluation", id)
                },
                inspection: {
                  isEnabled: () => call("enabled", enabled),
                  offer: (...args) => {
                    call("offer")
                    offers.push(args)
                  }
                }
              }
            }
            const item = {
              kind,
              ...(join === undefined ? {} : { join }),
              evaluationKey: "key",
              outcome: {
                path: "path",
                prepared: { identity: "identity", input: { declaration: { name: "declaration" } } }
              }
            }
            let failure
            try {
              {
                let step = core.plan_observation_initial(route),
                  heldReceipt,
                  evaluationId
                while (step.$ === "PlanObservationAwait") {
                  const op = step.operation
                  let response = { $: "PlanObservationAck" }
                  switch (op.$) {
                    case "ReadPlanReceipt":
                      heldReceipt = context.job.inspectionReceipt
                      response = { $: "PlanObservationFlag", value: heldReceipt !== undefined }
                      break
                    case "ForgetPlanOrigin":
                      context.deps.residentInspection.forgetOrigin()
                      break
                    case "CheckPlanInspection":
                      response = { $: "PlanObservationFlag", value: context.deps.inspection.isEnabled() }
                      break
                    case "RegisterPlanOrigin":
                      context.deps.residentInspection.registerOrigin()
                      break
                    case "ReadPlanEvaluation":
                      evaluationId = context.deps.residentInspection.evaluationId()
                      response = { $: "PlanObservationFlag", value: evaluationId !== undefined }
                      break
                    case "OfferMissingPlan":
                    case "OfferLinkedPlan":
                      context.deps.inspection.offer(
                        heldReceipt.scope,
                        { ...heldReceipt.correlation, ...(evaluationId === undefined ? {} : { evaluationId }) },
                        {
                          kind: "evaluation-route",
                          route: routeNames[op.route.$],
                          semanticIdentity: item.outcome.prepared.identity,
                          path: item.outcome.path,
                          declaration: item.outcome.prepared.input.declaration.name,
                          original:
                            op.$ === "OfferLinkedPlan"
                              ? { status: "linked", evaluationId }
                              : { status: "missing", reason: "not-captured" }
                        }
                      )
                      break
                  }
                  step = core.plan_observation_resume(step, response)
                }
                assert.equal(step.$, "PlanObservationDone")
              }
            } catch (error) {
              failure = error
            }
            return { trace, offers, failure }
          }
          const active = receiptPresent && enabled
          const trace = [
            "receipt",
            ...(kind === "owner" ? ["forget"] : []),
            ...(receiptPresent ? ["enabled"] : []),
            ...(active ? [...(kind === "owner" ? ["register"] : []), "evaluation", "offer"] : [])
          ]
          const offers = active
            ? [
                [
                  { root: "root" },
                  { invocation: "test", ...(id === undefined ? {} : { evaluationId: id }) },
                  {
                    kind: "evaluation-route",
                    route: routeCases.find((entry) => entry[0] === tag)[3],
                    semanticIdentity: "identity",
                    path: "path",
                    declaration: "declaration",
                    original:
                      id === undefined
                        ? { status: "missing", reason: "not-captured" }
                        : { status: "linked", evaluationId: id }
                  }
                ]
              ]
            : []
          assert.deepEqual(exercise(0), { trace, offers, failure: undefined })
          cases++
          for (let fail = 1; fail <= trace.length; fail++) {
            const actual = exercise(fail)
            assert.strictEqual(actual.failure, fault)
            assert.deepEqual(actual.trace, trace.slice(0, fail))
            assert.deepEqual(actual.offers, [], "a failed read/offer cannot publish")
            cases++
          }
        }
  }
  const selectionFault = new Error("selection getter fault")
  const selectionFactories = [
    () => [
      { status: "skipped", path: "target", key: "other" },
      { status: "observed", path: "target", key: "target" },
      { status: "observed", path: "target", key: "target" }
    ],
    () => [
      {
        status: "skipped",
        get path() {
          throw selectionFault
        },
        key: "other"
      },
      { status: "observed", path: "target", key: "target" },
      {
        get status() {
          throw selectionFault
        },
        get key() {
          throw selectionFault
        }
      }
    ],
    () => {
      const values = []
      values.length = 2
      values[1] = { status: "observed", path: "target", key: "target" }
      return values
    },
    () => [{ status: "observed", path: "other", key: "other" }],
    () => [],
    () => [
      { status: "observed", path: "\ud800", key: "\ud800" },
      { status: "observed", path: "\ud800", key: "\ud800" }
    ],
    () => {
      const values = [
        {
          status: "observed",
          get path() {
            values.push({ status: "observed", path: "target", key: "target" })
            return "other"
          },
          get key() {
            values.push({ status: "observed", path: "target", key: "target" })
            return "other"
          }
        }
      ]
      return values
    },
    () => {
      const values = [
        {
          status: "observed",
          get path() {
            delete values[1]
            return "other"
          },
          get key() {
            delete values[1]
            return "other"
          }
        },
        { status: "observed", path: "target", key: "target" },
        { status: "observed", path: "target", key: "target" }
      ]
      return values
    }
  ]
  for (const factory of selectionFactories)
    for (const mode of ["AdviceMembership", "AdviceSelection", "ObservedSelection"])
      for (const target of ["target", "\ud800", "missing"]) {
        const exercise = (bend) => {
          const trace = [],
            base = factory()
          const values = new Proxy(base, {
            has: (object, key) => {
              trace.push(["has", String(key)])
              return Reflect.has(object, key)
            },
            get: (object, key, receiver) => {
              trace.push(["get", String(key)])
              return Reflect.get(object, key, receiver)
            }
          })
          const equal = mode === "ObservedSelection" ? (row) => row.path === target : (row) => row.key === target
          const observed = (row) => row.status === "observed"
          let result, failure
          try {
            if (bend) {
              const selected = selectPostValue(core, values, { $: mode }, equal, { observed })
              result = mode === "AdviceMembership" ? selected.found : selected.found ? selected.value : undefined
            } else if (mode === "AdviceMembership") result = Array.prototype.some.call(values, equal)
            else
              result = Array.prototype.find.call(
                values,
                mode === "ObservedSelection" ? (row) => observed(row) && equal(row) : equal
              )
          } catch (error) {
            failure = error === selectionFault ? error : { name: error.name, message: error.message }
          }
          // Compare native payload identity by the original index, plus complete getter/has order.
          return {
            trace,
            result: typeof result === "object" && result !== null ? base.indexOf(result) : result,
            failure
          }
        }
        assert.deepEqual(exercise(true), exercise(false), `${mode}, ${target}`)
        cases++
      }
  const runTail = (options) => {
    let step = core.advice_initial(77, 900),
      ordinal = 0
    const commands = []
    for (let fuel = 0; fuel < 20; fuel++) {
      if (step.$ !== "AdviceAwait") return { step, commands }
      const request = step.request,
        command = request.command
      commands.push(command)
      requests++
      ordinal++
      assert.equal(command.advice, 900)
      assert.equal(
        core.advice_resume(step, { $: "Reply", invocation: 78, id: request.id, response: { $: "Ack" } }).$,
        "AdviceRejected"
      )
      assert.equal(
        core.advice_resume(step, { $: "Reply", invocation: 77, id: request.id + 1, response: { $: "Ack" } }).$,
        "AdviceRejected"
      )
      let response =
        command.$ === "AdviceCheckExpired"
          ? { $: "Expired", value: !!options.expired }
          : command.$ === "AdviceCheckActive"
            ? { $: "Active", value: !options.inactive }
            : command.$ === "AdvicePublish"
              ? { $: "Published", publication: 44 }
              : { $: "Ack" }
      if (ordinal === options.failAt) response = { $: "Failed", token: 71 }
      if (ordinal === options.defectAt) response = { $: "Defect", token: 74 }
      if (ordinal === options.cancelAt) response = { $: "Cancelled", token: 72 }
      if (
        command.$ === "AdviceRemove" &&
        options.cleanupFailure &&
        (options.cleanupAlways || commands.filter((value) => value.$ === "AdviceRemove").length === 1)
      )
        response = { $: "Failed", token: 73 }
      step = core.advice_resume(step, { $: "Reply", invocation: 77, id: request.id, response })
    }
    throw new Error("Advice tail did not terminate")
  }
  const permanentCleanupFailure = runTail({ failAt: 1, cleanupFailure: true, cleanupAlways: true })
  assert.equal(permanentCleanupFailure.step.$, "AdviceCleanupPending")
  assert.equal(permanentCleanupFailure.step.advice, 900)
  assert.equal(permanentCleanupFailure.step.reason.token, 71)
  assert.equal(permanentCleanupFailure.commands.filter((value) => value.$ === "AdviceRemove").length, 2)
  cases++
  const expiredTail = runTail({ failAt: 1, expired: true })
  assert.equal(expiredTail.commands.find((value) => value.$ === "AdviceRemove").retirement.$, "ExpiredRetirement")
  cases++
  const currentTail = runTail({ failAt: 1 })
  assert.equal(
    currentTail.commands.find((value) => value.$ === "AdviceRemove").retirement.$,
    "RetentionFailureRetirement"
  )
  cases++
  const liveTail = runTail({})
  assert.equal(liveTail.step.$, "AdviceFinished")
  assert.deepEqual(
    liveTail.commands.map((value) => value.$),
    ["AdvicePendingBarrier", "AdviceCheckActive", "AdvicePublish", "AdviceRecordPublished"]
  )
  cases++
  const cutoffTail = runTail({ inactive: true })
  assert.equal(cutoffTail.step.$, "AdviceFinished")
  assert.deepEqual(
    cutoffTail.commands.map((value) => value.$),
    ["AdvicePendingBarrier", "AdviceCheckActive"]
  )
  cases++
  for (let ordinal = 1; ordinal <= liveTail.commands.length; ordinal++)
    for (const kind of ["failAt", "cancelAt", "defectAt"]) {
      const result = runTail({ [kind]: ordinal, cleanupFailure: true })
      assert.equal(result.step.$, "AdviceStopped")
      assert.equal(
        result.step.reason.$,
        kind === "failAt" ? "TechnicalFailure" : kind === "defectAt" ? "DefectFailure" : "CancelledReason"
      )
      assert.equal(result.step.reason.token, kind === "failAt" ? 71 : kind === "defectAt" ? 74 : 72)
      assert.equal(result.commands.filter((value) => value.$ === "AdviceRemove").length, 2)
      cases++
    }
  console.log(
    JSON.stringify({
      passed: true,
      cases,
      requests,
      scope:
        "finite source-free whole postflow candidate; actual retained-observation interpreter getter/spread/callee/receiver and raw-fault chronology, exact bounded settlement and entrypoint coupling; fixture-authored plan/inspection ordering and lazy sparse/UTF16 first-match correspondence, four original release sequences across native fact axes and failure before/after every primitive, six reuse routes, round-bound/standalone, capacity and enqueue refusal, failures/cancellation at every Await, persistent cleanup obligation and transferred-owner exclusion; independent post-insert advice tail with cutoff retention, correlated replies and error-preserving cleanup retry; simulated semantic owner replies, not full resident integration or universal correspondence"
    })
  )
} finally {
  await rm(temporary, { recursive: true, force: true })
}
