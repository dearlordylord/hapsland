import { Schema } from "effect";
import { Runtime, type Update } from "foldkit";
import type { Document, HtmlBuilder } from "foldkit/html";
import { defineMessageUnion } from "foldkit/message";
import {
  EVENT_IDS, FlowStateSchema, NODES, NODE_IDS, TRANSITIONS, TRACES,
  initialFlow, stepFlow, type EventId, type FlowState, type NodeId, type Transition,
} from "./flow";

export const Model = Schema.Struct({
  trace: Schema.Number,
  cursor: Schema.Number,
  flow: FlowStateSchema,
});
export type Model = typeof Model.Type;

export const Message = defineMessageUnion({
  SelectedTrace: { index: Schema.Number },
  Advanced: {},
  TriggeredEvent: { event: Schema.Literals(EVENT_IDS) },
  Reset: {},
});
export type Message = typeof Message.Type;

const reset = (trace: number): Model => ({ trace, cursor: 0, flow: initialFlow() });
export const init: Runtime.ApplicationInit<Model, Message> = () => ({ model: reset(0) });

export const update = (model: Model, message: Message) =>
  Message.match<Update.Return<Model, Message>>(message, {
    SelectedTrace: ({ index }) => ({ model: reset(index >= 0 && index < TRACES.length ? index : 0) }),
    Reset: () => ({ model: reset(model.trace) }),
    Advanced: () => {
      const event = TRACES[model.trace]?.events[model.cursor];
      if (event === undefined) return { model };
      const result = stepFlow(model.flow, event);
      return { model: { ...model, flow: result.state, cursor: model.cursor + (result.accepted ? 1 : 0) } };
    },
    TriggeredEvent: ({ event }) => ({ model: {
      ...model, trace: -1, cursor: 0, flow: stepFlow(model.flow, event).state,
    } }),
  });

const NODE_WIDTH = 224;
const NODE_HEIGHT = 98;
const colors = {
  external: { fill: "#edf1f6", stroke: "#738399" },
  storage: { fill: "#fff0c8", stroke: "#ae7622" },
  process: { fill: "#e5efff", stroke: "#527cc4" },
  boundary: { fill: "#f1e9fa", stroke: "#8962ae" },
};

type Point = { readonly x: number; readonly y: number };
const geometry = (transition: Transition, offset: number) => {
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

const edgeOffsets = (): Readonly<Record<EventId, number>> => {
  const pairs = new Map<string, number>();
  return Object.fromEntries(EVENT_IDS.map((event) => {
    const transition = TRANSITIONS[event];
    const key = `${transition.from}:${transition.to}`;
    const count = pairs.get(key) ?? 0;
    pairs.set(key, count + 1);
    return [event, count * 18 - (key === "adviceStore:collector" ? 18 : 0)];
  })) as Record<EventId, number>;
};
const OFFSETS = edgeOffsets();

const arrow = (h: HtmlBuilder<Message>, event: EventId, number: number, active: boolean) => {
  const transition = TRANSITIONS[event];
  const { path, badge } = geometry(transition, OFFSETS[event]);
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

const nodeView = (h: HtmlBuilder<Message>, id: NodeId, flow: FlowState) => {
  const node = NODES[id];
  const palette = colors[node.role];
  const packets = flow.packets.filter((packet) => packet.at === id);
  const special = id === "turnState" ? `turn ${flow.turn} · Stop ${flow.stopUsed ? "used" : "available"}`
    : id === "collector" && flow.leaseSurface ? `${flow.leaseSurface} lease active`
      : id === "hostOutput" ? `model visibility: ${flow.visibility}`
        : `${packets.length} data item${packets.length === 1 ? "" : "s"}`;
  return h.g([], [
    h.rect([h.X(String(node.x)), h.Y(String(node.y)), h.Width(String(NODE_WIDTH)),
      h.Height(String(NODE_HEIGHT)), h.Rx("12"), h.Fill(palette.fill),
      h.Stroke(palette.stroke), h.StrokeWidth("2")], []),
    h.text([h.X(String(node.x + 14)), h.Y(String(node.y + 26)), h.FontSize("16"),
      h.FontWeight("700"), h.Fill("#1e3048")], [node.label]),
    h.text([h.X(String(node.x + 14)), h.Y(String(node.y + 51)), h.FontSize("12"),
      h.Fill("#52647d")], [node.detail]),
    h.text([h.X(String(node.x + 14)), h.Y(String(node.y + 78)), h.FontSize("12"),
      h.FontWeight("700"), h.Fill("#344964")], [special]),
  ]);
};

const chart = (model: Model, h: HtmlBuilder<Message>) => h.div([h.Class("chart-scroll")], [
  h.svg([h.ViewBox("0 0 1450 730"), h.Role("img"),
    h.AriaLabel("Event-labeled data flow from agent edit through Hapsland and Jev to host output")], [
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
    ...EVENT_IDS.map((event, index) => arrow(h, event, index + 1, model.flow.lastEvent === event)),
    ...NODE_IDS.map((id) => nodeView(h, id, model.flow)),
  ]),
]);

const eventLabel = (event: EventId): string => {
  const transition = TRANSITIONS[event];
  return `${transition.label} · ${NODES[transition.from].label} → ${NODES[transition.to].label}`;
};

export const view = (model: Model, h: HtmlBuilder<Message>): Document => {
  const trace = TRACES[model.trace];
  const next = trace?.events[model.cursor];
  return {
    title: "Hapsland · agent flow visualization",
    body: h.main([h.Class("page")], [
      h.header([h.Class("page-header")], [
        h.p([h.Class("eyebrow")], ["SIDECAR MODEL · FOLDKIT"]),
        h.h1([], ["From agent edit to Jev and back"]),
        h.p([h.Class("intro")], [
          "Every arrow is a named event. Amber nodes hold resident state; blue nodes process it. Dashed arrows carry hook control signals. The chart and reducer use one typed transition table.",
        ]),
        h.p([h.Class("caveat")], [
          "Discussion model: one recipient and one review unit. Stop reoffer is an approved design decision, not current production behavior. Model visibility is observer evidence, never inferred from a write.",
        ]),
      ]),
      h.section([h.Class("chart-panel")], [
        h.div([h.Class("section-head")], [
          h.h2([], ["Data locations and event arrows"]),
          h.span([], ["Scroll horizontally on narrow screens"]),
        ]),
        chart(model, h),
        h.p([h.Class("legend")], [
          "Numbered arrows map to the event list below. A review unit may cycle through the same work queue after preparation. Advice stays in the resident while a delivery batch is leased.",
        ]),
      ]),
      h.div([h.Class("below")], [
        h.section([h.Class("card")], [
          h.h2([], ["Guided trace"]),
          h.div([h.Class("trace-options")], TRACES.map((item, index) =>
            h.button([h.OnClick(Message.SelectedTrace({ index })),
              h.Class(index === model.trace ? "trace selected" : "trace")], [item.name]))),
          h.p([h.Class("description")], [trace?.description ?? "Free play: choose any event below."]),
          h.div([h.Class("trace-controls")], [
            h.button([h.OnClick(Message.Advanced()), h.Class("primary")], [
              next === undefined ? "Trace complete" : `Next: ${TRANSITIONS[next].label}`,
            ]),
            h.button([h.OnClick(Message.Reset())], ["Reset trace"]),
          ]),
          h.p([h.Class("progress")], [trace ? `Step ${model.cursor} of ${trace.events.length}` : "Free play"]),
          h.p([h.Class("status")], [model.flow.note]),
          h.h3([], ["Stored and transient data now"]),
          h.div([h.Class("packets")], model.flow.packets.map((packet) =>
            h.div([h.Class("packet")], [
              h.strong([], [`#${packet.id} ${packet.flavor}`]),
              h.span([], [NODES[packet.at].label]),
            ]))),
          h.p([h.Class("state-line")], [
            `Turn ${model.flow.turn} · Stop ${model.flow.stopUsed ? "used" : "available"} · ` +
            `active lease ${model.flow.leaseSurface ?? "none"} · visibility ${model.flow.visibility}`,
          ]),
        ]),
        h.section([h.Class("card")], [
          h.h2([], ["Events and data flavors"]),
          h.p([h.Class("description")], ["Click any event to inspect an alternate order. Rejected events explain the missing prerequisite."]),
          h.div([h.Class("events")], EVENT_IDS.map((event, index) => {
            const transition = TRANSITIONS[event];
            return h.button([h.OnClick(Message.TriggeredEvent({ event })), h.Class("event-row")], [
              h.span([h.Class("event-number")], [String(index + 1)]),
              h.span([h.Class("event-copy")], [
                h.strong([], [event]),
                h.small([], [eventLabel(event)]),
                h.small([], [transition.kind === "data"
                  ? `${transition.input} → ${transition.output}${transition.movement === "copy" ? " · source retained" : ""}`
                  : `${transition.signal} control signal · no review data moves`]),
              ]),
            ]);
          })),
        ]),
      ]),
    ]),
  };
};
