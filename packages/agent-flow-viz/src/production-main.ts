import { Schema } from "effect";
import { Runtime, type Update } from "foldkit";
import type { Document, HtmlBuilder } from "foldkit/html";
import { defineMessageUnion } from "foldkit/message";
import { IMPORT_GRAPH_SCENARIOS, importGraphView } from "./import-graph-view";
import { TIMELINE_CASES } from "./timeline";
import { timelineView } from "./timeline-view";
import { CAPACITY_INVENTORY } from "./capacity-inventory.generated";
import { CANONICAL_SCENARIOS, guidedIndex, nextGuidedEvent, replayCanonical, tryAppendCanonical, type ReplayEvent } from "./canonical-replay";
import { productionFlowView } from "./production-flow-view";
import type { CapacityPurpose, CanonicalCommand } from "../../../src/canonical/adapter";

export const Model = Schema.Struct({
  importScenario: Schema.Number,
  importCursor: Schema.Number,
  timeline: Schema.Number,
  scenario: Schema.Number,
  history: Schema.Array(Schema.Struct({ event: Schema.Unknown, origin: Schema.Literals(["guided", "manual"]) })),
  position: Schema.Number,
  frame: Schema.Number,
  draft: Schema.String,
  feedback: Schema.String,
});
export type Model = typeof Model.Type;

export const Message = defineMessageUnion({
  SelectedImportScenario: { index: Schema.Number },
  MovedImportCursor: { cursor: Schema.Number },
  SelectedTimeline: { index: Schema.Number },
  SelectedScenario: { index: Schema.Number },
  Advanced: {},
  Rewound: {},
  Redid: {},
  Jumped: { position: Schema.Number },
  MovedFrame: { frame: Schema.Number },
  DraftChanged: { raw: Schema.String },
  Submitted: {},
  Reset: {},
});
export type Message = typeof Message.Type;

export const init: Runtime.ApplicationInit<Model, Message> = () => ({ model: {
  importScenario: 0, importCursor: 0, timeline: 0, scenario: 0,
  history: [], position: 0, frame: 0,
  draft: '{"kind":"reserveCapacity","partition":3,"bytes":5,"purpose":"reviewUnit"}',
  feedback: "Source-free events use the same checked canonical adapter as the resident.",
} });

const append = (model: Model, event: unknown, origin: ReplayEvent["origin"]): Model => {
  const next = tryAppendCanonical(model.history as readonly ReplayEvent[], model.position, event, origin, CANONICAL_SCENARIOS[model.scenario].limits);
  return { ...model, history: [...next.history], position: next.position, frame: 0,
    feedback: next.error ?? (next.rejection === undefined
      ? "Canonical.step accepted this event." : `Canonical.step rejected this event: ${next.rejection}.`) };
};

export const update = (model: Model, message: Message) => Message.match<Update.Return<Model, Message>>(message, {
  SelectedImportScenario: ({ index }) => ({ model: { ...model,
    importScenario: index >= 0 && index < IMPORT_GRAPH_SCENARIOS.length ? index : 0, importCursor: 0 } }),
  MovedImportCursor: ({ cursor }) => ({ model: { ...model,
    importCursor: Math.max(0, Math.min(IMPORT_GRAPH_SCENARIOS[model.importScenario].steps.length, cursor)) } }),
  SelectedTimeline: ({ index }) => ({ model: { ...model, timeline: index >= 0 && index < TIMELINE_CASES.length ? index : 0 } }),
  SelectedScenario: ({ index }) => ({ model: { ...model, scenario: index >= 0 && index < CANONICAL_SCENARIOS.length ? index : 0,
    history: [], position: 0, frame: 0, feedback: "Canonical example selected." } }),
  Advanced: () => {
    const event = nextGuidedEvent(model.history as readonly ReplayEvent[], model.position, model.scenario);
    return { model: event === undefined ? model : append(model, event, "guided") };
  },
  Rewound: () => ({ model: { ...model, position: Math.max(0, model.position - 1), frame: 0 } }),
  Redid: () => ({ model: { ...model, position: Math.min(model.history.length, model.position + 1), frame: 0 } }),
  Jumped: ({ position }) => ({ model: { ...model, position: Math.max(0, Math.min(model.history.length, position)), frame: 0 } }),
  MovedFrame: ({ frame }) => ({ model: { ...model, frame } }),
  DraftChanged: ({ raw }) => ({ model: { ...model, draft: raw } }),
  Submitted: () => {
    try { return { model: append(model, JSON.parse(model.draft), "manual") }; }
    catch { return { model: { ...model, feedback: "Enter one valid JSON canonical event." } }; }
  },
  Reset: () => ({ model: { ...model, history: [], position: 0, frame: 0, feedback: "Canonical replay reset." } }),
});

const purposeLabels: Record<CapacityPurpose, string> = {
  observationDispatch: "Observation and dispatch",
  preparation: "Preparing review",
  reviewUnit: "Review unit",
  storedResult: "Stored result",
  operationalNotice: "Operational notice",
  adviceRecheck: "Advice recheck",
};
const limitLabels = {
  globalItems: "Resident work items", globalBytes: "Resident reserved bytes",
  partitionItems: "Agent work items", partitionBytes: "Agent reserved bytes",
} as const;
const coverageFamilies = [
  { name: "Round and observation admission", match: /^(openRound|admitObservation|startObservation|completeObservation|interruptObservation|issuePermit|consumePermit|releasePermit|expirePermit|closePermitRound)$/, source: "packages/agent-flow-bend/Canonical.bend" },
  { name: "Preparation and ordered unit admission", match: /^(beginPreparation|beginObservedPreparation|interruptPreparation|preparationCompleted|preparedOfferCheck|emptyPreparedCheck|reserveCapacity|replaceCapacity|resizeCapacity|releaseCapacity)$/, source: "packages/agent-flow-bend/Canonical.bend" },
  { name: "Preparation dispatch queue and cancellation", match: /^(queueDispatch|dispatchSettled|discardDispatch|dispatchScopeCheck|closeDispatch)$/, source: "packages/agent-flow-bend/Dispatch.bend" },
  { name: "Jev ready, command, attempt and terminal facts", match: /^(jevRequestReady|jevRequestStarted|jevRequestInterrupted|jevRequestSettled|startReview|retireReview|reviewCompleted|reviewObserved|reviewFailureCheck|findingCountUpdated)$/, source: "packages/agent-flow-bend/Canonical.bend" },
  { name: "Stop wait, cancellation and finish decision", match: /^(stopPolled|stopGroupPolled|stopGroupEnded|finishReserve|finishRelease|finishAuthorize|finishTerminal|finishEnd|continuationConsume)$/, source: "packages/agent-flow-bend/Canonical.bend" },
  { name: "Background and Stop collection, leases and expiry", match: /^collection/, source: "packages/agent-flow-bend/Collection.bend" },
  { name: "Advice submission, uncertain output and reoffer", match: /^submission/, source: "packages/agent-flow-bend/Delivery.bend" },
  { name: "Revision and revalidation", match: /^(revision|validationRouteCheck|postValidationCheck|finalCandidateCheck)/, source: "packages/agent-flow-bend/Revision.bend" },
  { name: "Ticket and retained unit outcome", match: /^ticket/, source: "packages/agent-flow-bend/Ticket.bend" },
  { name: "Delivery finalization, round barrier and cleanup", match: /^(delivery|round|cleanup)/, source: "packages/agent-flow-bend/Delivery.bend" },
  { name: "Reuse, cache and operational notice", match: /^(reuse|cache|notice)/, source: "packages/agent-flow-bend/Reuse.bend" },
  { name: "File and rule policy gates", match: /^(includeLayer|fileSelection|fileProtection|candidateFile|reviewAdmission|rule)/, source: "packages/agent-flow-bend/RulePolicy.bend" },
] as const;
const guidedKinds = new Set(CANONICAL_SCENARIOS.flatMap((scenario) => scenario.events.map((event) => event.kind)));
type CapacityFrameCommand = Extract<CanonicalCommand, { readonly kind:
  "preparationReleased" | "unitAdmitted" | "unitRefused" | "capacityUnitAdmitted" | "capacityUnitRefused" }>;
const isCapacityFrame = (command: CanonicalCommand): command is CapacityFrameCommand =>
  command.kind === "preparationReleased" || command.kind === "unitAdmitted" || command.kind === "unitRefused" ||
  command.kind === "capacityUnitAdmitted" || command.kind === "capacityUnitRefused";
const frameLabel = (command: CapacityFrameCommand): string => {
  switch (command.kind) {
    case "preparationReleased": return `Preparation space released · reservation #${command.id}`;
    case "capacityUnitAdmitted": return `Unit ${command.position}: accepted · ${command.bytes} B · reservation #${command.reservation}`;
    case "capacityUnitRefused": return `Unit ${command.position}: no capacity · ${command.bytes} B · ${command.reason}`;
    case "unitAdmitted": return `Unit ${command.position}: accepted · ${command.bytes} B · reservation #${command.reservation}`;
    case "unitRefused": return `Unit ${command.position}: no capacity · ${command.bytes} B · ${command.reason}`;
  }
};
const commandLabel = (command: CanonicalCommand): string => {
  if (isCapacityFrame(command)) return frameLabel(command);
  const details = Object.entries(command).filter(([key]) => key !== "kind" && key !== "after")
    .map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(", ") : String(value)}`);
  return [command.kind, ...details].join(" · ");
};

export const view = (model: Model, h: HtmlBuilder<Message>): Document => {
  const history = model.history as readonly ReplayEvent[];
  const replay = replayCanonical(history, model.position, CANONICAL_SCENARIOS[model.scenario].limits);
  const projection = replay.projection;
  const last = replay.steps.at(-1);
  const frames = last?.commands.filter(isCapacityFrame) ?? [];
  const frame = frames[Math.min(Math.max(model.frame, 0), Math.max(0, frames.length - 1))];
  const eventBefore = last?.before.global ?? projection.global;
  const eventAfter = last?.after.global ?? projection.global;
  const scenario = CANONICAL_SCENARIOS[model.scenario];
  const next = nextGuidedEvent(history, model.position, model.scenario);
  const guided = guidedIndex(history, model.position);
  const lastCommands = last?.commands ?? [];
  const activePurpose = projection.charges.map((charge) => purposeLabels[charge.purpose]);
  return {
    title: "Hapsland · canonical production flow",
    body: h.main([h.Class("page")], [
      h.header([h.Class("page-header")], [
        h.p([h.Class("eyebrow")], ["CANONICAL BEND PRODUCTION MODEL · FOLDKIT"]),
        h.h1([], ["From agent edit to Jev and back"]),
        h.p([h.Class("intro")], ["Step through the checked Bend transition used by the Hapsland resident. Agent runtimes supply observations; Hapsland executes native source, Jev, and host effects around Bend decisions."]),
        h.p([h.Class("caveat")], ["This source-free replay is an example, not a live connection to an agent runtime or Jev. Native timing evidence and the separate import graph appear below."]),
      ]),
      h.section([h.Class("chart-panel production-flow")], [
        h.h2([], ["Production decision flow"]),
        productionFlowView(h, projection, last),
        h.p([], [activePurpose.length ? `Reserved purposes: ${activePurpose.join(", ")}` : "No active capacity reservations."]),
        h.details([h.Class("flow-coverage")], [
          h.summary([], ["Transition-family coverage and source boundaries"]),
          h.p([], ["Guided status below is calculated from the loaded independent source-free fixtures. Manual replay accepts checked canonical events when their predecessor state and facts satisfy Bend's guards. The source link names each decision family."]),
          h.p([], ["Guided sources: ", h.a([h.Href("https://github.com/dearlordylord/hapsland/blob/master/conformance/canonical-v1.json")], ["canonical trace fixture"]), " and ", h.a([h.Href("https://github.com/dearlordylord/hapsland/blob/master/conformance/canonical-jev-request-v1.json")], ["Jev request trace fixture"]), "."]),
          h.ul([h.Class("flow-coverage-list")], coverageFamilies.map((family) => {
            const examples = [...guidedKinds].filter((kind) => family.match.test(kind));
            return h.li([], [
              h.strong([], [family.name]),
              ` · ${examples.length ? `guided: ${examples.join(", ")}` : "manual replay only in this dashboard"}`,
              " · manual replay available · ",
              h.a([h.Href(`https://github.com/dearlordylord/hapsland/blob/master/${family.source}`)], ["Bend source"]),
            ]);
          })),
          h.p([], ["Native facts and effects outside Bend: agent-runtime observation, source capture, clocks, Jev I/O, and host writes. ", h.a([h.Href("https://github.com/dearlordylord/hapsland/blob/master/src/resident/server.ts")], ["Resident boundary"]), ". Cross-file import traversal is modeled separately below and is not an executed production path; adoption is tracked by ", h.a([h.Href("https://github.com/dearlordylord/hapsland/issues/138")], ["#138"]), "."]),
        ]),
      ]),
      h.section([h.Id("canonical-replay"), h.Class("card canonical-replay")], [
        h.h2([], ["What uses review capacity"]),
        h.p([], ["Canonical Bend model · the inventory below is generated at build time from compiled Bend admission output. Each reservation uses the shared resident and per-agent item and byte limits."]),
        h.ul([h.Class("capacity-inventory")], CAPACITY_INVENTORY.map((entry) => h.li([], [
          h.strong([], [purposeLabels[entry.purpose]]),
          ` · ${entry.limits.map((limit) => limitLabels[limit]).join(" · ")}`,
        ]))),
        h.h2([], ["Review capacity"]),
        h.p([], [`All agents in this Hapsland process · ${projection.global.items}/${projection.limits.globalItems} work items · ${projection.global.bytes}/${projection.limits.globalBytes} reserved review bytes`]),
        h.div([h.Class("capacity-bar"), h.Role("img"), h.AriaLabel(`${projection.global.bytes} of ${projection.limits.globalBytes} reserved review bytes`)], [
          ...projection.charges.map((charge) => h.span([
            h.Class(`capacity-segment agent-${charge.partition}`),
            h.Style({ width: `${charge.bytes / projection.limits.globalBytes * 100}%` }),
          ], [`Agent ${charge.partition}`])),
          h.span([h.Class("capacity-free"), h.Style({ width: `${(projection.limits.globalBytes - projection.global.bytes) / projection.limits.globalBytes * 100}%` })], ["Free"]),
        ]),
        h.div([h.Class("capacity-rows")], projection.partitions.map((partition) => h.p([], [
          `Agent ${partition.partition} · ${partition.items}/${projection.limits.partitionItems} work items · ${partition.bytes}/${projection.limits.partitionBytes} reserved bytes`,
        ]))),
        h.div([h.Class("canonical-controls")], [
          h.h3([], [scenario.name]),
          h.p([], [scenario.description]),
          h.div([h.Class("trace-options canonical-scenarios")], CANONICAL_SCENARIOS.map((item, index) => h.button([
            h.OnClick(Message.SelectedScenario({ index })), h.Class(index === model.scenario ? "trace selected" : "trace"),
          ], [item.name]))),
          h.button([h.OnClick(Message.Rewound()), h.Disabled(model.position === 0)], ["Previous canonical step"]),
          h.button([h.OnClick(Message.Redid()), h.Disabled(model.position === history.length)], ["Redo canonical step"]),
          h.button([h.OnClick(Message.Advanced()), h.Disabled(next === undefined)], [
            next === undefined ? "Canonical trace complete" : `Next canonical step: ${next.kind}`,
          ]),
          h.button([h.OnClick(Message.Reset())], ["Reset canonical replay"]),
          h.p([h.Class("canonical-progress")], [`Guided step ${guided} of ${scenario.events.length} · history ${model.position}/${history.length}`]),
          h.p([h.Class("canonical-feedback")], [model.feedback]),
          h.label([h.For("canonical-event")], ["Manual source-free canonical event (JSON)"]),
          h.input([h.Id("canonical-event"), h.Type("text"), h.Value(model.draft),
            h.OnChange((raw) => Message.DraftChanged({ raw }))]),
          h.button([h.OnClick(Message.Submitted())], ["Apply canonical event"]),
        ]),
        h.div([h.Class("canonical-commands")], [
          h.h3([], ["Bend result"]),
          h.p([], [last === undefined ? "No transition yet." : `${last.event.kind} · ${last.rejection === undefined ? "accepted" : `rejected: ${last.rejection}`}`]),
          h.ul([], lastCommands.map((command) => h.li([], [commandLabel(command)]))),
        ]),
        ...(frames.length > 0 ? [h.div([h.Class("capacity-frames")], [
          h.h3([], [last?.event.kind === "preparationCompleted" ? "Preparation completion decisions" : "Decisions within this atomic capacity transition"]),
          h.p([], ["These frames explain one atomic Bend transition; they are not extra resident states."]),
          h.p([], [`Before event · ${eventBefore.items} shared items · ${eventBefore.bytes} shared bytes`]),
          h.div([], frames.map((command, index) => h.button([
            h.OnClick(Message.MovedFrame({ frame: index })), h.Class(index === model.frame ? "selected" : ""),
          ], [commandLabel(command)]))),
          h.p([], [`Frame ${Math.min(model.frame + 1, frames.length)} of ${frames.length} · ${frame.after.global.items} shared items · ${frame.after.global.bytes} shared bytes · ${frame.after.local.items} items and ${frame.after.local.bytes} bytes for this agent`]),
          h.p([], [`After event · ${eventAfter.items} shared items · ${eventAfter.bytes} shared bytes`]),
          h.div([h.Class("capacity-bar"), h.Role("img"), h.AriaLabel(`${frame.after.global.bytes} of ${projection.limits.globalBytes} reserved review bytes within transition`)],
            frame.after.charges.map((charge) => h.span([h.Class(`capacity-segment agent-${charge.partition}`),
              h.Style({ width: `${charge.bytes / projection.limits.globalBytes * 100}%` })], [`Agent ${charge.partition}`]))),
        ])] : []),
        h.h3([], ["Replay history"]),
        h.div([h.Class("history")], [
          h.button([h.OnClick(Message.Jumped({ position: 0 }))], ["Start"]),
          ...history.map((entry, index) => h.button([h.OnClick(Message.Jumped({ position: index + 1 })),
            h.Class(index + 1 === model.position ? "selected" : "")], [`${index + 1}. ${entry.event.kind} · ${entry.origin}`])),
        ]),
      ]),
      importGraphView(h, model.importScenario, model.importCursor,
        (index) => Message.SelectedImportScenario({ index }), (cursor) => Message.MovedImportCursor({ cursor })),
      timelineView(h, model.timeline, (index) => Message.SelectedTimeline({ index })),
    ]),
  };
};
