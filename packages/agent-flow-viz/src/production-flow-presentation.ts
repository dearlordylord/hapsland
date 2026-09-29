import type { CanonicalProjection } from "../../../src/canonical/adapter";
import { FLOW_STAGES, type FlowStage as Place } from "@hapsland/agent-flow-projection";

type Square = Readonly<{ title: string; owner: string; x: number; y: number; detail: (state: CanonicalProjection) => string }>;

const ids = (items: readonly number[]) => items.length ? items.map((id) => `#${id}`).join(", ") : "none";
const work = (state: CanonicalProjection, kind: CanonicalProjection["work"][number]["kind"]) =>
  state.work.filter((item) => item.kind === kind).map((item) => item.operation);
const dispatchDetail = (state: CanonicalProjection, place: "pending" | "active" | "running") =>
  state.dispatch[place].map((item, index) => `${index + 1}:#${item.operation}/agent ${item.partition}/seq ${item.sequence}`).join(", ") || "none";

/** The view alone names and positions conceptual flow stages as squares. */
export const SQUARES: Record<Place, Square> = {
  observation: { title: "Agent observation", owner: "NATIVE FACT", x: 32, y: 52,
    detail: (s) => `rounds ${ids(s.rounds.map((x) => x.id))} · source queued ${ids(work(s, "sourceQueued"))}` },
  admission: { title: "Capacity check", owner: "BEND DECISION", x: 310, y: 52,
    detail: (s) => `observation charges ${s.charges.filter((x) => x.purpose === "observationDispatch").length}` },
  queued: { title: "Preparation queue", owner: "BEND STATE", x: 588, y: 52,
    detail: (s) => `pending ${dispatchDetail(s, "pending")} · active ${dispatchDetail(s, "active")}` },
  preparation: { title: "Source preparation", owner: "NATIVE EFFECT + BEND STATE", x: 866, y: 52,
    detail: (s) => `running ${dispatchDetail(s, "running")} · source reading ${ids(work(s, "sourceReading"))} · preparing ${ids(work(s, "preparing"))}` },
  units: { title: "Review work items", owner: "BEND STATE", x: 1144, y: 52,
    detail: (s) => `reviewing ${ids(work(s, "reviewing"))} · unit charges ${s.charges.filter((x) => x.purpose === "reviewUnit").length}` },
  authorization: { title: "Jev ready check", owner: "BEND DECISION", x: 1144, y: 322,
    detail: (s) => `issued, not observed started ${ids(s.dispatch.requests.filter((x) => !x.started).map((x) => x.request))}` },
  effect: { title: "Jev request attempt", owner: "NATIVE FACT", x: 866, y: 322,
    detail: (s) => `observed started requests ${ids(s.dispatch.requests.filter((x) => x.started).map((x) => x.request))}` },
  jev: { title: "Awaiting Jev result", owner: "BEND STATE", x: 588, y: 322,
    detail: (s) => `at Jev work ${ids(work(s, "atJev"))} · reserved request permits ${ids(s.dispatch.requests.map((x) => x.request))}` },
  outcomes: { title: "Review outcomes", owner: "BEND DECISION", x: 310, y: 322,
    detail: (s) => `pending finding operations ${ids(work(s, "pendingFinding"))} · ticket units ${s.tickets.flatMap((x) => x.units).map((x) => `#${x.id}:${x.stage}`).join(", ") || "none"}` },
  advice: { title: "Pending advice", owner: "BEND STATE", x: 32, y: 322,
    detail: (s) => `ready ${ids(s.collection.ready)} · leases ${ids(s.collection.leases.map((x) => x.advice))}` },
  collection: { title: "Advice collection", owner: "BEND DECISION", x: 32, y: 592,
    detail: (s) => `waiting rounds ${ids(s.rounds.filter((x) => x.waiting).map((x) => x.id))}` },
  delivery: { title: "Host output", owner: "BEND + NATIVE EFFECT", x: 310, y: 592,
    detail: (s) => `finish ${s.delivery.slots.map((x) => `#${x.group}:${x.phase}`).join(", ") || "none"} · advice ${s.delivery.submissions.batches.map((x) => `#${x.advice}:${x.surface}:${x.phase}`).join(", ") || "none"}` },
  round: { title: "Round state", owner: "BEND STATE", x: 588, y: 592,
    detail: (s) => `active ${ids(s.rounds.map((x) => x.id))} · uncertain ${ids(s.rounds.filter((x) => x.uncertain).map((x) => x.id))}` },
};
export const PLACE_ORDER = FLOW_STAGES;


/** Fixed edges describe possible presentation connections; they make no reducer decisions. */
export const CONNECTIONS = [
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
  { from: "round", to: "round", label: "round retirement and release" },
] as const satisfies readonly Readonly<{ from: Place; to: Place; label: string }>[];
