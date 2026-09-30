import type { CanonicalCommand, CanonicalEvent, CanonicalProjection } from "../../../src/canonical/adapter";

/** Stable conceptual stages of the observed review process, independent of a drawing. */
export const FLOW_STAGES = ["observation", "admission", "sourcePending", "queued", "preparation", "units", "authorization", "effect", "jev", "outcomes", "advice", "collection", "delivery", "round"] as const;
export type FlowStage = typeof FLOW_STAGES[number];
export type EvidenceSource = "state" | "command" | "native fact" | "external fact";
/** A semantic transition or decision, with its evidence boundary and a readable account. */
export type FlowEvidence = Readonly<{ from: FlowStage; to: FlowStage; source: EvidenceSource; description: string; identity?: string }>;
export type FlowStepInput = Readonly<{
  event: CanonicalEvent;
  commands: readonly CanonicalCommand[];
  before: CanonicalProjection;
  after: CanonicalProjection;
  rejection?: string;
}>;
/** Identified checked record assigned to a conceptual stage. */
export type Located = Readonly<{ key: string; stage: FlowStage; description: string }>;
const locatedWork = (state: CanonicalProjection, kinds: readonly CanonicalProjection["work"][number]["kind"][], stage: FlowStage) =>
  state.work.filter((item) => kinds.includes(item.kind)).map((item) => ({ key: `work:${item.operation}`, stage, description: `work #${item.operation} (${item.kind})` }));
const locatedDispatch = (state: CanonicalProjection, fields: readonly ("pending" | "active" | "running")[], stage: FlowStage) =>
  fields.flatMap((field) => state.dispatch[field].map((item) => ({ key: `dispatch:${item.operation}`, stage, description: `dispatch #${item.operation} (${field})` })));

/** Only checked fields that this flow assigns to a conceptual stage. */
const stageSignature = (state: CanonicalProjection, stage: FlowStage): unknown => {
  switch (stage) {
    case "observation": return [];
    case "admission": return [state.charges, state.global, state.partitions, state.admissions];
    case "sourcePending": return state.work.filter((item) => item.kind === "sourceQueued").map((item) => item.operation);
    case "queued": return [state.dispatch.pending, state.dispatch.active];
    case "preparation": return [state.dispatch.running, state.work.filter((item) => item.kind === "sourceReading" || item.kind === "preparing").map((item) => [item.operation, item.kind])];
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
export const locateFlow = (state: CanonicalProjection): readonly Located[] => [
  ...locatedWork(state, ["sourceQueued"], "sourcePending"),
  ...locatedDispatch(state, ["pending", "active"], "queued"),
  ...locatedDispatch(state, ["running"], "preparation"),
  ...locatedWork(state, ["sourceReading", "preparing"], "preparation"),
  ...locatedWork(state, ["reviewing"], "units"),
  ...state.dispatch.requests.filter((item) => !item.started).map((item) => ({ key: `request:${item.request}`, stage: "authorization" as const, description: `request #${item.request} (issued)` })),
  ...state.dispatch.requests.filter((item) => item.started).map((item) => ({ key: `request:${item.request}`, stage: "effect" as const, description: `request #${item.request} (${item.interrupted ? "interrupted" : "started"})` })),
  ...locatedWork(state, ["atJev"], "jev"),
  ...locatedWork(state, ["pendingFinding"], "outcomes"),
  ...state.collection.ready.map((id) => ({ key: `ready-advice:${id}`, stage: "advice" as const, description: `advice #${id} (ready)` })),
  ...state.collection.leases.map((item) => ({ key: `lease-advice:${item.advice}`, stage: "collection" as const, description: `advice #${item.advice} (leased)` })),
  ...state.delivery.slots.map((item) => ({ key: `slot:${item.group}`, stage: "delivery" as const, description: `finish #${item.group} (${item.phase})` })),
  ...state.delivery.submissions.batches.map((item) => ({ key: `batch:${item.advice}:${item.token}`, stage: "delivery" as const, description: `advice #${item.advice} (${item.phase})` })),
  ...state.rounds.map((item) => ({ key: `round:${item.id}`, stage: "round" as const, description: `round #${item.id}` })),
];
const placements = (state: CanonicalProjection) => new Map(locateFlow(state).map((item) => [item.key, item] as const));
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

export type FlowProjection = Readonly<{ evidence: readonly FlowEvidence[]; changedStages: readonly FlowStage[]; projectionChanged: boolean; rejection?: string }>;
export const projectFlowStep = (step: FlowStepInput | undefined): FlowProjection => {
  if (step === undefined) return { evidence: [], changedStages: [], projectionChanged: false, rejection: undefined };
  if (step.rejection !== undefined) return { evidence: [], changedStages: [], projectionChanged: false, rejection: step.rejection };
  const before = placements(step.before);
  const after = placements(step.after);
  const evidence: FlowEvidence[] = [];
  const changedStages = new Set<FlowStage>();
  for (const stage of FLOW_STAGES) if (JSON.stringify(stageSignature(step.before, stage)) !== JSON.stringify(stageSignature(step.after, stage))) changedStages.add(stage);
  for (const [key, prior] of before) {
    const next = after.get(key);
    if (next === undefined) { changedStages.add(prior.stage); continue; }
    if (next.stage !== prior.stage) {
      evidence.push({ from: prior.stage, to: next.stage, source: "state", description: `${prior.description} → ${next.description}`, identity: key });
      changedStages.add(prior.stage); changedStages.add(next.stage);
    } else if (next.description !== prior.description) changedStages.add(next.stage);
  }
  for (const [key, next] of after) if (!before.has(key)) changedStages.add(next.stage);
  const admitted = step.commands.find((command) => command.kind === "observationAdmitted");
  if (admitted?.kind === "observationAdmitted") for (const next of step.after.work) if (
    next.operation === admitted.id && next.kind === "sourceQueued" &&
    !step.before.work.some((prior) => prior.operation === next.operation)) {
    evidence.push({ from: "admission", to: "sourcePending", source: "state",
      description: `observation admitted as source work #${next.operation}; source read not started`,
      identity: `work:${next.operation}` });
    changedStages.add("admission"); changedStages.add("sourcePending");
  }
  // New queue entries and child review work provide a checked destination and
  // an identity link to the prior source, without a direct stage link in Bend.
  for (const [field, place] of [["pending", "queued"], ["active", "queued"], ["running", "preparation"]] as const) for (const next of step.after.dispatch[field]) if (
    !step.before.dispatch.pending.some((prior) => prior.operation === next.operation) &&
    !step.before.dispatch.active.some((prior) => prior.operation === next.operation) &&
    !step.before.dispatch.running.some((prior) => prior.operation === next.operation)) {
    evidence.push({ from: "admission", to: place, source: "state", description: `dispatch #${next.operation} entered ${field}`, identity: `dispatch:${next.operation}` });
    changedStages.add("admission"); changedStages.add(place);
  }
  for (const next of step.after.work) if (next.kind === "reviewing" && !step.before.work.some((prior) => prior.operation === next.operation)) {
    const parent = step.before.work.find((prior) => prior.operation === next.parent);
    if (parent !== undefined && (parent.kind === "preparing" || parent.kind === "sourceReading")) {
      evidence.push({ from: "preparation", to: "units", source: "state", description: `prepared work #${parent.operation} produced review #${next.operation}`, identity: `work:${next.operation}` });
      changedStages.add("preparation"); changedStages.add("units");
    }
  }
  // Ready and leased advice may coexist. A newly checked lease for a ready
  // advice ID establishes the collection link without claiming ready storage moved.
  for (const lease of step.after.collection.leases) if (!step.before.collection.leases.some((prior) => prior.advice === lease.advice) &&
    step.before.collection.ready.includes(lease.advice)) {
    evidence.push({ from: "advice", to: "collection", source: "state",
      description: `advice #${lease.advice} leased${step.after.collection.ready.includes(lease.advice) ? "; still ready" : ""}`,
      identity: `advice:${lease.advice}` });
    changedStages.add("advice"); changedStages.add("collection");
  }
  if (step.event.kind === "collectionReady") for (const id of step.after.collection.ready) if (!step.before.collection.ready.includes(id)) {
    evidence.push({ from: "outcomes", to: "advice", source: "native fact",
      description: `advice #${id} supplied ready by native storage; producing work ID is not projected`, identity: `ready-advice:${id}` });
    changedStages.add("outcomes"); changedStages.add("advice");
  }
  const kinds = commandKinds(step.commands);
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
  return { evidence, changedStages: [...changedStages], projectionChanged };
};
