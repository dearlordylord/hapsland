import type { HtmlBuilder } from "foldkit/html";
import type { CanonicalCommand, CanonicalProjection } from "../../../src/canonical/adapter";
import type { ReplayStep } from "./canonical-replay";

type Place = "observation" | "admission" | "queued" | "preparation" | "units" |
  "authorization" | "effect" | "jev" | "outcomes" | "advice" | "collection" |
  "delivery" | "round";
type Route = { readonly from: Place; readonly to: Place; readonly label: string; readonly active: boolean };
const has = (commands: readonly CanonicalCommand[], ...kinds: CanonicalCommand["kind"][]) =>
  commands.some((command) => kinds.includes(command.kind));
const ids = (items: readonly number[]) => items.length ? items.map((id) => `#${id}`).join(", ") : "none";

/** A read-only projection. Every active route is keyed to a checked event or command. */
export const productionFlowView = <Message>(
  h: HtmlBuilder<Message>, projection: CanonicalProjection, last: ReplayStep | undefined,
) => {
  const commands = last?.rejection === undefined ? last?.commands ?? [] : [];
  const event = last?.rejection === undefined ? last?.event.kind : undefined;
  const stopEvent = event === "stopPolled" || event === "stopGroupPolled";
  const work = (kind: CanonicalProjection["work"][number]["kind"]) =>
    projection.work.filter((item) => item.kind === kind).map((item) => item.operation);
  const entries = (place: "pending" | "active" | "running") =>
    projection.dispatch[place].map((item, index) => `${index + 1}:#${item.operation}/agent ${item.partition}/seq ${item.sequence}`).join(", ") || "none";
  const requests = projection.dispatch.requests;
  const started = requests.filter((item) => item.started).map((item) => item.request);
  const issued = requests.filter((item) => !item.started).map((item) => item.request);
  const pendingAdvice = projection.collection.ready;
  const slots = projection.delivery.slots;
  const batches = projection.delivery.submissions.batches;
  const nodes: readonly { id: Place; title: string; owner: string; detail: string }[] = [
    { id: "observation", title: "Agent-runtime observation", owner: "NATIVE FACT", detail: `rounds ${ids(projection.rounds.map((item) => item.id))} · source queued ${ids(work("sourceQueued"))}` },
    { id: "admission", title: "Observation and capacity admission", owner: "BEND DECISION", detail: `observation charges ${projection.charges.filter((item) => item.purpose === "observationDispatch").length}` },
    { id: "queued", title: "Preparation queue", owner: "BEND STATE", detail: `pending ${entries("pending")} · active ${entries("active")}` },
    { id: "preparation", title: "Source preparation", owner: "NATIVE EFFECT + BEND STATE", detail: `running ${entries("running")} · source reading ${ids(work("sourceReading"))} · preparing ${ids(work("preparing"))}` },
    { id: "units", title: "Admitted review work items", owner: "BEND STATE", detail: `reviewing ${ids(work("reviewing"))} · unit charges ${projection.charges.filter((item) => item.purpose === "reviewUnit").length}` },
    { id: "authorization", title: "Ready check and Jev command", owner: "BEND DECISION", detail: `issued, not observed started ${ids(issued)}` },
    { id: "effect", title: "Native Jev effect attempt", owner: "NATIVE FACT", detail: `observed started requests ${ids(started)}` },
    { id: "jev", title: "Jev response", owner: "EXTERNAL FACT", detail: `at Jev work ${ids(work("atJev"))} · reserved request permits ${ids(requests.map((item) => item.request))}` },
    { id: "outcomes", title: "Review outcomes", owner: "BEND DECISION", detail: `pending finding operations ${ids(work("pendingFinding"))} · ticket units ${projection.tickets.flatMap((item) => item.units).map((item) => `#${item.id}:${item.stage}`).join(", ") || "none"}` },
    { id: "advice", title: "Pending advice", owner: "BEND STATE", detail: `ready ${ids(pendingAdvice)} · leases ${ids(projection.collection.leases.map((item) => item.advice))}` },
    { id: "collection", title: "Background or Stop collection", owner: "BEND DECISION", detail: `waiting rounds ${ids(projection.rounds.filter((item) => item.waiting).map((item) => item.id))}` },
    { id: "delivery", title: "Host output authorization and write", owner: "BEND + NATIVE EFFECT", detail: `finish ${slots.map((item) => `#${item.group}:${item.phase}`).join(", ") || "none"} · advice ${batches.map((item) => `#${item.advice}:${item.surface}:${item.phase}`).join(", ") || "none"}` },
    { id: "round", title: "Round continuation or closure", owner: "BEND STATE", detail: `active ${ids(projection.rounds.map((item) => item.id))} · uncertain ${ids(projection.rounds.filter((item) => item.uncertain).map((item) => item.id))}` },
  ];
  const routes: readonly Route[] = [
    { from: "observation", to: "admission", label: "observation supplied", active: event === "openRound" || event === "admitObservation" || event === "beginObservedPreparation" || event === "beginPreparation" },
    { from: "admission", to: "queued", label: "admit or refuse", active: has(commands, "observationAdmitted", "capacityGranted", "capacityRefused", "preparationRefused", "prepare") },
    { from: "queued", to: "preparation", label: "dispatch cycle starts", active: has(commands, "dispatchStarted", "observationStarted") },
    { from: "preparation", to: "units", label: "release; admit / refuse units in order", active: has(commands, "preparationReleased", "unitAdmitted", "unitRefused", "capacityUnitAdmitted", "capacityUnitRefused") },
    { from: "units", to: "authorization", label: "ready facts supplied", active: event === "jevRequestReady" },
    { from: "authorization", to: "effect", label: "Jev request commanded", active: has(commands, "jevRequestIssued") },
    { from: "authorization", to: "outcomes", label: "immediate unavailable / command refused", active: has(commands, "jevRequestUnavailable", "reviewRecorded") && event === "jevRequestReady" },
    { from: "effect", to: "jev", label: "attempt observed", active: has(commands, "jevRequestStartRecorded") },
    { from: "authorization", to: "outcomes", label: "command never sent", active: event === "jevRequestSettled" && last?.event.kind === "jevRequestSettled" && last.event.outcome === "neverSent" && has(commands, "jevRequestOutcomeRecorded") },
    { from: "effect", to: "outcomes", label: "attempt interrupted / cancelled", active: has(commands, "jevInterruptionRecorded") || (event === "jevRequestSettled" && last?.event.kind === "jevRequestSettled" && last.event.outcome === "interrupted") || (event === "reviewCompleted" && last?.event.kind === "reviewCompleted" && last.event.outcome === "interrupted") },
    { from: "effect", to: "outcomes", label: "native failure or timeout fact", active: (event === "jevRequestSettled" && last?.event.kind === "jevRequestSettled" && (last.event.outcome === "backendFailure" || last.event.outcome === "timeout")) || (event === "reviewCompleted" && last?.event.kind === "reviewCompleted" && (last.event.outcome === "unavailable" || last.event.outcome === "discarded")) },
    { from: "jev", to: "outcomes", label: "external finding or clear response supplied", active: (event === "jevRequestSettled" && last?.event.kind === "jevRequestSettled" && (last.event.outcome === "finding" || last.event.outcome === "clear")) || (event === "reviewCompleted" && last?.event.kind === "reviewCompleted" && (last.event.outcome === "finding" || last.event.outcome === "clear")) || event === "reviewObserved" },
    { from: "outcomes", to: "advice", label: "finding retained", active: has(commands, "retainFinding", "collectionFindingRetained") },
    { from: "outcomes", to: "round", label: "clear / stale / unavailable", active: has(commands, "settleClear", "settleStaleClear", "retireStaleFinding", "failureBackend", "reviewRecorded") },
    { from: "advice", to: "collection", label: "background or Stop select", active: has(commands, "collectionEligible", "collectionWaiting", "collectionBackgroundClaimed", "collectionFindingSelected", "finishReserved") },
    { from: "collection", to: "collection", label: "Stop waits for work or output", active: has(commands, "waitForWork", "waitForOutput") },
    { from: "collection", to: "preparation", label: "Stop cancels unfinished work", active: stopEvent && has(commands, "cancelWork", "discardAllUnfinished", "discardNamedOnly") },
    { from: "collection", to: "round", label: "Stop decision ready or allow finish", active: has(commands, "finishReady", "finishAllowedNoAdvice", "finishAllowedDeadline", "finishAllowedUnavailable") },
    { from: "collection", to: "delivery", label: "authorize output", active: has(commands, "finishAuthorized", "submissionAuthorized", "writeAuthorized") },
    { from: "delivery", to: "round", label: "terminal fact / reoffer / continue", active: has(commands, "finishRecorded", "writeRecorded", "submissionRecorded", "reofferAtStop", "continuationConsumed", "finishEnded", "finishAllowedDeadline", "finishAllowedNoAdvice") },
  ];
  const activePlaces = new Set(routes.filter((route) => route.active).flatMap((route) => [route.from, route.to]));
  const finishBranches = [
    { label: "Wait for work", active: has(commands, "waitForWork", "collectionWaiting") },
    { label: "Decision ready", active: has(commands, "finishReady", "reofferAtStop") },
    { label: "Continue with advice", active: has(commands, "finishAuthorized", "continuationConsumed") },
    { label: "Allow finish", active: has(commands, "finishAllowedNoAdvice", "finishAllowedDeadline", "finishAllowedUnavailable") },
    { label: "Cancel unfinished work", active: stopEvent && has(commands, "cancelWork", "discardAllUnfinished", "discardNamedOnly") },
  ];
  return h.div([h.Class("production-topology")], [
    h.p([h.Class("flow-legend")], ["Blue: Bend state or decision · gray: native fact/effect · gold: external Jev fact. Orange arrows and borders mark routes from this accepted canonical step."]),
    h.div([h.Class("topology-grid")], nodes.map((node) => h.div([
      h.Class(`topology-node ${activePlaces.has(node.id) ? "active" : ""}`),
    ], [
      h.small([], [node.owner]), h.strong([], [node.title]), h.p([], [node.detail]),
    ]))),
    h.div([h.Class("topology-routes")], routes.map((route) => h.div([
      h.Class(`topology-route ${route.active ? "active" : ""}`),
    ], [
      h.span([h.Class("route-origin")], [nodes.find((node) => node.id === route.from)?.title ?? route.from]),
      h.span([h.Class("route-arrow")], ["→"]),
      h.span([h.Class("route-destination")], [nodes.find((node) => node.id === route.to)?.title ?? route.to]),
      h.small([], [route.label]),
    ]))),
    h.div([h.Class("finish-decision")], [
      h.strong([], ["Stop finish decision · canonical branches"]),
      h.p([], ["Bend chooses from supplied deadline, work, collection, and output facts. Host output is a separate native effect."]),
      h.div([h.Class("finish-branches")], finishBranches.map((branch) => h.div([
        h.Class(`finish-branch ${branch.active ? "active" : ""}`),
      ], [h.span([], ["Stop collection"]), h.span([h.Class("route-arrow")], ["→"]), h.strong([], [branch.label])]))),
    ]),
    h.div([h.Class("topology-capacities")], [
      h.strong([], ["Three separate limits"]),
      h.span([], [`Preparation running: ${projection.dispatch.running.filter((item) => item.preparation).length}/${projection.executionLimits.preparation}`]),
      h.span([], [`Jev in-flight: ${requests.length}/${projection.executionLimits.jevRequests} · no Jev wait queue`]),
      h.span([], [`Review capacity ledger: ${projection.global.items}/${projection.limits.globalItems} items; ${projection.global.bytes}/${projection.limits.globalBytes} bytes`]),
    ]),
    h.div([h.Class("topology-step")], [
      h.strong([], ["Inspectable decision"]),
      h.p([], [last === undefined ? "Choose a guided or manual canonical event." : last.rejection !== undefined
        ? `${last.event.kind} rejected: ${last.rejection}. Canonical state and item locations did not change.`
        : `${last.event.kind} accepted · ${commands.length} command(s): ${commands.map((command) => command.kind).join(", ") || "none"}`]),
      h.p([], ["A Jev command authorizes an attempt; only a request-start fact records an attempt. A submitted host output does not establish agent receipt or use."]),
      h.p([], [`Branches at this step: ${commands.filter((command) => /Refused|Unavailable|Interrupted|Ignored|Stale|Cancel|Clear|Finding|Waiting|Allowed|Expired|Lease|Reoffer|Unknown|Recorded|Terminal/.test(command.kind)).map((command) => command.kind).join(", ") || "none"}.`]),
    ]),
  ]);
};
