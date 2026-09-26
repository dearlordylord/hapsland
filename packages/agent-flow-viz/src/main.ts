import { Schema } from "effect";
import { timelineView } from "./timeline-view";
import { TIMELINE_CASES } from "./timeline";
import { Runtime, type Update } from "foldkit";
import type { Document, HtmlBuilder } from "foldkit/html";
import { defineMessageUnion } from "foldkit/message";
import { describeAccepted, EMISSION_LABELS, EVENT_LABELS, NODES, REJECTION_LABELS } from "./diagram";
import { CONNECTIONS, PROJECTED_TRACES, nextEventOptions, routeFor } from "./generation";
import { TRACES } from "./scenarios";
import {
  EVENT_IDS, FlowStateSchema, MAX_ACTIVE_REVIEW_JOBS, MAX_STOP_CONTINUATIONS, NODE_IDS,
  activeReviewJobCount, initialFlow, stepFlow, type EventId, type FlowState, type NodeId, type Transition,
} from "./flow";

export const Model = Schema.Struct({
  trace: Schema.Number,
  timeline: Schema.Number,
  cursor: Schema.Number,
  flow: FlowStateSchema,
  guidedBindings: Schema.Array(Schema.Struct({ plannedId: Schema.Number, actualId: Schema.Number })),
  history: Schema.Array(Schema.Struct({
    event: Schema.Literals(EVENT_IDS), itemId: Schema.Union([Schema.Null, Schema.Number]),
    origin: Schema.Literals(["guided", "manual"]),
  })),
  lastEvent: Schema.Union([Schema.Null, Schema.Literals(EVENT_IDS)]),
  feedback: Schema.String,
  emissions: Schema.Array(Schema.Struct({
    event: Schema.Literals(["HostOutputSubmitted", "ClearRecorded", "JevUnavailable"]),
    at: Schema.Literals(NODE_IDS),
    itemId: Schema.Number,
  })),
});
export type Model = typeof Model.Type;

export const Message = defineMessageUnion({
  SelectedTrace: { index: Schema.Number },
  SelectedTimeline: { index: Schema.Number },
  Advanced: {},
  Rewound: {},
  TriggeredEvent: { event: Schema.Literals(EVENT_IDS), itemId: Schema.Union([Schema.Null, Schema.Number]) },
  JumpedToHistory: { count: Schema.Number },
  Reset: {},
});
export type Message = typeof Message.Type;

const reset = (trace: number): Model => ({
  trace, timeline: 0, cursor: 0, flow: initialFlow(), guidedBindings: [], history: [], lastEvent: null, emissions: [],
  feedback: "No live virtual round or review work yet. Events are example inputs; no agent runtime or Jev connection is attached.",
});
export const init: Runtime.ApplicationInit<Model, Message> = () => ({ model: reset(0) });

type EventOrigin = "guided" | "manual";
const plannedItemAt = (model: Model): number | null =>
  PROJECTED_TRACES[model.trace]?.[model.cursor]?.changes.find((change) => change.kind === "transition")?.itemId ?? null;
const guidedInput = (model: Model): { readonly event: EventId; readonly itemId: number | undefined } | null => {
  const event = TRACES[model.trace]?.events[model.cursor];
  if (event === undefined) return null;
  const plannedId = plannedItemAt(model);
  if (event === "EditObserved" || plannedId === null) return { event, itemId: undefined };
  return { event, itemId: model.guidedBindings.find((entry) => entry.plannedId === plannedId)?.actualId };
};
const guidedBlock = (model: Model): string | null => {
  const input = guidedInput(model);
  if (input === null) return null;
  const plannedId = plannedItemAt(model);
  if (plannedId !== null && input.event !== "EditObserved" && input.itemId === undefined) {
    return `Guided trace cannot proceed at step ${model.cursor + 1}: its item #${plannedId} has not entered this replay.`;
  }
  const result = stepFlow(model.flow, input.event, input.itemId);
  return result.accepted ? null :
    `Guided trace cannot proceed at step ${model.cursor + 1} (${EVENT_LABELS[input.event]}${input.itemId === undefined ? "" : ` for item #${input.itemId}`}): ${REJECTION_LABELS[result.reason]}`;
};

const applyEvent = (model: Model, event: EventId, origin: EventOrigin, itemId?: number): Model => {
  const result = stepFlow(model.flow, event, itemId);
  if (!result.accepted) return { ...model, feedback: origin === "guided"
    ? `Guided trace cannot proceed at step ${model.cursor + 1}: ${REJECTION_LABELS[result.reason]}`
    : REJECTION_LABELS[result.reason] };
  const actualId = result.changes.find((change) => change.kind === "transition")?.itemId ?? null;
  const plannedId = origin === "guided" && event === "EditObserved" ? plannedItemAt(model) : null;
  const emitted = result.changes.flatMap((change) => change.kind === "emitted"
    ? [{ event: change.event, at: change.at, itemId: change.itemId }] : []);
  return {
    ...model, flow: result.state, lastEvent: event,
    guidedBindings: plannedId === null || actualId === null ? model.guidedBindings
      : [...model.guidedBindings, { plannedId, actualId }],
    history: [...model.history, { event, itemId: actualId, origin }],
    cursor: model.cursor + (origin === "guided" ? 1 : 0),
    emissions: [...model.emissions, ...emitted],
    feedback: `${describeAccepted(model.flow, result.state, event, routeFor(event))}${actualId === null ? "" : ` Item #${actualId}.`}`,
  };
};

const replayHistory = (model: Model, count: number): Model => {
  let replayed = { ...reset(model.trace), timeline: model.timeline };
  for (const step of model.history.slice(0, count)) {
    const input = step.origin === "guided" ? guidedInput(replayed) : null;
    replayed = applyEvent(replayed, step.event, step.origin,
      step.origin === "manual" ? step.itemId ?? undefined : input?.itemId);
  }
  return replayed;
};

export const update = (model: Model, message: Message) =>
  Message.match<Update.Return<Model, Message>>(message, {
    SelectedTimeline: ({ index }) => ({ model: { ...model, timeline: index >= 0 && index < TIMELINE_CASES.length ? index : 0 } }),
    SelectedTrace: ({ index }) => ({ model: { ...reset(index >= 0 && index < TRACES.length ? index : 0), timeline: model.timeline } }),
    Reset: () => ({ model: { ...reset(model.trace), timeline: model.timeline } }),
    Advanced: () => {
      const input = guidedInput(model);
      if (input === null) return { model };
      const blocked = guidedBlock(model);
      if (blocked !== null) return { model: { ...model, feedback: blocked } };
      return { model: applyEvent(model, input.event, "guided", input.itemId) };
    },
    Rewound: () => {
      return { model: model.history.length === 0 ? model : replayHistory(model, model.history.length - 1) };
    },
    TriggeredEvent: ({ event, itemId }) => ({ model: applyEvent(model, event, "manual", itemId ?? undefined) }),
    JumpedToHistory: ({ count }) => ({ model: replayHistory(model, count) }),
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
const geometry = (transition: Transition) => {
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
    start = { x: fx + Math.sign(dx) * NODE_WIDTH / 2, y: fy };
    end = { x: tx - Math.sign(dx) * NODE_WIDTH / 2, y: ty };
  } else {
    start = { x: fx, y: fy + Math.sign(dy) * NODE_HEIGHT / 2 };
    end = { x: tx, y: ty - Math.sign(dy) * NODE_HEIGHT / 2 };
  }
  const control1 = { x: start.x + dx * 0.34, y: start.y + dy * 0.12 };
  const control2 = { x: end.x - dx * 0.34, y: end.y - dy * 0.12 };
  return {
    path: `M ${start.x} ${start.y} C ${control1.x} ${control1.y}, ${control2.x} ${control2.y}, ${end.x} ${end.y}`,
    badge: { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 },
  };
};

const arrow = (h: HtmlBuilder<Message>, events: readonly EventId[], number: number, active: boolean) => {
  const transition = routeFor(events[0]);
  const { path, badge } = geometry(transition);
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

const nodeView = (h: HtmlBuilder<Message>, id: NodeId, model: Model) => {
  const flow = model.flow;
  const node = NODES[id];
  const palette = colors[node.role];
  const packets = flow.packets.filter((packet) => packet.at === id);
  const shortIds = packets.slice(0, 4).map((packet) => `#${packet.id}`).join(", ") +
    (packets.length > 4 ? ` +${packets.length - 4}` : "");
  const special = id === "deliveryState" ? `virtual round ${flow.virtualRoundId} · ${flow.virtualRoundActive ? "active" : "closed"} · ${flow.stopContinuations}/${MAX_STOP_CONTINUATIONS}`
    : id === "agentEdit" ? "fresh edit enters through adapter"
    : id === "collector" ? (flow.leaseSurface ? `${flow.leaseSurface} batch reserved` : flow.opportunity ? `${flow.opportunity} request received` : "waiting for an agent runtime request")
    : id === "hostOutput" ? (flow.lastSubmissionSurface ? "written; no payload stored here" : "no response written yet")
    : id === "workQueue" ? (packets.length === 0 ? "queue empty" : `${packets.length} queued · ${shortIds}`)
    : id === "jev" ? `${packets.length} requests at Jev · ${shortIds}`
    : id === "adviceStore" ? (packets.length ? `${packets.length} finding${packets.length === 1 ? "" : "s"} · ${shortIds}` : "no pending advice")
    : id === "outcomeStore" ? (model.emissions.some((item) => item.at === id) ? "updated; no payload stored here" : "no completed review yet")
    : packets.length ? `${packets.length} item${packets.length === 1 ? "" : "s"} · ${shortIds}` : "idle in this example";
  return h.g([], [
    h.rect([h.X(String(node.x)), h.Y(String(node.y)), h.Width(String(NODE_WIDTH)),
      h.Height(String(NODE_HEIGHT)), h.Rx("12"), h.Fill(palette.fill),
      h.Stroke(palette.stroke), h.StrokeWidth("2")], []),
    h.text([h.X(String(node.x + 14)), h.Y(String(node.y + 26)), h.FontSize("16"),
      h.FontWeight("700"), h.Fill("#1e3048")], [node.label]),
    h.text([h.X(String(node.x + 14)), h.Y(String(node.y + 51)), h.FontSize("12"),
      h.Fill("#52647d")], [node.detail]),
    ...node.notes.map((line, index) => h.text([
      h.X(String(node.x + 14)), h.Y(String(node.y + 73 + index * 17)), h.FontSize("11"),
      h.Fill("#52647d"),
    ], [line])),
    h.text([h.X(String(node.x + 14)), h.Y(String(node.y + 119)), h.FontSize("12"),
      h.FontWeight("700"), h.Fill("#344964")], [special]),
  ]);
};

const chart = (model: Model, h: HtmlBuilder<Message>) => h.div([h.Class("chart-scroll")], [
  h.svg([h.ViewBox("0 0 1450 810"), h.Role("img"),
    h.AriaLabel("One-agent, multiple-review-item model: event-labeled data flow from agent edit through Hapsland and Jev to agent runtime output")], [
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
    h.text([h.X("30"), h.Y("28"), h.FontSize("13"), h.FontWeight("700"), h.Fill("#34516e")], [
      `Model scope: one agent · multiple items · ${MAX_ACTIVE_REVIEW_JOBS} active review jobs`,
    ]),
    ...CONNECTIONS.map((events, index) => arrow(h, events, index + 1, model.lastEvent !== null && events.includes(model.lastEvent))),
    ...NODE_IDS.map((id) => nodeView(h, id, model)),
    ...[
      { x: 30, y: 752, text: "* Stop reoffer: implemented in the #105 candidate." },
      { x: 30, y: 775, text: "** Size, time, expiry and full agent checks are not simulated." },
      { x: 780, y: 729, text: "Numbers match the event controls below." },
      { x: 780, y: 752, text: "Solid: data movement · Dashed: control event" },
      { x: 780, y: 775, text: "Amber: stored state · Blue: work · Grey: external · Purple: output" },
    ].map(({ x, y, text }) => h.text([
      h.X(String(x)), h.Y(String(y)), h.FontSize("12"), h.Fill("#52647d"),
    ], [text])),
  ]),
]);

const eventLabel = (event: EventId): string => {
  const transition = routeFor(event);
  return `${EVENT_LABELS[event]} · ${NODES[transition.from].label} → ${NODES[transition.to].label}`;
};

export const view = (model: Model, h: HtmlBuilder<Message>): Document => {
  const trace = TRACES[model.trace];
  const next = trace?.events[model.cursor];
  const previous = model.history.at(-1);
  const blocked = guidedBlock(model);
  const liveItems = model.flow.packets;
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
          `One agent, multiple review items, a FIFO work queue, and at most ${MAX_ACTIVE_REVIEW_JOBS} active preparation or evaluation jobs. No live connection or multiple-agent simulation.`,
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
              previous === undefined ? "Previous" : `Previous ${previous.origin}: ${EVENT_LABELS[previous.event]}`,
            ]),
            h.button([h.OnClick(Message.Advanced()), h.Class("primary"), h.Disabled(next === undefined)], [
              next === undefined ? "Trace complete" : `Next: ${EVENT_LABELS[next]}`,
            ]),
            h.button([h.OnClick(Message.Reset())], ["Reset trace"]),
            h.span([h.Class("key-hint")], ["← / → keys"]),
          ]),
          h.p([h.Class("progress")], [trace
            ? `Guided step ${model.cursor} of ${trace.events.length} · ${model.history.filter((entry) => entry.origin === "manual").length} manual events`
            : "Free play"]),
          h.h3([], ["Event history"]),
          h.p([h.Class("description")], ["Select a completed step to return to its resulting state; later steps are then discarded."]),
          h.div([h.Class("history")], [
            h.button([h.OnClick(Message.JumpedToHistory({ count: 0 }))], ["Initial state"]),
            ...model.history.map((step, index) => h.button([
              h.OnClick(Message.JumpedToHistory({ count: index + 1 })),
            ], [`${index + 1}. ${step.origin === "guided" ? "Guided" : "Manual"}: ${EVENT_LABELS[step.event]}${step.itemId === null ? "" : ` · #${step.itemId}`}`])),
          ]),
          h.p([h.Class("status")], [model.feedback]),
          ...(blocked === null ? [] : [h.p([h.Class("status blocked")], [blocked])]),
          h.h3([], ["Live review data in this virtual round"]),
          h.div([h.Class("packets")], liveItems.map((packet) =>
            h.div([h.Class("packet")], [
              h.strong([], [`#${packet.id} ${packet.flavor}`]),
              h.span([], [NODES[packet.at].label]),
            ]))),
          h.h3([], ["Emitted outcomes — example history"]),
          h.p([h.Class("description")], ["These entries record what the example emitted. They are not payloads stored at the process boxes and cannot be selected as pending advice."]),
          h.div([h.Class("packets")], model.emissions.length === 0
            ? [h.p([h.Class("description")], ["No response or status update emitted yet."])]
            : model.emissions.map((item) => h.div([h.Class("packet")], [
              h.strong([], [`#${item.itemId} ${EMISSION_LABELS[item.event]}`]), h.span([], [NODES[item.at].label]),
            ]))),
          h.p([h.Class("state-line")], [
            `Virtual round ${model.flow.virtualRoundId} (${model.flow.virtualRoundActive ? "active" : "closed"}) · active review jobs ${activeReviewJobCount(model.flow)}/${MAX_ACTIVE_REVIEW_JOBS} · Stop continuation requests ${model.flow.stopContinuations}/${MAX_STOP_CONTINUATIONS} · ` +
            `reserved batch ${model.flow.leaseSurface ?? "none"} · last response ${model.flow.lastSubmissionSurface ?? "none"}`,
          ]),
        ]),
        h.section([h.Class("card")], [
          h.h2([], ["Events, prerequisites, and information"]),
          h.p([h.Class("description")], ["Choose an event for a specific item. Manual events interleave with the selected guided trace without advancing it. Add more edits at any time in an active virtual round; queued items wait in FIFO order. Disabled actions show what is missing or why an item must wait. The two active-job slots follow the current resident constant; exact production scheduling is outside this sidecar."]),
          h.div([h.Class("events")], nextEventOptions(model.flow).map((option) => {
            const event = option.event;
            const transition = routeFor(event);
            return h.button([h.OnClick(Message.TriggeredEvent({ event, itemId: option.itemId })), h.Disabled(!option.available),
              h.Class(option.available ? "event-row available" : "event-row unavailable")], [
              h.span([h.Class("event-number")], [String(CONNECTIONS.findIndex((events) => events.includes(event)) + 1)]),
              h.span([h.Class("event-copy")], [
                h.strong([], [`${EVENT_LABELS[event]}${option.itemId === null ? "" : ` · item #${option.itemId}`}`]),
                h.small([], [eventLabel(event)]),
                h.small([], [transition.kind === "data"
                  ? `${transition.input} → ${transition.output}${transition.movement === "copy" ? " · source retained" : ""}`
                  : `${transition.signal} request · agent identity and delivery context`]),
                h.small([], [option.available ? "Available now" : REJECTION_LABELS[option.reason]]),
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
          h.div([h.Class("packet")], [h.strong([], ["Stop continuation requests"]), h.span([], [`${model.flow.stopContinuations} of ${MAX_STOP_CONTINUATIONS}`])]),
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
