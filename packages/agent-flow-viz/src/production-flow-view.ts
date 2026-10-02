import { executionPoolsView } from "./execution-pools-view";
import { residentCapacityInset } from "./resident-capacity-inset";
import type { AgentScope } from "./shared-resident-view";
import { adviceePermitLimit } from "./resource-details";
import type { CapacityMetadata } from "../../monkey-business/src/index";
import { Option } from "effect";
import { preparationMini, type PreparationSnapshot } from "./preparation-mini";
import type { HtmlBuilder } from "foldkit/html";
import type { CanonicalCommand, CanonicalProjection } from "../../../src/canonical/adapter";
import type { ReplayStep } from "./canonical-replay";
import { findingLineage, projectFlowStep, recordLabel, type FlowEvidence, type RecordNumbers } from "@hapsland/agent-flow-projection";
import { CONNECTIONS, PLACE_ORDER, SQUARES, squareFacetLine, squareFacetFontSize } from "./production-flow-presentation";

type ArrowKind = FlowEvidence["source"] | "possible" | "mixed" | "mixed external";
type Route = (typeof CONNECTIONS)[number] & Readonly<{ active: boolean; kind: ArrowKind; linked: boolean; evidence: string }>;
const unreachable = (value: never): never => { throw new Error(`unknown arrow kind: ${String(value)}`); };
const arrowKind = (evidence: readonly FlowEvidence[]): ArrowKind => {
  if (evidence.length === 0) return "possible";
  let command = false;
  let external = false;
  let native = false;
  for (const item of evidence) {
    switch (item.source) {
      case "command": command = true; break;
      case "external fact": external = true; break;
      case "native fact": native = true; break;
      case "state": break;
      default: unreachable(item.source);
    }
  }
  if (command && evidence.some((item) => item.source !== "command")) return external ? "mixed external" : "mixed";
  if (command) return "command";
  if (external) return "external fact";
  return native ? "native fact" : "state";
};
const arrowPaint = (kind: ArrowKind) => {
  switch (kind) {
    case "possible": return { color: "#91a4ba", dashed: false, overlay: false, external: false, command: false };
    case "state": case "native fact": return { color: "#e66035", dashed: false, overlay: false, external: false, command: false };
    case "external fact": return { color: "#8a5a00", dashed: false, overlay: false, external: true, command: false };
    case "command": return { color: "#794aa0", dashed: true, overlay: false, external: false, command: true };
    case "mixed": return { color: "#e66035", dashed: false, overlay: true, external: false, command: false };
    case "mixed external": return { color: "#8a5a00", dashed: false, overlay: true, external: true, command: false };
    default: return unreachable(kind);
  }
};
const has = (commands: readonly CanonicalCommand[], ...kinds: CanonicalCommand["kind"][]) =>
  commands.some((command) => kinds.includes(command.kind));

const NODE_WIDTH = 224;
const NODE_HEIGHT = 116;
const PLACES = SQUARES;
const arrowHead = (tip: { readonly x: number; readonly y: number }, toward: { readonly x: number; readonly y: number }) => {
  const length = Math.hypot(toward.x, toward.y);
  const ux = toward.x / length;
  const uy = toward.y / length;
  const bx = tip.x - ux * 12;
  const by = tip.y - uy * 12;
  return `M ${tip.x} ${tip.y} L ${bx - uy * 6} ${by + ux * 6} L ${bx + uy * 6} ${by - ux * 6} Z`;
};
const routeGeometry = (route: Route, offset: number) => {
  const from = PLACES[route.from];
  const to = PLACES[route.to];
  const fx = from.x + NODE_WIDTH / 2;
  const fy = from.y + NODE_HEIGHT / 2;
  if (route.from === "collection" && route.to === "collection") {
    const x = from.x + NODE_WIDTH / 2;
    const y = from.y;
    const high = 535;
    const shift = 23;
    return { path: `M ${x + shift - 42} ${y - 9} C ${x + shift - 65} ${high}, ${x + shift + 65} ${high}, ${x + shift + 42} ${y - 9}`,
      badge: { x: x + shift, y: high + 14 }, tip: { x: x + shift + 42, y: y - 9 }, toward: { x: -1, y: 1 } };
  }
  if (route.from === "delivery" && route.to === "delivery") {
    const x = from.x + NODE_WIDTH / 2;
    const y = from.y + NODE_HEIGHT;
    return { path: `M ${x - 40} ${y + 9} C ${x - 65} ${y + 70}, ${x + 65} ${y + 70}, ${x + 40} ${y + 9}`,
      badge: { x, y: y + 57 }, tip: { x: x + 40, y: y + 9 }, toward: { x: -1, y: -1 } };
  }
  if (route.from === "outcomes" && route.to === "outcomes") {
    const x = from.x + NODE_WIDTH / 2;
    const y = from.y + NODE_HEIGHT;
    return { path: `M ${x - 45} ${y + 9} C ${x - 58} ${y + 75}, ${x + 58} ${y + 75}, ${x + 45} ${y + 9}`,
      badge: { x, y: y + 59 }, tip: { x: x + 45, y: y + 9 }, toward: { x: -1, y: -1 } };
  }
  if (route.from === "round" && route.to === "round") {
    const x = from.x + NODE_WIDTH;
    const y = from.y + NODE_HEIGHT / 2;
    return { path: `M ${x + 9} ${y - 35} C ${x + 100} ${y - 70}, ${x + 100} ${y + 70}, ${x + 9} ${y + 35}`,
      badge: { x: x + 85, y }, tip: { x: x + 9, y: y + 35 }, toward: { x: -1, y: 0 } };
  }
  if (route.from === "scheduling" && route.to === "scheduling") {
    const x = from.x + NODE_WIDTH + 9;
    const y = from.y + NODE_HEIGHT / 2;
    return { path: `M ${x} ${y - 33} C ${x + 58} ${y - 65}, ${x + 58} ${y + 65}, ${x} ${y + 33}`,
      badge: { x: x + 31, y }, tip: { x, y: y + 33 }, toward: { x: -1, y: 0 } };
  }
  if (route.from === route.to) {
    const x = from.x + NODE_WIDTH - 18;
    const y = from.y + NODE_HEIGHT;
    return { path: `M ${x - 22} ${y} C ${x - 20} ${y + 100}, ${x + 44} ${y + 100}, ${x + 28} ${y - 2}`,
      badge: { x: x + 7, y: y + 71 }, tip: { x: x + 28, y: y - 9 }, toward: { x: 0, y: -1 } };
  }
  if (route.from === "admission" && route.to === "preparation") {
    const startX = from.x + NODE_WIDTH + 9;
    const laneX = startX + 17;
    const laneY = 177;
    const endLaneX = to.x - 36;
    const endX = to.x - 9;
    const endY = to.y + NODE_HEIGHT / 2;
    return { path: `M ${startX} ${from.y + NODE_HEIGHT / 2} L ${laneX} ${from.y + NODE_HEIGHT / 2} L ${laneX} ${laneY} L ${endLaneX} ${laneY} L ${endLaneX} ${endY} L ${endX} ${endY}`,
      badge: { x: 750, y: laneY }, tip: { x: endX, y: endY }, toward: { x: 1, y: 0 } };
  }
  if (route.from === "sourcePending" && route.to === "preparation") {
    const startX = from.x + NODE_WIDTH / 2;
    const laneX = to.x - 36;
    const startY = from.y + NODE_HEIGHT + 9;
    const laneY = 330;
    const endX = to.x - 9;
    const endY = to.y + NODE_HEIGHT / 2;
    return { path: `M ${startX} ${startY} L ${startX} ${laneY} L ${laneX} ${laneY} L ${laneX} ${endY} L ${endX} ${endY}`,
      badge: { x: 775, y: laneY }, tip: { x: endX, y: endY }, toward: { x: 1, y: 0 } };
  }
  if (route.from === "units" && route.to === "scheduling") {
    const startX = from.x + NODE_WIDTH / 2;
    const y = 325;
    const laneX = to.x + NODE_WIDTH + 36;
    const endX = to.x + NODE_WIDTH + 9;
    const endY = to.y + NODE_HEIGHT / 2;
    return { path: `M ${startX} ${from.y + NODE_HEIGHT + 9} L ${startX} ${y} L ${laneX} ${y} L ${laneX} ${endY} L ${endX} ${endY}`,
      badge: { x: 1060, y }, tip: { x: endX, y: endY }, toward: { x: -1, y: 0 } };
  }
  if (route.from === "units" && route.to === "jev") {
    const startX = from.x + NODE_WIDTH / 2;
    const endX = to.x + NODE_WIDTH / 2;
    return { path: `M ${startX} ${from.y + NODE_HEIGHT + 9} L 1118 ${from.y + NODE_HEIGHT + 9} L 1118 334 L ${endX} 334 L ${endX} ${to.y - 9}`,
      badge: { x: 950, y: 334 }, tip: { x: endX, y: to.y - 9 }, toward: { x: 0, y: 1 } };
  }
  if (route.from === "collection" && route.to === "preparation") {
    const y = from.y + NODE_HEIGHT / 2;
    const targetX = to.x + NODE_WIDTH / 2;
    return { path: `M ${from.x - 9} ${y} L 12 ${y} L 12 22 L ${targetX} 22 L ${targetX} ${to.y - 9}`,
      badge: { x: 740, y: 22 }, tip: { x: targetX, y: to.y - 9 }, toward: { x: 0, y: 1 } };
  }
  if (route.from === "collection" && route.to === "round") {
    const startX = from.x + NODE_WIDTH / 2;
    const endX = to.x + NODE_WIDTH / 2;
    return { path: `M ${startX} ${from.y + NODE_HEIGHT} L ${startX} 742 L ${endX} 742 L ${endX} ${to.y + NODE_HEIGHT + 9}`,
      badge: { x: 560, y: 742 }, tip: { x: endX, y: to.y + NODE_HEIGHT + 9 }, toward: { x: 0, y: -1 } };
  }
  if (route.from === "authorization" && route.to === "outcomes") {
    const lane = 515 + offset;
    return { path: `M ${from.x} ${fy + offset} C 970 ${lane}, 680 ${lane}, ${to.x + NODE_WIDTH + 9} ${to.y + NODE_HEIGHT - 12 + offset}`,
      badge: { x: 775, y: lane }, tip: { x: to.x + NODE_WIDTH + 9, y: to.y + NODE_HEIGHT - 12 + offset }, toward: { x: -1, y: -1 } };
  }
  if (route.from === "effect" && route.to === "outcomes") {
    const lane = 475 + offset;
    return { path: `M ${from.x} ${fy + offset} C 760 ${lane}, 645 ${lane}, ${to.x + NODE_WIDTH + 9} ${to.y + NODE_HEIGHT - 18 + offset}`,
      badge: { x: 655, y: lane }, tip: { x: to.x + NODE_WIDTH + 9, y: to.y + NODE_HEIGHT - 18 + offset }, toward: { x: -1, y: -1 } };
  }
  const tx = to.x + NODE_WIDTH / 2;
  const ty = to.y + NODE_HEIGHT / 2;
  const dx = tx - fx;
  const dy = ty - fy;
  const horizontal = Math.abs(dx) > Math.abs(dy);
  const start = horizontal
    ? { x: fx + Math.sign(dx) * (NODE_WIDTH / 2 + 9), y: fy + offset }
    : { x: fx + offset, y: fy + Math.sign(dy) * (NODE_HEIGHT / 2 + 9) };
  const end = horizontal
    ? { x: tx - Math.sign(dx) * (NODE_WIDTH / 2 + 9), y: ty + offset }
    : { x: tx + offset, y: ty - Math.sign(dy) * (NODE_HEIGHT / 2 + 9) };
  const bend = Math.abs(offset) > 0 ? offset * 1.8 : 0;
  const path = horizontal
    ? `M ${start.x} ${start.y} C ${(start.x + end.x) / 2} ${start.y + bend}, ${(start.x + end.x) / 2} ${end.y + bend}, ${end.x} ${end.y}`
    : `M ${start.x} ${start.y} C ${start.x + bend} ${(start.y + end.y) / 2}, ${end.x + bend} ${(start.y + end.y) / 2}, ${end.x} ${end.y}`;
  return { path, badge: { x: (start.x + end.x) / 2 + (horizontal ? 0 : bend),
    y: (start.y + end.y) / 2 + (horizontal ? bend : 0) },
    tip: end, toward: horizontal ? { x: Math.sign(dx), y: 0 } : { x: 0, y: Math.sign(dy) } };
};

/** A read-only projection. Every active route is keyed to a checked event or command. */
/** Topology annotations, not additional states or observed traffic. */
export const INFRASTRUCTURE_CONTACTS = [
  { id: "capacity", stage: "admission", x: SQUARES.admission.x + NODE_WIDTH / 2, y: 40, edgeY: SQUARES.admission.y,
    labelY: 0, title: "Resident capacity", scope: "one shared resident ledger", color: "#168f83" },
  { id: "jev", stage: "effect", x: SQUARES.effect.x + NODE_WIDTH / 2, y: 490, edgeY: SQUARES.effect.y + NODE_HEIGHT,
    labelY: 502, title: "Jev backend", scope: "shared permits · simulated responses", color: "#b17a22" },
] as const;

export const productionFlowView = <Message>(
  h: HtmlBuilder<Message>, projection: CanonicalProjection, last: ReplayStep | undefined,
  showcase: boolean,
  inspect?: (place: (typeof PLACE_ORDER)[number]) => Message,
  preparation: PreparationSnapshot = {},
  numbers?: RecordNumbers,
  infrastructure = false,
  resident: CanonicalProjection = projection,
  metadata?: CapacityMetadata,
  partition?: number,
  selected?: { readonly group?: number; readonly round?: number },
  agents?: readonly AgentScope[],
) => {
  if (selected?.group !== undefined && ![...resident.delivery.slots.map(s => s.group), ...resident.delivery.counters.map(c => c.group), ...resident.collection.claims.map(c => c.group), ...(metadata?.deliveryGroups ?? []).map(binding => binding.group)].includes(selected.group)) selected = { ...selected, group: undefined };
  const commands = last?.rejection === undefined ? last?.commands ?? [] : [];
  const event = last?.rejection === undefined ? last?.event.kind : undefined;
  const consumed = commands.find((command) => command.kind === "permitConsumed");
  const editAccepted = event === "consumePermit" && last?.event.kind === "consumePermit" && consumed?.kind === "permitConsumed"
    ? { tool: last.event.tool, token: last.event.token, round: consumed.round } : undefined;
  const issuedPermit = commands.find((command) => command.kind === "permitIssued");
  const startedRound = commands.find((command) => command.kind === "roundStarted");
  const admittedSource = commands.find((command) => command.kind === "observationAdmitted");
  const stopEvent = event === "stopPolled" || event === "stopGroupPolled";
  const requests = projection.dispatch.requests;
  const flow = projectFlowStep(last && last.event.kind !== "preparationGraph" ? { ...last, event: last.event } : undefined, numbers);
  const sourceCompletion = flow.sourceCompletion;
  const sourceLabel = sourceCompletion === undefined ? undefined
    : recordLabel("source", sourceCompletion.observation, numbers).split("/")[0];
  const linkedReviewStatus = sourceCompletion?.linkedReviews.map((work) =>
    `${recordLabel("review", work.operation, numbers).split("/")[0]} ${work.kind === "reviewing" ? "continues" : work.kind === "atJev" ? "awaits Jev" : "has a retained finding"}`) ?? [];
  const completionContext = sourceCompletion === undefined ? undefined : [
    linkedReviewStatus.length > 0 ? linkedReviewStatus.join(", ") : "no linked review work remains",
    sourceCompletion.jobRunning ? "source preparation job still marked running" : "source preparation job already settled",
  ].join("; ");
  const storedResultConversion = flow.storedResultConversions[0];
  const storedResultTransition = storedResultConversion === undefined ? undefined
    : `${recordLabel("charge:reviewUnit", storedResultConversion.charge, numbers).split("/")[0]} → stored`;
  const clearedReviewLabel = flow.clearedReview === undefined ? undefined
    : recordLabel("review", flow.clearedReview, numbers).split("/")[0];
  const retainedOperation = (last?.event.kind === "jevRequestSettled" ||
    last?.event.kind === "reviewCompleted" || last?.event.kind === "reviewObserved") &&
    commands.some((command) => command.kind === "retainFinding")
    ? last.event.operation : undefined;
  const retainedFindingLabel = retainedOperation === undefined ? undefined
    : recordLabel("review", retainedOperation, numbers).split("/")[0];
  const retainedFinding = retainedOperation === undefined ? undefined
    : findingLineage(projection).find((item) => item.operation === retainedOperation);
  const waitingReview = retainedFinding?.unfinished.length === 1 &&
    (retainedFinding.unfinished[0].kind === "reviewing" || retainedFinding.unfinished[0].kind === "atJev")
    ? recordLabel("review", retainedFinding.unfinished[0].operation, numbers).split("/")[0] : undefined;
  const retainMarker = retainedFindingLabel === undefined ? undefined : waitingReview === undefined
    ? `CMD · retain finding for ${retainedFindingLabel}`
    : `CMD · retain ${retainedFindingLabel.replace("Review item", "Review")}; waits for ${waitingReview.replace("Review item ", "")}`;
  const markedReady = last?.event.kind === "collectionReady" &&
    !last.before.collection.ready.includes(last.event.advice) &&
    projection.collection.ready.includes(last.event.advice)
    ? recordLabel("advice", last.event.advice, numbers).split("/")[0] + " ← " +
      recordLabel("review", last.event.advice, numbers).split("/")[0] : undefined;
  const stepCaption = last?.rejection !== undefined ? undefined : (() => {
    const newLeases = (projection.collection.leases.length - (last?.before.collection.leases.length ?? 0));
    if (last?.event.kind === "collectionReserveLease" && newLeases > 1)
      return `${newLeases} advice groups leased for one Stop output; no output slot is reserved yet.`;
    const newRecords = projection.delivery.submissions.batches.length - (last?.before.delivery.submissions.batches.length ?? 0);
    if (last?.event.kind === "submissionBegin" && newRecords > 1)
      return `${newRecords} advice records staged for one Stop output; no host write is established.`;
    const newlyInPhase = (phase: string) => projection.delivery.submissions.batches.filter((batch) =>
      batch.phase === phase && last?.before.delivery.submissions.batches.some((prior) =>
        prior.advice === batch.advice && prior.token === batch.token && prior.phase !== phase)).length;
    if (last?.event.kind === "finishAuthorize" && newlyInPhase("authorized") > 1)
      return `${newlyInPhase("authorized")} advice records and their Stop output authorized together; no host write is established.`;
    if (last?.event.kind === "finishTerminal" && newlyInPhase("submitted") > 1)
      return `${newlyInPhase("submitted")} advice submissions and one Stop result recorded together as acknowledged; agent use of advice is not observed.`;
    if (last?.event.kind === "stopPolled" && has(commands, "finishReady")) return "Stop decision ready; this step does not reserve or send output.";
    if (last?.event.kind === "collectionReserveLease" && has(commands, "collectionLeaseReserved"))
      return `${recordLabel("advice", last.event.advice, numbers).split("/")[0]} leased for collection${projection.collection.ready.includes(last.event.advice) ? "; still ready" : ""}.`;
    if (last?.event.kind === "finishReserve" && has(commands, "finishReserved"))
      return `Stop output slot reserved for ${last.event.selected.length} selected advice groups; output is not yet authorized.`;
    if (last?.event.kind === "submissionBegin" && has(commands, "submissionBegun")) {
      const { advice, token, surface } = last.event;
      const phase = projection.delivery.submissions.batches.find((batch) =>
        batch.advice === advice && batch.token === token)?.phase;
      return `${recordLabel("advice", advice, numbers).split("/")[0]} submission ${phase ?? "begun"} for ${surface === "stop" ? "Stop" : surface} output; no host write is established.`;
    }
    if (last?.event.kind === "finishAuthorize" && has(commands, "finishAuthorized"))
      return "Stop output authorized; no host write is established.";
    if (last?.event.kind === "submissionAuthorize" && has(commands, "submissionAuthorized"))
      return `${recordLabel("advice", last.event.advice, numbers).split("/")[0]} submission authorized; acknowledgment remains to be checked.`;
    if (last?.event.kind === "deliveryAcknowledgeCheck" && has(commands, "deliveryAckReady"))
      return `Acknowledgment gate passed for ${last.event.items} items; no host write is observed by this step.`;
    if (last?.event.kind === "submissionTerminal" && has(commands, "submissionRecorded"))
      return `${recordLabel("advice", last.event.advice, numbers).split("/")[0]} submission recorded as ${last.event.certain ? "certain" : "uncertain"}.`;
    if (last?.event.kind === "finishTerminal" && commands.some((command) => command.kind === "finishRecorded"))
      return `Stop result recorded as ${last.event.outcome}; agent use of advice is not observed.`;
    return undefined;
  })();
  const changedStages = last?.preparation ? ["preparation", ...flow.changedStages] : flow.changedStages;
  const declaredRoutes = new Set(CONNECTIONS.map(({ from, to }) => `${from}:${to}`));
  if (declaredRoutes.size !== CONNECTIONS.length) throw new Error("duplicate dashboard arrow route");
  const unmapped = flow.evidence.filter(item => !declaredRoutes.has(`${item.from}:${item.to}`));
  const nodes = PLACE_ORDER.map((id) => ({ id, ...SQUARES[id], detail: SQUARES[id].detail(projection, numbers), facets: SQUARES[id].facets(projection, numbers) }));
  const routes: readonly Route[] = CONNECTIONS.map((connection): Route => {
    const evidence = flow.evidence.filter((item) => item.from === connection.from && item.to === connection.to);
    return { ...connection, active: evidence.length > 0, kind: arrowKind(evidence),
      linked: "relation" in connection && connection.relation === "linked record",
      evidence: evidence.map((item) => `${item.relation ?? item.source}: ${item.description}`).join("; ") };
  });
  const routeMultiplicity = new Map<string, number>();
  const routeOffsets = routes.map((route) => {
    const key = `${route.from}:${route.to}`;
    const index = routeMultiplicity.get(key) ?? 0;
    routeMultiplicity.set(key, index + 1);
    return index;
  });
  const finishBranches = [
    { label: "Wait for work", active: has(commands, "waitForWork", "collectionWaiting") },
    { label: "Decision ready", active: has(commands, "finishReady", "reofferAtStop") },
    { label: "Advice output authorized", active: has(commands, "finishAuthorized") },
    { label: "Continuation consumed", active: has(commands, "continuationConsumed") },
    { label: "Allow finish", active: has(commands, "finishAllowedNoAdvice", "finishAllowedDeadline", "finishAllowedUnavailable") },
    { label: "Cancel unfinished work", active: stopEvent && has(commands, "cancelWork", "discardAllUnfinished", "discardNamedOnly") },
  ];
  return h.div([h.Class("production-topology")], [
    h.p([h.Class("flow-legend")], ["Blue: state or decision · Gray: external work · Gold: Jev result · Orange: transition · Orange dotted: linked work and job with the same ID · Purple dashed: command"]),
    h.div([h.Class("topology-scroll")], [
      h.svg([h.ViewBox("0 0 1400 830"), h.Role(inspect ? "group" : "img"),
        h.AriaLabel("Connected production flow from agent edit through Jev review to advice and round decision")], [
        executionPoolsView(h, resident, agents, inspect),
        ...routes.map((route, index) => {
          const same = routeMultiplicity.get(`${route.from}:${route.to}`) ?? 1;
          const offset = (routeOffsets[index] - (same - 1) / 2) * 18;
          const { path, badge, tip, toward } = routeGeometry(route, offset);
          const paint = arrowPaint(route.kind);
          const color = paint.color;
          return h.g([h.Class(`topology-route ${route.active ? "active" : ""} ${paint.external ? "external" : ""}`)], [
            h.title([], [`${index + 1}. ${nodes.find((node) => node.id === route.from)?.title} → ${nodes.find((node) => node.id === route.to)?.title}: ${route.active ? route.evidence : `possible: ${route.label}`}`]),
            h.path([h.D(path), h.Fill("none"), h.Stroke(color),
              h.StrokeWidth(route.active ? "4" : "2"),
              ...(paint.dashed ? [h.StrokeDasharray("7 5")] : route.linked ? [h.StrokeDasharray("2 6")] : [])], []),
            ...(paint.overlay ? [h.path([h.D(path), h.Fill("none"), h.Stroke("#794aa0"), h.StrokeWidth("2"), h.StrokeDasharray("7 5")], [])] : []),
            h.path([h.D(arrowHead(tip, toward)), h.Fill(color)], []),
            h.circle([h.Cx(String(badge.x)), h.Cy(String(badge.y)), h.R("11"),
              h.Fill(route.active ? color : "#fff"), h.Stroke(color)], []),
            h.text([h.X(String(badge.x)), h.Y(String(badge.y + 1)), h.TextAnchor("middle"),
              h.DominantBaseline("middle"), h.FontSize("10"), h.FontWeight("700"),
              h.Fill(route.active ? "#fff" : "#485b73")], [String(index + 1)]),
          ]);
        }),
        ...nodes.map((node) => {
          const point = PLACES[node.id];
          const palette = node.owner.includes("NATIVE") ? { fill: "#edf1f6", stroke: "#7d8da2" }
            : { fill: "#e9f1ff", stroke: "#547dc0" };
          return h.g([h.Class(`topology-node ${changedStages.includes(node.id) ? "active" : ""}`), ...(inspect ? [h.Role("button"), h.Tabindex(0), h.AriaLabel(`Inspect ${node.title}`), h.OnClick(inspect(node.id)),
              h.OnKeyDownSelfPreventDefault(key => key === "Enter" || key === " " ? Option.some(inspect(node.id)) : Option.none())] : [])], [
            h.title([], [`${node.title}: ${node.detail}${node.id === "admission" ? [storedResultTransition, issuedPermit?.kind === "permitIssued" ? `Permit #${issuedPermit.token} issued` : undefined, editAccepted ? `Permit #${editAccepted.token} used` : undefined].filter(Boolean).map(fact => ` · NOW: ${fact}`).join("") : ""}`]),
            h.rect([h.X(String(point.x)), h.Y(String(point.y)), h.Width(String(NODE_WIDTH)),
              h.Height(String(node.id === "preparation" ? 270 : NODE_HEIGHT)), h.Rx("12"), h.Fill(palette.fill),
              h.Stroke(palette.stroke), h.StrokeWidth(changedStages.includes(node.id) ? "4" : "2")], []),
            h.text([h.X(String(point.x + 13)), h.Y(String(point.y + 25)), h.FontSize("10"),
              h.FontWeight("700"), h.Fill("#52647d")], [node.owner]),
            h.text([h.X(String(point.x + 13)), h.Y(String(point.y + 49)), h.FontSize("14"),
              h.FontWeight("700"), h.Fill("#1e3048")], [node.title]),
            ...(node.id === "admission" || node.id === "effect" ? [] : node.id === "scheduling" ? node.facets.filter((_, index) => index !== 2) : node.id === "round" ? node.facets.slice(0, 2) : node.id === "collection" ? node.facets.slice(0, 2) : node.id === "delivery" ? node.facets.slice(1) : node.facets).map((facet, index) =>
              h.text([h.X(String(point.x + 13)), h.Y(String(point.y + 69 + (index + (node.id === "delivery" ? 1 : 0)) * 13)), h.FontSize(squareFacetFontSize(facet)), h.FontWeight("600"), h.Class("topology-facet"),
                h.Fill("#435670")], [squareFacetLine(facet)])),
            ...(node.id === "effect" ? [
              h.text([h.X(String(point.x+13)),h.Y(String(point.y+69)),h.FontSize("10"),h.Fill("#435670")],[`Shared Jev permits: ${resident.dispatch.requests.length} / ${resident.executionLimits.jevRequests}`]),
              h.text([h.X(String(point.x+13)),h.Y(String(point.y+91)),h.FontSize("10"),h.Fill("#435670")],[`This agent: ${projection.dispatch.requests.filter(request=>request.started && (partition === undefined || request.partition === partition)).length} started`]),
            ] : []),
            ...(node.id === "collection" ? (() => {
              const used = resident.collection.claims.length;
              const maximum = metadata?.collectors?.capacity;
              const description = `Shared background collectors: ${maximum === undefined ? `${used} used; limit not recorded` : `${used} of ${maximum}`}`;
              return [h.g([h.Class("collection-shared-collectors"), h.Role("img"), h.AriaLabel(description)], [
                h.title([], [description, ...resident.collection.claims.map(claim => ` · Group ${claim.group} · collector token ${claim.owner}`)]),
                h.text([h.X(String(point.x + 13)), h.Y(String(point.y + 95)), h.FontSize("9"), h.Fill("#435670")], [maximum === undefined ? `Collectors ${used} · max unknown` : `Collectors · shared ${used}/${maximum}`]),
                ...(maximum === undefined ? [] : [
                  h.rect([h.X(String(point.x + 154)), h.Y(String(point.y + 89)), h.Width("57"), h.Height("5"), h.Fill("#dce5f0")], []),
                  h.rect([h.Class("collection-collector-fill"), h.X(String(point.x + 154)), h.Y(String(point.y + 89)), h.Width(String(Math.min(57, maximum > 0 ? used / maximum * 57 : 0))), h.Height("5"), h.Fill("#168f83")], []),
                ]),
              ])];
            })() : []),
            ...(node.id === "delivery" ? [h.text([h.X(String(point.x + 13)), h.Y(String(point.y + 69)), h.FontSize("9"), h.Fill("#435670")], [selected?.group === undefined ? "Output slot · select group in inspector" : `Group ${selected.group} · ${resident.delivery.slots.some(s => s.group === selected.group) ? "occupied" : "free"}`])] : []),
            ...(node.id === "round" ? (() => {
              if (selected?.round === undefined || !projection.rounds.some(r => r.id === selected.round) || selected.group === undefined || metadata?.continuationBudget === undefined)
                return [h.text([h.X(String(point.x + 13)), h.Y(String(point.y + 95)), h.FontSize("9"), h.Fill("#435670")], ["Continuation budget · select round/group"])];
              const used = resident.delivery.counters.find(c => c.group === selected.group && c.round === selected.round)?.used ?? 0;
              return [h.text([h.X(String(point.x + 13)), h.Y(String(point.y + 95)), h.FontSize("9"), h.Fill("#435670")], [`Selected round · ${used}/4 used`]), ...Array.from({length:4}, (_, index) => h.rect([h.X(String(point.x + 152 + index*15)), h.Y(String(point.y + 88)), h.Width("10"), h.Height("8"), h.Fill(index < used ? "#427bc4" : "#dce5f0")], []))];
            })() : []),
            ...(node.id === "scheduling" || node.id === "jev" ? [h.text([h.X(String(point.x + 13)), h.Y(String(point.y + (node.id === "scheduling" ? 108 : 95))), h.FontSize("9"), h.Fill("#435670")], [node.id === "scheduling" ? `Preparing: agent ${projection.dispatch.running.filter(w => w.preparation).length} · shared ${resident.dispatch.running.filter(w => w.preparation).length}/${resident.executionLimits.preparation}` : `Jev: agent ${projection.dispatch.requests.length} · shared ${resident.dispatch.requests.length}/${resident.executionLimits.jevRequests}`])] : []),
            ...(node.id === "admission" ? (() => {
              const usage = partition === undefined ? projection.partitions.length === 1 ? projection.partitions[0] : undefined : resident.partitions.find(p => p.partition === partition);
              const scopedPartition = partition ?? (projection.partitions.length === 1 ? projection.partitions[0].partition : projection.admissions.length === 1 ? projection.admissions[0].partition : undefined);
              const scoped = scopedPartition !== undefined;
              const rows = [{ label: "Items", used: usage?.items ?? 0, max: scoped ? resident.limits.partitionItems : undefined },
                { label: "Bytes", used: usage?.bytes ?? 0, max: scoped ? resident.limits.partitionBytes : undefined },
                { label: "Permits · agent", scope: "this agent", kind: "local", used: resident.admissions.filter(a => a.partition === scopedPartition).reduce((n,a) => n + a.permits.length, 0), max: adviceePermitLimit(metadata, scopedPartition) },
                { label: "Permits · shared", scope: "all agents", kind: "global", used: resident.admissions.reduce((n,a) => n + a.permits.length, 0), max: metadata?.permits?.residentLimit }];
              return rows.map((row, index) => h.g([
                ...(row.kind ? [h.Class(`admission-permit-${row.kind}`), h.Role("img"), h.AriaLabel(`Edit permits, ${row.scope}: ${row.max === undefined ? `${row.used} used; limit not recorded` : `${row.used} of ${row.max}`}`)] : []),
              ], [
                ...(row.kind ? [h.title([], [`Edit permits, ${row.scope}: ${row.max === undefined ? `${row.used} used; limit not recorded` : `${row.used} of ${row.max}`}`])] : []),
                h.text([h.X(String(point.x + 13)), h.Y(String(point.y + 65 + index * 13)), h.FontSize("9"), h.Fill("#435670")], [`${row.label} ${row.max === undefined ? `${row.used} · ${row.kind ? "max unknown" : "limit not recorded"}` : `${row.used}/${row.max}`}`]),
                ...(row.max === undefined ? [] : [h.rect([h.X(String(point.x + 154)), h.Y(String(point.y + 59 + index * 13)), h.Width("57"), h.Height("5"), h.Fill("#dce5f0")], []), h.rect([...(row.kind ? [h.Class("admission-permit-fill")] : []), h.X(String(point.x + 154)), h.Y(String(point.y + 59 + index * 13)), h.Width(String(Math.min(57, row.max > 0 ? row.used / row.max * 57 : 0))), h.Height("5"), h.Fill(row.kind === "global" ? "#168f83" : "#427bc4")], [])]),
              ]));
            })() : []),
            ...(node.id === "preparation" ? [preparationMini(h, point.x, point.y, preparation, numbers)] : []),
            ...(node.id === "preparation" && sourceLabel !== undefined ? [
              h.text([h.X(String(point.x + 13)), h.Y(String(point.y + 264)), h.FontSize("10"),
                h.FontWeight("700"), h.Class("topology-event-fact"), h.Fill("#a24625")],
                [`NOW · ${sourceLabel} completed`]),
            ] : []),
            ...(node.id === "sourcePending" && admittedSource?.kind === "observationAdmitted" && last?.event.kind === "admitObservation" ? [
              h.text([h.X(String(point.x + 13)), h.Y(String(point.y + 108)), h.FontSize("9"),
                h.FontWeight("700"), h.Class("topology-event-fact"), h.Fill("#a24625")],
                [`NOW · Source #${admittedSource.id} admitted · Round #${last.event.round}`]),
            ] : []),
            ...(node.id === "round" && editAccepted !== undefined ? [
              h.text([h.X(String(point.x + 13)), h.Y(String(point.y + 108)), h.FontSize("9"),
                h.FontWeight("700"), h.Class("topology-event-fact"), h.Fill("#a24625")],
                [startedRound?.kind === "roundStarted"
                  ? `NOW · Round #${startedRound.id} opened with edit #${editAccepted.tool}`
                  : `NOW · edit #${editAccepted.tool} joined Round #${editAccepted.round}`]),
            ] : []),
            ...(node.id === "outcomes" && clearedReviewLabel !== undefined ? [
              h.text([h.X(String(point.x + 13)), h.Y(String(point.y + 108)), h.FontSize("10"),
                h.FontWeight("700"), h.Class("topology-event-fact"), h.Fill("#a24625")],
                [`NOW · ${clearedReviewLabel} clear`]),
            ] : []),
            ...(node.id === "outcomes" && retainMarker !== undefined ? [
              h.text([h.X(String(point.x + 13)), h.Y(String(point.y + 108)), h.FontSize("9"),
                h.FontWeight("700"), h.Class("topology-event-fact"), h.Fill("#794aa0")],
                [retainMarker]),
            ] : []),
            ...(node.id === "advice" && markedReady !== undefined ? [
              h.text([h.X(String(point.x + 13)), h.Y(String(point.y + 108)), h.FontSize("9"),
                h.FontWeight("700"), h.Class("topology-event-fact"), h.Fill("#a24625")],
                [`NOW · ${markedReady}`]),
            ] : []),
            ...(editAccepted === undefined ? [] : node.id === "observation"
              ? [h.text([h.X(String(point.x + 13)), h.Y(String(point.y + 69)), h.FontSize("10"),
                h.FontWeight("700"), h.Class("topology-event-fact"), h.Fill("#a24625")],
                [`NOW · edit #${editAccepted.tool} accepted`])]
              : []),
          ]);
        }),
        ...(infrastructure ? [residentCapacityInset(h, resident, agents, inspect)] : []),
        ...(infrastructure ? INFRASTRUCTURE_CONTACTS.map(contact => h.g([
          h.Class(`topology-resource ${contact.id}`), h.Role("img"),
          h.AriaLabel(`${contact.title} contact at ${SQUARES[contact.stage].title}: ${contact.scope}`),
        ], [
          h.title([], [`Infrastructure topology: ${contact.title} connects to ${SQUARES[contact.stage].title}. ${contact.scope}. This line is not an observed event.`]),
          h.path([h.D(`M ${contact.x} ${contact.y} L ${contact.x} ${contact.edgeY}`), h.Stroke(contact.color), h.StrokeWidth("2.5"), h.StrokeDasharray("3 3"), h.Fill("none")], []),
          h.circle([h.Cx(String(contact.x)), h.Cy(String(contact.y)), h.R("5"), h.Fill("#fff"), h.Stroke(contact.color), h.StrokeWidth("2.5")], []),
          h.rect([h.X(String(contact.x - 112)), h.Y(String(contact.labelY)), h.Width("224"), h.Height("32"), h.Rx("5"), h.Fill("#fff"), h.Stroke(contact.color), h.StrokeDasharray("3 3")], []),
          h.text([h.X(String(contact.x)), h.Y(String(contact.labelY + 13)), h.TextAnchor("middle"), h.FontSize("12"), h.FontWeight("700"), h.Fill(contact.color)], [contact.title]),
          h.text([h.X(String(contact.x)), h.Y(String(contact.labelY + 25)), h.TextAnchor("middle"), h.FontSize("9"), h.Fill(contact.color)], [contact.scope]),
        ])) : []),
      ]),
    ]),
    ...(stepCaption === undefined ? [] : [h.p([h.Class("topology-current-step")], [stepCaption])]),
    h.details([h.Class("topology-route-key")], [
      h.summary([], ["Numbered route key"]),
      h.ol([], routes.map((route) => {
        const paint = arrowPaint(route.kind);
        return h.li([h.Class(`${route.active ? "active" : ""} ${paint.command ? "command" : ""} ${paint.external ? "external" : ""}`)], [
          `${nodes.find((node) => node.id === route.from)?.title} → ${nodes.find((node) => node.id === route.to)?.title}: ${route.active ? route.evidence : `possible: ${route.label}`}`,
        ]);
      })),
    ]),
    h.details([h.Class("finish-decision")], [h.summary([], ["Finish outcomes"]),
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
    h.details([h.Class("topology-step")], [h.summary([], ["Decision details"]),
      h.p([], [last === undefined ? "Choose a guided or manual event." : last.rejection !== undefined
        ? `${last.event.kind} rejected: ${last.rejection}. Bend state and item locations did not change.`
        : last.preparation ? `ImportGraph: ${last.preparation.event.fact.kind} → ${last.preparation.command.kind} · ${recordLabel("preparation", last.preparation.event.operation, numbers)}`
        : `${last.event.kind} accepted · ${commands.length} command(s): ${commands.map((command) => command.kind).join(", ") || "none"}`]),
      ...(showcase && last?.origin === "guided" && last.event.kind === "issuePermit" ?
        [h.p([h.Class("flow-provenance")], ["Before the edit: a source-free pre-edit request supplies its timing and identity facts. Bend issued a permit. No virtual round is open yet."])] : []),
      ...(showcase && last?.origin === "guided" && last.event.kind === "consumePermit" ?
        [h.p([h.Class("flow-provenance")], [commands.some((command) => command.kind === "roundStarted")
          ? "Why this round opened: the first accepted attributed edit consumed its permit. Bend opened virtual round #1 in that same transition."
          : "This accepted attributed edit consumed its permit and joined the already open virtual round."])] : []),
      ...(last?.event.kind === "openRound" ? [h.p([h.Class("flow-provenance")], [last.origin === "manual"
        ? "You supplied this openRound event in the replay."
        : "This guided fixture supplies openRound directly. Its native trigger is not represented in the replay."])] : []),
      ...(sourceCompletion === undefined ? [] : [h.p([h.Class("flow-provenance")], [
        `${sourceLabel} completed. ${completionContext}.`,
      ])]),
      h.p([], [last === undefined ? "Choose a reducer event to inspect its checked effects."
        : last?.preparation ? `Inner preparation: ${last.preparation.event.fact.kind} → ${last.preparation.command.kind}. Canonical work and capacity stay at preparation.`
        : flow.rejection !== undefined ? `Rejected: ${flow.rejection}. No movement is shown.`
          : flow.evidence.length ? `${flow.evidence.length} relation(s) have checked evidence.`
            : flow.changedStages.length ? `State changed in ${flow.changedStages.map((stage) => SQUARES[stage].title).join(", ")}; no item crossed a displayed connection.`
              : flow.projectionChanged ? "Checked reducer state changed outside the displayed square details; no displayed movement is established."
                : commands.length ? `Decision emitted ${commands.map((command) => command.kind).join(", ")}; no displayed item movement is established.`
                  : "Accepted event; no displayed item movement or square change is established."]),
      ...(unmapped.length ? [h.p([h.Class("topology-unmapped-relations")], [`Checked relations outside drawn connections: ${unmapped.map(item => `${SQUARES[item.from].title} → ${SQUARES[item.to].title}: ${item.description}`).join("; ")}.`])] : []),
      h.p([], [`Branches at this step: ${commands.filter((command) => /Refused|Unavailable|Interrupted|Ignored|Stale|Cancel|Clear|Finding|Waiting|Allowed|Expired|Lease|Reoffer|Unknown|Recorded|Terminal/.test(command.kind)).map((command) => command.kind).join(", ") || "none"}.`]),
    ]),
  ]);
};
