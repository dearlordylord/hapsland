import type { HtmlBuilder } from "foldkit/html";
import type { CanonicalCommand, CanonicalProjection } from "../../../src/canonical/adapter";
import type { ReplayStep } from "./canonical-replay";
import { projectFlowStep, type FlowEvidence } from "@hapsland/agent-flow-projection";
import { CONNECTIONS, PLACE_ORDER, SQUARES, squareFacetLine } from "./production-flow-presentation";

type ArrowKind = FlowEvidence["source"] | "possible" | "mixed" | "mixed external";
type Route = (typeof CONNECTIONS)[number] & Readonly<{ active: boolean; kind: ArrowKind; evidence: string }>;
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
    const y = from.y;
    return { path: `M ${x - 45} ${y - 9} C ${x - 58} ${y - 90}, ${x + 58} ${y - 90}, ${x + 45} ${y - 9}`,
      badge: { x, y: y - 64 }, tip: { x: x + 45, y: y - 9 }, toward: { x: -1, y: 1 } };
  }
  if (route.from === "round" && route.to === "round") {
    const x = from.x + NODE_WIDTH;
    const y = from.y + NODE_HEIGHT / 2;
    return { path: `M ${x + 9} ${y - 35} C ${x + 100} ${y - 70}, ${x + 100} ${y + 70}, ${x + 9} ${y + 35}`,
      badge: { x: x + 85, y }, tip: { x: x + 9, y: y + 35 }, toward: { x: -1, y: 0 } };
  }
  if (route.from === route.to) {
    const x = from.x + NODE_WIDTH - 18;
    const y = from.y + NODE_HEIGHT;
    return { path: `M ${x - 22} ${y} C ${x - 20} ${y + 100}, ${x + 44} ${y + 100}, ${x + 28} ${y - 2}`,
      badge: { x: x + 7, y: y + 71 }, tip: { x: x + 28, y: y - 9 }, toward: { x: 0, y: -1 } };
  }
  if (route.from === "admission" && route.to === "preparation") {
    const startX = from.x + NODE_WIDTH / 2;
    const endX = to.x + NODE_WIDTH / 2;
    return { path: `M ${startX} ${from.y + NODE_HEIGHT + 9} L ${startX} 220 L ${endX} 220 L ${endX} ${to.y + NODE_HEIGHT + 9}`,
      badge: { x: 750, y: 220 }, tip: { x: endX, y: to.y + NODE_HEIGHT + 9 }, toward: { x: 0, y: -1 } };
  }
  if (route.from === "sourcePending" && route.to === "preparation") {
    const startX = from.x + NODE_WIDTH + 9;
    const laneX = to.x - 36;
    const y = from.y + NODE_HEIGHT / 2;
    const endX = to.x - 9;
    const endY = to.y + NODE_HEIGHT / 2;
    return { path: `M ${startX} ${y} L ${laneX} ${y} L ${laneX} ${endY} L ${endX} ${endY}`,
      badge: { x: 540, y }, tip: { x: endX, y: endY }, toward: { x: 1, y: 0 } };
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
export const productionFlowView = <Message>(
  h: HtmlBuilder<Message>, projection: CanonicalProjection, last: ReplayStep | undefined,
  showcase: boolean,
  inspect?: (place: (typeof PLACE_ORDER)[number]) => Message,
) => {
  const commands = last?.rejection === undefined ? last?.commands ?? [] : [];
  const event = last?.rejection === undefined ? last?.event.kind : undefined;
  const stopEvent = event === "stopPolled" || event === "stopGroupPolled";
  const requests = projection.dispatch.requests;
  const flow = projectFlowStep(last);
  const declaredRoutes = new Set(CONNECTIONS.map(({ from, to }) => `${from}:${to}`));
  if (declaredRoutes.size !== CONNECTIONS.length) throw new Error("duplicate dashboard arrow route");
  for (const item of flow.evidence) if (!declaredRoutes.has(`${item.from}:${item.to}`)) {
    throw new Error(`undeclared dashboard arrow route: ${item.from}:${item.to}`);
  }
  const nodes = PLACE_ORDER.map((id) => ({ id, ...SQUARES[id], detail: SQUARES[id].detail(projection), facets: SQUARES[id].facets(projection) }));
  const routes: readonly Route[] = CONNECTIONS.map((connection): Route => {
    const evidence = flow.evidence.filter((item) => item.from === connection.from && item.to === connection.to);
    return { ...connection, active: evidence.length > 0, kind: arrowKind(evidence),
      evidence: evidence.map((item) => `${item.source}: ${item.description}`).join("; ") };
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
    { label: "Continue with advice", active: has(commands, "finishAuthorized", "continuationConsumed") },
    { label: "Allow finish", active: has(commands, "finishAllowedNoAdvice", "finishAllowedDeadline", "finishAllowedUnavailable") },
    { label: "Cancel unfinished work", active: stopEvent && has(commands, "cancelWork", "discardAllUnfinished", "discardNamedOnly") },
  ];
  return h.div([h.Class("production-topology")], [
    h.p([h.Class("flow-legend")], ["Blue squares: checked Bend state or decision · gray squares: native fact/effect. Gold arrows mark supplied external Jev facts; orange arrows mark other accepted facts or state movement. Purple dashed arrows mark emitted commands; they do not prove a native effect or stored advice."]),
    h.div([h.Class("topology-scroll")], [
      h.svg([h.ViewBox("0 0 1400 830"), h.Role("img"),
        h.AriaLabel("Connected production flow from agent edit through Jev review to advice and round decision")], [
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
              ...(paint.dashed ? [h.StrokeDasharray("7 5")] : [])], []),
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
          return h.g([h.Class(`topology-node ${flow.changedStages.includes(node.id) ? "active" : ""}`), ...(inspect ? [h.OnClick(inspect(node.id))] : [])], [
            h.title([], [`${node.title}: ${node.detail}`]),
            h.rect([h.X(String(point.x)), h.Y(String(point.y)), h.Width(String(NODE_WIDTH)),
              h.Height(String(NODE_HEIGHT)), h.Rx("12"), h.Fill(palette.fill),
              h.Stroke(palette.stroke), h.StrokeWidth(flow.changedStages.includes(node.id) ? "4" : "2")], []),
            h.text([h.X(String(point.x + 13)), h.Y(String(point.y + 25)), h.FontSize("10"),
              h.FontWeight("700"), h.Fill("#52647d")], [node.owner]),
            h.text([h.X(String(point.x + 13)), h.Y(String(point.y + 49)), h.FontSize("14"),
              h.FontWeight("700"), h.Fill("#1e3048")], [node.title]),
            ...node.facets.map((facet, index) =>
              h.text([h.X(String(point.x + 13)), h.Y(String(point.y + 69 + index * 13)), h.FontSize("10"), h.FontWeight("600"), h.Class("topology-facet"),
                h.Fill("#435670")], [squareFacetLine(facet)])),
          ]);
        }),
        h.text([h.X("32"), h.Y("810"), h.FontSize("12"), h.Fill("#52647d")], [
          "Numbers match the route key. Gold is an external Jev fact; orange is other accepted evidence; purple dashed is a command. Gray shows possible paths.",
        ]),
      ]),
    ]),
    h.details([h.Class("topology-route-key")], [
      h.summary([], ["Numbered route key"]),
      h.ol([], routes.map((route) => {
        const paint = arrowPaint(route.kind);
        return h.li([h.Class(`${route.active ? "active" : ""} ${paint.command ? "command" : ""} ${paint.external ? "external" : ""}`)], [
          `${nodes.find((node) => node.id === route.from)?.title} → ${nodes.find((node) => node.id === route.to)?.title}: ${route.active ? route.evidence : `possible: ${route.label}`}`,
        ]);
      })),
    ]),
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
      h.p([], [last === undefined ? "Choose a guided or manual event." : last.rejection !== undefined
        ? `${last.event.kind} rejected: ${last.rejection}. Bend state and item locations did not change.`
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
      h.p([], [last === undefined ? "Choose a reducer event to inspect its checked effects."
        : flow.rejection !== undefined ? `Rejected: ${flow.rejection}. No movement is shown.`
          : flow.evidence.length ? `${flow.evidence.length} connection(s) have checked evidence.`
            : flow.changedStages.length ? `State changed in ${flow.changedStages.map((stage) => SQUARES[stage].title).join(", ")}; no item crossed a displayed connection.`
              : flow.projectionChanged ? "Checked reducer state changed outside the displayed square details; no displayed movement is established."
                : commands.length ? `Decision emitted ${commands.map((command) => command.kind).join(", ")}; no displayed item movement is established.`
                  : "Accepted event; no displayed item movement or square change is established."]),
      h.p([], ["A Jev command authorizes an attempt; only a request-start fact records an attempt. A submitted host output does not establish agent receipt or use."]),
      h.p([], [`Branches at this step: ${commands.filter((command) => /Refused|Unavailable|Interrupted|Ignored|Stale|Cancel|Clear|Finding|Waiting|Allowed|Expired|Lease|Reoffer|Unknown|Recorded|Terminal/.test(command.kind)).map((command) => command.kind).join(", ") || "none"}.`]),
    ]),
  ]);
};
