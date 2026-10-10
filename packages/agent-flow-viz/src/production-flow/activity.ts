import type { CapacityMetadata } from "@hapsland/monkey-business"
import type { CanonicalOutput, CanonicalProjection } from "@hapsland/canonical-policy/canonical/adapter"
import type { ReplayStep } from "../canonical-replay"
import { findingLineage, projectFlowStep, recordLabel, type RecordNumbers } from "@hapsland/agent-flow-projection"
import { CONNECTIONS, PLACE_ORDER, SQUARES } from "@hapsland/agent-flow-projection/production-flow-presentation"
import { type Route, arrowKind } from "./route-style"

export const flowPresentation = (
  projection: CanonicalProjection,
  last: ReplayStep | undefined,
  numbers?: RecordNumbers,
  resident: CanonicalProjection = projection,
  metadata?: CapacityMetadata,
  selected?: { readonly group?: number; readonly round?: number },
  activitySteps?: readonly ReplayStep[]
) => {
  if (
    selected?.group !== undefined &&
    ![
      ...resident.delivery.slots.map((s) => s.group),
      ...resident.delivery.counters.map((c) => c.group),
      ...resident.collection.claims.map((c) => c.group),
      ...(metadata?.deliveryGroups ?? []).map((binding) => binding.group)
    ].includes(selected.group)
  )
    selected = { ...selected, group: undefined }
  const outputs = last?.rejection === undefined ? (last?.outputs ?? []) : []
  const event = last?.rejection === undefined ? last?.event.kind : undefined
  const consumed = outputs.find((command) => command.kind === "permitConsumed")
  const editAccepted =
    event === "consumePermit" && last?.event.kind === "consumePermit" && consumed?.kind === "permitConsumed"
      ? { tool: last.event.tool, token: last.event.token, round: consumed.round }
      : undefined
  const issuedPermit = outputs.find((command) => command.kind === "permitIssued")
  const startedRound = outputs.find((command) => command.kind === "roundStarted")
  const admittedSource = outputs.find((command) => command.kind === "observationAdmitted")
  const stopEvent = event === "stopPolled" || event === "stopGroupPolled"
  const requests = projection.dispatch.requests
  const flow = projectFlowStep(
    last && last.event.kind !== "preparationGraph" ? { ...last, event: last.event } : undefined,
    numbers
  )
  const sourceCompletion = flow.sourceCompletion
  const sourceLabel =
    sourceCompletion === undefined
      ? undefined
      : recordLabel("source", sourceCompletion.observation, numbers).split("/")[0]
  const linkedReviewStatus =
    sourceCompletion?.linkedReviews.map(
      (work) =>
        `${recordLabel("review", work.operation, numbers).split("/")[0]} ${work.kind === "reviewing" ? "continues" : work.kind === "atJev" ? "awaits Jev" : "has a retained finding"}`
    ) ?? []
  const completionContext =
    sourceCompletion === undefined
      ? undefined
      : [
          linkedReviewStatus.length > 0 ? linkedReviewStatus.join(", ") : "no linked review work remains",
          sourceCompletion.jobRunning
            ? "source preparation job still marked running"
            : "source preparation job already settled"
        ].join("; ")
  const storedResultConversion = flow.storedResultConversions[0]
  const storedResultTransition =
    storedResultConversion === undefined
      ? undefined
      : `${recordLabel("charge:reviewUnit", storedResultConversion.charge, numbers).split("/")[0]} → stored`
  const clearedReviewLabel =
    flow.clearedReview === undefined ? undefined : recordLabel("review", flow.clearedReview, numbers).split("/")[0]
  const retainedOperation =
    (last?.event.kind === "jevRequestSettled" ||
      last?.event.kind === "reviewCompleted" ||
      last?.event.kind === "reviewObserved") &&
    outputs.some((command) => command.kind === "findingRetained")
      ? last.event.operation
      : undefined
  const retainedFindingLabel =
    retainedOperation === undefined ? undefined : recordLabel("review", retainedOperation, numbers).split("/")[0]
  const retainedFinding =
    retainedOperation === undefined
      ? undefined
      : findingLineage(projection).find((item) => item.operation === retainedOperation)
  const waitingReview =
    retainedFinding?.unfinished.length === 1 &&
    (retainedFinding.unfinished[0].kind === "reviewing" || retainedFinding.unfinished[0].kind === "atJev")
      ? recordLabel("review", retainedFinding.unfinished[0].operation, numbers).split("/")[0]
      : undefined
  const retainMarker =
    retainedFindingLabel === undefined
      ? undefined
      : waitingReview === undefined
        ? `CMD · retain finding for ${retainedFindingLabel}`
        : `CMD · retain ${retainedFindingLabel.replace("Review item", "Review")}; waits for ${waitingReview.replace("Review item ", "")}`
  const markedReady =
    last?.event.kind === "collectionReady" &&
    !last.before.collection.ready.includes(last.event.advice) &&
    projection.collection.ready.includes(last.event.advice)
      ? recordLabel("advice", last.event.advice, numbers).split("/")[0] +
        " ← " +
        recordLabel("review", last.event.advice, numbers).split("/")[0]
      : undefined
  const stepCaption =
    last?.rejection !== undefined
      ? undefined
      : (() => {
          const newLeases = projection.collection.leases.length - (last?.before.collection.leases.length ?? 0)
          if (last?.event.kind === "collectionReserveLease" && newLeases > 1)
            return `${newLeases} advice groups leased for one Stop output; no output slot is reserved yet.`
          const newRecords =
            projection.delivery.submissions.batches.length - (last?.before.delivery.submissions.batches.length ?? 0)
          if (last?.event.kind === "submissionBegin" && newRecords > 1)
            return `${newRecords} advice records staged for one Stop output; no host write is established.`
          const newlyInPhase = (phase: string) =>
            projection.delivery.submissions.batches.filter(
              (batch) =>
                batch.phase === phase &&
                last?.before.delivery.submissions.batches.some(
                  (prior) => prior.advice === batch.advice && prior.token === batch.token && prior.phase !== phase
                )
            ).length
          if (last?.event.kind === "finishAuthorize" && newlyInPhase("authorized") > 1)
            return `${newlyInPhase("authorized")} advice records and their Stop output authorized together; no host write is established.`
          if (last?.event.kind === "finishTerminal" && newlyInPhase("submitted") > 1)
            return `${newlyInPhase("submitted")} advice submissions and one Stop result recorded together as acknowledged; agent use of advice is not observed.`
          if (last?.event.kind === "stopPolled" && has(outputs, "finishReady"))
            return "Stop decision ready; this step does not reserve or send output."
          if (last?.event.kind === "collectionReserveLease" && has(outputs, "collectionLeaseReserved"))
            return `${recordLabel("advice", last.event.advice, numbers).split("/")[0]} leased for collection${projection.collection.ready.includes(last.event.advice) ? "; still ready" : ""}.`
          if (last?.event.kind === "finishReserve" && has(outputs, "finishReserved"))
            return `Stop output slot reserved for ${last.event.selected.length} selected advice groups; output is not yet authorized.`
          if (last?.event.kind === "submissionBegin" && has(outputs, "submissionBegun")) {
            const { advice, token, surface } = last.event
            const phase = projection.delivery.submissions.batches.find(
              (batch) => batch.advice === advice && batch.token === token
            )?.phase
            return `${recordLabel("advice", advice, numbers).split("/")[0]} submission ${phase ?? "begun"} for ${surface === "stop" ? "Stop" : surface} output; no host write is established.`
          }
          if (last?.event.kind === "finishAuthorize" && has(outputs, "finishAuthorized"))
            return "Stop output authorized; no host write is established."
          if (last?.event.kind === "submissionAuthorize" && has(outputs, "submissionAuthorized"))
            return `${recordLabel("advice", last.event.advice, numbers).split("/")[0]} submission authorized; acknowledgment remains to be checked.`
          if (last?.event.kind === "deliveryAcknowledgeCheck" && has(outputs, "deliveryAckReady"))
            return `Acknowledgment gate passed for ${last.event.items} items; no host write is observed by this step.`
          if (last?.event.kind === "submissionTerminal" && has(outputs, "submissionRecorded"))
            return `${recordLabel("advice", last.event.advice, numbers).split("/")[0]} submission recorded as ${last.event.certain ? "certain" : "uncertain"}.`
          if (last?.event.kind === "finishTerminal" && outputs.some((command) => command.kind === "finishRecorded"))
            return `Stop result recorded as ${last.event.outcome}; agent use of advice is not observed.`
          return undefined
        })()
  // A playback batch can contain transient records absent from its endpoint.
  const activity = activitySteps
    ? activitySteps.map((step) => ({
        step,
        flow: projectFlowStep(
          step.event.kind !== "preparationGraph" ? { ...step, event: step.event } : undefined,
          numbers
        )
      }))
    : last
      ? [{ step: last, flow }]
      : []
  const changedStages = activity.flatMap(({ step, flow }) =>
    step.preparation ? ["preparation" as const, ...flow.changedStages] : flow.changedStages
  )
  const activityEvidence = activity.flatMap(({ flow }) => flow.evidence)
  const declaredRoutes = new Set(CONNECTIONS.map(({ from, to }) => `${from}:${to}`))
  if (declaredRoutes.size !== CONNECTIONS.length) throw new Error("duplicate dashboard arrow route")
  const unmapped = flow.evidence.filter((item) => !declaredRoutes.has(`${item.from}:${item.to}`))
  const nodes = PLACE_ORDER.map((id) => ({
    id,
    ...SQUARES[id],
    detail: SQUARES[id].detail(projection, numbers),
    facets: SQUARES[id].facets(projection, numbers)
  }))
  const routes: readonly Route[] = CONNECTIONS.map((connection): Route => {
    const evidence = activityEvidence.filter((item) => item.from === connection.from && item.to === connection.to)
    return {
      ...connection,
      active: evidence.length > 0,
      kind: arrowKind(evidence),
      linked: "relation" in connection && connection.relation === "linked record",
      evidence: evidence.map((item) => `${item.relation ?? item.source}: ${item.description}`).join("; ")
    }
  })
  const routeMultiplicity = new Map<string, number>()
  const routeOffsets = routes.map((route) => {
    const key = `${route.from}:${route.to}`
    const index = routeMultiplicity.get(key) ?? 0
    routeMultiplicity.set(key, index + 1)
    return index
  })
  const finishBranches = [
    { label: "Wait for work", active: has(outputs, "waitForWork", "collectionWaiting") },
    { label: "Decision ready", active: has(outputs, "finishReady", "reofferAtStop") },
    { label: "Advice output authorized", active: has(outputs, "finishAuthorized") },
    { label: "Continuation consumed", active: has(outputs, "continuationConsumed") },
    {
      label: "Allow finish",
      active: has(outputs, "finishAllowedNoAdvice", "finishAllowedDeadline", "finishAllowedUnavailable")
    },
    {
      label: "Cancel unfinished work",
      active: stopEvent && has(outputs, "cancelWork", "discardAllUnfinished", "discardNamedOnly")
    }
  ]
  return {
    outputs,
    event,
    consumed,
    editAccepted,
    issuedPermit,
    startedRound,
    admittedSource,
    stopEvent,
    requests,
    flow,
    sourceCompletion,
    sourceLabel,
    linkedReviewStatus,
    completionContext,
    storedResultConversion,
    storedResultTransition,
    clearedReviewLabel,
    retainedOperation,
    retainedFindingLabel,
    retainedFinding,
    waitingReview,
    retainMarker,
    markedReady,
    stepCaption,
    activity,
    changedStages,
    activityEvidence,
    declaredRoutes,
    unmapped,
    nodes,
    routes,
    routeMultiplicity,
    routeOffsets,
    finishBranches,
    selected
  }
}
const has = (outputs: readonly CanonicalOutput[], ...kinds: CanonicalOutput["kind"][]) =>
  outputs.some((command) => kinds.includes(command.kind))
