import { MAX_STOP_CONTINUATIONS, type EmissionEvent, type EventId, type FlowState, type NodeId, type RejectionCode, type Transition } from "./flow";

export type NodeRole = "external" | "storage" | "process" | "boundary";
type NodeSpec = { readonly label: string; readonly detail: string; readonly notes: readonly string[]; readonly role: NodeRole; readonly x: number; readonly y: number };

// Presentation only. The reducer owns data locations and movement; these
// coordinates and descriptions do not participate in state transitions.
export const NODES = {
  agentEdit: { label: "Agent", detail: "edit and hook events for one agent", notes: ["Claude Code / Codex adapter"], role: "external", x: 30, y: 332 },
  workQueue: { label: "Review work queue", detail: "FIFO capture and review items", notes: ["multiple items can wait", "capture job → review work item"], role: "storage", x: 320, y: 52 },
  preparation: { label: "Read and analyze source", detail: "capture job → review work item", notes: ["returns each item to the work queue"], role: "process", x: 610, y: 52 },
  decisionRequest: { label: "Build review input", detail: "review work item → decision request", notes: ["each item keeps its own ID"], role: "process", x: 900, y: 52 },
  jev: { label: "Jev", detail: "evaluates the review input", notes: ["external review backend", "returns a judgment or fails"], role: "external", x: 1190, y: 52 },
  decisionResponse: { label: "Read Jev result", detail: "finding or no finding", notes: ["finding → pending advice", "no finding → review status"], role: "process", x: 1190, y: 332 },
  adviceStore: { label: "Pending advice", detail: "retained finding in this model", notes: ["background or Stop can select it", "Stop reoffer keeps the same finding*"], role: "storage", x: 900, y: 332 },
  collector: { label: "Select advice to send", detail: "request + eligible pending advice", notes: ["one batch reserved for one caller", "bounds are outside this model**"], role: "process", x: 610, y: 332 },
  hostOutput: { label: "Write hook response", detail: "response submitted to agent runtime", notes: ["output carries advice", "write ≠ receipt or use"], role: "boundary", x: 320, y: 575 },
  deliveryState: { label: "Virtual round", detail: "active review period + continuation count", notes: [`${MAX_STOP_CONTINUATIONS} Stop requests per virtual round`, "allow Stop → discard its work"], role: "storage", x: 30, y: 575 },
  outcomeStore: { label: "Record review status", detail: "no finding / review failed", notes: ["review status emitted", "no finding ≠ failed review"], role: "process", x: 1190, y: 575 },
} as const satisfies Record<NodeId, NodeSpec>;

// Presentation wording keyed to every domain event. Routes and guards stay in flow.ts.
export const EVENT_LABELS = {
  StopAllowed: "allow Stop; close virtual round",
  EditObserved: "proven fresh edit admitted",
  IngressStarted: "start source capture",
  ReviewUnitPrepared: "prepared review item enters work queue",
  UnitDispatched: "unit dispatched",
  JevRequestSent: "Jev request sent",
  JevResponseReceived: "Jev response received",
  FindingRetained: "finding retained",
  ClearRecorded: "clear result recorded",
  JevUnavailable: "Jev request unavailable",
  BackgroundHookFired: "background asks to collect",
  StopHookFired: "Stop hook starts; wait for advice",
  AdviceLeasedByBackground: "background leases advice",
  AdviceLeasedByStop: "Stop leases advice",
  AdviceReofferedAtStop: "Stop selects advice again",
  HostOutputSubmitted: "hook write completed",
} as const satisfies Record<EventId, string>;

export const EMISSION_LABELS = {
  HostOutputSubmitted: "Hook response written; no runtime receipt",
  ClearRecorded: "Review completed with no finding",
  JevUnavailable: "Review failed because Jev was unavailable",
} as const satisfies Record<EmissionEvent, string>;

export const REJECTION_LABELS = {
  virtualRoundClosed: "This virtual round is closed. Only a fresh attributed edit can open another one.",
  stopNotWaiting: "Stop has not requested a decision.",
  unexpectedControl: "This control event cannot move review data.",
  backgroundAlreadySubmitted: "Background advice was already submitted. Stop may reoffer it.",
  backgroundNotRequested: "The background hook has not requested collection.",
  stopNotRequested: "Stop has not requested collection.",
  continuationBudgetExhausted: `This virtual round reserved ${MAX_STOP_CONTINUATIONS} Stop continuation requests. Hapsland must allow Stop and clean up.`,
  reofferNeedsBackground: "Reoffer needs a prior background response; runtime receipt is unknown.",
  stopNeedsFreshAdvice: "Use the Stop reoffer event for advice already sent through the background hook.",
  leaseBusy: "Another collector already holds the advice lease.",
  noLease: "No delivery lease exists.",
  missingPacket: "The required data item is not at this step.",
  dispatchCapacityReached: "All configured review job slots are in use; wait for a job to finish.",
  queueOrder: "An earlier queued item must start first.",
  invalidCapacity: "Choose a positive whole number of job slots.",
} as const satisfies Record<RejectionCode, string>;

export const describeAccepted = (before: FlowState, after: FlowState, event: EventId, route: Transition): string => {
  if (event === "EditObserved") return before.virtualRoundActive
    ? "The virtual round remains active. The edit entered the review work queue."
    : "An attributed edit opened a virtual round and entered the review work queue.";
  if (event === "StopAllowed") return "Hapsland allowed Stop and closed its virtual round. Modeled work was discarded; another hook may continue the agent's round.";
  if (event === "StopHookFired") return "The agent is trying to finish. Hapsland waits for review work; its virtual round remains active.";
  if (event === "BackgroundHookFired") return "The runtime requested background advice for this agent.";
  if (event === "HostOutputSubmitted") return after.lastSubmissionSurface === "stop"
    ? "Hapsland submitted advice through Stop and asked the runtime to continue the same virtual round."
    : "Hapsland submitted advice through the background hook. Receipt is unknown; Stop can reoffer it.";
  if (event === "AdviceLeasedByBackground" || event === "AdviceLeasedByStop" || event === "AdviceReofferedAtStop") {
    return `${EVENT_LABELS[event]}. Pending advice remains while one collector holds the lease.`;
  }
  return route.kind === "data" ? `${EVENT_LABELS[event]}: ${route.input} → ${route.output}.` : EVENT_LABELS[event];
};
