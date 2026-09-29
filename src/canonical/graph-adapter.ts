import { bendImportGraphInitial, bendImportGraphStep } from "./import-graph.generated.js";
import { GRAPH_LIMIT_CEILINGS, validateGraphLimits, type GraphLimits } from "../configuration/graph-limits.ts";
export { GRAPH_LIMIT_CEILINGS, validateGraphLimits, type GraphLimits } from "../configuration/graph-limits.ts";

export type ImportGraphEvent =
  | { readonly kind: "root"; readonly target: number; readonly sourceBytes: number; readonly treeBytes: number; readonly edges: readonly number[] }
  | { readonly kind: "next" }
  | { readonly kind: "resolved"; readonly target: number; readonly result: "found" | "missing" | "ambiguous" | "unsupported" }
  | { readonly kind: "pathChecked"; readonly allowed: boolean }
  | { readonly kind: "captured"; readonly sourceBytes: number; readonly treeBytes: number; readonly edges: readonly number[] }
  | { readonly kind: "captureFailed" }
  | { readonly kind: "deadlineReached" };

export type ImportGraphCommand =
  | { readonly kind: "none" }
  | { readonly kind: "resolveEdge"; readonly edge: number }
  | { readonly kind: "checkPath"; readonly target: number }
  | { readonly kind: "readSource"; readonly target: number }
  | { readonly kind: "unitComplete" }
  | { readonly kind: "unitIncomplete"; readonly reason: string }
  | { readonly kind: "skipImport"; readonly target: number; readonly reason: string };

type RecordValue = Record<string, unknown>;
const record = (value: unknown): RecordValue => {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new TypeError("invalid Bend object");
  return value as RecordValue;
};
const freezeState = (value: unknown): unknown => {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freezeState(child);
    Object.freeze(value);
  }
  return value;
};
const tag = (value: unknown): string => {
  const name = record(value).$;
  if (typeof name !== "string") throw new TypeError("invalid Bend tag");
  return name;
};
const kind = (value: unknown): string => tag(value).replace(/^ImportGraph\./, "");
const number = (value: unknown): number => {
  const result = typeof value === "bigint" ? Number(value) : value;
  if (typeof result !== "number" || !Number.isSafeInteger(result) || result < 0) {
    throw new TypeError("invalid Bend Nat");
  }
  return result;
};
const bool = (value: unknown): boolean => {
  if (typeof value !== "boolean") throw new TypeError("invalid Bend boolean");
  return value;
};
const nat = (value: number): number => {
  if (!Number.isSafeInteger(value) || value < 0 || value >= 2 ** 48) throw new TypeError("invalid graph Nat");
  return value;
};
const list = (items: readonly number[]): unknown => {
  if (items.length > 128) throw new TypeError("too many graph edges");
  return items.reduceRight<unknown>((tail, head) => ({ $: "Con", head: nat(head), tail }), { $: "Nil" });
};
const readList = <T>(value: unknown, decode: (value: unknown) => T): T[] => {
  const result: T[] = [];
  let current = value;
  while (tag(current) === "Con") {
    if (result.length >= 128) throw new TypeError("Bend graph list exceeded bound");
    const node = record(current);
    result.push(decode(node.head));
    current = node.tail;
  }
  if (tag(current) !== "Nil") throw new TypeError("unknown Bend list constructor");
  return result;
};
const encode = (event: ImportGraphEvent): unknown => {
  switch (event.kind) {
    case "root": return { $: "ImportGraph.Root", target: nat(event.target), source_bytes: nat(event.sourceBytes), tree_bytes: nat(event.treeBytes), edges: list(event.edges) };
    case "next": return { $: "ImportGraph.Next" };
    case "resolved": return { $: "ImportGraph.Resolved", target: nat(event.target), result: { $: ({ found: "ImportGraph.Found", missing: "ImportGraph.NotFound", ambiguous: "ImportGraph.Many", unsupported: "ImportGraph.Unhandled" } as const)[event.result] } };
    case "pathChecked": return { $: "ImportGraph.PathChecked", allowed: event.allowed };
    case "captured": return { $: "ImportGraph.Captured", source_bytes: nat(event.sourceBytes), node_bytes: nat(event.treeBytes), edges: list(event.edges) };
    case "captureFailed": return { $: "ImportGraph.CaptureFailed" };
    case "deadlineReached": return { $: "ImportGraph.DeadlineReached" };
  }
};
const reason = (value: unknown): string => {
  const name = tag(value);
  if (!/^(ImportGraph\.)?(Missing|Ambiguous|Unsupported|Excluded|CaptureUnavailable|FileLimit|ReadLimit|TreeLimit|WorkLimit|DepthLimit|Deadline|ProtocolViolation)$/.test(name)) {
    throw new TypeError(`unknown Bend graph reason ${name}`);
  }
  return name.replace("ImportGraph.", "");
};
const command = (value: unknown): ImportGraphCommand => {
  const object = record(value);
  switch (kind(value)) {
    case "NoCommand": return { kind: "none" };
    case "ResolveEdge": return { kind: "resolveEdge", edge: number(object.edge) };
    case "CheckPath": return { kind: "checkPath", target: number(object.target) };
    case "ReadSource": return { kind: "readSource", target: number(object.target) };
    case "UnitComplete": return { kind: "unitComplete" };
    case "UnitIncomplete": return { kind: "unitIncomplete", reason: reason(object.reason) };
    case "SkipImport": return { kind: "skipImport", target: number(object.target), reason: reason(object.reason) };
    default: throw new TypeError(`unknown Bend graph command ${tag(value)}`);
  }
};
export type ImportGraphProjection = {
  readonly limits: GraphLimits;
  readonly phase: "idle" | "ready" | "resolving" | "checking" | "capturing" | "complete" | "incomplete";
  readonly reason?: string;
  readonly pending: readonly number[];
  readonly visited: readonly number[];
  readonly files: number;
  readonly readBytes: number;
  readonly treeBytes: number;
  readonly work: number;
  readonly skippedTree: boolean;
  readonly skippedExcluded: boolean;
};
const phases = { Idle: "idle", Ready: "ready", Resolving: "resolving", Checking: "checking", Capturing: "capturing", Complete: "complete", Incomplete: "incomplete" } as const;
export const projectImportGraph = (state: unknown): ImportGraphProjection => {
  const bounded = record(state);
  if (kind(state) !== "Bounded") throw new TypeError("invalid Bend bounded graph state");
  const object = record(bounded.graph);
  if (kind(object) !== "Graph") throw new TypeError("invalid Bend graph state");
  const phaseObject = record(object.phase);
  const name = kind(phaseObject);
  if (!(name in phases)) throw new TypeError(`unknown Bend graph phase ${name}`);
  const phase = phases[name as keyof typeof phases];
  const limitObject = record(object.limits);
  if (kind(limitObject) !== "Limits") throw new TypeError("invalid Bend graph limits");
  const limits = validateGraphLimits({
    version: number(limitObject.version) as 1,
    sourceBytes: number(limitObject.source_bytes), treeBytes: number(limitObject.tree_bytes),
    files: number(limitObject.files), readBytes: number(limitObject.read_bytes),
    outgoingEdges: number(limitObject.outgoing_edges), depth: number(limitObject.depth),
    work: number(limitObject.work),
  });
  number(bounded.remaining);
  return { limits, phase, ...(phase === "incomplete" ? { reason: reason(phaseObject.reason) } : {}),
    pending: readList(object.pending, (edge) => { if (kind(edge) !== "Edge") throw new TypeError("invalid Bend graph edge"); return number(record(edge).id); }),
    visited: readList(object.visited, number), files: number(object.files), readBytes: number(object.read_bytes),
    treeBytes: number(object.tree_bytes), work: number(object.work), skippedTree: bool(object.skipped_tree),
    skippedExcluded: bool(object.skipped_excluded) };
};
export const initialImportGraph = (limits: GraphLimits = GRAPH_LIMIT_CEILINGS): unknown => {
  const effective = validateGraphLimits(limits);
  const state = bendImportGraphInitial({
    $: "ImportGraph.Limits", version: nat(effective.version),
    source_bytes: nat(effective.sourceBytes), tree_bytes: nat(effective.treeBytes),
    files: nat(effective.files), read_bytes: nat(effective.readBytes),
    outgoing_edges: nat(effective.outgoingEdges), depth: nat(effective.depth), work: nat(effective.work),
  });
  projectImportGraph(state);
  return freezeState(state);
};
export const stepImportGraph = (state: unknown, event: ImportGraphEvent): { readonly state: unknown; readonly command: ImportGraphCommand } => {
  projectImportGraph(state);
  const raw = record(bendImportGraphStep(state, encode(event)));
  if (kind(raw) !== "BoundedStep") throw new TypeError("invalid Bend graph step");
  projectImportGraph(raw.state);
  return { state: freezeState(raw.state), command: command(raw.command) };
};
