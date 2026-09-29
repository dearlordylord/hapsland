import type { HtmlBuilder } from "foldkit/html";
import type { CanonicalCommand, CanonicalProjection } from "../../../src/canonical/adapter";
import type { ReplayStep } from "./canonical-replay";
import { projectFlowStep, type FlowStage as Place } from "@hapsland/agent-flow-projection";
import { CONNECTIONS, PLACE_ORDER, SQUARES } from "./production-flow-presentation";

type Route = { readonly from: Place; readonly to: Place; readonly label: string; readonly active: boolean;
  readonly command: boolean; readonly mixed: boolean; readonly evidence: string };
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
) => {
  const commands = last?.rejection === undefined ? last?.commands ?? [] : [];
  const event = last?.rejection === undefined ? last?.event.kind : undefined;
  const stopEvent = event === "stopPolled" || event === "stopGroupPolled";
  const requests = projection.dispatch.requests;
  const flow = projectFlowStep(last);
  const nodes = PLACE_ORDER.map((id) => ({ id, ...SQUARES[id], detail: SQUARES[id].detail(projection) }));
  const routes: readonly Route[] = CONNECTIONS.map((connection): Route => {
    const evidence = flow.evidence.filter((item) => item.from === connection.from && item.to === connection.to);
    const hasCommand = evidence.some((item) => item.source === "command");
    const hasFact = evidence.some((item) => item.source !== "command");
    return { ...connection, active: evidence.length > 0, command: hasCommand && !hasFact, mixed: hasCommand && hasFact,
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
    h.p([h.Class("flow-legend")], ["Blue: Bend state or decision · gray: native fact/effect · gold: external Jev fact. Orange arrows mark the accepted event or fact. Purple dashed arrows mark emitted commands; they do not prove a native effect or stored advice."]),
    h.div([h.Class("topology-scroll")], [
      h.svg([h.ViewBox("0 0 1400 830"), h.Role("img"),
        h.AriaLabel("Connected production flow from agent observation through Jev review to advice and round decision")], [
        ...routes.map((route, index) => {
          const same = routeMultiplicity.get(`${route.from}:${route.to}`) ?? 1;
          const offset = (routeOffsets[index] - (same - 1) / 2) * 18;
          const { path, badge, tip, toward } = routeGeometry(route, offset);
          const color = route.active ? route.command ? "#794aa0" : "#e66035" : "#91a4ba";
          return h.g([h.Class(`topology-route ${route.active ? "active" : ""}`)], [
            h.title([], [`${index + 1}. ${nodes.find((node) => node.id === route.from)?.title} → ${nodes.find((node) => node.id === route.to)?.title}: ${route.active ? route.evidence : `possible: ${route.label}`}`]),
            h.path([h.D(path), h.Fill("none"), h.Stroke(color),
              h.StrokeWidth(route.active ? "4" : "2"),
              ...(route.command ? [h.StrokeDasharray("7 5")] : [])], []),
            ...(route.mixed ? [h.path([h.D(path), h.Fill("none"), h.Stroke("#794aa0"), h.StrokeWidth("2"), h.StrokeDasharray("7 5")], [])] : []),
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
          const palette = node.owner.includes("EXTERNAL") ? { fill: "#fff0c8", stroke: "#ad7524" }
            : node.owner.includes("NATIVE") ? { fill: "#edf1f6", stroke: "#7d8da2" }
            : { fill: "#e9f1ff", stroke: "#547dc0" };
          return h.g([h.Class(`topology-node ${flow.changedStages.includes(node.id) ? "active" : ""}`)], [
            h.title([], [`${node.title}: ${node.detail}`]),
            h.rect([h.X(String(point.x)), h.Y(String(point.y)), h.Width(String(NODE_WIDTH)),
              h.Height(String(NODE_HEIGHT)), h.Rx("12"), h.Fill(palette.fill),
              h.Stroke(palette.stroke), h.StrokeWidth(flow.changedStages.includes(node.id) ? "4" : "2")], []),
            h.text([h.X(String(point.x + 13)), h.Y(String(point.y + 25)), h.FontSize("10"),
              h.FontWeight("700"), h.Fill("#52647d")], [node.owner]),
            h.text([h.X(String(point.x + 13)), h.Y(String(point.y + 49)), h.FontSize("14"),
              h.FontWeight("700"), h.Fill("#1e3048")], [node.title]),
            ...node.detail.split(" · ").slice(0, 2).map((part, index) =>
              h.text([h.X(String(point.x + 13)), h.Y(String(point.y + 77 + index * 18)), h.FontSize("10"),
                h.Fill("#435670")], [part.length > 33 ? `${part.slice(0, 30)}…` : part])),
          ]);
        }),
        h.text([h.X("32"), h.Y("810"), h.FontSize("12"), h.Fill("#52647d")], [
          "Numbers match the route key. Orange is an accepted fact; purple dashed is a command. Gray shows possible paths.",
        ]),
      ]),
    ]),
    h.details([h.Class("topology-route-key")], [
      h.summary([], ["Numbered route key"]),
      h.ol([], routes.map((route) => h.li([h.Class(`${route.active ? "active" : ""} ${route.command ? "command" : ""}`)], [
        `${nodes.find((node) => node.id === route.from)?.title} → ${nodes.find((node) => node.id === route.to)?.title}: ${route.active ? route.evidence : `possible: ${route.label}`}`,
      ]))),
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
      h.p([], [last === undefined ? "Choose a guided or manual canonical event." : last.rejection !== undefined
        ? `${last.event.kind} rejected: ${last.rejection}. Canonical state and item locations did not change.`
        : `${last.event.kind} accepted · ${commands.length} command(s): ${commands.map((command) => command.kind).join(", ") || "none"}`]),
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
