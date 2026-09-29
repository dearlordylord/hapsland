import type { CanonicalCommand, CanonicalProjection } from "../../../src/canonical/adapter";
import type { ReplayStep } from "./canonical-replay";

/** Squares are presentation locations for checked facts, never reducer states. */
export type Place = "observation" | "admission" | "queued" | "preparation" | "units" |
  "authorization" | "effect" | "jev" | "outcomes" | "advice" | "collection" | "delivery" | "round";
export type EvidenceSource = "state" | "command" | "native fact" | "external fact";
export type FlowEvidence = Readonly<{ from: Place; to: Place; source: EvidenceSource; label: string; identity?: string }>;

type Located = Readonly<{ key: string; place: Place; label: string }>;
type Square = Readonly<{
  title: string; owner: string; x: number; y: number;
  detail: (state: CanonicalProjection) => string;
  locate: (state: CanonicalProjection) => readonly Located[];
  watch?: (state: CanonicalProjection) => unknown;
}>;
const ids = (items: readonly number[]) => items.length ? items.map((id) => `#${id}`).join(", ") : "none";
const work = (state: CanonicalProjection, kind: CanonicalProjection["work"][number]["kind"]) =>
  state.work.filter((item) => item.kind === kind).map((item) => item.operation);
const dispatchDetail = (state: CanonicalProjection, place: "pending" | "active" | "running") =>
  state.dispatch[place].map((item, index) => `${index + 1}:#${item.operation}/agent ${item.partition}/seq ${item.sequence}`).join(", ") || "none";
const locatedWork = (state: CanonicalProjection, kinds: readonly CanonicalProjection["work"][number]["kind"][], place: Place) =>
  state.work.filter((item) => kinds.includes(item.kind)).map((item) => ({ key: `work:${item.operation}`, place, label: `work #${item.operation} (${item.kind})` }));
const locatedDispatch = (state: CanonicalProjection, fields: readonly ("pending" | "active" | "running")[], place: Place) =>
  fields.flatMap((field) => state.dispatch[field].map((item) => ({ key: `dispatch:${item.operation}`, place, label: `dispatch #${item.operation} (${field})` })));

/** One registry supplies square content and the placement used to infer arrows. */
export const SQUARES: Record<Place, Square> = {
  observation: { title: "Agent observation", owner: "NATIVE FACT", x: 32, y: 52,
    detail: (s) => `rounds ${ids(s.rounds.map((x) => x.id))} · source queued ${ids(work(s, "sourceQueued"))}`,
    locate: (s) => locatedWork(s, ["sourceQueued"], "observation") },
  admission: { title: "Capacity check", owner: "BEND DECISION", x: 310, y: 52,
    detail: (s) => `observation charges ${s.charges.filter((x) => x.purpose === "observationDispatch").length}`,
    locate: () => [], watch: (s) => [s.charges, s.global, s.partitions, s.admissions] },
  queued: { title: "Preparation queue", owner: "BEND STATE", x: 588, y: 52,
    detail: (s) => `pending ${dispatchDetail(s, "pending")} · active ${dispatchDetail(s, "active")}`,
    locate: (s) => locatedDispatch(s, ["pending", "active"], "queued"), watch: (s) => [s.dispatch.pending, s.dispatch.active] },
  preparation: { title: "Source preparation", owner: "NATIVE EFFECT + BEND STATE", x: 866, y: 52,
    detail: (s) => `running ${dispatchDetail(s, "running")} · source reading ${ids(work(s, "sourceReading"))} · preparing ${ids(work(s, "preparing"))}`,
    locate: (s) => [...locatedDispatch(s, ["running"], "preparation"), ...locatedWork(s, ["sourceReading", "preparing"], "preparation")],
    watch: (s) => s.dispatch.running },
  units: { title: "Review work items", owner: "BEND STATE", x: 1144, y: 52,
    detail: (s) => `reviewing ${ids(work(s, "reviewing"))} · unit charges ${s.charges.filter((x) => x.purpose === "reviewUnit").length}`,
    locate: (s) => locatedWork(s, ["reviewing"], "units") },
  authorization: { title: "Jev ready check", owner: "BEND DECISION", x: 1144, y: 322,
    detail: (s) => `issued, not observed started ${ids(s.dispatch.requests.filter((x) => !x.started).map((x) => x.request))}`,
    locate: (s) => s.dispatch.requests.filter((x) => !x.started).map((x) => ({ key: `request:${x.request}`, place: "authorization", label: `request #${x.request} (issued)` })) },
  effect: { title: "Jev request attempt", owner: "NATIVE FACT", x: 866, y: 322,
    detail: (s) => `observed started requests ${ids(s.dispatch.requests.filter((x) => x.started).map((x) => x.request))}`,
    locate: (s) => s.dispatch.requests.filter((x) => x.started).map((x) => ({ key: `request:${x.request}`, place: "effect", label: `request #${x.request} (${x.interrupted ? "interrupted" : "started"})` })) },
  jev: { title: "Awaiting Jev result", owner: "BEND + EXTERNAL FACT", x: 588, y: 322,
    detail: (s) => `at Jev work ${ids(work(s, "atJev"))} · reserved request permits ${ids(s.dispatch.requests.map((x) => x.request))}`,
    locate: (s) => locatedWork(s, ["atJev"], "jev") },
  outcomes: { title: "Review outcomes", owner: "BEND DECISION", x: 310, y: 322,
    detail: (s) => `pending finding operations ${ids(work(s, "pendingFinding"))} · ticket units ${s.tickets.flatMap((x) => x.units).map((x) => `#${x.id}:${x.stage}`).join(", ") || "none"}`,
    locate: (s) => locatedWork(s, ["pendingFinding"], "outcomes"), watch: (s) => [s.pendingFindings, s.tickets] },
  advice: { title: "Pending advice", owner: "BEND STATE", x: 32, y: 322,
    detail: (s) => `ready ${ids(s.collection.ready)} · leases ${ids(s.collection.leases.map((x) => x.advice))}`,
    locate: (s) => s.collection.ready.map((id) => ({ key: `ready-advice:${id}`, place: "advice", label: `advice #${id} (ready)` })) },
  collection: { title: "Advice collection", owner: "BEND DECISION", x: 32, y: 592,
    detail: (s) => `waiting rounds ${ids(s.rounds.filter((x) => x.waiting).map((x) => x.id))}`,
    locate: (s) => s.collection.leases.map((x) => ({ key: `lease-advice:${x.advice}`, place: "collection", label: `advice #${x.advice} (leased)` })),
    watch: (s) => [s.collection.leases, s.collection.claims] },
  delivery: { title: "Host output", owner: "BEND + NATIVE EFFECT", x: 310, y: 592,
    detail: (s) => `finish ${s.delivery.slots.map((x) => `#${x.group}:${x.phase}`).join(", ") || "none"} · advice ${s.delivery.submissions.batches.map((x) => `#${x.advice}:${x.surface}:${x.phase}`).join(", ") || "none"}`,
    locate: (s) => [...s.delivery.slots.map((x) => ({ key: `slot:${x.group}`, place: "delivery" as const, label: `finish #${x.group} (${x.phase})` })),
      ...s.delivery.submissions.batches.map((x) => ({ key: `batch:${x.advice}:${x.token}`, place: "delivery" as const, label: `advice #${x.advice} (${x.phase})` }))], watch: (s) => s.delivery },
  round: { title: "Round state", owner: "BEND STATE", x: 588, y: 592,
    detail: (s) => `active ${ids(s.rounds.map((x) => x.id))} · uncertain ${ids(s.rounds.filter((x) => x.uncertain).map((x) => x.id))}`,
    locate: (s) => s.rounds.map((x) => ({ key: `round:${x.id}`, place: "round", label: `round #${x.id}` })), watch: (s) => s.rounds },
};
export const PLACE_ORDER = Object.keys(SQUARES) as Place[];

const placements = (state: CanonicalProjection) => new Map(PLACE_ORDER.flatMap((place) => SQUARES[place].locate(state).map((item) => [item.key, item] as const)));
const commandKinds = (commands: readonly CanonicalCommand[]) => new Set(commands.map((command) => command.kind));

/** Fixed edges describe possible presentation connections; they make no reducer decisions. */
export const CONNECTIONS: readonly Readonly<{ from: Place; to: Place; label: string }>[] = [
  { from: "observation", to: "admission", label: "observation supplied" },
  { from: "admission", to: "queued", label: "dispatch queued" },
  { from: "observation", to: "preparation", label: "source reading begins" },
  { from: "admission", to: "preparation", label: "preparation admitted" },
  { from: "queued", to: "preparation", label: "dispatch starts" },
  { from: "preparation", to: "units", label: "review unit admitted" },
  { from: "units", to: "authorization", label: "ready facts supplied" },
  { from: "units", to: "jev", label: "work enters Jev phase" },
  { from: "authorization", to: "effect", label: "request command or observed start" },
  { from: "authorization", to: "outcomes", label: "request unavailable or never sent" },
  { from: "effect", to: "jev", label: "attempt observed" },
  { from: "effect", to: "outcomes", label: "attempt interrupted or failed" },
  { from: "jev", to: "outcomes", label: "review result supplied" },
  { from: "outcomes", to: "advice", label: "retain finding decision" },
  { from: "outcomes", to: "outcomes", label: "outcome recorded" },
  { from: "advice", to: "collection", label: "advice selected or leased" },
  { from: "collection", to: "collection", label: "wait, keep, or allow finish" },
  { from: "collection", to: "preparation", label: "cancel work command" },
  { from: "collection", to: "round", label: "Stop decision" },
  { from: "collection", to: "delivery", label: "output authorized" },
  { from: "delivery", to: "delivery", label: "delivery phase recorded" },
  { from: "delivery", to: "round", label: "output fact changes round" },
];

type Rule = Readonly<{ from: Place; to: Place; source: EvidenceSource; label: string; commands?: readonly CanonicalCommand["kind"][]; events?: readonly ReplayStep["event"]["kind"][] }>;
/** Only links with no shared projected identity need a view interpretation rule. */
const FACT_RULES: readonly Rule[] = [
  { from: "observation", to: "admission", source: "native fact", label: "observation supplied for admission", events: ["admitObservation", "beginObservedPreparation", "beginPreparation"] },
  { from: "admission", to: "preparation", source: "command", label: "prepare command emitted", commands: ["prepare"] },
  { from: "units", to: "authorization", source: "native fact", label: "Jev readiness facts supplied", events: ["jevRequestReady"] },
  { from: "authorization", to: "effect", source: "command", label: "request permitted; native attempt not yet observed", commands: ["jevRequestIssued"] },
  { from: "authorization", to: "outcomes", source: "command", label: "request unavailable or refused", commands: ["jevRequestUnavailable"] },
  { from: "effect", to: "jev", source: "native fact", label: "request start observed", commands: ["jevRequestStartRecorded"] },
  { from: "effect", to: "outcomes", source: "native fact", label: "request interruption recorded", commands: ["jevInterruptionRecorded"] },
  { from: "outcomes", to: "advice", source: "command", label: "retain finding command; storage not observed", commands: ["retainFinding"] },
  { from: "outcomes", to: "outcomes", source: "command", label: "clear, stale, or backend outcome recorded", commands: ["settleClear", "settleStaleClear", "retireStaleFinding", "failureBackend"] },
  { from: "advice", to: "collection", source: "command", label: "advice eligible or selected", commands: ["collectionEligible", "collectionBackgroundClaimed", "collectionFindingSelected"] },
  { from: "collection", to: "collection", source: "command", label: "collection waits or retains advice", commands: ["collectionFindingRetained", "waitForWork", "waitForOutput", "finishAllowedNoAdvice", "finishAllowedDeadline", "finishAllowedUnavailable"] },
  { from: "collection", to: "preparation", source: "command", label: "cancel unfinished work requested", commands: ["cancelWork", "discardAllUnfinished", "discardNamedOnly"] },
  { from: "collection", to: "round", source: "command", label: "Stop decision ready or advice reoffered", commands: ["finishReady", "reofferAtStop"] },
  { from: "collection", to: "delivery", source: "command", label: "output authorized; host write not established", commands: ["finishAuthorized", "submissionAuthorized", "writeAuthorized"] },
];

export type FlowProjection = Readonly<{ evidence: readonly FlowEvidence[]; changedSquares: readonly Place[]; explanation: string }>;
export const projectFlowStep = (step: ReplayStep | undefined): FlowProjection => {
  if (step === undefined) return { evidence: [], changedSquares: [], explanation: "Choose a reducer event to inspect its checked effects." };
  if (step.rejection !== undefined) return { evidence: [], changedSquares: [], explanation: `Rejected: ${step.rejection}. No movement is shown.` };
  const before = placements(step.before);
  const after = placements(step.after);
  const evidence: FlowEvidence[] = [];
  const changedSquares = new Set<Place>();
  for (const place of PLACE_ORDER) {
    const square = SQUARES[place];
    if (square.detail(step.before) !== square.detail(step.after) ||
      (square.watch !== undefined && JSON.stringify(square.watch(step.before)) !== JSON.stringify(square.watch(step.after)))) changedSquares.add(place);
  }
  for (const [key, prior] of before) {
    const next = after.get(key);
    if (next === undefined) { changedSquares.add(prior.place); continue; }
    if (next.place !== prior.place) {
      evidence.push({ from: prior.place, to: next.place, source: "state", label: `${prior.label} → ${next.label}`, identity: key });
      changedSquares.add(prior.place); changedSquares.add(next.place);
    } else if (next.label !== prior.label) changedSquares.add(next.place);
  }
  for (const [key, next] of after) if (!before.has(key)) changedSquares.add(next.place);
  // New queue entries and child review work provide a checked destination and
  // an identity link to the prior source, without square metadata in Bend.
  for (const [field, place] of [["pending", "queued"], ["active", "queued"], ["running", "preparation"]] as const) for (const next of step.after.dispatch[field]) if (
    !step.before.dispatch.pending.some((prior) => prior.operation === next.operation) &&
    !step.before.dispatch.active.some((prior) => prior.operation === next.operation) &&
    !step.before.dispatch.running.some((prior) => prior.operation === next.operation)) {
    evidence.push({ from: "admission", to: place, source: "state", label: `dispatch #${next.operation} entered ${field}`, identity: `dispatch:${next.operation}` });
    changedSquares.add("admission"); changedSquares.add(place);
  }
  for (const next of step.after.work) if (next.kind === "reviewing" && !step.before.work.some((prior) => prior.operation === next.operation)) {
    const parent = step.before.work.find((prior) => prior.operation === next.parent);
    if (parent !== undefined && (parent.kind === "preparing" || parent.kind === "sourceReading")) {
      evidence.push({ from: "preparation", to: "units", source: "state", label: `prepared work #${parent.operation} produced review #${next.operation}`, identity: `work:${next.operation}` });
      changedSquares.add("preparation"); changedSquares.add("units");
    }
  }
  // Ready and leased advice may coexist. Infer a transfer only when this step
  // removes readiness and adds a lease for the same advice ID.
  for (const lease of step.after.collection.leases) if (!step.before.collection.leases.some((prior) => prior.advice === lease.advice) &&
    step.before.collection.ready.includes(lease.advice) && !step.after.collection.ready.includes(lease.advice)) {
    evidence.push({ from: "advice", to: "collection", source: "state", label: `advice #${lease.advice} leased`, identity: `advice:${lease.advice}` });
    changedSquares.add("advice"); changedSquares.add("collection");
  }
  if (step.event.kind === "collectionReady") for (const id of step.after.collection.ready) if (!step.before.collection.ready.includes(id)) {
    evidence.push({ from: "outcomes", to: "advice", source: "native fact",
      label: `advice #${id} supplied ready by native storage; producing work ID is not projected`, identity: `ready-advice:${id}` });
    changedSquares.add("outcomes"); changedSquares.add("advice");
  }
  const kinds = commandKinds(step.commands);
  for (const rule of FACT_RULES) {
    const matchedCommands = rule.commands?.filter((kind) => kinds.has(kind)) ?? [];
    if (!(rule.events?.includes(step.event.kind) ?? false) && matchedCommands.length === 0) continue;
    evidence.push({ from: rule.from, to: rule.to, source: rule.source,
      label: matchedCommands.length ? `${rule.label} (${matchedCommands.join(", ")})` : rule.label });
    changedSquares.add(rule.from);
    // A command describes an authorized path; the destination is occupied
    // only when checked state or a later supplied fact places something there.
    if (rule.source !== "command") changedSquares.add(rule.to);
  }
  // Result facts identify the outcome after request tracking disappears. A missing
  // request alone cannot distinguish response, failure, timeout, or cancellation.
  if (step.event.kind === "jevRequestSettled") {
    const outcome = step.event.outcome;
    const from = outcome === "neverSent" ? "authorization" : outcome === "finding" || outcome === "clear" ? "jev" : "effect";
    evidence.push({ from, to: "outcomes", source: outcome === "finding" || outcome === "clear" ? "external fact" : "native fact", label: `Jev result supplied: ${outcome}` });
    changedSquares.add(from); changedSquares.add("outcomes");
  } else if (step.event.kind === "reviewCompleted") {
    const outcome = step.event.outcome;
    const external = outcome === "finding" || outcome === "clear";
    evidence.push({ from: external ? "jev" : "effect", to: "outcomes", source: external ? "external fact" : "native fact", label: `review result supplied: ${outcome}` });
    changedSquares.add("outcomes");
  } else if (step.event.kind === "reviewObserved") {
    evidence.push({ from: "jev", to: "outcomes", source: "external fact", label: `review result observed: ${step.event.outcome}` });
    changedSquares.add("jev"); changedSquares.add("outcomes");
  }
  if (step.commands.some((command) => command.kind === "reviewRecorded" && command.outcome !== "finding")) {
    evidence.push({ from: "outcomes", to: "outcomes", source: "command", label: "nonfinding review outcome recorded" });
    changedSquares.add("outcomes");
  }
  for (const next of step.after.delivery.slots) {
    const prior = step.before.delivery.slots.find((slot) => slot.group === next.group);
    if (prior !== undefined && prior.phase !== next.phase) evidence.push({ from: "delivery", to: "delivery", source: "state", label: `finish #${next.group}: ${prior.phase} → ${next.phase}`, identity: `slot:${next.group}` });
  }
  for (const next of step.after.delivery.submissions.batches) {
    const prior = step.before.delivery.submissions.batches.find((batch) => batch.advice === next.advice && batch.token === next.token);
    if (prior !== undefined && prior.phase !== next.phase) evidence.push({ from: "delivery", to: "delivery", source: "state", label: `advice #${next.advice}: ${prior.phase} → ${next.phase}`, identity: `batch:${next.advice}:${next.token}` });
  }
  if (kinds.has("writeRecorded") && JSON.stringify(step.before.rounds) !== JSON.stringify(step.after.rounds)) {
    evidence.push({ from: "delivery", to: "round", source: "native fact", label: "host output result recorded; round changed (writeRecorded)" });
    changedSquares.add("delivery"); changedSquares.add("round");
  }
  const projectionChanged = JSON.stringify(step.before) !== JSON.stringify(step.after);
  const explanation = evidence.length ? `${evidence.length} connection(s) have checked evidence.`
    : changedSquares.size ? `State changed in ${[...changedSquares].map((place) => SQUARES[place].title).join(", ")}; no item crossed a displayed connection.`
      : projectionChanged ? "Checked reducer state changed outside the displayed square details; no displayed movement is established."
      : step.commands.length ? `Decision emitted ${step.commands.map((command) => command.kind).join(", ")}; no displayed item movement is established.`
        : "Accepted event; no displayed item movement or square change is established.";
  return { evidence, changedSquares: [...changedSquares], explanation };
};
