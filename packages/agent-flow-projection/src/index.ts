import type { CanonicalCommand, CanonicalEvent, CanonicalProjection } from "../../../src/canonical/adapter";

/** Stable conceptual stages of the observed review process, independent of a drawing. */
export const FLOW_STAGES = ["observation", "admission", "sourcePending", "scheduling", "preparation", "units", "authorization", "effect", "jev", "outcomes", "advice", "collection", "delivery", "round"] as const;
export type FlowStage = typeof FLOW_STAGES[number];
export type EvidenceSource = "state" | "command" | "native fact" | "external fact";
/** A semantic transition or decision, with its evidence boundary and a readable account. */
export type FlowEvidence = Readonly<{ from: FlowStage; to: FlowStage; source: EvidenceSource; description: string; identity?: string; relation?: "linked record" }>;
export type FlowStepInput = Readonly<{
  event: CanonicalEvent;
  commands: readonly CanonicalCommand[];
  before: CanonicalProjection;
  after: CanonicalProjection;
  rejection?: string;
}>;
/** Human-facing sequence numbers derived from accepted reducer transitions. Keys remain canonical IDs. */
export type ChargeKind = `charge:${CanonicalProjection["charges"][number]["purpose"]}`;
export type RecordKind = "source" | "preparation" | "review" | "request" | "advice" | ChargeKind;
export type RecordNumbers = Readonly<Record<RecordKind, ReadonlyMap<number, number>>>;
type NumberingStep = Pick<FlowStepInput, "before" | "after" | "rejection">;
const createdWorkKind = (kind: CanonicalProjection["work"][number]["kind"]): RecordKind | undefined =>
  kind === "awaitingSourceRead" ? "source" : kind === "preparing" ? "preparation" : kind === "reviewing" ? "review" : undefined;
export const numberRecords = (steps: readonly NumberingStep[]): RecordNumbers => {
  const numbers: Record<RecordKind, Map<number, number>> = {
    source: new Map(), preparation: new Map(), review: new Map(), request: new Map(), advice: new Map(),
    "charge:observationDispatch": new Map(), "charge:preparation": new Map(),
    "charge:reviewUnit": new Map(), "charge:storedResult": new Map(),
    "charge:operationalNotice": new Map(), "charge:adviceRecheck": new Map(),
  };
  const assign = (kind: RecordKind, id: number) => {
    if (!numbers[kind].has(id)) numbers[kind].set(id, numbers[kind].size + 1);
  };
  for (const step of steps) {
    if (step.rejection !== undefined) continue;
    for (const item of [...step.after.work].sort((a, b) => a.operation - b.operation)) {
      if (step.before.work.some((prior) => prior.operation === item.operation)) continue;
      const kind = createdWorkKind(item.kind);
      if (kind !== undefined) assign(kind, item.operation);
    }
    for (const item of step.after.dispatch.requests)
      if (!step.before.dispatch.requests.some((prior) => prior.request === item.request)) assign("request", item.request);
    for (const item of step.after.pendingFindings)
      if (!step.before.pendingFindings.some((prior) => prior.operation === item.operation)) assign("advice", item.operation);
    for (const item of step.after.charges)
      if (!step.before.charges.some((prior) => prior.id === item.id && prior.purpose === item.purpose))
        assign(`charge:${item.purpose}`, item.id);
  }
  return numbers;
};
const recordNames: Record<RecordKind, string> = {
  source: "Source read", preparation: "Preparation", review: "Review item", request: "Jev request", advice: "Advice",
  "charge:observationDispatch": "Observation charge", "charge:preparation": "Preparation charge",
  "charge:reviewUnit": "Unit charge", "charge:storedResult": "Stored result charge",
  "charge:operationalNotice": "Notice charge", "charge:adviceRecheck": "Advice recheck charge",
};
export const recordLabel = (kind: RecordKind, id: number, numbers?: RecordNumbers): string => {
  const ordinal = numbers?.[kind].get(id);
  const internalKind = kind === "request" ? "request" : kind.startsWith("charge:") ? "charge" : "operation";
  return ordinal === undefined ? `${recordNames[kind]}/${internalKind} ${id}`
    : `${recordNames[kind]} #${ordinal}/${internalKind} ${id}`;
};
/** Identified checked record assigned to a conceptual stage. */
export type Located = Readonly<{ key: string; stage: FlowStage; description: string }>;
const workKind = (kind: CanonicalProjection["work"][number]["kind"]): RecordKind =>
  kind === "awaitingSourceRead" || kind === "sourceReading" ? "source" : kind === "preparing" ? "preparation" : "review";
const locatedWork = (state: CanonicalProjection, kinds: readonly CanonicalProjection["work"][number]["kind"][], stage: FlowStage, numbers?: RecordNumbers) =>
  state.work.filter((item) => kinds.includes(item.kind)).map((item) => ({ key: `work:${item.operation}`, stage, description: `${recordLabel(workKind(item.kind), item.operation, numbers)} (${item.kind})` }));
const locatedDispatch = (state: CanonicalProjection, fields: readonly ("queued" | "running")[], stage: FlowStage, numbers?: RecordNumbers) =>
  fields.flatMap((field) => state.dispatch[field].map((item) => ({ key: `dispatch:${item.operation}`, stage,
    description: `${recordLabel(item.preparation ? "source" : "review", item.operation, numbers)} job (${field})` })));

/** Only checked fields that this flow assigns to a conceptual stage. */
const stageSignature = (state: CanonicalProjection, stage: FlowStage): unknown => {
  switch (stage) {
    case "observation": return [];
    case "admission": return [state.charges, state.global, state.partitions, state.admissions];
    case "sourcePending": return state.work.filter((item) => item.kind === "awaitingSourceRead").map((item) => item.operation);
    case "scheduling": return [state.dispatch.queued, state.dispatch.running];
    case "preparation": return state.work.filter((item) => item.kind === "sourceReading" || item.kind === "preparing").map((item) => [item.operation, item.kind]);
    case "units": return [state.work.filter((item) => item.kind === "reviewing").map((item) => item.operation), state.charges.filter((item) => item.purpose === "reviewUnit").length];
    case "authorization": return state.dispatch.requests.filter((item) => !item.started).map((item) => item.request);
    case "effect": return state.dispatch.requests.filter((item) => item.started).map((item) => [item.request, item.interrupted]);
    case "jev": return [state.work.filter((item) => item.kind === "atJev").map((item) => item.operation), state.dispatch.requests.map((item) => item.request)];
    case "outcomes": return [state.work.filter((item) => item.kind === "pendingFinding"), state.pendingFindings, state.tickets];
    case "advice": return [state.collection.ready, state.collection.leases.map((item) => item.advice)];
    case "collection": return [state.collection.leases, state.collection.claims, state.rounds.filter((item) => item.waiting)];
    case "delivery": return state.delivery;
    case "round": return state.rounds;
  }
};
/** Locate identified work and records in the conceptual flow. */
export const locateFlow = (state: CanonicalProjection, numbers?: RecordNumbers): readonly Located[] => [
  ...locatedWork(state, ["awaitingSourceRead"], "sourcePending", numbers),
  ...locatedDispatch(state, ["queued", "running"], "scheduling", numbers),
  ...locatedWork(state, ["sourceReading", "preparing"], "preparation", numbers),
  ...locatedWork(state, ["reviewing"], "units", numbers),
  ...state.dispatch.requests.filter((item) => !item.started).map((item) => ({ key: `request:${item.request}`, stage: "authorization" as const, description: `${recordLabel("request", item.request, numbers)} (issued)` })),
  ...state.dispatch.requests.filter((item) => item.started).map((item) => ({ key: `request:${item.request}`, stage: "effect" as const, description: `${recordLabel("request", item.request, numbers)} (${item.interrupted ? "interrupted" : "started"})` })),
  ...locatedWork(state, ["atJev"], "jev", numbers),
  ...locatedWork(state, ["pendingFinding"], "outcomes", numbers),
  ...state.collection.ready.map((id) => ({ key: `ready-advice:${id}`, stage: "advice" as const, description: `${recordLabel("advice", id, numbers)} (ready)` })),
  ...state.collection.leases.map((item) => ({ key: `lease-advice:${item.advice}`, stage: "collection" as const, description: `${recordLabel("advice", item.advice, numbers)} (leased)` })),
  ...state.delivery.slots.map((item) => ({ key: `slot:${item.group}`, stage: "delivery" as const, description: `finish #${item.group} (${item.phase})` })),
  ...state.delivery.submissions.batches.map((item) => ({ key: `batch:${item.advice}:${item.token}`, stage: "delivery" as const, description: `${recordLabel("advice", item.advice, numbers)} (${item.phase})` })),
  ...state.rounds.map((item) => ({ key: `round:${item.id}`, stage: "round" as const, description: `round #${item.id}` })),
];
const placements = (state: CanonicalProjection, numbers?: RecordNumbers) => new Map(locateFlow(state, numbers).map((item) => [item.key, item] as const));
const commandKinds = (commands: readonly CanonicalCommand[]) => new Set(commands.map((command) => command.kind));

type Rule = Readonly<{ from: FlowStage; to: FlowStage; source: EvidenceSource; description: string; commands?: readonly CanonicalCommand["kind"][]; events?: readonly CanonicalEvent["kind"][] }>;
/** Links without a shared checked identity require explicit event or command evidence. */
const FACT_RULES: readonly Rule[] = [
  { from: "observation", to: "admission", source: "native fact", description: "pre-edit permit requested; no edit admitted yet", events: ["issuePermit"] },
  { from: "observation", to: "admission", source: "native fact", description: "attributed edit consumed its permit", events: ["consumePermit"] },
  { from: "observation", to: "admission", source: "native fact", description: "observation supplied for admission", events: ["admitObservation", "beginObservedPreparation", "beginPreparation"] },
  { from: "admission", to: "preparation", source: "command", description: "prepare command emitted", commands: ["prepare"] },
  { from: "units", to: "authorization", source: "native fact", description: "Jev readiness facts supplied", events: ["jevRequestReady"] },
  { from: "authorization", to: "effect", source: "command", description: "request permitted; native attempt not yet observed", commands: ["jevRequestIssued"] },
  { from: "authorization", to: "outcomes", source: "command", description: "request unavailable or refused", commands: ["jevRequestUnavailable"] },
  { from: "effect", to: "jev", source: "native fact", description: "request start observed", commands: ["jevRequestStartRecorded"] },
  { from: "effect", to: "outcomes", source: "native fact", description: "request interruption recorded", commands: ["jevInterruptionRecorded"] },
  { from: "outcomes", to: "advice", source: "command", description: "retain finding command; storage not observed", commands: ["retainFinding"] },
  { from: "outcomes", to: "outcomes", source: "command", description: "clear, stale, or backend outcome recorded", commands: ["settleClear", "settleStaleClear", "retireStaleFinding", "failureBackend"] },
  { from: "advice", to: "collection", source: "command", description: "advice eligible or selected", commands: ["collectionEligible", "collectionBackgroundClaimed", "collectionFindingSelected"] },
  { from: "collection", to: "collection", source: "command", description: "collection waits or retains advice", commands: ["collectionFindingRetained", "waitForWork", "waitForOutput", "finishAllowedNoAdvice", "finishAllowedDeadline", "finishAllowedUnavailable"] },
  { from: "collection", to: "preparation", source: "command", description: "cancel unfinished work requested", commands: ["cancelWork", "discardAllUnfinished", "discardNamedOnly"] },
  { from: "collection", to: "round", source: "command", description: "Stop decision ready or advice reoffered", commands: ["finishReady", "reofferAtStop"] },
  { from: "collection", to: "delivery", source: "command", description: "output authorized; host write not established", commands: ["finishAuthorized", "submissionAuthorized", "writeAuthorized"] },
];

export type SourceCompletion = Readonly<{
  observation: number;
  linkedReviews: readonly Readonly<{ operation: number; kind: CanonicalProjection["work"][number]["kind"] }>[];
  jobRunning: boolean;
}>;
export type StoredResultConversion = Readonly<{ charge: number }>;
export type FlowProjection = Readonly<{ evidence: readonly FlowEvidence[]; changedStages: readonly FlowStage[]; projectionChanged: boolean; sourceCompletion?: SourceCompletion; storedResultConversions: readonly StoredResultConversion[]; clearedReview?: number; rejection?: string }>;
export const projectFlowStep = (step: FlowStepInput | undefined, numbers?: RecordNumbers): FlowProjection => {
  if (step === undefined) return { evidence: [], changedStages: [], projectionChanged: false, storedResultConversions: [], rejection: undefined };
  if (step.rejection !== undefined) return { evidence: [], changedStages: [], projectionChanged: false, storedResultConversions: [], rejection: step.rejection };
  const before = placements(step.before, numbers);
  const after = placements(step.after, numbers);
  const evidence: FlowEvidence[] = [];
  const changedStages = new Set<FlowStage>();
  for (const stage of FLOW_STAGES) if (JSON.stringify(stageSignature(step.before, stage)) !== JSON.stringify(stageSignature(step.after, stage))) changedStages.add(stage);
  for (const [key, prior] of before) {
    const next = after.get(key);
    if (next === undefined) { changedStages.add(prior.stage); continue; }
    if (next.stage !== prior.stage) {
      evidence.push({ from: prior.stage, to: next.stage, source: "state", description: `${prior.description} → ${next.description}`, identity: key });
      changedStages.add(prior.stage); changedStages.add(next.stage);
    } else if (next.description !== prior.description) {
      changedStages.add(next.stage);
      if (next.stage === "scheduling") evidence.push({ from: "scheduling", to: "scheduling", source: "state",
        description: `${prior.description} → ${next.description}`, identity: key });
    }
  }
  for (const [key, next] of after) if (!before.has(key)) changedStages.add(next.stage);
  const admitted = step.commands.find((command) => command.kind === "observationAdmitted");
  if (admitted?.kind === "observationAdmitted") for (const next of step.after.work) if (
    next.operation === admitted.id && next.kind === "awaitingSourceRead" &&
    !step.before.work.some((prior) => prior.operation === next.operation)) {
    evidence.push({ from: "admission", to: "sourcePending", source: "state",
      description: `${recordLabel("source", next.operation, numbers)} admitted; source read not started`,
      identity: `work:${next.operation}` });
    changedStages.add("admission"); changedStages.add("sourcePending");
  }
  // QueueDispatch creates a dispatch record for existing work. The work stays
  // at its stage; the scheduling link denotes shared identity, not movement.
  for (const field of ["queued", "running"] as const) for (const next of step.after.dispatch[field]) if (
    !step.before.dispatch.queued.some((prior) => prior.operation === next.operation) &&
    !step.before.dispatch.running.some((prior) => prior.operation === next.operation)) {
    if (step.event.kind !== "queueDispatch" || step.event.operation !== next.operation) continue;
    const source = before.get(`work:${next.operation}`);
    if (source?.stage === "sourcePending" || source?.stage === "units") {
      evidence.push({ from: source.stage, to: "scheduling", source: "state", relation: "linked record",
        description: `${recordLabel(next.preparation ? "source" : "review", next.operation, numbers)} scheduled; dispatch entered ${field}; work state unchanged`, identity: `work:${next.operation}` });
      changedStages.add(source.stage);
    }
    changedStages.add("scheduling");
  }
  for (const next of step.after.work) if (next.kind === "reviewing" && !step.before.work.some((prior) => prior.operation === next.operation)) {
    const parent = step.before.work.find((prior) => prior.operation === next.parent);
    if (parent !== undefined && (parent.kind === "preparing" || parent.kind === "sourceReading")) {
      evidence.push({ from: "preparation", to: "units", source: "state", description: `${recordLabel("preparation", parent.operation, numbers)} produced ${recordLabel("review", next.operation, numbers)}`, identity: `work:${next.operation}` });
      changedStages.add("preparation"); changedStages.add("units");
    }
  }
  // Ready and leased advice may coexist. A newly checked lease for a ready
  // advice ID establishes the collection link without claiming ready storage moved.
  for (const lease of step.after.collection.leases) if (!step.before.collection.leases.some((prior) => prior.advice === lease.advice) &&
    step.before.collection.ready.includes(lease.advice)) {
    evidence.push({ from: "advice", to: "collection", source: "state",
      description: `${recordLabel("advice", lease.advice, numbers)} leased${step.after.collection.ready.includes(lease.advice) ? "; still ready" : ""}`,
      identity: `advice:${lease.advice}` });
    changedStages.add("advice"); changedStages.add("collection");
  }
  if (step.event.kind === "collectionReady") for (const id of step.after.collection.ready) if (!step.before.collection.ready.includes(id)) {
    evidence.push({ from: "outcomes", to: "advice", source: "native fact",
      description: `${recordLabel("advice", id, numbers)} supplied ready by native storage; producing work ID is not projected`, identity: `ready-advice:${id}` });
    changedStages.add("outcomes"); changedStages.add("advice");
  }
  const kinds = commandKinds(step.commands);
  const event = step.event;
  const clearedReview = event.kind === "jevRequestSettled" && event.outcome === "clear" &&
    step.commands.some((command) => command.kind === "reviewRecorded" && command.outcome === "clear") &&
    step.before.work.some((work) => work.operation === event.operation && work.kind === "atJev" &&
      work.partition === event.partition && work.lifetime === event.lifetime && work.round === event.round) &&
    !step.after.work.some((work) => work.operation === event.operation)
    ? event.operation : undefined;
  const storedResultConversions = step.before.charges.filter((before) => before.purpose === "reviewUnit" &&
    step.after.charges.some((after) => after.id === before.id && after.partition === before.partition &&
      after.purpose === "storedResult" && after.bytes === before.bytes))
    .map((charge) => ({ charge: charge.id }));
  const sourceCompletion = event.kind === "completeObservation" && kinds.has("observationCompleted") &&
    step.before.work.some((work) => work.operation === event.observation && work.kind === "sourceReading" &&
      work.partition === event.partition && work.lifetime === event.lifetime && work.round === event.round) &&
    !step.after.work.some((work) => work.operation === event.observation)
    ? {
        observation: event.observation,
        linkedReviews: step.after.work.filter((work) => work.parent === event.observation &&
          work.partition === event.partition && work.lifetime === event.lifetime && work.round === event.round &&
          (work.kind === "reviewing" || work.kind === "atJev" || work.kind === "pendingFinding"))
          .map((work) => ({ operation: work.operation, kind: work.kind })),
        jobRunning: step.after.dispatch.running.some((job) => job.operation === event.observation &&
          job.partition === event.partition && job.lifetime === event.lifetime && job.round === event.round && job.preparation),
      }
    : undefined;
  for (const rule of FACT_RULES) {
    const matchedCommands = rule.commands?.filter((kind) => kinds.has(kind)) ?? [];
    if (!(rule.events?.includes(step.event.kind) ?? false) && matchedCommands.length === 0) continue;
    evidence.push({ from: rule.from, to: rule.to, source: rule.source,
      description: matchedCommands.length ? `${rule.description} (${matchedCommands.join(", ")})` : rule.description });
    changedStages.add(rule.from);
    // A command describes an authorized path; the destination is occupied
    // only when checked state or a later supplied fact places something there.
    if (rule.source !== "command") changedStages.add(rule.to);
  }
  // Result facts identify the outcome after request tracking disappears. A missing
  // request alone cannot distinguish response, failure, timeout, or cancellation.
  if (step.event.kind === "jevRequestSettled") {
    const outcome = step.event.outcome;
    const from = outcome === "neverSent" ? "authorization" : outcome === "finding" || outcome === "clear" ? "jev" : "effect";
    evidence.push({ from, to: "outcomes", source: outcome === "finding" || outcome === "clear" ? "external fact" : "native fact", description: `Jev result supplied: ${outcome}` });
    changedStages.add(from); changedStages.add("outcomes");
  } else if (step.event.kind === "reviewCompleted") {
    const outcome = step.event.outcome;
    const external = outcome === "finding" || outcome === "clear";
    evidence.push({ from: external ? "jev" : "effect", to: "outcomes", source: external ? "external fact" : "native fact", description: `review result supplied: ${outcome}` });
    changedStages.add("outcomes");
  } else if (step.event.kind === "reviewObserved") {
    evidence.push({ from: "jev", to: "outcomes", source: "external fact", description: `review result observed: ${step.event.outcome}` });
    changedStages.add("jev"); changedStages.add("outcomes");
  }
  if (step.commands.some((command) => command.kind === "reviewRecorded" && command.outcome !== "finding")) {
    evidence.push({ from: "outcomes", to: "outcomes", source: "command", description: "nonfinding review outcome recorded" });
    changedStages.add("outcomes");
  }
  for (const next of step.after.delivery.slots) {
    const prior = step.before.delivery.slots.find((slot) => slot.group === next.group);
    if (prior !== undefined && prior.phase !== next.phase) evidence.push({ from: "delivery", to: "delivery", source: "state", description: `finish #${next.group}: ${prior.phase} → ${next.phase}`, identity: `slot:${next.group}` });
  }
  for (const next of step.after.delivery.submissions.batches) {
    const prior = step.before.delivery.submissions.batches.find((batch) => batch.advice === next.advice && batch.token === next.token);
    if (prior !== undefined && prior.phase !== next.phase) evidence.push({ from: "delivery", to: "delivery", source: "state", description: `advice #${next.advice}: ${prior.phase} → ${next.phase}`, identity: `batch:${next.advice}:${next.token}` });
  }
  if (kinds.has("writeRecorded") && JSON.stringify(step.before.rounds) !== JSON.stringify(step.after.rounds)) {
    evidence.push({ from: "delivery", to: "round", source: "native fact", description: "host output result recorded; round changed (writeRecorded)" });
    changedStages.add("delivery"); changedStages.add("round");
  }
  if (step.event.kind === "retirePartition") {
    const { partition, lifetime, round: roundId } = step.event;
    const retired = step.before.rounds.find((round) => round.partition === partition &&
      round.lifetime === lifetime && round.id === roundId);
    if (retired !== undefined && !step.after.rounds.some((round) => round.partition === retired.partition && round.id === retired.id)) {
      evidence.push({ from: "round", to: "round", source: "state",
        description: `round #${retired.id} retired; its work and reservations released`, identity: `round:${retired.id}` });
      changedStages.add("round");
    }
  }
  const projectionChanged = JSON.stringify(step.before) !== JSON.stringify(step.after);
  return { evidence, changedStages: [...changedStages], projectionChanged, storedResultConversions,
    ...(clearedReview === undefined ? {} : { clearedReview }),
    ...(sourceCompletion === undefined ? {} : { sourceCompletion }) };
};
