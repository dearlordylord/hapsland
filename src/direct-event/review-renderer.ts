import { createHash } from "node:crypto";
import { posix } from "node:path";
import { canonicalValue } from "./model.ts";

export const CANDIDATE_RENDERER_VERSION = "candidate-semantic-evidence/1";
export const MAX_CANDIDATE_TREE_BYTES = 20 * 1024;
const MAX_CANDIDATE_SOURCE_BYTES = 256 * 1024;
const MAX_CANDIDATE_NODES = 128;
const MAX_CANDIDATE_EDGES = 128;
const sha256 = (value: string): string => createHash("sha256").update(value, "utf8").digest("hex");
export const CANDIDATE_RENDERER_DIGEST = sha256(
  "candidate-semantic-evidence/1:artifact(kind,name,domain,source):evidence(rootId,nodes[id,kind,name,domain,source,order],edges[from,to?,kind,symbol,reason?,order]):inputContract(id,completeness,projectionFingerprint,rendererVersion,rendererDigest)",
);

type Kind = "interface" | "type-alias" | "struct" | "enum" | "datatype" | "function";
type Artifact = Readonly<{ id: string; kind: Kind; name: string; domain: string; source: string }>;
type Node = Artifact & Readonly<{ order: number }>;
type Edge = Readonly<{ from: string; to: string; kind: "expanded" | "included"; symbol: string; order: number }> |
  Readonly<{ from: string; kind: "omitted"; symbol: string;
    reason: "unresolved" | "unsupported" | "reference-limit" | "unavailable"; order: number }>;
export type CandidateReviewInput = Readonly<{
  contract: "direct-event/type-shape/v1" | "direct-event/function/v1";
  completeness: "complete" | "incomplete-irrelevant";
  treeBytesLimit: number;
  artifact: Artifact;
  nodes: ReadonlyArray<Node>;
  edges: ReadonlyArray<Edge>;
}>;
export type RenderedCandidateReviewInput = Readonly<{
  artifact: Readonly<{ kind: Kind; name: string; domain: string; source: string }>;
  evidence: Readonly<{ rootId: string; nodes: ReadonlyArray<Node>; edges: ReadonlyArray<Edge> }>;
  inputContract: Readonly<{
    id: CandidateReviewInput["contract"];
    completeness: CandidateReviewInput["completeness"];
    projectionFingerprint: string;
    rendererVersion: typeof CANDIDATE_RENDERER_VERSION;
    rendererDigest: string;
  }>;
}>;

const record = (value: unknown): Record<string, unknown> | undefined =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown> : undefined;
const exactKeys = (value: Record<string, unknown>, keys: ReadonlyArray<string>): boolean =>
  Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
const relativeDomain = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0 && value.length <= 4096 &&
  !value.includes("\\") && !value.includes("\0") && !value.startsWith("/") &&
  !/^[A-Za-z]:/.test(value) && value.split("/").every((part) => part !== "" && part !== "." && part !== "..") &&
  posix.normalize(value) === value;
const identifier = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0 && value.length <= 256 && !value.includes("\0");
const declarationName = (value: unknown): value is string =>
  typeof value === "string" && value.length <= 256 &&
  /^[\p{ID_Start}_$][\p{ID_Continue}$\u200C\u200D]*$/u.test(value);
// Qualified reference sites are distinct from declaration names. Keep the
// original alias/path spelling while binding the edge to its canonical target.
const referenceName = (value: unknown): value is string =>
  typeof value === "string" && value.length <= 256 &&
  value.split(/::|\./u).every(declarationName);
const kind = (value: unknown): value is Kind =>
  value === "interface" || value === "type-alias" || value === "struct" || value === "enum" || value === "datatype" || value === "function";
const source = (value: unknown): value is string =>
  typeof value === "string" && Buffer.byteLength(value, "utf8") <= MAX_CANDIDATE_SOURCE_BYTES;
const artifact = (value: unknown, ordered: boolean): Artifact | Node | undefined => {
  const item = record(value);
  if (item === undefined || !exactKeys(item,
    ordered ? ["id", "kind", "name", "domain", "source", "order"] : ["id", "kind", "name", "domain", "source"]) ||
    !identifier(item.id) || !kind(item.kind) || !declarationName(item.name) ||
    !relativeDomain(item.domain) || !source(item.source) ||
    item.id !== `${item.domain}:${item.kind}:${item.name}` ||
    (ordered && (!Number.isSafeInteger(item.order) || Number(item.order) < 0))) return undefined;
  return item as Artifact | Node;
};
const edge = (value: unknown): Edge | undefined => {
  const item = record(value);
  if (item === undefined || !identifier(item.from) || !referenceName(item.symbol) ||
    !Number.isSafeInteger(item.order) || Number(item.order) < 0) return undefined;
  if (item.kind === "omitted") {
    if (!exactKeys(item, ["from", "kind", "symbol", "reason", "order"]) ||
      !["unresolved", "unsupported", "reference-limit", "unavailable"].includes(String(item.reason))) return undefined;
  } else if (!exactKeys(item, ["from", "to", "kind", "symbol", "order"]) ||
    !identifier(item.to) || (item.kind !== "expanded" && item.kind !== "included")) return undefined;
  return item as Edge;
};
const freeze = <A>(value: A): A => {
  if (typeof value === "object" && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) freeze(child);
  }
  return value;
};

/** Candidate wire proposal only; the accepted adoption gate must freeze its exact shape before egress. */
export const renderCandidateReviewInput = (value: unknown): RenderedCandidateReviewInput | undefined => {
  const input = record(value);
  if (input === undefined || !exactKeys(input,
    ["contract", "completeness", "treeBytesLimit", "artifact", "nodes", "edges"]) ||
    (input.contract !== "direct-event/type-shape/v1" && input.contract !== "direct-event/function/v1") ||
    (input.completeness !== "complete" && input.completeness !== "incomplete-irrelevant") ||
    !Number.isSafeInteger(input.treeBytesLimit) ||
    Number(input.treeBytesLimit) < 1 || Number(input.treeBytesLimit) > MAX_CANDIDATE_TREE_BYTES ||
    !Array.isArray(input.nodes) || input.nodes.length > MAX_CANDIDATE_NODES ||
    !Array.isArray(input.edges) || input.edges.length > MAX_CANDIDATE_EDGES) return undefined;
  const root = artifact(input.artifact, false);
  if (root === undefined) return undefined;
  if (input.contract === "direct-event/function/v1" ? root.kind !== "function" : root.kind === "function") return undefined;
  const nodes = input.nodes.map((item) => artifact(item, true));
  const edges = input.edges.map(edge);
  if (nodes.some((item) => item === undefined) || edges.some((item) => item === undefined)) return undefined;
  if (input.contract === "direct-event/type-shape/v1" && nodes.some((item) => item?.kind === "function")) return undefined;
  const orderedNodes = (nodes as Node[]).sort((a, b) => a.order - b.order || a.domain.localeCompare(b.domain) ||
    a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  const orderedEdges = (edges as Edge[]).sort((a, b) => a.order - b.order || a.from.localeCompare(b.from) ||
    ("to" in a ? a.to : "").localeCompare("to" in b ? b.to : "") || a.symbol.localeCompare(b.symbol));
  const ids = new Set([root.id]);
  for (const node of orderedNodes) {
    if (ids.has(node.id) || node.source.length === 0) return undefined;
    ids.add(node.id);
  }
  const hasOmissions = orderedEdges.some((item) => item.kind === "omitted");
  if ((input.completeness === "complete") === hasOmissions || root.source.length === 0 ||
    orderedEdges.some((item) => !ids.has(item.from) || item.kind !== "omitted" && !ids.has(item.to))) return undefined;
  // Only the finite, rooted projection may be serialized. An unreferenced node
  // would disclose unrelated source, and an included edge cannot introduce it.
  const reached = new Set([root.id]);
  for (const item of orderedEdges) {
    if (!reached.has(item.from)) return undefined;
    if (item.kind === "omitted") continue;
    if (item.kind === "expanded") {
      if (reached.has(item.to)) return undefined;
      reached.add(item.to);
    } else if (!reached.has(item.to)) return undefined;
  }
  if (reached.size !== ids.size) return undefined;
  const tree = {
    artifact: { kind: root.kind, name: root.name, domain: root.domain, source: root.source },
    evidence: { rootId: root.id, nodes: orderedNodes, edges: orderedEdges },
  };
  const encodedTree = canonicalValue(tree);
  const rendered: RenderedCandidateReviewInput = {
    ...tree,
    inputContract: {
      id: input.contract, completeness: input.completeness,
      projectionFingerprint: sha256(encodedTree),
      rendererVersion: CANDIDATE_RENDERER_VERSION,
      rendererDigest: CANDIDATE_RENDERER_DIGEST,
    },
  };
  if (Buffer.byteLength(canonicalValue(rendered), "utf8") > Number(input.treeBytesLimit)) return undefined;
  return freeze(rendered);
};
