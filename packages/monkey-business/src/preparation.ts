import { SharedCore } from "./shared-core.ts";
import { type ImportGraphEvent, type ImportGraphProjection, type ImportGraphCommand, type GraphLimits } from "../../../src/canonical/graph-adapter.ts";

/** Source-free native facts for one synthetic A → B review artifact. */
export const preparationFacts = (): readonly ImportGraphEvent[] => [
  { kind: "root", target: 1, sourceBytes: 1000, treeBytes: 400, edges: [10] },
  { kind: "next" },
  { kind: "resolved", target: 2, result: "found" },
  { kind: "pathChecked", allowed: true },
  { kind: "captured", sourceBytes: 1000, treeBytes: 400, edges: [] },
  { kind: "next" },
];
type GraphExampleStep = Readonly<{ unit: number; label: string; event: ImportGraphEvent }>;
const step = (label: string, event: ImportGraphEvent, unit = 0): GraphExampleStep => ({ unit, label, event });
const root = (edges: number[], treeBytes = 400) => step("Native: allowed root A captured; ordered edge facts supplied", { kind: "root", target: 1, sourceBytes: 1000, treeBytes, edges });
const next = () => step("Replay: supply Next event for pending exploration", { kind: "next" });
const resolved = (target: number) => step(`Native: edge resolves to target #${target}`, { kind: "resolved", target, result: "found" });
const allowed = () => step("Native: target path allowed; Bend decides whether to request source", { kind: "pathChecked", allowed: true });
const captured = (edges: number[] = [], treeBytes = 400, sourceBytes = 1000) => step("Native: bounded capture and ordered outgoing edges supplied", { kind: "captured", sourceBytes, treeBytes, edges });

export const BRANCHING_TREE_BUDGET = { title: "Branching tree budget", description: "The fixture supplies A→B,C,X; B→D,E; C→F,G, with X path-denied. Encoded contributions are A/B/C 5 KiB each, D 4 KiB, E/G 2 KiB each, and F 1 KiB. The trace shows Bend's acceptance and terminal reason under the effective limits.", units: ["A.ts"], targetNames: { 1: "A.ts", 2: "B.ts", 3: "C.ts", 4: "D.ts", 5: "E.ts", 6: "F.ts", 7: "G.ts", 8: "X.ts" }, steps: [
    root([10, 20, 70], 5120),
    next(), resolved(2), allowed(), captured([30, 40], 5120),
    next(), resolved(3), allowed(), captured([50, 60], 5120),
    next(), resolved(8), step("Native: X.ts permission fact denied", { kind: "pathChecked", allowed: false }),
    next(), resolved(4), allowed(), captured([], 4096),
    next(), resolved(5), allowed(), step("Native: E capture reports 1,000 B source and 2 KiB tree", { kind: "captured", sourceBytes: 1000, treeBytes: 2048, edges: [] }),
    next(), resolved(6), allowed(), captured([], 1024),
    next(), resolved(7), allowed(), step("Native: G capture reports 1,000 B source and 2 KiB tree", { kind: "captured", sourceBytes: 1000, treeBytes: 2048, edges: [] }),
    next(),
  ] } as const;

export type PreparationExample = "simple" | "branchingTreeBudget" | "generated";
export const preparationExample = (example: PreparationExample) => example === "branchingTreeBudget"
  ? BRANCHING_TREE_BUDGET
  : { title: "A → B", units: ["A.ts"], targetNames: { 1: "A.ts", 2: "B.ts" }, steps: preparationFacts().map(event => step("Synthetic source fact", event)) };

export type PreparationEvent = Readonly<{
  kind: "preparationGraph";
  example: PreparationExample;
  partition: number;
  lifetime: number;
  round: number;
  operation: number;
  unit: number;
  step: number;
  fact: ImportGraphEvent;
  /** Effective production graph profile captured when this unit is prepared. */
  graphLimits?: GraphLimits;
  generatedTree?: Readonly<{ targetNames: Readonly<Record<number, string>>; files: number; depth: number; rootEligible?: boolean; closureEligible?: boolean }>;
}>;
export type PreparationFrame = Readonly<{
  event: PreparationEvent;
  before: ImportGraphProjection;
  after: ImportGraphProjection;
  command: ImportGraphCommand;
}>;

/** Standalone graph views use the same Bend-owned preparation state as Run. */
export class PreparationReplay {
  private core = new SharedCore({ globalItems: 32, globalBytes: 100000, partitionItems: 16, partitionBytes: 50000 });
  step(event: PreparationEvent): PreparationFrame { return this.core.graphStep(event); }
}
