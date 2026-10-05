// Read-only trace projection shared by generic and optional game conformance.
// Codes are wire-independent test labels, not product decisions.
const events = Object.fromEntries(
  [
    "openRound",
    "admitObservation",
    "queueDispatch",
    "startObservation",
    "beginObservedPreparation",
    "preparationCompleted",
    "completeObservation",
    "dispatchSettled",
    "startReview",
    "jevRequestReady",
    "jevRequestStarted",
    "jevRequestSettled",
    "collectionReady",
    "finalCandidateCheck",
    "submissionSuppressCheck",
    "collectionReserveLease",
    "submissionBegin",
    "submissionTerminal",
    "collectionLeaseCheck",
    "collectionReleaseLease"
  ].map((kind, index) => [kind, index + 1])
)
Object.assign(events, {
  collectionRetireAdvice: 22,
  submissionForget: 23,
  retireReview: 24,
  jevRequestInterrupted: 25,
  stopPolled: 40,
  roundContinuationBudgetCheck: 41,
  finishReserve: 42,
  finishAuthorize: 43,
  finishTerminal: 44,
  continuationConsume: 45,
  finishEnd: 46,
  stopGroupEnded: 47,
  retirePartition: 48
})
const commands = Object.fromEntries(
  [
    "roundStarted",
    "observationAdmitted",
    "dispatchStarted",
    "prepare",
    "unitAdmitted",
    "jevRequestIssued",
    "retainFinding",
    "collectionEligible",
    "retainCandidate",
    "submissionUnsuppressed",
    "collectionLeaseReserved",
    "submissionBegun",
    "submissionRecorded",
    "observationStarted",
    "preparationReleased",
    "observationCompleted",
    "reviewStarted",
    "jevRequestStartRecorded",
    "jevRequestOutcomeRecorded",
    "reservationReleased",
    "collectionLeaseKept",
    "collectionLeaseReleased",
    "settleClear",
    "reviewRecorded",
    "retireCandidate",
    "releaseCandidate",
    "collectionAdviceRetired",
    "submissionForgotten"
  ].map((kind, index) => [kind, index + 1])
)
Object.assign(commands, {
  jevInterruptionRecorded: 29,
  jevRequestUnavailable: 30,
  waitForWork: 40,
  waitForOutput: 41,
  finishReady: 42,
  finishLimit: 43,
  roundContinuationAvailable: 44,
  roundContinuationExhausted: 45,
  finishAllowedNoAdvice: 46,
  finishAllowedDeadline: 47,
  finishAllowedUnavailable: 48,
  finishReserved: 49,
  finishAuthorized: 50,
  finishRecorded: 51,
  finishEnded: 52,
  finishReleased: 53,
  continuationConsumed: 54,
  stopEnded: 55,
  partitionRetired: 56
})
const graphCommands = { none: 0, resolveEdge: 1, checkPath: 2, readSource: 3, unitComplete: 4 }
const identityOperations = new Set([
  "queueDispatch",
  "preparationCompleted",
  "dispatchSettled",
  "startReview",
  "jevRequestReady",
  "retireReview"
])
function identity(event) {
  const p = event.partition ?? 0,
    l = event.lifetime ?? 0,
    r = event.round ?? 0
  if (event.kind === "openRound") return [p, l, 0, 0, 0, 0, 0]
  if (["admitObservation", "stopPolled", "retirePartition"].includes(event.kind)) return [p, l, r, 0, 0, 0, 0]
  if (["startObservation", "beginObservedPreparation", "completeObservation"].includes(event.kind))
    return [p, l, r, event.observation, 0, 0, 0]
  if (identityOperations.has(event.kind)) return [p, l, r, event.operation, 0, 0, 0]
  if (["jevRequestStarted", "jevRequestSettled", "jevRequestInterrupted"].includes(event.kind))
    return [p, l, r, event.operation, event.request, 0, 0]
  switch (event.kind) {
    case "collectionReady":
      return [p, l, r, event.observation, 0, event.advice, 0]
    case "submissionSuppressCheck":
      return [0, 0, r, 0, 0, event.advice, event.fingerprint]
    case "submissionBegin":
      return [event.group, 0, r, 0, 0, event.advice, event.token]
    case "collectionReserveLease":
    case "submissionTerminal":
    case "collectionLeaseCheck":
    case "collectionReleaseLease":
      return [0, 0, 0, 0, 0, event.advice, event.token]
    case "collectionRetireAdvice":
    case "submissionForget":
      return [0, 0, 0, 0, 0, event.advice, 0]
    case "finishReserve":
      return [event.group, l, r, event.attempt, 0, 0, event.token]
    case "finishAuthorize":
    case "finishTerminal":
    case "finishEnd":
      return [event.group, 1, r, event.attempt, 0, 0, event.token]
    case "continuationConsume":
      return [event.group, 1, r, 0, 0, 0, 0]
    case "stopGroupEnded":
      return [event.group, l, r, 0, 0, 0, 0]
    default:
      return [0, 0, 0, 0, 0, 0, 0]
  }
}
function facts(event) {
  switch (event.kind) {
    case "finalCandidateCheck":
      return [
        event.ownerCurrent,
        event.credentialGeneration,
        event.credentialAuthorized,
        event.expired,
        event.workCurrent,
        event.hasFindings
      ].map(Number)
    case "jevRequestReady":
      return [
        event.rootValid,
        event.configurationValid,
        event.credentialReady,
        event.selected,
        event.currentWork,
        event.physicalAvailable
      ].map(Number)
    case "jevRequestSettled":
      return [
        Number(event.currentWork),
        { neverSent: 1, finding: 2, clear: 3, backendFailure: 4, timeout: 5, interrupted: 6 }[event.outcome],
        0,
        0,
        0,
        0
      ]
    case "submissionTerminal":
      return [Number(event.certain), 0, 0, 0, 0, 0]
    case "beginObservedPreparation":
      return [event.bytes, 0, 0, 0, 0, 0]
    case "preparationCompleted":
      return [event.unitBytes.length, event.unitBytes[0] ?? 0, 0, 0, 0, 0]
    case "submissionBegin":
      return [
        Number(event.authorizeNow),
        event.fingerprints.length,
        event.fingerprints[0] ?? 0,
        event.units.length,
        event.units[0] ?? 0,
        0
      ]
    case "collectionLeaseCheck":
      return [
        Number(event.expired),
        Number(event.stopCollector),
        Number(event.sameGroup),
        Number(event.reofferable),
        0,
        0
      ]
    case "stopPolled":
      return [Number(event.deadline), 0, 0, 0, 0, 0]
    case "finishReserve":
      return [
        event.selected.length,
        event.selected[0] ?? 0,
        Number(event.hasNotice),
        Number(event.passNotices),
        Number(event.canWrite),
        Number(event.deadlineReached)
      ]
    case "finishAuthorize":
      return [event.selected.length, event.selected[0] ?? 0, 0, 0, 0, 0]
    case "finishTerminal":
      return [
        event.selected.length,
        event.selected[0] ?? 0,
        { acknowledged: 1, failed: 2, unknown: 3 }[event.outcome],
        0,
        0,
        0
      ]
    default:
      return [0, 0, 0, 0, 0, 0]
  }
}

export function publicRows(observations) {
  return observations.map((frame) => {
    const after = frame.after
    const counts = [
      after.global.items,
      after.global.bytes,
      after.dispatch.running.length,
      after.dispatch.requests.length,
      after.collection.leases.length
    ]
    if (frame.preparation) {
      const graph = frame.preparation
      return [
        21,
        frame.time,
        graphCommands[graph.command.kind],
        graph.after.files,
        graph.after.readBytes,
        graph.after.treeBytes,
        ...counts,
        100,
        graph.before.files,
        graph.before.readBytes,
        graph.before.treeBytes
      ]
    }
    return [
      events[frame.event.kind] ?? 99,
      frame.time,
      ...identity(frame.event),
      ...facts(frame.event),
      ...counts,
      frame.rejection ? 1 : 0,
      ...frame.commands.map((command) => commands[command.kind] ?? 99),
      100,
      frame.before.global.items,
      frame.before.global.bytes,
      frame.before.dispatch.running.length,
      frame.before.dispatch.requests.length,
      frame.before.collection.leases.length
    ]
  })
}

export function nativeRows(rows) {
  return rows.map((row) => [...row])
}
