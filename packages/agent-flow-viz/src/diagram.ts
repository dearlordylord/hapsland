import { MAX_STOP_CONTINUATIONS, type EmissionEvent, type EventId, type FlowState, type NodeId, type RejectionCode, type Transition } from "./flow";

export type NodeRole = "external" | "storage" | "process" | "boundary";
type NodeSpec = { readonly label: string; readonly detail: string; readonly notes: readonly string[]; readonly role: NodeRole; readonly x: number; readonly y: number };

// Presentation only. The reducer owns data locations and movement; these
// coordinates and descriptions do not participate in state transitions.
export const NODES = {
  agentEdit: { label: "Agent", detail: "edit and hook events for one agent", notes: ["Claude Code / Codex adapter"], role: "external", x: 30, y: 332 },
  editQueue: { label: "Edit observations", detail: "edits waiting for source reading", notes: ["one agent in this model", "each edit has an ID"], role: "storage", x: 320, y: 52 },
  preparation: { label: "Read and analyze source", detail: "edit → reviewable material", notes: ["captures source and type evidence", "may yield review units"], role: "process", x: 610, y: 52 },
  reviewQueue: { label: "Review work items", detail: "ready for Jev dispatch", notes: ["review unit + frozen context", "separate from edit observations"], role: "storage", x: 900, y: 52 },
  jevDispatch: { label: "Jev dispatcher", detail: "reserves one of N Jev slots", notes: ["N is set below the diagram", "source reading uses no Jev slot"], role: "process", x: 1190, y: 52 },
  jev: { label: "Jev", detail: "evaluates review work", notes: ["external review backend", "returns a result or fails"], role: "external", x: 1190, y: 332 },
  resultQueue: { label: "Jev results", detail: "responses awaiting policy", notes: ["a result is not yet advice", "finding / clear / unavailable"], role: "storage", x: 900, y: 332 },
  adviceStore: { label: "Pending advice", detail: "retained actionable finding", notes: ["background or Stop can select it", "Stop reoffer keeps the same finding*"], role: "storage", x: 900, y: 575 },
  advicePolicy: { label: "Advice policy", detail: "Jev results + open finish-decision wait", notes: ["selects and reserves advice", "tracks requests in this virtual round"], role: "process", x: 610, y: 332 },
  responseCommand: { label: "Finish response command", detail: "reducer asks adapter to write", notes: ["continue with advice / allow", "command ≠ completed write"], role: "boundary", x: 320, y: 575 },
  observedWrite: { label: "Observed hook write", detail: "background output completed", notes: ["adapter reported write", "write ≠ receipt or use"], role: "boundary", x: 320, y: 795 },
  deliveryState: { label: "Virtual round", detail: "active review period + continuation count", notes: [`${MAX_STOP_CONTINUATIONS} Stop requests per virtual round`, "allow Stop → discard its work"], role: "storage", x: 30, y: 575 },
  outcomeStore: { label: "Record review status", detail: "no finding / review failed", notes: ["review status emitted", "no finding ≠ failed review"], role: "process", x: 1190, y: 575 },
} as const satisfies Record<NodeId, NodeSpec>;

// Presentation wording keyed to every domain event. Routes and guards stay in flow.ts.
export const EVENT_LABELS = {
  StopAllowed: "allow-finish decision; close virtual round",
  EditObserved: "proven fresh edit admitted",
  IngressStarted: "start source capture",
  ReviewUnitPrepared: "review work item ready",
  UnitDispatched: "Jev slot reserved for item",
  JevRequestSent: "Jev request sent",
  JevFindingReceived: "Jev finding result queued",
  JevClearReceived: "Jev clear result queued",
  FindingRetained: "finding retained",
  ClearRecorded: "clear result recorded",
  JevUnavailable: "Jev unavailable result queued",
  UnavailableRecorded: "unavailable result recorded",
  BackgroundHookFired: "background asks to collect",
  StopHookFired: "finish attempt; runtime calls Stop hook",
  FinishDecisionAllWorkSettled: "review and background output settled; decide now",
  FinishDecisionDeadlineReached: "safe finish-decision deadline signalled",
  FinishResponseRequested: "return selected finish response command",
  AdviceLeasedByBackground: "background leases advice",
  AdviceLeasedByStop: "select advice for continue response",
  AdviceReofferedAtStop: "select prior advice for continue response",
  HostOutputSubmitted: "hook write completed",
} as const satisfies Record<EventId, string>;

export const EMISSION_LABELS = {
  HostOutputSubmitted: "Hook response written; no runtime receipt",
  ClearRecorded: "Review completed with no finding",
  UnavailableRecorded: "Review failed because Jev was unavailable",
} as const satisfies Record<EmissionEvent, string>;

export const CONTROL_SIGNAL_LABELS = {
  background: "background collection opportunity",
  stop: "agent finish attempt hook call",
  settled: "all review and background output settled",
  deadline: "safe hook deadline signalled",
  allow: "allow-finish decision",
  response: "typed response command for adapter",
} as const satisfies Record<Extract<Transition, { kind: "control" }>["signal"], string>;

export const REJECTION_LABELS = {
  virtualRoundClosed: "This virtual round is closed. Only a fresh attributed edit can open another one.",
  stopNotWaiting: "No finish-decision wait is open.",
  unexpectedControl: "This control event cannot move review data.",
  backgroundAlreadySubmitted: "Background advice was already submitted. Stop may reoffer it.",
  backgroundNotRequested: "The background hook has not requested collection.",
  stopNotRequested: "No finish-decision wait is open.",
  finishDecisionAlreadyOpen: "This agent already has one open finish-decision wait.",
  continuationBudgetExhausted: `This virtual round reserved ${MAX_STOP_CONTINUATIONS} continuation requests. Hapsland must choose allow-finish and clean up.`,
  reofferNeedsBackground: "Reoffer needs a prior background response; runtime receipt is unknown.",
  stopNeedsFreshAdvice: "Use the Stop reoffer event for advice already sent through the background hook.",
  leaseBusy: "Another collector already holds the advice lease.",
  noLease: "No delivery lease exists.",
  missingPacket: "The required data item is not at this step.",
  dispatchCapacityReached: "All configured Jev slots are in use; wait for a request to finish.",
  queueOrder: "An earlier item in this queue must start first.",
  invalidCapacity: "Choose a positive whole number of job slots.",
  internalEvent: "The reducer starts waiting work automatically when capacity is available.",
  workStillPending: "Source reading, Jev review, or a background output write is still in progress.",
} as const satisfies Record<RejectionCode, string>;

export const describeAccepted = (before: FlowState, after: FlowState, event: EventId, route: Transition): string => {
  if (event === "EditObserved") return before.virtualRoundActive
    ? "The virtual round remains active. The edit entered the edit-observation queue."
    : "An attributed edit opened a virtual round and entered the edit-observation queue.";
  if (event === "StopAllowed") return "Hapsland returned allow from the runtime's Stop hook and closed its virtual round. Modeled work was discarded; another hook may continue the agent's round.";
  if (event === "StopHookFired") return "The runtime invoked its Stop hook for a finish attempt. Hapsland holds the response open while review work completes; its virtual round remains active.";
  if (event === "BackgroundHookFired") return "The runtime requested background advice for this agent.";
  if (event === "HostOutputSubmitted") return "Hapsland recorded a completed background hook write. Runtime receipt is unknown; a later finish attempt can reoffer the advice.";
  if (event === "AdviceLeasedByBackground" || event === "AdviceLeasedByStop" || event === "AdviceReofferedAtStop") {
    return `${EVENT_LABELS[event]}. Pending advice remains while one collector holds the lease.`;
  }
  return route.kind === "data" ? `${EVENT_LABELS[event]}: ${route.input} → ${route.output}.` : EVENT_LABELS[event];
};
