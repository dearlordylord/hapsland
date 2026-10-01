import type { CanonicalProjection } from "../../../src/canonical/adapter";
import { FLOW_STAGES, recordLabel, type RecordNumbers, type FlowStage as Place } from "@hapsland/agent-flow-projection";

export type SquareFacet = Readonly<{ label: string; count: number; references: readonly string[] }>;
type Square = Readonly<{ title: string; owner: string; x: number; y: number; facets: (state: CanonicalProjection, numbers?: RecordNumbers) => readonly SquareFacet[]; detail: (state: CanonicalProjection, numbers?: RecordNumbers) => string }>;
const facet = (label: string, references: readonly string[]): SquareFacet => ({ label, count: references.length, references });
const ids = (items: readonly number[], noun: string) => items.map((id) => `${noun} #${id}`);
const work = (state: CanonicalProjection, kind: CanonicalProjection["work"][number]["kind"], numbers?: RecordNumbers) =>
  state.work.filter((item) => item.kind === kind).map((item) => recordLabel(
    kind === "sourceReading" || kind === "awaitingSourceRead" ? "source" : kind === "preparing" ? "preparation" : "review",
    item.operation, numbers));
const dispatch = (state: CanonicalProjection, place: "queued" | "running", numbers?: RecordNumbers, preparation?: boolean) =>
  state.dispatch[place].filter((item) => preparation === undefined || item.preparation === preparation)
    .map((item) => `${recordLabel(item.preparation ? "source" : "review", item.operation, numbers)}/agent ${item.partition}/round ${item.round}/seq ${item.sequence}/${item.preparation ? "preparation" : "review"}${item.cancelled ? "/cancelled" : ""}`);
const facetCount = (item: SquareFacet) => `${item.count} ${item.count === 1 ? item.label.replace(/\b(rounds|permits|charges|requests|units|leases|claims|slots|preparations|items|reads)\b/g, (word) => word.slice(0, -1)) : item.label}`;
const square = (definition: Omit<Square, "detail">): Square => ({ ...definition, detail: (state, numbers) => definition.facets(state, numbers).map((item) => `${facetCount(item)}${item.references.length ? `: ${item.references.join(", ")}` : ""}`).join(" · ") });
/** Count and facet name always remain visible; only the identity sample is bounded. */
export const squareFacetLine = (item: SquareFacet): string => {
  const count = facetCount(item);
  if (item.count === 0) return count;
  const first = item.references[0].split(/[/:]/)[0];
  const remaining = item.count > 1 ? ` +${item.count - 1} more` : "";
  const sampled = `${count} · ${first}${remaining}`;
  return sampled.length <= 40 ? sampled : count;
};

export const squareFacetFontSize = (item: SquareFacet): "8" | "10" => squareFacetLine(item).length > 28 ? "8" : "10";

/** The view alone names and positions conceptual flow stages as squares. Counts are checked record facets, never an aggregate of overlapping references. */
export const SQUARES: Record<Place, Square> = {
  observation: square({ title: "Agent edit", owner: "NATIVE FACT", x: 32, y: 52,
    facets: () => [] }),
  admission: square({ title: "Admission & capacity", owner: "BEND DECISION", x: 310, y: 52,
    facets: (s, n) => [facet("edit permits", ids(s.admissions.flatMap((x) => x.permits.map((permit) => permit.token)), "Permit")), facet("observation charges", s.charges.filter((x) => x.purpose === "observationDispatch").map((x) => recordLabel("charge:observationDispatch", x.id, n))),
      facet("stored result charges", s.charges.filter((x) => x.purpose === "storedResult").map((x) => recordLabel("charge:storedResult", x.id, n)))] }),
  sourcePending: square({ title: "Awaiting source read", owner: "BEND STATE", x: 32, y: 190,
    facets: (s, n) => [facet("pending source reads", work(s, "awaitingSourceRead", n))] }),
  scheduling: square({ title: "Job scheduling", owner: "BEND DECISION + STATE", x: 588, y: 190,
    facets: (s, n) => [facet("waiting to prepare", dispatch(s, "queued", n, true)), facet("waiting to review", dispatch(s, "queued", n, false)),
      facet("running preparation jobs", dispatch(s, "running", n, true)), facet("running review jobs", dispatch(s, "running", n, false))] }),
  preparation: square({ title: "Read & prepare source", owner: "NATIVE EFFECT + BEND STATE", x: 866, y: 52,
    facets: (s, n) => [facet("active source reads", work(s, "sourceReading", n)), facet("active preparations", work(s, "preparing", n))] }),
  units: square({ title: "Review work items", owner: "BEND STATE", x: 1144, y: 52,
    facets: (s, n) => [facet("review items", work(s, "reviewing", n)), facet("unit charges", s.charges.filter((x) => x.purpose === "reviewUnit").map((x) => recordLabel("charge:reviewUnit", x.id, n)))] }),
  authorization: square({ title: "Jev ready check", owner: "BEND DECISION", x: 1144, y: 350,
    facets: (s, n) => [facet("unstarted requests", s.dispatch.requests.filter((x) => !x.started).map((x) => recordLabel("request", x.request, n)))] }),
  effect: square({ title: "Jev request attempt", owner: "NATIVE FACT", x: 866, y: 350,
    facets: (s, n) => [facet("started requests", s.dispatch.requests.filter((x) => x.started).map((x) => recordLabel("request", x.request, n)))] }),
  jev: square({ title: "Awaiting Jev result", owner: "BEND STATE", x: 588, y: 350,
    facets: (s, n) => [facet("at Jev work", work(s, "atJev", n)), facet("request permits", s.dispatch.requests.map((x) => recordLabel("request", x.request, n)))] }),
  outcomes: square({ title: "Review outcomes", owner: "BEND DECISION", x: 310, y: 350,
    facets: (s, n) => [facet("finding work", work(s, "pendingFinding", n)), facet("ticket units", s.tickets.flatMap((x) => x.units).map((x) => `Ticket unit #${x.id}:${x.stage}`))] }),
  advice: square({ title: "Advice ready / retained", owner: "BEND STATE", x: 32, y: 350,
    facets: (s, n) => {
      const submitted = new Set(s.delivery.submissions.batches.filter((x) => x.phase === "submitted").map((x) => x.advice));
      return [facet("pending ready", s.collection.ready.filter((id) => !submitted.has(id)).map((id) => recordLabel("advice", id, n))), facet("retained submitted", s.collection.ready.filter((id) => submitted.has(id)).map((id) => recordLabel("advice", id, n))), facet("leases", s.collection.leases.map((x) => recordLabel("advice", x.advice, n)))];
    } }),
  collection: square({ title: "Advice collection", owner: "BEND DECISION", x: 32, y: 592,
    facets: (s, n) => [facet("waiting rounds", ids(s.rounds.filter((x) => x.waiting).map((x) => x.id), "Round")), facet("leases", s.collection.leases.map((x) => recordLabel("advice", x.advice, n))), facet("background claims", ids(s.collection.claims.map((x) => x.group), "Claim group"))] }),
  delivery: square({ title: "Host output", owner: "BEND + NATIVE EFFECT", x: 310, y: 592,
    facets: (s, n) => [facet("finish slots", s.delivery.slots.map((x) => `Finish group #${x.group}:${x.phase}`)), facet("pending advice", s.delivery.submissions.batches.filter((x) => x.phase === "reserved" || x.phase === "authorized").map((x) => `${recordLabel("advice", x.advice, n)}:${x.surface}:${x.phase}`)), facet("submitted advice", s.delivery.submissions.batches.filter((x) => x.phase === "submitted").map((x) => `${recordLabel("advice", x.advice, n)}:${x.surface}:${x.phase}`)), facet("uncertain advice", s.delivery.submissions.batches.filter((x) => x.phase === "uncertain").map((x) => `${recordLabel("advice", x.advice, n)}:${x.surface}:${x.phase}`))] }),
  round: square({ title: "Round state", owner: "BEND STATE", x: 588, y: 592,
    facets: (s) => [facet("active rounds", ids(s.rounds.map((x) => x.id), "Round")), facet("uncertain rounds", ids(s.rounds.filter((x) => x.uncertain).map((x) => x.id), "Round"))] }),
};
export const PLACE_ORDER = FLOW_STAGES;


/** Fixed edges describe possible presentation connections; they make no reducer decisions. */
export const CONNECTIONS = [
  { from: "observation", to: "admission", label: "Edit attempt or observation supplied" },
  { from: "admission", to: "sourcePending", label: "observation admitted as source work" },
  { from: "sourcePending", to: "scheduling", label: "source job scheduled", relation: "linked record" },
  { from: "units", to: "scheduling", label: "review job scheduled", relation: "linked record" },
  { from: "scheduling", to: "scheduling", label: "job scheduling status changes" },
  { from: "sourcePending", to: "preparation", label: "source read phase entered" },
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
