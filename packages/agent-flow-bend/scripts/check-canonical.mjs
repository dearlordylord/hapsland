import assert from "node:assert/strict"
import { bendCanonicalStep } from "@hapsland/agent-flow-bend/canonical"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import {
  initialCanonical,
  projectCanonical,
  stepCanonical as rawStepCanonical
} from "@hapsland/canonical-policy/canonical/adapter"

// Assert the partition uniqueness invariant after every checked transition,
// including rejected events and transitions unrelated to round admission.
const uniquenessCheckedKinds = new Set()
let uniquenessCheckedTransitions = 0
const stepCanonical = (state, event) => {
  const result = rawStepCanonical(state, event)
  const rounds = projectCanonical(result.state).rounds
  assert.equal(
    new Set(rounds.map((round) => round.partition)).size,
    rounds.length,
    `${event.kind}: at most one canonical round per partition`
  )
  uniquenessCheckedKinds.add(event.kind)
  uniquenessCheckedTransitions++
  return result
}

const fixture = JSON.parse(readFileSync(resolve(import.meta.dirname, "../../../conformance/canonical-v1.json"), "utf8"))
const format = (outputs) =>
  outputs
    .map((item) => {
      switch (item.kind) {
        case "prepare":
        case "unitAdmitted":
          return `${item.kind}:${item.operation}:${item.reservation}`
        case "roundStarted":
        case "reservationReleased":
          return `${item.kind}:${item.id}`
        case "preparationReleased":
          return `reservationReleased:${item.id}`
        case "partitionRetired":
          return `${item.kind}:${item.round}`
        case "writeAuthorized":
        case "cancelWork":
          return `${item.kind}:${item.operation}`
        case "reviewRecorded":
        case "writeRecorded":
          return `${item.kind}:${item.outcome}`
        default:
          return item.kind
      }
    })
    .join(",")
for (const trace of fixture.traces) {
  let state = initialCanonical(fixture.limits)
  const outputs = []
  const capacity = []
  for (const event of trace.events) {
    const result = stepCanonical(state, event)
    state = result.state
    outputs.push(result.rejection ? `rejected:${result.rejection}` : format(result.outputs))
    if (event.kind === "preparationCompleted")
      capacity.push(
        result.outputs
          .filter((command) => "after" in command)
          .map((command) => ({
            kind: command.kind,
            ...("position" in command ? { position: command.position, bytes: command.bytes } : {}),
            ...("reason" in command ? { reason: command.reason } : {}),
            global: command.after.global,
            local: command.after.local,
            charges: command.after.charges
          }))
      )
  }
  assert.deepEqual(outputs, trace.outputs, trace.name)
  assert.deepEqual(projectCanonical(state).global, trace.global, `${trace.name}: ledger`)
  assert.deepEqual(projectCanonical(state).partitions, trace.partitions, `${trace.name}: advicee usage`)
  if (trace.charges) assert.deepEqual(projectCanonical(state).charges, trace.charges, `${trace.name}: reservations`)
  if (trace.capacity) assert.deepEqual(capacity, trace.capacity, `${trace.name}: ordered capacity decisions`)
  if (trace.expectedDecisionPending) {
    assert.equal(projectCanonical(state).rounds[0]?.deciding, true, `${trace.name}: decision fence`)
  }
}
const state = initialCanonical(fixture.limits)
const idleFacts = {
  active: true,
  dispatcherIdle: true,
  noAdvice: true,
  noNotices: true,
  noPendingEvaluations: true,
  noCurrentWork: true,
  noCooldowns: true,
  connectionCountOk: true,
  cacheMatchesLedger: true
}
const cleanupDecision = (canonical, kind) =>
  stepCanonical(canonical, kind === "cleanupCheck" ? { kind, facts: idleFacts } : { kind }).outputs.map(
    (command) => command.kind
  )
assert.deepEqual(cleanupDecision(state, "cleanupCheck"), ["cleanupReady"])
const roundHeld = stepCanonical(state, { kind: "openRound", partition: 1, lifetime: 1 }).state
assert.deepEqual(cleanupDecision(roundHeld, "cleanupCheck"), ["cleanupBusy"])
assert.deepEqual(cleanupDecision(roundHeld, "cleanupCommit"), ["cleanupBusy"])
const permitHeld = stepCanonical(state, {
  kind: "issuePermit",
  partition: 1,
  lifetime: 1,
  tool: 1,
  started: 100,
  now: 101,
  deadline: 200,
  minimumStarted: 0,
  facts: {
    clockValid: true,
    hookWindow: 2500,
    startedUpper: 100,
    nowLower: 101,
    adviceePermitLimit: 32,
    residentPermitLimit: 4096
  }
}).state
assert.deepEqual(cleanupDecision(permitHeld, "cleanupCheck"), ["cleanupBusy"])
assert.deepEqual(cleanupDecision(permitHeld, "cleanupCommit"), ["cleanupBusy"])
const permitReleased = stepCanonical(permitHeld, { kind: "releasePermit", partition: 1, lifetime: 1, token: 1 }).state
assert.deepEqual(cleanupDecision(permitReleased, "cleanupCheck"), ["cleanupReady"])
assert.throws(() => stepCanonical(state, { kind: "unknownTransition" }), TypeError)
assert.deepEqual(
  projectCanonical(state).inventory,
  ["observationDispatch", "preparation", "reviewUnit", "storedResult", "operationalNotice", "adviceRecheck"].map(
    (purpose) => ({ purpose, limits: fixture.limits })
  )
)
assert.throws(() => stepCanonical(state, { kind: "openRound", partition: -1, lifetime: 1 }), TypeError)
assert.throws(() => stepCanonical(state, { kind: "openRound", partition: 1, lifetime: 1, extra: true }), TypeError)
assert.throws(() => stepCanonical(state, { kind: "openRound", partition: 2 ** 48, lifetime: 1 }), TypeError)
assert.throws(() => initialCanonical({ ...fixture.limits, globalBytes: 2 ** 47 }), TypeError)
assert.throws(() => initialCanonical({ ...fixture.limits, globalItems: 513 }), TypeError)
assert.throws(
  () => stepCanonical(state, { kind: "beginPreparation", partition: 1, lifetime: 1, round: 1, bytes: 2 ** 47 }),
  TypeError
)
assert.throws(
  () =>
    stepCanonical(state, {
      kind: "preparationCompleted",
      partition: 1,
      lifetime: 1,
      round: 1,
      operation: 1,
      unitBytes: new Array(1025).fill(1)
    }),
  TypeError
)
assert.throws(
  () =>
    stepCanonical(state, {
      kind: "reviewCompleted",
      partition: 1,
      lifetime: 1,
      round: 1,
      operation: 1,
      outcome: "unexpected"
    }),
  TypeError
)
assert.throws(
  () => stepCanonical(state, { kind: "reserveCapacity", partition: 1, bytes: 1, purpose: "unknown" }),
  TypeError
)
assert.throws(
  () => stepCanonical(state, { kind: "reserveCapacity", partition: 1, bytes: 2 ** 47, purpose: "preparation" }),
  TypeError
)
assert.throws(
  () => stepCanonical(state, { kind: "resizeCapacity", reservation: 1, bytes: 1, purpose: "unknown" }),
  TypeError
)
assert.throws(
  () =>
    stepCanonical(state, {
      kind: "deliverySubmissionAllowedCheck",
      active: true,
      barrier: false,
      deciding: false,
      surface: "unknown",
      existingToken: false,
      finishPermit: false
    }),
  TypeError
)
assert.throws(
  () => stepCanonical({ $: "Canonical.State" }, { kind: "openRound", partition: 1, lifetime: 1 }),
  TypeError
)
let edge = initialCanonical({
  globalItems: 2,
  globalBytes: 2 ** 47 - 1,
  partitionItems: 2,
  partitionBytes: 2 ** 47 - 1
})
edge = stepCanonical(edge, { kind: "openRound", partition: 1, lifetime: 1 }).state
edge = stepCanonical(edge, { kind: "beginPreparation", partition: 1, lifetime: 1, round: 1, bytes: 1 }).state
const nearLimit = stepCanonical(edge, {
  kind: "preparationCompleted",
  partition: 1,
  lifetime: 1,
  round: 1,
  operation: 1,
  unitBytes: [2 ** 47 - 1, 2 ** 47 - 1]
})
assert.deepEqual(
  nearLimit.outputs.map((command) => command.kind),
  ["preparationReleased", "unitAdmitted", "unitRefused"]
)
assert.equal(projectCanonical(nearLimit.state).global.bytes, 2 ** 47 - 1)
const usageText = (usage) => `${usage.items}/${usage.bytes}`
const capacityCommand = (command) => {
  const after = "after" in command ? `:${usageText(command.after.global)}:${usageText(command.after.local)}` : ""
  switch (command.kind) {
    case "capacityGranted":
    case "capacityResized":
      return `${command.kind}:${command.id}${after}`
    case "preparationReleased":
      return `${command.kind}:${command.id}${after}`
    case "capacityUnitAdmitted":
      return `${command.kind}:${command.position}:${command.reservation}${after}`
    case "capacityUnitRefused":
      return `${command.kind}:${command.position}:${command.reason}${after}`
    case "reservationReleased":
      return `${command.kind}:${command.id}`
    default:
      throw new Error(`unexpected capacity trace command ${command.kind}`)
  }
}
let capacityState = initialCanonical(fixture.limits)
const capacityCommands = []
for (const [index, event] of fixture.capacityTrace.events.entries()) {
  const result = stepCanonical(capacityState, event)
  capacityState = result.state
  capacityCommands.push(
    result.rejection ? `rejected:${result.rejection}` : result.outputs.map(capacityCommand).join(",")
  )
  if (index === 7)
    assert.deepEqual(
      projectCanonical(capacityState).charges,
      fixture.capacityTrace.afterResizeCharges,
      "purpose change and competing ownership"
    )
}
assert.deepEqual(capacityCommands, fixture.capacityTrace.outputs, "resident capacity transition contract")
assert.deepEqual(projectCanonical(capacityState).global, fixture.capacityTrace.finalGlobal, "exact capacity release")
const permitFixture = JSON.parse(
  readFileSync(resolve(import.meta.dirname, "../../../conformance/canonical-permits-v1.json"), "utf8")
)
for (const trace of permitFixture.traces) {
  let consumedEdits = 0
  let current = initialCanonical(fixture.limits)
  for (const item of trace.events) {
    const { expect: expected, kind, ...input } = item
    const partition = input.partition
    const lifetime = input.lifetime ?? 1
    let event
    if (kind === "issue")
      event = {
        kind: "issuePermit",
        partition,
        lifetime,
        tool: input.tool,
        started: input.started,
        now: input.now,
        deadline: input.deadline,
        minimumStarted: 0,
        facts: {
          clockValid: true,
          hookWindow: 2500,
          startedUpper: input.started,
          nowLower: input.now,
          adviceePermitLimit: 32,
          residentPermitLimit: 4096
        }
      }
    else if (kind === "consume")
      event = { kind: "consumePermit", partition, lifetime, token: input.token, tool: input.tool, now: input.now }
    else if (kind === "release") event = { kind: "releasePermit", partition, lifetime, token: input.token }
    else if (kind === "expire")
      event = { kind: "expirePermit", partition, lifetime, token: input.token, deadlineReached: input.due }
    else if (kind === "close")
      event = { kind: "closePermitRound", partition, lifetime, round: input.round, at: input.at }
    else throw new Error(`unknown permit fixture event ${kind}`)
    const result = stepCanonical(current, event)
    current = result.state
    consumedEdits += result.outputs.filter((command) => command.kind === "permitConsumed").length
    const actual = result.rejection
      ? `rejected:${result.rejection}`
      : result.outputs
          .map((command) => {
            if (command.kind === "permitIssued") return `permitIssued:${command.token}:${command.round}`
            if (command.kind === "permitConsumed" || command.kind === "permitRoundClosed")
              return `${command.kind}:${command.round}`
            return command.kind
          })
          .join(",")
    assert.equal(actual, expected, `${trace.name}: ${kind}`)
  }
  assert.deepEqual(
    projectCanonical(current).admissions.map((entry) => ({
      partition: entry.partition,
      round: entry.round,
      active: entry.active,
      permits: entry.permits.length
    })),
    trace.rounds,
    trace.name
  )
  assert.equal(consumedEdits, trace.consumedEdits, `${trace.name}: accepted edits`)
}
// Bypass TypeScript validation to exercise Bend's own invariant boundary.
const singleRound = stepCanonical(initialCanonical(fixture.limits), {
  kind: "openRound",
  partition: 1,
  lifetime: 1
}).state
const invalidRounds = {
  ...singleRound,
  rounds: { $: "Con", head: { ...singleRound.rounds.head, lifetime: 2, id: 2 }, tail: singleRound.rounds }
}
const refusedDuplicates = bendCanonicalStep(invalidRounds, { $: "Canonical.OpenRound", partition: 2, lifetime: 1 })
assert.equal(refusedDuplicates.$, "Canonical.Rejected")
assert.equal(refusedDuplicates.reason.$, "Canonical.InconsistentLedger")
assert.deepEqual(
  refusedDuplicates.state,
  invalidRounds,
  "invalid post-state rolls back instead of committing new round"
)
// Exercise multiple partitions and generations, checking uniqueness after every
// transition above. A second edit joins, and even a different lifetime cannot
// open another round while the partition still owns its current round.
let uniqueRounds = initialCanonical(fixture.limits)
const applyUnique = (event, expectedKinds, expectedRejection) => {
  const result = stepCanonical(uniqueRounds, event)
  assert.equal(result.rejection, expectedRejection, `round uniqueness: ${event.kind}`)
  assert.deepEqual(
    result.outputs.map((command) => command.kind),
    expectedKinds,
    `round uniqueness: ${event.kind}`
  )
  uniqueRounds = result.state
}
for (let generation = 1; generation <= 3; generation++) {
  for (let partition = 1; partition <= 3; partition++) {
    const started = generation * 100
    for (let edit = 1; edit <= 2; edit++) {
      const token = (generation - 1) * 2 + edit
      applyUnique(
        {
          kind: "issuePermit",
          partition,
          lifetime: 1,
          tool: token,
          started,
          now: started + edit,
          deadline: started + 50,
          minimumStarted: 0,
          facts: {
            clockValid: true,
            hookWindow: 2500,
            startedUpper: started,
            nowLower: started + edit,
            adviceePermitLimit: 32,
            residentPermitLimit: 4096
          }
        },
        ["permitIssued"]
      )
      const before = projectCanonical(uniqueRounds).rounds
      applyUnique(
        { kind: "consumePermit", partition, lifetime: 1, token, tool: token, now: started + 3 },
        edit === 1 ? ["permitConsumed", "roundStarted"] : ["permitConsumed"]
      )
      if (edit === 2)
        assert.deepEqual(
          projectCanonical(uniqueRounds).rounds,
          before,
          "second accepted edit preserves existing round identity"
        )
      for (const lifetime of [1, 2]) {
        applyUnique({ kind: "openRound", partition, lifetime }, [], "StaleRound")
      }
    }
  }
  assert.equal(projectCanonical(uniqueRounds).rounds.length, 3)
  for (let partition = 1; partition <= 3; partition++) {
    const current = projectCanonical(uniqueRounds).rounds.find((round) => round.partition === partition)
    applyUnique({ kind: "closePermitRound", partition, lifetime: 1, round: generation, at: generation * 100 + 60 }, [
      "permitRoundClosed"
    ])
    // Admission closure alone cannot create a second canonical round before
    // the existing round is retired by the lifecycle owner.
    applyUnique({ kind: "openRound", partition, lifetime: 1 }, [], "StaleRound")
    applyUnique({ kind: "retirePartition", partition, lifetime: 1, round: current.id }, ["partitionRetired"])
  }
  assert.equal(projectCanonical(uniqueRounds).rounds.length, 0)
}
// Opening a canonical round and consuming its first edit are one transaction.
let fullRounds = initialCanonical(fixture.limits)
for (let partition = 1; partition <= 64; partition++) {
  const opened = stepCanonical(fullRounds, { kind: "openRound", partition, lifetime: 1 })
  assert.equal(opened.rejection, undefined)
  fullRounds = opened.state
}
const issuedAtLimit = stepCanonical(fullRounds, {
  kind: "issuePermit",
  partition: 65,
  lifetime: 1,
  tool: 1,
  started: 100,
  now: 101,
  deadline: 200,
  minimumStarted: 0,
  facts: {
    clockValid: true,
    hookWindow: 2500,
    startedUpper: 100,
    nowLower: 101,
    adviceePermitLimit: 32,
    residentPermitLimit: 4096
  }
})
assert.equal(issuedAtLimit.rejection, undefined)
const refusedAtLimit = stepCanonical(issuedAtLimit.state, {
  kind: "consumePermit",
  partition: 65,
  lifetime: 1,
  token: 1,
  tool: 1,
  now: 102
})
assert.equal(refusedAtLimit.rejection, "RoundLimit")
assert.deepEqual(
  projectCanonical(refusedAtLimit.state),
  projectCanonical(issuedAtLimit.state),
  "canonical round limit must preserve the unconsumed, inactive admission"
)
const retiredRound = projectCanonical(fullRounds).rounds.find((round) => round.partition === 1)
assert.ok(retiredRound)
const afterRetirement = stepCanonical(fullRounds, {
  kind: "retirePartition",
  partition: 1,
  lifetime: 1,
  round: retiredRound.id
})
assert.equal(afterRetirement.rejection, undefined)
assert.equal(
  stepCanonical(afterRetirement.state, { kind: "openRound", partition: 65, lifetime: 1 }).rejection,
  undefined,
  "retiring a round frees an active slot"
)
const reviewFixture = JSON.parse(
  readFileSync(resolve(import.meta.dirname, "../../../conformance/canonical-review-v1.json"), "utf8")
)
for (const trace of reviewFixture.traces) {
  let current = initialCanonical(fixture.limits)
  for (const item of trace.events) {
    const { expect: expected, afterChargePurpose, afterWorkKind, afterParents, ...event } = item
    const result = stepCanonical(current, event)
    current = result.state
    const actual = result.rejection
      ? `rejected:${result.rejection}`
      : result.outputs
          .map((command) => {
            if (
              command.kind === "roundStarted" ||
              command.kind === "observationAdmitted" ||
              command.kind === "preparationReleased" ||
              command.kind === "reservationReleased"
            ) {
              return `${command.kind}:${command.id}`
            }
            if (command.kind === "prepare" || command.kind === "unitAdmitted") {
              return `${command.kind}:${command.operation}:${command.reservation}`
            }
            if (command.kind === "reviewRecorded") return `${command.kind}:${command.outcome}`
            if (command.kind === "partitionRetired") return `${command.kind}:${command.round}`
            return command.kind
          })
          .join(",")
    assert.equal(actual, expected, `${trace.name}: ${event.kind}`)
    if (afterChargePurpose !== undefined) {
      assert.equal(
        projectCanonical(current).charges[0]?.purpose,
        afterChargePurpose,
        `${trace.name}: retained result charge`
      )
    }
    if (afterWorkKind !== undefined) {
      assert.equal(
        projectCanonical(current).work.find((work) => work.operation === event.operation)?.kind,
        afterWorkKind,
        `${trace.name}: completed result stage`
      )
    }
    if (afterParents !== undefined) {
      assert.deepEqual(
        projectCanonical(current)
          .work.filter((work) => work.kind === "reviewing")
          .map((work) => work.parent),
        afterParents,
        `${trace.name}: exact unit parent identities`
      )
    }
  }
  assert.deepEqual(projectCanonical(current).work, trace.finalWork, `${trace.name}: work`)
  assert.deepEqual(projectCanonical(current).charges, trace.finalCharges, `${trace.name}: charges`)
}
const dispatchFixture = JSON.parse(
  readFileSync(resolve(import.meta.dirname, "../../../conformance/canonical-dispatch-v1.json"), "utf8")
)
for (const trace of dispatchFixture.traces) {
  let current = initialCanonical(fixture.limits)
  for (const { expect: expected, ...event } of trace.events) {
    const result = stepCanonical(current, event)
    current = result.state
    const actual = result.rejection
      ? `rejected:${result.rejection}`
      : result.outputs
          .map((command) => {
            if (command.kind === "roundStarted" || command.kind === "observationAdmitted")
              return `${command.kind}:${command.id}`
            if (command.kind === "dispatchStarted") return `${command.kind}:${command.operation}:${command.sequence}`
            if (command.kind === "dispatchDiscarded") return `${command.kind}:${command.operation}:${command.running}`
            throw new Error(`unexpected dispatch trace command ${command.kind}`)
          })
          .join(",")
    assert.equal(actual, expected, `${trace.name}: ${event.kind}`)
  }
  const { queued, running, nextSequence, closed } = projectCanonical(current).dispatch
  assert.deepEqual({ queued, running, nextSequence, closed }, trace.dispatch, trace.name)
}
const stopFixture = JSON.parse(
  readFileSync(resolve(import.meta.dirname, "../../../conformance/canonical-stop-v1.json"), "utf8")
)
for (const trace of stopFixture.traces) {
  let current = initialCanonical(fixture.limits)
  for (const { expect: expected, ...event } of trace.events) {
    const result = stepCanonical(current, event)
    current = result.state
    const actual = result.rejection
      ? `rejected:${result.rejection}`
      : result.outputs
          .map((command) => {
            if (
              command.kind === "roundStarted" ||
              command.kind === "observationAdmitted" ||
              command.kind === "reservationReleased"
            )
              return `${command.kind}:${command.id}`
            if (command.kind === "preparationReleased") return `${command.kind}:${command.id}`
            if (command.kind === "prepare" || command.kind === "unitAdmitted")
              return `${command.kind}:${command.operation}:${command.reservation}`
            if (command.kind === "dispatchStarted" || command.kind === "cancelWork")
              return `${command.kind}:${command.operation}`
            return command.kind
          })
          .join(",")
    assert.equal(actual, expected, `${trace.name}: ${event.kind}`)
  }
}
const collectionFixture = JSON.parse(
  readFileSync(resolve(import.meta.dirname, "../../../conformance/canonical-collection-v1.json"), "utf8")
)
for (const trace of collectionFixture.traces) {
  let current = initialCanonical(fixture.limits)
  for (const { expect: expected, ...event } of trace.events) {
    const result = stepCanonical(current, event)
    current = result.state
    const actual = result.rejection
      ? `rejected:${result.rejection}`
      : result.outputs.map((command) => command.kind).join(",")
    assert.equal(actual, expected, `${trace.name}: ${event.kind}`)
  }
  assert.deepEqual(projectCanonical(current).collection, trace.collection, trace.name)
}
const deliveryFixture = JSON.parse(
  readFileSync(resolve(import.meta.dirname, "../../../conformance/canonical-delivery-v1.json"), "utf8")
)
for (const trace of deliveryFixture.traces) {
  let current = initialCanonical(fixture.limits)
  for (const { expect: expected, ...event } of trace.events) {
    const result = stepCanonical(current, event)
    current = result.state
    const actual = result.rejection
      ? `rejected:${result.rejection}`
      : result.outputs
          .map((command) => (command.kind === "finishRecorded" ? `${command.kind}:${command.outcome}` : command.kind))
          .join(",")
    assert.equal(actual, expected, `${trace.name}: ${event.kind}`)
  }
  const { slots, counters, submissions } = projectCanonical(current).delivery
  assert.deepEqual({ slots, counters }, trace.delivery, trace.name)
  if (trace.submissions) assert.deepEqual(submissions, trace.submissions, trace.name)
}
const submissionFixture = JSON.parse(
  readFileSync(resolve(import.meta.dirname, "../../../conformance/canonical-submission-v1.json"), "utf8")
)
for (const trace of submissionFixture.traces) {
  let current = initialCanonical(fixture.limits)
  for (const { expect: expected, afterBatches, afterLeases, ...event } of trace.events) {
    const result = stepCanonical(current, event)
    current = result.state
    assert.equal(result.rejection ?? result.outputs[0]?.kind, expected, `${trace.name}: ${event.kind}`)
    const submission = projectCanonical(current).delivery.submissions
    if (afterBatches)
      assert.deepEqual(
        submission.batches.map((batch) => batch.phase),
        afterBatches,
        `${trace.name}: batch phase`
      )
    if (afterLeases)
      assert.deepEqual(
        submission.leases.map((lease) => `${lease.phase}:${lease.reoffered}`),
        afterLeases,
        `${trace.name}: lease phase`
      )
  }
  assert.deepEqual(projectCanonical(current).delivery.submissions, trace.submissions, trace.name)
}
const revisionFixture = JSON.parse(
  readFileSync(resolve(import.meta.dirname, "../../../conformance/canonical-revision-v1.json"), "utf8")
)
for (const trace of revisionFixture.traces) {
  let current = initialCanonical(fixture.limits)
  for (const { expect: expected, ...event } of trace.events) {
    const result = stepCanonical(current, event)
    current = result.state
    const actual = result.rejection
      ? `rejected:${result.rejection}`
      : result.outputs
          .map((command) => {
            if ("generation" in command) return `${command.kind}:${command.generation}`
            if (command.kind === "revisionCount") return `${command.kind}:${command.count}`
            return command.kind
          })
          .join(",")
    assert.equal(actual, expected, `${trace.name}: ${event.kind}`)
  }
  assert.deepEqual(projectCanonical(current).revision, trace.revision, trace.name)
}
const authorityFixture = JSON.parse(
  readFileSync(resolve(import.meta.dirname, "../../../conformance/canonical-response-authority-v1.json"), "utf8")
)
for (const trace of authorityFixture.traces) {
  let current = initialCanonical(fixture.limits)
  for (const { expect: expected, ...event } of trace.events) {
    const result = stepCanonical(current, event)
    current = result.state
    const actual = result.rejection
      ? `rejected:${result.rejection}`
      : result.outputs
          .map((command) => ("reason" in command ? `${command.kind}:${command.reason}` : command.kind))
          .join(",")
    assert.equal(actual, expected, `${trace.name}: ${event.kind}`)
  }
  assert.ok(!Object.hasOwn(projectCanonical(current), "tickets"), "canonical state must have no ticket registry")
}
const reuseFixture = JSON.parse(
  readFileSync(resolve(import.meta.dirname, "../../../conformance/canonical-reuse-v1.json"), "utf8")
)
for (const trace of reuseFixture.traces) {
  let current = initialCanonical(fixture.limits)
  for (const { expect: expected, ...event } of trace.events) {
    const result = stepCanonical(current, event)
    current = result.state
    const actual = result.rejection
      ? `rejected:${result.rejection}`
      : result.outputs
          .map((command) =>
            command.kind === "cachePrepared"
              ? `${command.kind}:${command.evicted.join(",")}`
              : command.kind === "cacheDiscarded"
                ? `${command.kind}:${command.ids.join(",")}`
                : command.kind === "capacityGranted" || command.kind === "reservationReleased"
                  ? `${command.kind}:${command.id}`
                  : command.kind
          )
          .join(",")
    assert.equal(actual, expected, `${trace.name}: ${event.kind}`)
  }
  assert.deepEqual(projectCanonical(current).reuse, trace.reuse, trace.name)
}
const noticeFixture = JSON.parse(
  readFileSync(resolve(import.meta.dirname, "../../../conformance/canonical-notice-v1.json"), "utf8")
)
for (const trace of noticeFixture.traces) {
  let current = initialCanonical(fixture.limits)
  for (const { expect: expected, ...event } of trace.events) {
    const result = stepCanonical(current, event)
    current = result.state
    const actual = result.rejection
      ? `rejected:${result.rejection}`
      : result.outputs
          .map((command) => {
            switch (command.kind) {
              case "capacityGranted":
              case "reservationReleased":
                return `${command.kind}:${command.id}`
              case "noticeSuppressed":
              case "noticePendingCreated":
              case "noticePendingMerged":
                return `${command.kind}:${command.count}`
              case "noticeSelected":
                return `${command.kind}:${command.ids.join(",")}`
              case "noticePruned":
                return `${command.kind}:${command.dropLease}:${command.dropPending}:${command.dropKey}`
              default:
                return command.kind
            }
          })
          .join(",")
    assert.equal(actual, expected, `${trace.name}: ${event.kind}`)
  }
  assert.deepEqual(projectCanonical(current).notices, trace.notices, trace.name)
}
const retentionFixture = JSON.parse(
  readFileSync(resolve(import.meta.dirname, "../../../conformance/canonical-retention-v1.json"), "utf8")
)
for (const trace of retentionFixture.traces) {
  let current = initialCanonical(fixture.limits)
  for (const { expect: expected, ...event } of trace.events) {
    const result = stepCanonical(current, event)
    current = result.state
    const actual = result.rejection
      ? `rejected:${result.rejection}`
      : result.outputs
          .map((command) => {
            switch (command.kind) {
              case "capacityGranted":
              case "reservationReleased":
              case "roundStarted":
                return `${command.kind}:${command.id}`
              case "prepare":
                return `${command.kind}:${command.operation}:${command.reservation}`
              default:
                return command.kind
            }
          })
          .join(",")
    assert.equal(actual, expected, `${trace.name}: ${event.kind}`)
  }
  const projection = projectCanonical(current)
  assert.ok(!Object.hasOwn(projection, "tickets"))
  assert.equal(projection.dispatch.closed, trace.closed, trace.name)
  if (trace.rounds)
    assert.deepEqual(
      projection.rounds.map((round) => round.id).sort((a, b) => a - b),
      trace.rounds,
      trace.name
    )
}
const configurationFixture = JSON.parse(
  readFileSync(resolve(import.meta.dirname, "../../../conformance/canonical-configuration-v1.json"), "utf8")
)
for (const trace of configurationFixture.traces) {
  let current = initialCanonical(fixture.limits)
  for (const { expect: expected, ...event } of trace.events) {
    const result = stepCanonical(current, event)
    current = result.state
    assert.equal(result.rejection, undefined, trace.name)
    assert.equal(result.outputs.length, 1, trace.name)
    const command = result.outputs[0]
    const actual =
      command.kind === "includeChoice"
        ? `includeChoice:${command.choice}`
        : command.kind === "fileSelection"
          ? `fileSelection:${command.selection}`
          : command.kind === "fileProtection"
            ? `fileProtection:${command.protection}`
            : command.kind === "candidateFile"
              ? `candidateFile:${command.candidate}`
              : command.kind === "reviewAdmission"
                ? `reviewAdmission:${command.admission}`
                : command.kind
    assert.equal(actual, expected, trace.name)
  }
}
const ruleFixture = JSON.parse(
  readFileSync(resolve(import.meta.dirname, "../../../conformance/canonical-rules-v1.json"), "utf8")
)
for (const trace of ruleFixture.traces) {
  let current = initialCanonical(fixture.limits)
  const before = projectCanonical(current)
  for (const { expect: expected, ...event } of trace.events) {
    const result = stepCanonical(current, event)
    current = result.state
    assert.equal(result.rejection, undefined, trace.name)
    assert.equal(result.outputs.length, 1, trace.name)
    const command = result.outputs[0]
    const actual =
      command.kind === "ruleGate"
        ? `ruleGate:${command.gate}`
        : command.kind === "ruleOrder"
          ? `ruleOrder:${command.order}`
          : command.kind
    assert.equal(actual, expected, `${trace.name}: ${event.kind}`)
  }
  assert.deepEqual(projectCanonical(current), before, `${trace.name}: rule facts are not retained`)
  assert.deepEqual(current, initialCanonical(fixture.limits), `${trace.name}: canonical state is unchanged`)
}
console.log(
  `checked ${fixture.traces.length + permitFixture.traces.length + reviewFixture.traces.length + dispatchFixture.traces.length + stopFixture.traces.length + collectionFixture.traces.length + deliveryFixture.traces.length + submissionFixture.traces.length + revisionFixture.traces.length + authorityFixture.traces.length + reuseFixture.traces.length + noticeFixture.traces.length + retentionFixture.traces.length + configurationFixture.traces.length + ruleFixture.traces.length} independent source-free canonical traces`
)

console.log(
  `checked round uniqueness after ${uniquenessCheckedTransitions} transitions across ${uniquenessCheckedKinds.size} event kinds`
)
