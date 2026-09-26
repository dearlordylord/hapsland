import type { NodeId } from "./flow";

export type NodeRole = "external" | "storage" | "process" | "boundary";
type NodeSpec = { readonly label: string; readonly detail: string; readonly role: NodeRole; readonly x: number; readonly y: number };

// Presentation only. The reducer owns data locations and movement; these
// coordinates and descriptions do not participate in state transitions.
export const NODES = {
  agentEdit: { label: "Agent", detail: "edit and hook events for one agent", role: "external", x: 30, y: 332 },
  workQueue: { label: "Review scheduler", detail: "waits for capacity to run work", role: "storage", x: 320, y: 52 },
  preparation: { label: "Read and analyze source", detail: "extract reviewable artifacts", role: "process", x: 610, y: 52 },
  decisionRequest: { label: "Build review input", detail: "artifact + rule + evidence", role: "process", x: 900, y: 52 },
  jev: { label: "Jev", detail: "evaluates the review input", role: "external", x: 1190, y: 52 },
  decisionResponse: { label: "Read Jev result", detail: "finding or no finding", role: "process", x: 1190, y: 332 },
  adviceStore: { label: "Pending advice", detail: "findings for this agent", role: "storage", x: 900, y: 332 },
  collector: { label: "Select advice to send", detail: "request + eligible pending advice", role: "process", x: 610, y: 332 },
  hostOutput: { label: "Write hook response", detail: "advice in the runtime response format", role: "boundary", x: 320, y: 575 },
  deliveryState: { label: "Virtual round", detail: "active review period + continuation count", role: "storage", x: 30, y: 575 },
  outcomeStore: { label: "Record review status", detail: "no finding / review failed", role: "process", x: 1190, y: 575 },
} as const satisfies Record<NodeId, NodeSpec>;
