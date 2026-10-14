import assert from "node:assert/strict"
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
    handle: BigInt(index + 1),
    ready: true,
    fits: true,
    reservation_bytes: 100n
  }))
  let cases = 0,
    requests = 0
  function run(options = {}) {
    let step = core.initial(1n, options.bound ?? true, list(options.outcomes ?? outcomes), options.incomplete ?? false),
      ordinal = 0
    const commands = [],
      cleanup = [],
      enqueued = [],
      settled = []
    for (let fuel = 0; fuel < 1000; fuel++) {
      if (step.$ === "Internal") {
        step = core.advance(step.state)
        continue
      }
      if (step.$ !== "Await") return { step, commands, cleanup, enqueued, settled }
      const request = step.request,
        command = request.command
      commands.push(command)
      requests++
      ordinal++
      assert.equal(
        core.resume(step, { $: "Reply", invocation: 2n, id: request.id, response: { $: "Ack" } }).$,
        "Rejected"
      )
      let response = { $: "Ack" }
      switch (command.$) {
        case "CheckActive":
          response = { $: "Active", value: options.inactiveAt !== ordinal }
          break
        case "Offer":
          response = {
            $: "Offered",
            accepted: command.outcome.ready && (!command.deliverability || command.outcome.fits)
          }
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
          response = { $: "CachedFacts", evaluation: 999n, findings: command.item.key === 2n ? 0n : 1n }
          break
        case "ReadPending":
          response = { $: "PendingOwner", owner: 700n }
          break
        case "CompletePreparation":
          response = {
            $: "Reserved",
            allocations: list(
              array(command.retained).map((item) =>
                options.capacityRefused
                  ? none
                  : some({ $: "Allocation", operation: 100n + item.key, reservation: 200n + item.key })
              )
            )
          }
          break
        case "ReadLiveAdvice":
          response = { $: "AdviceOwner", owner: command.item.key === 4n ? some(800n) : none }
          break
        case "PublishJoinedAdvice":
          response = { $: "Published", publication: 900n }
          break
        case "ReadCurrentAdvice":
          response = { $: "FindingCount", findings: 2n }
          break
        case "ReadJoinedPending":
          response = { $: "JoinOwner", owner: command.item.key === 5n ? some(700n) : none }
          break
        case "RegisterClear":
          response = { $: "Revision", token: 302n }
          break
        case "RegisterRevision":
          response = { $: "Revision", token: 300n + command.slot.item.key }
          break
        case "RegisterWork":
          response = { $: "Work", token: options.noWork ? none : some(400n + command.slot.item.key) }
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
          response = { $: "AdviceInserted", tail: 1000n }
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
      if (options.failAt === ordinal && command.$ !== "Cleanup") response = { $: "Failed", token: 77n }
      if (options.defectAt === ordinal && command.$ !== "Cleanup") response = { $: "Defect", token: 89n }
      if (options.cancelAt === ordinal && command.$ !== "Cleanup") response = { $: "Cancelled", token: 88n }
      if (options.cleanupFailOnce && command.$ === "Cleanup" && cleanup.length === 1)
        response = { $: "Failed", token: 99n }
      if (command.$ === "Enqueue" && response.$ === "Queued" && response.accepted) enqueued.push(command.slot.item.key)
      if (command.$ === "FinalizeCachedUnit" && response.$ === "Ack") settled.push(command.slot.item.key)
      step = core.resume(step, { $: "Reply", invocation: 1n, id: request.id, response })
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
  assert.deepEqual(success.enqueued, [1n])
  assert.deepEqual(success.settled, [3n])
  assert.deepEqual(
    success.commands.filter((command) => command.$ === "LookupReuse").map((command) => command.outcome.handle),
    [1n, 2n, 3n, 4n, 5n, 6n]
  )
  assert.equal(success.commands.filter((command) => command.$ === "OwnerBarrier").length, 1)
  assert.equal(success.commands.filter((command) => command.$ === "JoinedBarrier").length, 1)
  assert.equal(
    success.commands.some((command) => command.$ === "ReportDeliverabilityNotice"),
    false
  )
  cases++
  for (const refused of [[1n], [1n, 3n]]) {
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
          .map((action) => action.handle - 200n),
        refused.includes(3n) ? [] : [3n]
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
    [{ noWork: true, bound: false }, (result) => assert.deepEqual(result.enqueued, [1n])],
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
            (action) => action.$ === "ReleaseCleanupReservation" && action.handle === 201n
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
      assert.equal(result.step.reason.token, kind === "failAt" ? 77n : kind === "defectAt" ? 89n : 88n)
      assert.equal(result.cleanup.length, 2)
      assert.deepEqual(result.cleanup[0], result.cleanup[1])
      for (const command of result.cleanup)
        for (const action of array(command.actions)) {
          if (action.$ !== "ReleaseCleanupReservation") continue
          const key = action.handle - 200n
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
      { $: "CleanupTail", handle: 1n, started: bit(0) },
      { $: "CleanupWork", handle: 2n, cached: bit(1), completed: bit(2), round_bound: bit(3), work_bound: bit(4) },
      { $: "CleanupReservation", handle: 3n, present: bit(5), transferred: bit(6), discharged: bit(7) },
      { $: "CleanupRevision", handle: 4n, present: bit(5), transferred: bit(6) },
      { $: "CleanupClaim", handle: 5n, present: bit(7), transferred: bit(8) },
      { $: "CleanupWorkspace", source_owned: bit(8), active: bit(0) }
    ]
    const expected = []
    if (!bit(0)) expected.push({ $: "DrainCleanupTail", handle: 1n })
    if (bit(1) && !bit(2) && bit(3) && bit(4)) expected.push({ $: "RetireCleanupWork", handle: 2n })
    if (!bit(6)) {
      if (bit(5)) expected.push({ $: "ReleaseCleanupReservation", handle: 3n })
      else if (!bit(7)) expected.push({ $: "InvalidCleanupReservation" })
    }
    if (bit(5) && !bit(6)) expected.push({ $: "ReleaseCleanupRevision", handle: 4n })
    if (bit(7) && !bit(8)) expected.push({ $: "ReleaseCleanupClaim", handle: 5n })
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
      list([{ $: "CleanupClaim", handle: 33n, present: true, transferred: false }])
    )
    assert.equal(finish.$, "CleanupFinishRun")
    assert.deepEqual(finish.cursor.action, { $: "ReleaseCleanupClaim", handle: 33n })
    finish = core.cleanup_finish_reply(finish, false)
  }
  assert.equal(finish.$, "CleanupFinishDone")
  cases++
  // Independent native ordering oracle for the four original compound releases.
  // Every primitive can fail before or after its receipt; no later action runs.
  const nativeRelease = (kind, operation) => {
    if (kind === "UnspawnedRelease") {
      if (operation("ReleaseReadTransfer")) return
      if (operation("ReleaseReadOwner")) {
        if (operation("ReleaseReadPlanClaim")) operation("ReleasePlanClaim")
        operation("ReleaseForgetPlanClaim")
      }
      operation("ReleaseSlotReservation")
      operation("ReleaseForgetReservation")
      operation("ReleaseAcquisition")
    } else if (kind === "AttachedRelease") {
      if (operation("ReleaseReadTransfer")) return
      operation("ReleaseBuildUnit")
      if (operation("ReleaseReadUnitClaim")) operation("ReleaseCapacityClaim")
      operation("ReleaseUnitReservation")
      operation("ReleaseCurrentWork")
      operation("ReleaseForgetAcquisition")
      operation("ReleaseMarkUnit")
      operation("ReleaseForgetUnitClaim")
      operation("ReleaseForgetReservation")
    } else if (kind === "CachedRelease") {
      operation("ReleaseSlotReservation")
      operation("ReleaseAcquisition")
      operation("ReleaseBuildUnit")
      operation("ReleaseMarkUnit")
      operation("ReleaseForgetReservation")
    } else {
      operation("ReleaseBuildUnit")
      const workBound = operation("ReleaseReadWorkBound")
      if (!operation("ReleaseReadCompleted") && operation("ReleaseReadRound") && workBound) {
        operation("ReleaseRetireWork")
        if (!operation("ReleaseReadReleased")) {
          operation("ReleaseUnitReservation")
          operation("ReleaseCurrentWork")
          operation("ReleaseForgetAcquisition")
          operation("ReleaseMarkUnit")
        }
      }
    }
  }
  for (let mask = 0; mask < 512; mask++) {
    const bit = (index) => Boolean(mask & (1 << index))
    for (const kind of ["UnspawnedRelease", "AttachedRelease", "CachedRelease", "FinalizedRelease"]) {
      const fault = new Error("release primitive fault")
      const exercise = (bend, failAt, after) => {
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
          if (!bend) nativeRelease(kind, operation)
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
      const native = exercise(false, 0, false)
      assert.deepEqual(exercise(true, 0, false), native)
      cases++
      for (let index = 1; index <= native.trace.length; index++)
        for (const after of [false, true]) {
          const expected = exercise(false, index, after),
            actual = exercise(true, index, after)
          assert.strictEqual(expected.failure, fault)
          assert.deepEqual(actual, expected, `${kind} primitive ${index}, after=${after}, mask=${mask}`)
          cases++
        }
    }
  }
  const runTail = (options) => {
    let step = core.advice_initial(77n, 900n),
      ordinal = 0
    const commands = []
    for (let fuel = 0; fuel < 20; fuel++) {
      if (step.$ !== "AdviceAwait") return { step, commands }
      const request = step.request,
        command = request.command
      commands.push(command)
      requests++
      ordinal++
      assert.equal(command.advice, 900n)
      assert.equal(
        core.advice_resume(step, { $: "Reply", invocation: 78n, id: request.id, response: { $: "Ack" } }).$,
        "AdviceRejected"
      )
      assert.equal(
        core.advice_resume(step, { $: "Reply", invocation: 77n, id: request.id + 1n, response: { $: "Ack" } }).$,
        "AdviceRejected"
      )
      let response =
        command.$ === "AdviceCheckExpired"
          ? { $: "Expired", value: !!options.expired }
          : command.$ === "AdviceCheckActive"
            ? { $: "Active", value: !options.inactive }
            : command.$ === "AdvicePublish"
              ? { $: "Published", publication: 44n }
              : { $: "Ack" }
      if (ordinal === options.failAt) response = { $: "Failed", token: 71n }
      if (ordinal === options.defectAt) response = { $: "Defect", token: 74n }
      if (ordinal === options.cancelAt) response = { $: "Cancelled", token: 72n }
      if (
        command.$ === "AdviceRemove" &&
        options.cleanupFailure &&
        (options.cleanupAlways || commands.filter((value) => value.$ === "AdviceRemove").length === 1)
      )
        response = { $: "Failed", token: 73n }
      step = core.advice_resume(step, { $: "Reply", invocation: 77n, id: request.id, response })
    }
    throw new Error("Advice tail did not terminate")
  }
  const permanentCleanupFailure = runTail({ failAt: 1, cleanupFailure: true, cleanupAlways: true })
  assert.equal(permanentCleanupFailure.step.$, "AdviceCleanupPending")
  assert.equal(permanentCleanupFailure.step.advice, 900n)
  assert.equal(permanentCleanupFailure.step.reason.token, 71n)
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
      assert.equal(result.step.reason.token, kind === "failAt" ? 71n : kind === "defectAt" ? 74n : 72n)
      assert.equal(result.commands.filter((value) => value.$ === "AdviceRemove").length, 2)
      cases++
    }
  console.log(
    JSON.stringify({
      passed: true,
      cases,
      requests,
      scope:
        "finite source-free whole postflow draft, four original release sequences across native fact axes and failure before/after every primitive, six reuse routes, round-bound/standalone, capacity and enqueue refusal, failures/cancellation at every Await, persistent cleanup obligation and transferred-owner exclusion; independent post-insert advice tail with cutoff retention, correlated replies and error-preserving cleanup retry; simulated semantic owner replies, not physical integration or universal correspondence"
    })
  )
} finally {
  await rm(temporary, { recursive: true, force: true })
}
