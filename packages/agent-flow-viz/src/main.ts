import { Schema } from "effect";
import { timelineView } from "./timeline-view";
import { BEND_CONNECTIONS, bendRouteFor, compareHistory } from "./bend-comparison";
import { TIMELINE_CASES } from "./timeline";
import { Runtime, type Update } from "foldkit";
import type { Document, HtmlBuilder } from "foldkit/html";
import { defineMessageUnion } from "foldkit/message";
import { CONTROL_SIGNAL_LABELS, describeAccepted, EMISSION_LABELS, EVENT_LABELS, NODES, REJECTION_LABELS } from "./diagram";
import { CONNECTIONS, PROJECTED_TRACES, nextEventOptions, routeFor } from "./generation";
import { TRACES } from "./scenarios";
import {
  EVENT_IDS, FlowStateSchema, INTERNAL_EVENTS, MAX_STOP_CONTINUATIONS, NODE_IDS,
  activeReviewJobCount, activeSourceJobCount, advicePolicyInput, initialFlow, stepFlow, type EventId, type FlowState, type NodeId, type Transition,
} from "./flow";

export const Model = Schema.Struct({
  trace: Schema.Number,
  timeline: Schema.Number,
  cursor: Schema.Number,
  flow: FlowStateSchema,
  guidedBindings: Schema.Array(Schema.Struct({ plannedId: Schema.Number, actualId: Schema.Number })),
  historyPosition: Schema.Number,
  history: Schema.Array(Schema.Union([
    Schema.Struct({ kind: Schema.Literal("flow"), event: Schema.Literals(EVENT_IDS),
      itemId: Schema.Union([Schema.Null, Schema.Number]), origin: Schema.Literals(["guided", "manual"]),
      automatic: Schema.Array(Schema.Struct({ event: Schema.Literals(INTERNAL_EVENTS), itemId: Schema.Union([Schema.Null, Schema.Number]) })) }),
    Schema.Struct({ kind: Schema.Literal("capacity"), capacityType: Schema.Literals(["source", "jev"]), capacity: Schema.Number,
      automatic: Schema.Array(Schema.Struct({ event: Schema.Literals(INTERNAL_EVENTS), itemId: Schema.Union([Schema.Null, Schema.Number]) })) }),
  ])),
  lastChangeEvents: Schema.Array(Schema.Literals(EVENT_IDS)),
  feedback: Schema.String,
  emissions: Schema.Array(Schema.Struct({
    event: Schema.Literals(["HostOutputSubmitted", "JevClearReceived", "JevUnavailable"]),
    at: Schema.Literals(NODE_IDS),
    itemId: Schema.Number,
  })),
  lastFinishDecision: Schema.Union([Schema.Null, Schema.Struct({
    response: Schema.Literals(["continueWithAdvice", "allowFinish"]),
    adviceItemIds: Schema.Array(Schema.Number),
    discardedItemIds: Schema.Array(Schema.Number),
    cancelledSourceReadingIds: Schema.Array(Schema.Number),
    cancelledJevRequestIds: Schema.Array(Schema.Number),
  })]),
});
export type Model = typeof Model.Type;

export const Message = defineMessageUnion({
  SelectedTrace: { index: Schema.Number },
  SelectedTimeline: { index: Schema.Number },
  Advanced: {},
  Rewound: {},
  Redid: {},
  TriggeredEvent: { event: Schema.Literals(EVENT_IDS), itemId: Schema.Union([Schema.Null, Schema.Number]) },
  CapacitySubmitted: { capacityType: Schema.Literals(["source", "jev"]), raw: Schema.String },
  JumpedToHistory: { count: Schema.Number },
  Reset: {},
});
export type Message = typeof Message.Type;

const reset = (trace: number): Model => ({
  trace, timeline: 0, cursor: 0, flow: initialFlow(), guidedBindings: [], historyPosition: 0,
  history: [], lastChangeEvents: [], emissions: [], lastFinishDecision: null,
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
  const automatic = result.changes.flatMap((change) => change.kind === "transition" &&
    (INTERNAL_EVENTS as readonly string[]).includes(change.event)
    ? [{ event: change.event as (typeof INTERNAL_EVENTS)[number], itemId: change.itemId }] : []);
  const recorded = { kind: "flow" as const, event, itemId: actualId, origin, automatic };
  const nextRecorded = model.history[model.historyPosition];
  const followsTail = nextRecorded?.kind === "flow" && nextRecorded.event === recorded.event &&
    nextRecorded.itemId === recorded.itemId && nextRecorded.origin === recorded.origin;
  const emitted = result.changes.flatMap((change) => change.kind === "emitted"
    ? [{ event: change.event, at: change.at, itemId: change.itemId }] : []);
  const finishDecision = result.changes.find((change) => change.kind === "finishDecision");
  const feedback = finishDecision === undefined
    ? `${describeAccepted(model.flow, result.state, event, routeFor(event))}${actualId === null ? "" : ` Item #${actualId}.`}`
    : finishDecision.response === "continueWithAdvice"
      ? `Hapsland chose a continue-with-advice response containing item${finishDecision.adviceItemIds.length === 1 ? "" : "s"} ${finishDecision.adviceItemIds.map((id) => `#${id}`).join(", ")}. It discarded ${finishDecision.discardedItemIds.length} other items and requested cancellation of ${finishDecision.cancelledSourceReadingIds.length} source readings and ${finishDecision.cancelledJevRequestIds.length} Jev requests from this flow.`
      : `Hapsland chose an allow-finish response. It discarded ${finishDecision.discardedItemIds.length} items and requested cancellation of ${finishDecision.cancelledSourceReadingIds.length} source readings and ${finishDecision.cancelledJevRequestIds.length} Jev requests from this virtual round.`;
  return {
    ...model, flow: result.state,
    lastChangeEvents: result.changes.flatMap((change) => change.kind === "transition" ? [change.event] : []),
    lastFinishDecision: finishDecision === undefined ? model.lastFinishDecision : {
      response: finishDecision.response, adviceItemIds: finishDecision.adviceItemIds,
      discardedItemIds: finishDecision.discardedItemIds,
      cancelledSourceReadingIds: finishDecision.cancelledSourceReadingIds,
      cancelledJevRequestIds: finishDecision.cancelledJevRequestIds,
    },
    guidedBindings: plannedId === null || actualId === null ? model.guidedBindings
      : [...model.guidedBindings, { plannedId, actualId }],
    history: followsTail ? model.history : [...model.history.slice(0, model.historyPosition), recorded],
    historyPosition: model.historyPosition + 1,
    cursor: model.cursor + (origin === "guided" ? 1 : 0),
    emissions: [...model.emissions, ...emitted],
    feedback,
  };
};

const applyCapacity = (model: Model, capacityType: "source" | "jev", capacity: number): Model => {
  const result = stepFlow(model.flow, { type: capacityType === "source" ? "SourceCapacitySet" : "ReviewCapacitySet", capacity });
  if (!result.accepted) return { ...model, feedback: REJECTION_LABELS[result.reason] };
  const nextRecorded = model.history[model.historyPosition];
  const followsTail = nextRecorded?.kind === "capacity" && nextRecorded.capacityType === capacityType && nextRecorded.capacity === capacity;
  const automatic = result.changes.flatMap((change) => change.kind === "transition" &&
    (INTERNAL_EVENTS as readonly string[]).includes(change.event)
    ? [{ event: change.event as (typeof INTERNAL_EVENTS)[number], itemId: change.itemId }] : []);
  return { ...model, flow: result.state,
    lastChangeEvents: result.changes.flatMap((change) => change.kind === "transition" ? [change.event] : []),
    history: followsTail ? model.history : [...model.history.slice(0, model.historyPosition), { kind: "capacity", capacityType, capacity, automatic }],
    historyPosition: model.historyPosition + 1,
    feedback: `${capacityType === "source" ? "Source-reading" : "Jev request"} capacity set to ${capacity}. ${capacityType === "source" ? activeSourceJobCount(result.state) : activeReviewJobCount(result.state)} currently active.`,
  };
};

const replayHistory = (model: Model, count: number): Model => {
  const position = Math.max(0, Math.min(model.history.length, count));
  let replayed = { ...reset(model.trace), timeline: model.timeline };
  for (const step of model.history.slice(0, position)) {
    if (step.kind === "capacity") replayed = applyCapacity(replayed, step.capacityType, step.capacity);
    else {
      const input = step.origin === "guided" ? guidedInput(replayed) : null;
      replayed = applyEvent(replayed, step.event, step.origin,
        step.origin === "manual" ? step.itemId ?? undefined : input?.itemId);
    }
  }
  return { ...replayed, history: model.history, historyPosition: position };
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
      return { model: model.historyPosition === 0 ? model : replayHistory(model, model.historyPosition - 1) };
    },
    Redid: () => ({ model: model.historyPosition === model.history.length ? model : replayHistory(model, model.historyPosition + 1) }),
    TriggeredEvent: ({ event, itemId }) => ({ model: applyEvent(model, event, "manual", itemId ?? undefined) }),
    CapacitySubmitted: ({ capacityType, raw }) => ({ model: applyCapacity(model, capacityType, Number(raw)) }),
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

const arrow = (h: HtmlBuilder<Message>, events: readonly EventId[], number: number, active: boolean,
  route: (event: EventId) => Transition) => {
  const transition = route(events[0]);
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
    : id === "advicePolicy" ? (() => {
      const input = advicePolicyInput(flow);
      return `${input.unfinishedWorkItemIds.length} unfinished · ${input.ongoingJevRequestIds.length} at Jev · ${input.pendingAdviceIds.length} advice · ${input.openFinishDecision ? "finish wait open" : "no finish wait"}`;
    })()
    : id === "responseCommand" ? (flow.stopWaiting ? "finish decision pending" : "decision command leaves reducer")
    : id === "observedWrite" ? (flow.lastSubmissionSurface ? "background write observed" : "no write observed in model")
    : id === "editQueue" || id === "reviewQueue" ? (packets.length === 0 ? "queue empty" : `${packets.length} queued · ${shortIds}`)
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

const chart = (model: Model, h: HtmlBuilder<Message>,
  connections: readonly (readonly EventId[])[] = CONNECTIONS,
  route: (event: EventId) => Transition = routeFor) => h.div([h.Class("chart-scroll")], [
  h.svg([h.ViewBox("0 0 1450 1010"), h.Role("img"),
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
      `Model scope: one agent · multiple items · ${model.flow.reviewCapacity} Jev slots (settable)`,
    ]),
    ...connections.map((events, index) => arrow(h, events, index + 1,
      events.some((event) => model.lastChangeEvents.includes(event)), route)),
    ...NODE_IDS.map((id) => nodeView(h, id, model)),
    ...[
      { x: 30, y: 945, text: "Hook response command and observed write are separate boundaries." },
      { x: 30, y: 968, text: "Size limits, wall-clock time and expiry are outside this model." },
      { x: 780, y: 922, text: "Numbers match the event controls below." },
      { x: 780, y: 945, text: "Solid: data movement · Dashed: control event" },
      { x: 780, y: 968, text: "Amber: stored state · Blue: work · Grey: external · Purple: output" },
    ].map(({ x, y, text }) => h.text([
      h.X(String(x)), h.Y(String(y)), h.FontSize("12"), h.Fill("#52647d"),
    ], [text])),
  ]),
]);

const itemIds = (ids: readonly number[]): string => ids.length === 0 ? "none" : ids.map((id) => `#${id}`).join(", ");
const finishDecisionChart = (model: Model, h: HtmlBuilder<Message>) => {
  const decision = model.lastFinishDecision;
  return h.section([h.Class("finish-panel")], [
    h.h3([], ["Latest finish decision · reducer projection"]),
    h.div([h.Class("finish-flow")], [
      h.div([h.Class("finish-triggers")], [
        h.div([h.Class("finish-box event")], [EVENT_LABELS.FinishDecisionAllWorkSettled]),
        h.div([h.Class("finish-box event")], [EVENT_LABELS.FinishDecisionDeadlineReached]),
        h.div([h.Class("finish-box event")], [EVENT_LABELS.FinishDecisionBudgetExhausted]),
      ]),
      h.span([h.Class("finish-arrow")], ["→"]),
      h.div([h.Class("finish-box policy")], ["Advice policy", h.small([], ["select pending advice; discard unfinished work"])]),
      h.span([h.Class("finish-arrow")], ["→"]),
      h.div([h.Class("finish-outcomes")], [
        h.div([h.Class(`finish-box outcome${decision?.response === "continueWithAdvice" ? " chosen" : ""}`)], [
          "Continue with advice", h.small([], ["virtual round stays active"]),
        ]),
        h.div([h.Class(`finish-box outcome${decision?.response === "allowFinish" ? " chosen" : ""}`)], [
          "Allow finish", h.small([], ["virtual round closes"]),
        ]),
      ]),
      h.span([h.Class("finish-arrow")], ["→"]),
      h.div([h.Class("finish-box command")], ["Response command", h.small([], ["adapter write remains unobserved here"])]),
    ]),
    h.div([h.Class("finish-facts")], [
      h.span([], [`Selected advice: ${decision === null ? "no decision yet" : itemIds(decision.adviceItemIds)}`]),
      h.span([], [`Discarded: ${decision === null ? "no decision yet" : itemIds(decision.discardedItemIds)}`]),
      h.span([], [`Cancel source readings: ${decision === null ? "no decision yet" : itemIds(decision.cancelledSourceReadingIds)}`]),
      h.span([], [`Cancel Jev requests: ${decision === null ? "no decision yet" : itemIds(decision.cancelledJevRequestIds)}`]),
      h.span([], [`Continuation requests reserved: ${model.flow.stopContinuations}/${MAX_STOP_CONTINUATIONS}`]),
    ]),
  ]);
};

const eventLabel = (event: EventId): string => {
  const transition = routeFor(event);
  return `${EVENT_LABELS[event]} · ${NODES[transition.from].label} → ${NODES[transition.to].label}`;
};
const historyLabel = (step: Model["history"][number]): string =>
  (step.kind === "capacity"
    ? `${step.capacityType === "source" ? "Source-reading" : "Jev request"} capacity set to ${step.capacity}`
    : `${step.origin === "guided" ? "Guided" : "Manual"}: ${EVENT_LABELS[step.event]}${step.itemId === null ? "" : ` · #${step.itemId}`}`) +
  (step.automatic.length === 0 ? "" : ` · then ${step.automatic.map((change) => `${EVENT_LABELS[change.event]}${change.itemId === null ? "" : ` #${change.itemId}`}`).join(", ")}`);

export const view = (model: Model, h: HtmlBuilder<Message>): Document => {
  const trace = TRACES[model.trace];
  const next = trace?.events[model.cursor];
  const previous = model.history[model.historyPosition - 1];
  const redo = model.history[model.historyPosition];
  const blocked = guidedBlock(model);
  const liveItems = model.flow.packets;
  const comparison = compareHistory(model.history.slice(0, model.historyPosition).map((step) =>
    step.kind === "capacity"
      ? { event: { type: step.capacityType === "source" ? "SourceCapacitySet" as const : "ReviewCapacitySet" as const,
          capacity: step.capacity } }
      : { event: step.event, itemId: step.event === "EditObserved" ? undefined : step.itemId ?? undefined }));
  const bendModel: Model = {
    ...model,
    flow: comparison.flow,
    lastChangeEvents: comparison.changes.flatMap((change) => change.kind === "transition" ? [change.event] : []),
    lastFinishDecision: comparison.finishDecision,
    emissions: comparison.emissions,
  };
  return {
    title: "Hapsland · agent flow visualization",
    body: h.main([h.Class("page")], [
      h.header([h.Class("page-header")], [
        h.p([h.Class("eyebrow")], ["SIDECAR AND BEND FLOW MODELS · FOLDKIT"]),
        h.h1([], ["From agent edit to Jev and back"]),
        h.a([h.Href("#timing-diagrams"), h.Class("timing-jump")], ["Jump to timing diagrams ↓"]),
        h.p([h.Class("intro")], [
          "One agent reports edits and receives advice through Claude Code or Codex. The runtime adapter identifies the agent. The TypeScript sidecar and compiled Bend flow reducer replay the same inputs below.",
        ]),
        h.p([h.Class("caveat")], [
          `One agent, separate edit and review queues, immediate retention of Jev findings, and ${model.flow.reviewCapacity} configured Jev slots. No live connection or multiple-agent simulation. The Bend flow model is narrower than production policy.`,
        ]),
      ]),
      h.section([h.Class("chart-panel")], [
        h.div([h.Class("section-head")], [
          h.h2([], ["Review and advice flow · two code paths"]),
          h.span([], ["Scroll horizontally on narrow screens"]),
        ]),
        h.div([h.Class("comparison-grid")], [
          h.div([h.Class("comparison-column")], [
            h.h3([], ["TypeScript sidecar reducer"]),
            h.p([h.Class("description")], ["Current diagram's original interactive model."]),
            chart(model, h),
            finishDecisionChart(model, h),
          ]),
          h.div([h.Class("comparison-column")], [
            h.h3([], ["Compiled Bend Flow.bend reducer"]),
            h.p([h.Class("description")], ["Replayed from the same accepted event history. State, routes, emissions, and finish choice come from generated Bend JavaScript. Layout and labels are shared presentation code."]),
            chart(bendModel, h, BEND_CONNECTIONS, bendRouteFor),
            finishDecisionChart(bendModel, h),
          ]),
        ]),
        h.div([h.Class(comparison.differences.length === 0 ? "comparison-status matched" : "comparison-status different")], [
          h.strong([], [comparison.differences.length === 0
            ? `Routes and ${comparison.compared} applied step${comparison.compared === 1 ? "" : "s"} match`
            : `${comparison.differences.length} difference${comparison.differences.length === 1 ? "" : "s"} in routes or ${comparison.compared} applied steps`]),
          h.p([], ["Compared every displayed route plus acceptance, rejection reasons, ordered changes, and projected flow state for this replay. This is not a proof of every possible path or of the wider resident."]),
          ...comparison.differences.map((difference) => h.p([], [difference])),
        ]),
      ]),
      h.section([h.Class("card policy-scope")], [
        h.h2([], ["What the sidecar does not model"]),
        h.p([], ["The twin diagrams compare the overlapping Flow.bend reducer only. Production calls separate generated Bend policies for the stages below. A matching diagram does not establish parity for those stages. Follow each link to the Bend source and the resident call site."]),
        h.div([h.Class("scope-list")], [
          ...([
            ["Edit permits and admission", "Admission.bend", "src/resident/composed-delivery.ts"],
            ["Observation fan-out and work cancellation", "Work.bend", "src/resident/bend-work.ts"],
            ["Stop cutoff and final output reservation", "Lifecycle.bend", "src/resident/bend-work.ts"],
            ["Finding selection and collection gates", "Collection.bend", "src/resident/collection.ts"],
            ["Per-finding delivery leases", "Delivery.bend", "src/resident/composed-delivery.ts"],
            ["Ticket outcomes and final authority", "Ticket.bend", "src/resident/server.ts"],
            ["Logical capacity ledger", "Ledger.bend", "src/resident/capacity.ts"],
            ["Revision supersession", "Revision.bend", "src/resident/server.ts"],
            ["Reuse routing", "Reuse.bend", "src/resident/server.ts"],
            ["Successful-review cache pressure", "Cache.bend", "src/resident/evaluation-reuse.ts"],
            ["Operational notices", "Notice.bend", "src/resident/operational-notice-policy.ts"],
            ["Ticket retention", "Retention.bend", "src/resident/server.ts"],
          ] as const).map(([label, bendSource, caller]) => h.div([h.Class("scope-row")], [
            h.strong([], [label]),
            h.a([h.Href(`https://github.com/dearlordylord/hapsland/blob/ed4ac70/packages/agent-flow-bend/${bendSource}`)], [bendSource]),
            h.a([h.Href(`https://github.com/dearlordylord/hapsland/blob/ed4ac70/${caller}`)], ["resident use"]),
          ])),
        ]),
        h.p([h.Class("description")], ["Flow.bend is an executable parity model; production uses generated gates from the richer Bend modules. The resident still performs I/O, source capture, identity and time measurements, and applies the decisions in TypeScript."]),
      ]),
      h.section([h.Class("capacity-control")], [
        h.label([h.For("source-capacity")], ["Concurrent source readings"]),
        h.input([h.Id("source-capacity"), h.Type("number"), h.Min("1"), h.Step("1"),
          h.Value(String(model.flow.sourceCapacity)),
          h.OnChange((raw) => Message.CapacitySubmitted({ capacityType: "source", raw }))]),
        h.label([h.For("review-capacity")], ["Concurrent Jev requests (N)"]),
        h.input([h.Id("review-capacity"), h.Type("number"), h.Min("1"), h.Step("1"),
          h.Value(String(model.flow.reviewCapacity)),
          h.OnChange((raw) => Message.CapacitySubmitted({ capacityType: "jev", raw }))]),
        h.p([], ["Changing N is a reducer event recorded in history. If N falls below the number of requests already at Jev, those requests finish normally; no new request starts until a slot is available. Source reading does not use N."]),
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
              previous === undefined ? "Previous" : `Previous: ${historyLabel(previous)}`,
            ]),
            h.button([h.OnClick(Message.Redid()), h.Disabled(redo === undefined)], [
              redo === undefined ? "Redo" : `Redo: ${historyLabel(redo)}`,
            ]),
            h.button([h.OnClick(Message.Advanced()), h.Class("primary"), h.Disabled(next === undefined)], [
              next === undefined ? "Trace complete" : `Next: ${EVENT_LABELS[next]}`,
            ]),
            h.button([h.OnClick(Message.Reset())], ["Reset trace"]),
            h.span([h.Class("key-hint")], ["← / → keys"]),
          ]),
          h.p([h.Class("progress")], [trace
            ? `Guided step ${model.cursor} of ${trace.events.length} · ${model.history.slice(0, model.historyPosition).filter((entry) => entry.kind === "capacity" || entry.origin === "manual").length} manual events · history ${model.historyPosition}/${model.history.length}`
            : "Free play"]),
          h.h3([], ["Event history"]),
          h.p([h.Class("description")], ["Select any recorded step to move there. Future steps remain available for redo until a different event replaces that tail."]),
          h.div([h.Class("history")], [
            h.button([h.OnClick(Message.JumpedToHistory({ count: 0 })),
              h.Class(model.historyPosition === 0 ? "current" : "past")], ["Initial state"]),
            ...model.history.map((step, index) => h.button([
              h.OnClick(Message.JumpedToHistory({ count: index + 1 })),
              h.Class(index + 1 === model.historyPosition ? "current" : index + 1 < model.historyPosition ? "past" : "future"),
            ], [`${index + 1}. ${historyLabel(step)}`])),
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
            `Virtual round ${model.flow.virtualRoundId} (${model.flow.virtualRoundActive ? "active" : "closed"}) · source readings ${activeSourceJobCount(model.flow)}/${model.flow.sourceCapacity} · Jev requests ${activeReviewJobCount(model.flow)}/${model.flow.reviewCapacity} · continue-with-advice responses ${model.flow.stopContinuations}/${MAX_STOP_CONTINUATIONS} · ` +
            `unfinished items ${advicePolicyInput(model.flow).unfinishedWorkItemIds.length} · background wait ${model.flow.backgroundAvailable ? "started" : "absent"} · reserved batch ${model.flow.leaseSurface ?? "none"} · last response ${model.flow.lastSubmissionSurface ?? "none"}`,
          ]),
        ]),
        h.section([h.Class("card")], [
          h.h2([], ["Events, prerequisites, and information"]),
          h.p([h.Class("description")], ["Choose an event for a specific item. Manual events interleave with the selected guided trace without advancing it. Edit observations and review work items have separate queues. A Jev result completes its item in one reducer step. Disabled actions show what is missing. The reducer starts waiting source readings and Jev requests whenever a slot opens; those starts appear as generated graph movements."]),
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
                  : CONTROL_SIGNAL_LABELS[transition.signal]]),
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
            h.div([h.Class("packet")], [h.strong([], ["Unfinished review items"]), h.span([], [itemIds(advicePolicyInput(model.flow).unfinishedWorkItemIds)])]),
            h.div([h.Class("packet")], [h.strong([], ["Background advice wait"]), h.span([], [model.flow.backgroundAvailable ? "started with the edit" : "none"])]),
          h.div([h.Class("packet")], [h.strong([], ["Continue-with-advice responses reserved"]), h.span([], [`${model.flow.stopContinuations} of ${MAX_STOP_CONTINUATIONS}`])]),
          h.div([h.Class("packet")], [h.strong([], ["Finish-decision wait"]), h.span([], [model.flow.stopWaiting ? "runtime Stop hook call is open" : "none"])]),
          h.div([h.Class("packet")], [h.strong([], ["Batch reserved for"]), h.span([], [model.flow.leaseSurface ?? "no caller"])]),
          h.div([h.Class("packet")], [h.strong([], ["Last response written through"]), h.span([], [model.flow.lastSubmissionSurface ?? "none"])]),
        ]),
        h.p([], ["The runtime calls its Stop hook when the agent attempts to finish. Hapsland may hold that call open for a finish-decision wait. Returning block with advice asks the runtime to continue the same virtual round; returning allow closes Hapsland’s virtual round and discards its resources. A fresh edit can open another virtual round even if a different hook kept the agent’s actual round going. The hook response alone does not prove advice use or the actual end of the agent’s round."]),
      ]),
      timelineView(h, model.timeline, (index) => Message.SelectedTimeline({ index })),
    ]),
  };
};
