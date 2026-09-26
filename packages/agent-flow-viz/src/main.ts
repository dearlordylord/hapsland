import { Schema } from "effect";
import { timelineView } from "./timeline-view";
import { TIMELINE_CASES } from "./timeline";
import { Runtime, type Update } from "foldkit";
import type { Document, HtmlBuilder } from "foldkit/html";
import { defineMessageUnion } from "foldkit/message";
import { NODES } from "./diagram";
import { CONNECTIONS, routeFor } from "./generation";
import { TRACES } from "./scenarios";
import {
  EVENT_IDS, FlowStateSchema, NODE_IDS, TRANSITIONS,
  initialFlow, stepFlow, type EventId, type FlowState, type NodeId, type Transition,
} from "./flow";

export const Model = Schema.Struct({
  trace: Schema.Number,
  timeline: Schema.Number,
  cursor: Schema.Number,
  flow: FlowStateSchema,
});
export type Model = typeof Model.Type;

export const Message = defineMessageUnion({
  SelectedTrace: { index: Schema.Number },
  SelectedTimeline: { index: Schema.Number },
  Advanced: {},
  Rewound: {},
  TriggeredEvent: { event: Schema.Literals(EVENT_IDS) },
  Reset: {},
});
export type Message = typeof Message.Type;

const reset = (trace: number): Model => ({ trace, timeline: 0, cursor: 0, flow: initialFlow() });
export const init: Runtime.ApplicationInit<Model, Message> = () => ({ model: reset(0) });

export const update = (model: Model, message: Message) =>
  Message.match<Update.Return<Model, Message>>(message, {
    SelectedTimeline: ({ index }) => ({ model: { ...model, timeline: index >= 0 && index < TIMELINE_CASES.length ? index : 0 } }),
    SelectedTrace: ({ index }) => ({ model: { ...reset(index >= 0 && index < TRACES.length ? index : 0), timeline: model.timeline } }),
    Reset: () => ({ model: { ...reset(model.trace), timeline: model.timeline } }),
    Advanced: () => {
      const event = TRACES[model.trace]?.events[model.cursor];
      if (event === undefined) return { model };
      const result = stepFlow(model.flow, event);
      return { model: { ...model, flow: result.state, cursor: model.cursor + (result.accepted ? 1 : 0) } };
    },
    Rewound: () => {
      const events = TRACES[model.trace]?.events;
      if (events === undefined || model.cursor === 0) return { model };
      const cursor = model.cursor - 1;
      let flow = initialFlow();
      for (const event of events.slice(0, cursor)) {
        const result = stepFlow(flow, event);
        if (!result.accepted) return { model };
        flow = result.state;
      }
      return { model: { ...model, cursor, flow } };
    },
    TriggeredEvent: ({ event }) => ({ model: {
      ...model, trace: -1, cursor: 0, flow: stepFlow(model.flow, event).state,
    } }),
  });

const NODE_WIDTH = 224;
const NODE_HEIGHT = 138;
const colors = {
  external: { fill: "#edf1f6", stroke: "#738399" },
  storage: { fill: "#fff0c8", stroke: "#ae7622" },
  process: { fill: "#e5efff", stroke: "#527cc4" },
  boundary: { fill: "#f1e9fa", stroke: "#8962ae" },
};

type Point = { readonly x: number; readonly y: number };
const geometry = (transition: Transition, offset: number) => {
  if (transition.from === "workQueue" && transition.to === "decisionRequest") return {
    path: "M 432 52 C 432 10, 1012 10, 1012 52", badge: { x: 722, y: 21 },
  };
  if (transition.from === "preparation" && transition.to === "workQueue") return {
    path: "M 650 190 C 650 250, 500 250, 500 190", badge: { x: 575, y: 235 },
  };
  const from = NODES[transition.from];
  const to = NODES[transition.to];
  const fx = from.x + NODE_WIDTH / 2;
  const fy = from.y + NODE_HEIGHT / 2;
  const tx = to.x + NODE_WIDTH / 2;
  const ty = to.y + NODE_HEIGHT / 2;
  const dx = tx - fx;
  const dy = ty - fy;
  let start: Point;
  let end: Point;
  if (Math.abs(dx) >= Math.abs(dy)) {
    start = { x: fx + Math.sign(dx) * NODE_WIDTH / 2, y: fy + offset };
    end = { x: tx - Math.sign(dx) * NODE_WIDTH / 2, y: ty + offset };
  } else {
    start = { x: fx + offset, y: fy + Math.sign(dy) * NODE_HEIGHT / 2 };
    end = { x: tx + offset, y: ty - Math.sign(dy) * NODE_HEIGHT / 2 };
  }
  const bend = transition.from === "preparation" && transition.to === "workQueue" ? -62
    : transition.from === "workQueue" && transition.to === "decisionRequest" ? 72 : 0;
  const control1 = { x: start.x + dx * 0.34, y: start.y + dy * 0.12 + bend };
  const control2 = { x: end.x - dx * 0.34, y: end.y - dy * 0.12 + bend };
  return {
    path: `M ${start.x} ${start.y} C ${control1.x} ${control1.y}, ${control2.x} ${control2.y}, ${end.x} ${end.y}`,
    badge: { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 + bend * 0.72 },
  };
};

const arrow = (h: HtmlBuilder<Message>, events: readonly EventId[], number: number, active: boolean) => {
  const transition = routeFor(events[0]);
  const { path, badge } = geometry(transition, 0);
  const stroke = active ? "#e66035" : transition.kind === "control" ? "#8b94a5" : "#98a9bd";
  return h.g([], [
    h.path([
      h.D(path), h.Fill("none"), h.Stroke(stroke), h.StrokeWidth(active ? "4" : "2"),
      h.MarkerEnd(active ? "url(#arrow-active)" : "url(#arrow-muted)"),
      ...(transition.kind === "control" ? [h.StrokeDasharray("6 5")] : []),
    ], []),
    h.circle([h.Cx(String(badge.x)), h.Cy(String(badge.y)), h.R("12"),
      h.Fill(active ? "#e66035" : "#fff"), h.Stroke(stroke), h.StrokeWidth("1.5")], []),
    h.text([h.X(String(badge.x)), h.Y(String(badge.y + 0.5)), h.TextAnchor("middle"),
      h.DominantBaseline("middle"), h.FontSize("10"), h.FontWeight("700"),
      h.Fill(active ? "#fff" : "#495a70")], [String(number)]),
  ]);
};

const NODE_NOTES: Record<NodeId, readonly string[]> = {
  agentEdit: ["Claude Code / Codex adapter"],
  workQueue: ["one scheduler, two job kinds", "capture jobs → review work items"],
  preparation: ["snapshot → artifacts + evidence", "enqueue work in same scheduler"],
  decisionRequest: ["one artifact + supporting evidence", "one rule evaluation request"],
  jev: ["external review backend", "returns a judgment or fails"],
  decisionResponse: ["finding → pending advice", "no finding → review status"],
  adviceStore: ["advicee + source + relevance", "after tool / Stop / Stop reoffer*"],
  collector: ["one batch reserved for one caller", "limit: 5 findings / 2 KiB**"],
  hostOutput: ["adapter formats response for agent", "write ≠ receipt or use"],
  deliveryState: ["four Stop requests per virtual round", "allow Stop → discard its work"],
  outcomeStore: ["update ticket / activity status", "no finding ≠ failed review"],
};

const nodeView = (h: HtmlBuilder<Message>, id: NodeId, flow: FlowState) => {
  const node = NODES[id];
  const palette = colors[node.role];
  const packets = flow.packets.filter((packet) => packet.at === id);
  const special = id === "deliveryState" ? `virtual round ${flow.virtualRoundId} · ${flow.virtualRoundActive ? "active" : "closed"} · ${flow.stopContinuations}/4`
    : id === "agentEdit" ? "fresh edit enters through adapter"
    : id === "collector" ? (flow.leaseSurface ? `${flow.leaseSurface} batch reserved` : flow.opportunity ? `${flow.opportunity} request received` : "waiting for an agent runtime request")
    : id === "hostOutput" ? (flow.lastSubmissionSurface ? "written; no payload stored here" : "no response written yet")
    : id === "workQueue" ? `${packets.length} queued job${packets.length === 1 ? "" : "s"}`
    : id === "adviceStore" ? `${packets.length} pending finding${packets.length === 1 ? "" : "s"}`
    : id === "outcomeStore" ? (flow.emissions.some((item) => item.at === id) ? "updated; no payload stored here" : "no completed review yet")
    : packets.length ? packets.map((packet) => packet.flavor).join(", ") : "idle in this example";
  return h.g([], [
    h.rect([h.X(String(node.x)), h.Y(String(node.y)), h.Width(String(NODE_WIDTH)),
      h.Height(String(NODE_HEIGHT)), h.Rx("12"), h.Fill(palette.fill),
      h.Stroke(palette.stroke), h.StrokeWidth("2")], []),
    h.text([h.X(String(node.x + 14)), h.Y(String(node.y + 26)), h.FontSize("16"),
      h.FontWeight("700"), h.Fill("#1e3048")], [node.label]),
    h.text([h.X(String(node.x + 14)), h.Y(String(node.y + 51)), h.FontSize("12"),
      h.Fill("#52647d")], [node.detail]),
    ...NODE_NOTES[id].map((line, index) => h.text([
      h.X(String(node.x + 14)), h.Y(String(node.y + 73 + index * 17)), h.FontSize("11"),
      h.Fill("#52647d"),
    ], [line])),
    h.text([h.X(String(node.x + 14)), h.Y(String(node.y + 119)), h.FontSize("12"),
      h.FontWeight("700"), h.Fill("#344964")], [special]),
  ]);
};

const chart = (model: Model, h: HtmlBuilder<Message>) => h.div([h.Class("chart-scroll")], [
  h.svg([h.ViewBox("0 0 1450 810"), h.Role("img"),
    h.AriaLabel("Event-labeled data flow from agent edit through Hapsland and Jev to agent runtime output")], [
    h.defs([], [
      h.marker([h.Id("arrow-muted"), h.ViewBox("0 0 10 10"), h.RefX("8"), h.RefY("5"),
        h.MarkerWidth("6"), h.MarkerHeight("6"), h.Orient("auto")], [
        h.path([h.D("M 0 0 L 10 5 L 0 10 z"), h.Fill("#98a9bd")], []),
      ]),
      h.marker([h.Id("arrow-active"), h.ViewBox("0 0 10 10"), h.RefX("8"), h.RefY("5"),
        h.MarkerWidth("6"), h.MarkerHeight("6"), h.Orient("auto")], [
        h.path([h.D("M 0 0 L 10 5 L 0 10 z"), h.Fill("#e66035")], []),
      ]),
    ]),
    ...CONNECTIONS.map((events, index) => arrow(h, events, index + 1, model.flow.lastEvent !== null && events.includes(model.flow.lastEvent))),
    ...NODE_IDS.map((id) => nodeView(h, id, model.flow)),
    ...[
      { x: 755, y: 26, text: "review work item →" },
      { x: 510, y: 268, text: "new review work" },
      { x: 1230, y: 277, text: "Jev response ↓" },
      { x: 780, y: 314, text: "← pending findings" },
      { x: 285, y: 376, text: "advice request: agent ID + deadline →" },
      { x: 30, y: 266, text: "edit via runtime adapter →" },
      { x: 30, y: 288, text: "PostToolUse: edit + advice request" },
      { x: 285, y: 435, text: "after tool / Stop" },
      { x: 165, y: 519, text: "Stop allow → close + cleanup" },
      { x: 30, y: 752, text: "* Stop reoffer: implemented in the #105 candidate." },
      { x: 30, y: 775, text: "** Size, time, expiry and full advicee checks are not simulated." },
      { x: 780, y: 729, text: "Numbers match the event controls below." },
      { x: 780, y: 752, text: "Solid: review information · Dashed: agent runtime request" },
      { x: 780, y: 775, text: "Amber: stored state · Blue: work · Grey: external · Purple: output" },
    ].map(({ x, y, text }) => h.text([
      h.X(String(x)), h.Y(String(y)), h.FontSize("12"), h.Fill("#52647d"),
    ], [text])),
  ]),
]);

const eventLabel = (event: EventId): string => {
  const transition = routeFor(event);
  return `${transition.label} · ${NODES[transition.from].label} → ${NODES[transition.to].label}`;
};

export const view = (model: Model, h: HtmlBuilder<Message>): Document => {
  const trace = TRACES[model.trace];
  const next = trace?.events[model.cursor];
  const previous = model.cursor > 0 ? trace?.events[model.cursor - 1] : undefined;
  return {
    title: "Hapsland · agent flow visualization",
    body: h.main([h.Class("page")], [
      h.header([h.Class("page-header")], [
        h.p([h.Class("eyebrow")], ["SIDECAR MODEL · FOLDKIT"]),
        h.h1([], ["From agent edit to Jev and back"]),
        h.a([h.Href("#timing-diagrams"), h.Class("timing-jump")], ["Jump to timing diagrams ↓"]),
        h.p([h.Class("intro")], [
          "One agent reports edits and receives advice through Claude Code or Codex. The runtime adapter identifies the agent. A sidecar reducer drives this data-flow example.",
        ]),
        h.p([h.Class("caveat")], [
          "One agent, one review item; no live connection. This reducer does not simulate multiple agents or tabs.",
        ]),
      ]),
      h.section([h.Class("chart-panel")], [
        h.div([h.Class("section-head")], [
          h.h2([], ["Review and advice flow"]),
          h.span([], ["Scroll horizontally on narrow screens"]),
        ]),
        chart(model, h),
      ]),
      h.div([h.Class("below")], [
        h.section([h.Class("card")], [
          h.h2([], ["Guided trace"]),
          h.div([h.Class("trace-options")], TRACES.map((item, index) =>
            h.button([h.OnClick(Message.SelectedTrace({ index })),
              h.Class(index === model.trace ? "trace selected" : "trace")], [item.name]))),
          h.p([h.Class("description")], [trace?.description ?? "Free play: choose any event below."]),
          h.div([h.Class("trace-controls")], [
            h.button([h.OnClick(Message.Rewound()), h.Disabled(previous === undefined)], [
              previous === undefined ? "Previous" : `Previous: ${TRANSITIONS[previous].label}`,
            ]),
            h.button([h.OnClick(Message.Advanced()), h.Class("primary"), h.Disabled(next === undefined)], [
              next === undefined ? "Trace complete" : `Next: ${TRANSITIONS[next].label}`,
            ]),
            h.button([h.OnClick(Message.Reset())], ["Reset trace"]),
            h.span([h.Class("key-hint")], ["← / → keys"]),
          ]),
          h.p([h.Class("progress")], [trace ? `Step ${model.cursor} of ${trace.events.length}` : "Free play"]),
          h.p([h.Class("status")], [model.flow.note]),
          h.h3([], ["Live review data in this virtual round"]),
          h.div([h.Class("packets")], model.flow.packets.map((packet) =>
            h.div([h.Class("packet")], [
              h.strong([], [`#${packet.id} ${packet.flavor}`]),
              h.span([], [NODES[packet.at].label]),
            ]))),
          h.h3([], ["Emitted outcomes — example history"]),
          h.p([h.Class("description")], ["These entries record what the example emitted. They are not payloads stored at the process boxes and cannot be selected as pending advice."]),
          h.div([h.Class("packets")], model.flow.emissions.length === 0
            ? [h.p([h.Class("description")], ["No response or status update emitted yet."])]
            : model.flow.emissions.map((item) => h.div([h.Class("packet")], [
              h.strong([], [item.description]), h.span([], [NODES[item.at].label]),
            ]))),
          h.p([h.Class("state-line")], [
            `Virtual round ${model.flow.virtualRoundId} (${model.flow.virtualRoundActive ? "active" : "closed"}) · Stop continuation requests ${model.flow.stopContinuations}/4 · ` +
            `reserved batch ${model.flow.leaseSurface ?? "none"} · last response ${model.flow.lastSubmissionSurface ?? "none"}`,
          ]),
        ]),
        h.section([h.Class("card")], [
          h.h2([], ["Events, prerequisites, and information"]),
          h.p([h.Class("description")], ["Click any event to inspect an alternate order. Rejected events explain the missing prerequisite."]),
          h.div([h.Class("events")], EVENT_IDS.map((event) => {
            const transition = routeFor(event);
            return h.button([h.OnClick(Message.TriggeredEvent({ event })), h.Class("event-row")], [
              h.span([h.Class("event-number")], [String(CONNECTIONS.findIndex((events) => events.includes(event)) + 1)]),
              h.span([h.Class("event-copy")], [
                h.strong([], [transition.label]),
                h.small([], [eventLabel(event)]),
                h.small([], [transition.kind === "data"
                  ? `${transition.input} → ${transition.output}${transition.movement === "copy" ? " · source retained" : ""}`
                  : `${transition.signal} request · agent identity and delivery context`]),
                h.small([], [stepFlow(model.flow, event).accepted ? "Can happen now" : stepFlow(model.flow, event).state.note]),
              ]),
            ]);
          })),
        ]),
      ]),
      h.section([h.Class("card explanation")], [
        h.h2([], ["Event reducer and current state"]),
        h.p([], ["The sidecar reducer applies events to example state. Accepted steps generate this graph’s connections and the abstract timeline steps. Box layout and wording are presentation choices. Native timestamps come from retained evidence. Diagram boxes show places and operations, not lifecycle states."]),
        h.div([h.Class("packets")], [
          h.div([h.Class("packet")], [h.strong([], ["Virtual round"]), h.span([], [`${model.flow.virtualRoundId} · ${model.flow.virtualRoundActive ? "active" : "closed"}`])]),
          h.div([h.Class("packet")], [h.strong([], ["Stop continuation requests"]), h.span([], [`${model.flow.stopContinuations} of 4`])]),
          h.div([h.Class("packet")], [h.strong([], ["Stop wait"]), h.span([], [model.flow.stopWaiting ? "waiting before a finish decision" : "none"])]),
          h.div([h.Class("packet")], [h.strong([], ["Batch reserved for"]), h.span([], [model.flow.leaseSurface ?? "no caller"])]),
          h.div([h.Class("packet")], [h.strong([], ["Last response written through"]), h.span([], [model.flow.lastSubmissionSurface ?? "none"])]),
        ]),
        h.p([], ["A fresh edit opens a virtual round if the previous one closed. Selecting advice for a Stop response reserves one request from that virtual round’s budget before writing. A Stop block asks the runtime to keep the agent working in the same virtual round. Stop allow closes it and cancels or discards its resources. Another hook can keep the agent's actual round going. Runtime turn IDs do not identify virtual rounds. Restart and transport failure are outside this example."]),
      ]),
      timelineView(h, model.timeline, (index) => Message.SelectedTimeline({ index })),
    ]),
  };
};
