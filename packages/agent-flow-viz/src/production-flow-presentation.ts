import type { CanonicalProjection } from "../../../src/canonical/adapter";
import { FLOW_STAGES, type FlowStage as Place } from "@hapsland/agent-flow-projection";

export type SquareFacet = Readonly<{ label: string; count: number; references: readonly string[] }>;
type Square = Readonly<{ title: string; owner: string; x: number; y: number; facets: (state: CanonicalProjection) => readonly SquareFacet[]; detail: (state: CanonicalProjection) => string }>;
const facet = (label: string, references: readonly string[]): SquareFacet => ({ label, count: references.length, references });
const ids = (items: readonly number[]) => items.map((id) => `#${id}`);
const work = (state: CanonicalProjection, kind: CanonicalProjection["work"][number]["kind"]) => ids(state.work.filter((item) => item.kind === kind).map((item) => item.operation));
const dispatch = (state: CanonicalProjection, place: "pending" | "active" | "running", preparation?: boolean) => state.dispatch[place].filter((item) => preparation === undefined || item.preparation === preparation).map((item) => `#${item.operation}/agent ${item.partition}/round ${item.round}/seq ${item.sequence}/cycle ${item.cycle}/${item.preparation ? "preparation" : "review"}${item.cancelled ? "/cancelled" : ""}`);
const facetCount = (item: SquareFacet) => `${item.count} ${item.count === 1 ? item.label.replace(/\b(rounds|permits|charges|requests|units|leases|claims|slots)\b/g, (word) => word.slice(0, -1)) : item.label}`;
const square = (definition: Omit<Square, "detail">): Square => ({ ...definition, detail: (state) => definition.facets(state).map((item) => `${facetCount(item)}${item.references.length ? `: ${item.references.join(", ")}` : ""}`).join(" · ") });
/** Count and facet name always remain visible; only the identity sample is bounded. */
export const squareFacetLine = (item: SquareFacet): string => {
  const count = facetCount(item);
  if (item.count === 0) return count;
  const first = item.references[0].split(/[/:]/)[0];
  const remaining = item.count > 1 ? ` +${item.count - 1} more` : "";
  const sampled = `${count} · ${first}${remaining}`;
  return sampled.length <= 28 ? sampled : count;
};

/** The view alone names and positions conceptual flow stages as squares. Counts are checked record facets, never an aggregate of overlapping references. */
export const SQUARES: Record<Place, Square> = {
  observation: square({ title: "Agent edit", owner: "NATIVE FACT", x: 32, y: 52,
    facets: () => [] }),
  admission: square({ title: "Admission & capacity", owner: "BEND DECISION", x: 310, y: 52,
    facets: (s) => [facet("edit permits", ids(s.admissions.flatMap((x) => x.permits.map((permit) => permit.token)))), facet("observation charges", ids(s.charges.filter((x) => x.purpose === "observationDispatch").map((x) => x.id)))] }),
  sourcePending: square({ title: "Awaiting source read", owner: "BEND STATE", x: 32, y: 190,
    facets: (s) => [facet("source work waiting", work(s, "awaitingSourceRead"))] }),
  scheduling: square({ title: "Job scheduling", owner: "BEND DECISION + STATE", x: 588, y: 190,
    facets: (s) => [facet("waiting next batch", dispatch(s, "pending")), facet("waiting current batch", dispatch(s, "active")),
      facet("running preparation jobs", dispatch(s, "running", true)), facet("running review jobs", dispatch(s, "running", false))] }),
  preparation: square({ title: "Read & prepare source", owner: "NATIVE EFFECT + BEND STATE", x: 866, y: 52,
    facets: (s) => [facet("source reading", work(s, "sourceReading")), facet("preparing", work(s, "preparing"))] }),
  units: square({ title: "Review work items", owner: "BEND STATE", x: 1144, y: 52,
    facets: (s) => [facet("reviewing", work(s, "reviewing")), facet("unit charges", ids(s.charges.filter((x) => x.purpose === "reviewUnit").map((x) => x.id)))] }),
  authorization: square({ title: "Jev ready check", owner: "BEND DECISION", x: 1144, y: 350,
    facets: (s) => [facet("unstarted requests", ids(s.dispatch.requests.filter((x) => !x.started).map((x) => x.request)))] }),
  effect: square({ title: "Jev request attempt", owner: "NATIVE FACT", x: 866, y: 350,
    facets: (s) => [facet("started requests", ids(s.dispatch.requests.filter((x) => x.started).map((x) => x.request)))] }),
  jev: square({ title: "Awaiting Jev result", owner: "BEND STATE", x: 588, y: 350,
    facets: (s) => [facet("at Jev work", work(s, "atJev")), facet("request permits", ids(s.dispatch.requests.map((x) => x.request)))] }),
  outcomes: square({ title: "Review outcomes", owner: "BEND DECISION", x: 310, y: 350,
    facets: (s) => [facet("finding work", work(s, "pendingFinding")), facet("ticket units", s.tickets.flatMap((x) => x.units).map((x) => `#${x.id}:${x.stage}`))] }),
  advice: square({ title: "Advice ready / retained", owner: "BEND STATE", x: 32, y: 350,
    facets: (s) => {
      const submitted = new Set(s.delivery.submissions.batches.filter((x) => x.phase === "submitted").map((x) => x.advice));
      return [facet("pending ready", ids(s.collection.ready.filter((id) => !submitted.has(id)))), facet("retained submitted", ids(s.collection.ready.filter((id) => submitted.has(id)))), facet("leases", ids(s.collection.leases.map((x) => x.advice)))];
    } }),
  collection: square({ title: "Advice collection", owner: "BEND DECISION", x: 32, y: 592,
    facets: (s) => [facet("waiting rounds", ids(s.rounds.filter((x) => x.waiting).map((x) => x.id))), facet("leases", ids(s.collection.leases.map((x) => x.advice))), facet("background claims", ids(s.collection.claims.map((x) => x.group)))] }),
  delivery: square({ title: "Host output", owner: "BEND + NATIVE EFFECT", x: 310, y: 592,
    facets: (s) => [facet("finish slots", s.delivery.slots.map((x) => `#${x.group}:${x.phase}`)), facet("pending advice", s.delivery.submissions.batches.filter((x) => x.phase === "reserved" || x.phase === "authorized").map((x) => `#${x.advice}:${x.surface}:${x.phase}`)), facet("submitted advice", s.delivery.submissions.batches.filter((x) => x.phase === "submitted").map((x) => `#${x.advice}:${x.surface}:${x.phase}`)), facet("uncertain advice", s.delivery.submissions.batches.filter((x) => x.phase === "uncertain").map((x) => `#${x.advice}:${x.surface}:${x.phase}`))] }),
  round: square({ title: "Round state", owner: "BEND STATE", x: 588, y: 592,
    facets: (s) => [facet("active rounds", ids(s.rounds.map((x) => x.id))), facet("uncertain rounds", ids(s.rounds.filter((x) => x.uncertain).map((x) => x.id)))] }),
};
export const PLACE_ORDER = FLOW_STAGES;


/** Fixed edges describe possible presentation connections; they make no reducer decisions. */
export const CONNECTIONS = [
  { from: "observation", to: "admission", label: "Edit attempt or observation supplied" },
  { from: "admission", to: "sourcePending", label: "observation admitted as source work" },
  { from: "sourcePending", to: "scheduling", label: "source job scheduled", relation: "linked record" },
  { from: "units", to: "scheduling", label: "review job scheduled", relation: "linked record" },
  { from: "scheduling", to: "scheduling", label: "job scheduling status changes" },
  { from: "sourcePending", to: "preparation", label: "source reading begins" },
  { from: "admission", to: "preparation", label: "preparation admitted" },
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
] as const satisfies readonly Readonly<{ from: Place; to: Place; label: string; relation?: "linked record" }>[];
