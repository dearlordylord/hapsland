import Shared from "../../monkey-business-bend/engine.mjs";
import { Schema } from "effect";
import { decoder, Nat, readNat, readBool, readRecord, readBendList } from "@hapsland/canonical-policy/canonical/boundary-schema";
import { decodeGraphEvent } from "@hapsland/canonical-policy/canonical/graph-schema";
import { type ImportGraphEvent, GRAPH_LIMIT_CEILINGS, validateGraphLimits, type GraphLimits } from "@hapsland/canonical-policy/canonical/graph-adapter";
import { encodeSharedValue, decodeSharedValue } from "@hapsland/canonical-policy/canonical/simulation-codec";

export type FileTreeProfile = Readonly<{
  minFiles: number; maxFiles: number; maxImports: number; maxDepth: number;
  deniedPercent: number;
  unsupportedPercent?: number; missingPercent?: number; unreadablePercent?: number; repeatedEdgePercent?: number; cyclicEdgePercent?: number;
  /** Fact index at which the native deadline fires; zero disables injection. */
  deadlineStep?: number;
  /** Synthetic local analysis work supplied with every capture. */
  localWork?: number;
  minSourceBytes: number; maxSourceBytes: number;
  minTreeBytes: number; maxTreeBytes: number;
}>;
export const DEFAULT_FILE_TREE_PROFILE: FileTreeProfile = Object.freeze({
  minFiles: 3, maxFiles: 8, maxImports: 3, maxDepth: 3, deniedPercent: 15,
  minSourceBytes: 512, maxSourceBytes: 4096, minTreeBytes: 256, maxTreeBytes: 2048,
});
export const FILE_TREE_LABELS: Readonly<Record<keyof FileTreeProfile, string>> = Object.freeze({
  unsupportedPercent: "Unsupported import targets (%)",
  localWork: "Local analysis work per file",
  missingPercent: "Missing import targets (%)", unreadablePercent: "Unreadable import targets (%)", repeatedEdgePercent: "Repeated import edges (%)", cyclicEdgePercent: "Cyclic import edges (%)", deadlineStep: "Deadline fact index",
  minFiles: "Minimum generated files", maxFiles: "Maximum generated files", maxImports: "Maximum imports per file", maxDepth: "Maximum import depth", deniedPercent: "Denied import targets (%)",
  minSourceBytes: "Minimum source bytes per file", maxSourceBytes: "Maximum source bytes per file", minTreeBytes: "Minimum evidence-tree bytes per file", maxTreeBytes: "Maximum evidence-tree bytes per file",
});
export const validateFileTreeProfile = (profile: FileTreeProfile): FileTreeProfile => {
  if (!profile || typeof profile !== "object") throw new TypeError("file tree profile must be an object");
  const bounds: Record<keyof FileTreeProfile, readonly [number, number]> = {
    unsupportedPercent: [0, 100],
    localWork: [0, 1048576],
    missingPercent: [0, 100], unreadablePercent: [0, 100], repeatedEdgePercent: [0, 100], cyclicEdgePercent: [0, 100], deadlineStep: [0, 511],
    minFiles: [1, 64], maxFiles: [1, 64], maxImports: [0, 128], maxDepth: [0, 12], deniedPercent: [0, 100],
    minSourceBytes: [1, 1048576], maxSourceBytes: [1, 1048576], minTreeBytes: [1, 1048576], maxTreeBytes: [1, 1048576],
  };
  for (const key of Object.keys(bounds) as (keyof FileTreeProfile)[]) {
    const [min, max] = bounds[key];
    const value = profile[key];
    if (value === undefined && ["unsupportedPercent", "missingPercent", "unreadablePercent", "repeatedEdgePercent", "cyclicEdgePercent", "deadlineStep", "localWork"].includes(key)) continue;
    if (typeof value !== "number" || !Number.isSafeInteger(value) || value < min || value > max)
      throw new RangeError(`${FILE_TREE_LABELS[key]} must be an integer in [${min}, ${max}]`);
  }
  for (const [min, max] of [["minFiles", "maxFiles"], ["minSourceBytes", "maxSourceBytes"], ["minTreeBytes", "maxTreeBytes"]] as const)
    if (profile[min] > profile[max]) throw new RangeError(`${FILE_TREE_LABELS[min]} must not exceed ${FILE_TREE_LABELS[max].toLowerCase()}`);
  let capacity = 1, level = 1;
  for (let depth = 1; depth <= profile.maxDepth && capacity < 64; depth++) {
    level *= profile.maxImports;
    capacity += level;
  }
  if (profile.maxFiles > capacity) throw new RangeError(`Maximum files exceeds branching/depth capacity (${capacity} files)`);
  return Object.freeze({ ...profile });
};
export type GeneratedFile = Readonly<{ target: number; name: string; depth: number; allowed: boolean; sourceBytes: number; treeBytes: number; edges: readonly number[] }>;
export type GeneratedTree = Readonly<{ files: readonly GeneratedFile[]; facts: readonly ImportGraphEvent[]; targetNames: Readonly<Record<number, string>>; depth: number; limits: GraphLimits; rootEligible: boolean; closureEligible: boolean }>;

const rawFile = decoder(Schema.Struct({
  $: Schema.Literal("TreeFacts.TreeFile"), target: Nat, depth: Nat, allowed: Schema.Boolean,
  source_bytes: Nat, tree_bytes: Nat, edges: Schema.Unknown,
  missing: Schema.Boolean, unreadable: Schema.Boolean, unsupported: Schema.Boolean,
}));
const rawTree = decoder(Schema.Struct({ $: Schema.Literal("TreeFacts.Tree"), files: Schema.Unknown, depth: Nat }));
const rawGenerated = decoder(Schema.Struct({ $: Schema.Literal("PreparationScenario.Generated"),
  tree: Schema.Unknown, facts: Schema.Unknown, state: Schema.Unknown, terminated: Schema.Boolean, root_gate: Schema.Unknown, closure_gate: Schema.Unknown }));

/** Encode the captured source-free profile; no random draws or graph policy run in the host. */
export const encodeFileTreeProfile = (input: FileTreeProfile): unknown => {
  const profile = validateFileTreeProfile(input);
  return { $: "TreeFacts.Profile", min_files: profile.minFiles, max_files: profile.maxFiles,
    max_imports: profile.maxImports, max_depth: profile.maxDepth, denied_percent: profile.deniedPercent,
    missing_percent: profile.missingPercent ?? 0, unreadable_percent: profile.unreadablePercent ?? 0,
    repeated_percent: profile.repeatedEdgePercent ?? 0, cyclic_percent: profile.cyclicEdgePercent ?? 0,
    unsupported_percent: profile.unsupportedPercent ?? 0, deadline_step: profile.deadlineStep ?? 0,
    local_work: profile.localWork ?? 0, min_source: profile.minSourceBytes, max_source: profile.maxSourceBytes,
    min_tree: profile.minTreeBytes, max_tree: profile.maxTreeBytes };
};
export const encodePreparationGraphLimits = (input: GraphLimits): unknown => {
  const limits = validateGraphLimits(input);
  return { $: "ImportGraph.Limits", version: limits.version, source_bytes: limits.sourceBytes,
    tree_bytes: limits.treeBytes, files: limits.files, read_bytes: limits.readBytes,
    outgoing_edges: limits.outgoingEdges, depth: limits.depth, work: limits.work };
};
const decodedFact = (input: unknown): ImportGraphEvent => {
  const fact = readRecord(input);
  switch (fact.$) {
    case "ImportGraph.Root": return decodeGraphEvent({ kind: "root", target: fact.target,
      sourceBytes: fact.source_bytes, treeBytes: fact.tree_bytes, localWork: fact.local_work,
      edges: readBendList(fact.edges, readNat, 128) });
    case "ImportGraph.Next": return decodeGraphEvent({ kind: "next" });
    case "ImportGraph.Resolved": {
      const result = readRecord(fact.result).$;
      const names = { "ImportGraph.Found": "found", "ImportGraph.NotFound": "missing", "ImportGraph.Many": "ambiguous", "ImportGraph.Unhandled": "unsupported" } as const;
      if (typeof result !== "string" || !(result in names)) throw new TypeError("invalid generated resolution");
      return decodeGraphEvent({ kind: "resolved", target: fact.target, result: names[result as keyof typeof names] });
    }
    case "ImportGraph.PathChecked": return decodeGraphEvent({ kind: "pathChecked", allowed: readBool(fact.allowed) });
    case "ImportGraph.Captured": return decodeGraphEvent({ kind: "captured", sourceBytes: fact.source_bytes,
      treeBytes: fact.node_bytes, localWork: fact.local_work, edges: readBendList(fact.edges, readNat, 128) });
    case "ImportGraph.CaptureFailed": return decodeGraphEvent({ kind: "captureFailed" });
    case "ImportGraph.DeadlineReached": return decodeGraphEvent({ kind: "deadlineReached" });
    default: throw new TypeError("invalid generated preparation fact");
  }
};

/** Dedicated per-artifact stream and command-following orchestration belong to Bend. */
export const generateFileTree = (seed: number, operation: number, unit: number,
  input: FileTreeProfile = DEFAULT_FILE_TREE_PROFILE, graphLimits: GraphLimits = GRAPH_LIMIT_CEILINGS): GeneratedTree => {
  for (const [name, value] of [["seed", seed], ["operation", operation], ["artifact index", unit]] as const)
    if (!Number.isSafeInteger(value) || value < 0 || value >= 2 ** 48) throw new RangeError(`${name} must be a nonnegative safe graph integer`);
  const limits = validateGraphLimits(graphLimits);
  const generated = rawGenerated(decodeSharedValue(Shared.generate_tree(BigInt(seed), BigInt(operation), BigInt(unit),
    encodeSharedValue(encodeFileTreeProfile(input)), encodeSharedValue(encodePreparationGraphLimits(limits)))));
  if (!generated.terminated) throw new Error("generated import tree did not reach a checked terminal state");
  const tree = rawTree(generated.tree);
  const files = readBendList(tree.files, item => {
    const file = rawFile(item);
    return { target: file.target, name: file.target === 1 ? "entry.ts" : `module-${file.target}.ts`,
      depth: file.depth, allowed: file.allowed, sourceBytes: file.source_bytes,
      treeBytes: file.tree_bytes, edges: readBendList(file.edges, readNat, 128) };
  }, 64);
  const facts = readBendList(generated.facts, item => {
    const fact = decodedFact(item);
    if (input.localWork !== undefined || !("localWork" in fact)) return fact;
    const { localWork: _work, ...nativeFact } = fact;
    return nativeFact;
  }, 512);
  const gate = decoder(Schema.Union([
    Schema.Struct({ $: Schema.Literal("RulePolicy.Admit") }),
    Schema.Struct({ $: Schema.Literal("RulePolicy.Omit") }),
  ]));
  return { files, facts, depth: tree.depth, limits,
    rootEligible: gate(generated.root_gate).$ === "RulePolicy.Admit", closureEligible: gate(generated.closure_gate).$ === "RulePolicy.Admit",
    targetNames: Object.fromEntries(files.map(file => [file.target, file.name])) };
};
