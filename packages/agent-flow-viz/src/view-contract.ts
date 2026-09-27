// Shared display contracts for the abstract Flow.bend projection. No acceptance rules live here.
import { Schema } from "effect";

export const NODE_IDS = [
  "agentEdit", "editQueue", "preparation", "reviewQueue", "jevDispatch", "jev",
  "adviceStore", "advicePolicy", "responseCommand", "observedWrite",
  "deliveryState", "outcomeStore",
] as const;
export type NodeId = (typeof NODE_IDS)[number];

export const FLAVORS = [
  "edit observation", "capture job", "review work item", "decision request",
  "network request", "finding result", "clear result", "unavailable result", "advice", "leased batch",
  "runtime submission", "review status",
] as const;
export type Flavor = (typeof FLAVORS)[number];
// Typed data locations constrain routes projected from Bend.
type StoredAt = {
  agentEdit: "edit observation";
  editQueue: "capture job";
  preparation: "capture job";
  reviewQueue: "review work item";
  jevDispatch: "decision request";
  jev: "network request";
  adviceStore: "advice";
  advicePolicy: "leased batch";
  responseCommand: never;
  observedWrite: "runtime submission";
  deliveryState: never;
  outcomeStore: "review status";
};
type DataTransition = {
  [From in NodeId]: {
    [To in NodeId]: {
      readonly kind: "data";
      readonly from: From;
      readonly to: To;
      readonly input: StoredAt[From];
      readonly output: StoredAt[To];
      readonly movement: "move" | "copy";
    }
  }[NodeId]
}[NodeId];
type ControlTransition = {
  readonly kind: "control";
  readonly from: NodeId;
  readonly to: NodeId;
  readonly signal: "background" | "stop" | "settled" | "deadline" | "allow" | "response";
};
export type Transition = DataTransition | ControlTransition;

export const EVENT_IDS = [
  "EditObserved", "IngressStarted", "ReviewUnitPrepared",
  "UnitDispatched", "JevRequestSent", "JevFindingReceived", "JevClearReceived",
  "JevUnavailable", "BackgroundWaitStarted", "StopHookFired",
  "FinishDecisionAllWorkSettled", "FinishResponseRequested",
  "FinishDecisionDeadlineReached", "FinishDecisionBudgetExhausted",
  "AdviceLeasedByBackground", "AdviceLeasedByStop", "AdviceReofferedAtStop",
  "HostOutputSubmitted", "StopAllowed",
] as const;
export type EventId = (typeof EVENT_IDS)[number];
export const LIVE_PACKET_NODES = ["editQueue", "preparation", "reviewQueue", "jevDispatch", "jev", "adviceStore", "advicePolicy"] as const satisfies readonly NodeId[];
export type LivePacketNode = (typeof LIVE_PACKET_NODES)[number];
export type Packet = { readonly id: number; readonly at: LivePacketNode; readonly flavor: Flavor };
export const PacketSchema = Schema.Struct({
  id: Schema.Number,
  at: Schema.Literals(LIVE_PACKET_NODES),
  flavor: Schema.Literals(FLAVORS),
});
export const FlowStateSchema = Schema.Struct({
  packets: Schema.Array(PacketSchema),
  nextItemId: Schema.Number,
  sourceCapacity: Schema.Number,
  reviewCapacity: Schema.Number,
  virtualRoundId: Schema.Number,
  virtualRoundActive: Schema.Boolean,
  stopContinuations: Schema.Number,
  stopWaiting: Schema.Boolean,
  backgroundAvailable: Schema.Boolean,
  leaseSurface: Schema.Union([Schema.Null, Schema.Literals(["background", "stop"])]),
  lastSubmissionSurface: Schema.Union([Schema.Null, Schema.Literals(["background", "stop"])]),
  lastSubmissionItemId: Schema.Union([Schema.Null, Schema.Number]),
  leasedItemId: Schema.Union([Schema.Null, Schema.Number]),
  backgroundSubmittedIds: Schema.Array(Schema.Number),
});
export type FlowState = typeof FlowStateSchema.Type;

export const MAX_STOP_CONTINUATIONS = 4;
export const DEFAULT_SOURCE_CAPACITY = 3;
export const DEFAULT_REVIEW_CAPACITY = 3;
export const activeSourceJobCount = (state: FlowState): number =>
  state.packets.filter((packet) => packet.at === "preparation").length;
export const ACTIVE_REVIEW_LOCATIONS = ["jevDispatch", "jev"] as const satisfies readonly LivePacketNode[];
export const activeReviewJobCount = (state: FlowState): number =>
  state.packets.filter((packet) => (ACTIVE_REVIEW_LOCATIONS as readonly string[]).includes(packet.at)).length;

export const UNFINISHED_REVIEW_LOCATIONS = ["editQueue", "preparation", "reviewQueue", "jevDispatch", "jev"] as const satisfies readonly LivePacketNode[];
export const unfinishedReviewItemIds = (state: FlowState): readonly number[] =>
  state.packets.filter((packet) => (UNFINISHED_REVIEW_LOCATIONS as readonly string[]).includes(packet.at)).map((packet) => packet.id);

export const advicePolicyInput = (state: FlowState) => ({
  openFinishDecision: state.stopWaiting,
  unfinishedWorkItemIds: unfinishedReviewItemIds(state),
  ongoingJevRequestIds: state.packets.filter((packet) => packet.at === "jev").map((packet) => packet.id),
  pendingAdviceIds: state.packets.filter((packet) => packet.at === "adviceStore").map((packet) => packet.id),
});
export type EmissionEvent = "HostOutputSubmitted" | "JevClearReceived" | "JevUnavailable";
export type FlowChange =
  | { readonly kind: "transition"; readonly event: EventId; readonly route: Transition; readonly itemId: number | null }
  | { readonly kind: "capacityChanged"; readonly capacity: "source" | "jev"; readonly before: number; readonly after: number }
  | { readonly kind: "virtualRoundOpened"; readonly id: number }
  | { readonly kind: "virtualRoundClosed"; readonly id: number; readonly discardedItems: number }
  | { readonly kind: "finishDecision"; readonly response: "continueWithAdvice" | "allowFinish";
      readonly adviceItemIds: readonly number[]; readonly discardedItemIds: readonly number[];
      readonly cancelledSourceReadingIds: readonly number[]; readonly cancelledJevRequestIds: readonly number[] }
  | { readonly kind: "emitted"; readonly event: EmissionEvent; readonly at: NodeId; readonly itemId: number };
export type RejectionCode =
  | "virtualRoundClosed" | "stopNotWaiting" | "unexpectedControl"
  | "backgroundAlreadySubmitted" | "backgroundNotRequested" | "stopNotRequested"
  | "finishDecisionAlreadyOpen"
  | "continuationBudgetExhausted" | "reofferNeedsBackground" | "stopNeedsFreshAdvice"
  | "leaseBusy" | "noLease" | "missingPacket" | "dispatchCapacityReached" | "queueOrder" | "invalidCapacity" | "internalEvent" | "workStillPending";
export type StepResult =
  | { readonly state: FlowState; readonly accepted: true; readonly changes: readonly FlowChange[] }
  | { readonly state: FlowState; readonly accepted: false; readonly changes: readonly []; readonly reason: RejectionCode };
export const INTERNAL_EVENTS = [
  "IngressStarted", "UnitDispatched", "JevRequestSent", "BackgroundWaitStarted", "FinishDecisionAllWorkSettled", "FinishDecisionBudgetExhausted",
  "AdviceLeasedByStop",
  "AdviceReofferedAtStop", "StopAllowed", "FinishResponseRequested",
] as const satisfies readonly EventId[];
export const isInternalEvent = (event: EventId): boolean =>
  (INTERNAL_EVENTS as readonly string[]).includes(event);

export type CapacityEvent = { readonly type: "ReviewCapacitySet" | "SourceCapacitySet"; readonly capacity: number };
