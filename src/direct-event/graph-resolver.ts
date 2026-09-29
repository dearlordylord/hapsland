import { dirname, extname, isAbsolute, join, normalize, sep } from "node:path";
import { lstat } from "node:fs/promises";
import * as Effect from "effect/Effect";
import { initialImportGraph, permitLocalGraphFacts, projectImportGraph, stepImportGraph, type ImportGraphCommand } from "../canonical/graph-adapter.ts";
import { GRAPH_LIMIT_CEILINGS, type GraphLimits } from "../configuration/graph-limits.ts";
import { inspectGraphFile, type GraphDeclaration, type GraphFile } from "./analyzer.ts";
import { captureStable, type CaptureHooks, type StableCapture } from "./capture.ts";
import type { ArtifactReference, PhysicalRootIdentity, ReviewNode, ReviewUnit } from "./model.ts";
import { eligibleNamedPath, type DirectFilePolicy } from "./selection.ts";

type MutableNode = { artifact: ReviewNode["artifact"]; references: ArtifactReference[] };
type Pending = { readonly owner: MutableNode; readonly index: number; readonly from: string; readonly importPath: string; readonly name: string; readonly depth: number };
type Built = { readonly node: ReviewNode; readonly pending: ReadonlyArray<Pending>; readonly complete: boolean };
type LocalBudget = { readonly limits: GraphLimits; readonly targets: Set<string>; work: number; maxDepth: number };
export const GRAPH_ANALYSIS_DEADLINE_MS = 5_000;
const bytes = (value: unknown): number => Buffer.byteLength(JSON.stringify(value), "utf8");
const sourceExtensions = [".ts", ".tsx", ".mts", ".cts"] as const;

/** Materialize same-file evidence without turning imported declarations into edited roots. */
const buildLocal = (file: GraphFile, path: string, name: string, visited: Set<string>, budget: LocalBudget, depth: number): Built | undefined => {
  const declaration = file.declarations.get(name);
  if (declaration === undefined) return undefined;
  const node: MutableNode = {
    artifact: declaration.artifact, references: [],
  };
  const pending: Pending[] = [];
  let complete = true;
  for (const reference of declaration.references) {
    budget.maxDepth = Math.max(budget.maxDepth, depth + 1);
    if (depth >= budget.limits.depth) {
      complete = false; break;
    }
    if (reference.kind === "unsupported") { complete = false; continue; }
    const local = file.declarations.get(reference.name);
    const imported = file.imports.get(reference.name);
    const targetKey = local?.artifact.id ?? (imported === undefined ? reference.name : `${path}\0${imported.path}\0${imported.name}`);
    budget.targets.add(targetKey);
    if (budget.targets.size > budget.limits.outgoingEdges) { complete = false; break; }
    if (local !== undefined && imported !== undefined) { complete = false; continue; }
    if (local !== undefined) {
      budget.work += 1;
      if (budget.work > budget.limits.work) { complete = false; break; }
      if (visited.has(local.artifact.id)) {
        node.references.push({ kind: "included", site: { symbol: reference.name }, target: local.artifact.id });
      } else {
        visited.add(local.artifact.id);
        const child = buildLocal(file, path, reference.name, visited, budget, depth + 1);
        if (child === undefined) { complete = false; continue; }
        node.references.push({ kind: "expanded", site: { symbol: reference.name }, node: child.node });
        pending.push(...child.pending);
        complete &&= child.complete;
      }
    } else if (imported !== undefined) {
      const index = node.references.length;
      node.references.push({ kind: "omitted", site: { symbol: reference.name }, target: { kind: "unresolved", symbol: reference.name }, reason: "unresolved" });
      pending.push({ owner: node, index, from: path, importPath: imported.path, name: imported.name, depth });
    } else {
      complete = false;
      node.references.push({ kind: "omitted", site: { symbol: reference.name }, target: { kind: "unresolved", symbol: reference.name }, reason: "unresolved" });
    }
  }
  return { node, pending, complete };
};

export type GraphResolveContext = {
  readonly root: string;
  readonly rootIdentity: PhysicalRootIdentity;
  readonly policy: DirectFilePolicy;
  readonly limits?: GraphLimits;
  readonly captureHooks?: CaptureHooks;
  readonly captureSource?: typeof captureStable;
  /** One preparation invocation shares stable supporting snapshots across roots. */
  readonly captureCache?: Map<string, StableCapture>;
  readonly now?: () => number;
};

/** Run one finite, source-free Bend graph per named edited root. */
export const resolveGraphUnit = Effect.fn("DirectEvent.resolveGraphUnit")(function* (
  rootPath: string,
  rootCapture: StableCapture,
  name: string,
  context: GraphResolveContext,
) {
  const limits = context.limits ?? GRAPH_LIMIT_CEILINGS;
  const rootFile = inspectGraphFile(rootPath, rootCapture.text);
  if (rootFile === undefined) return undefined;
  const rootDeclaration = rootFile.declarations.get(name);
  if (rootDeclaration === undefined) return undefined;
  if (rootDeclaration.references.length > limits.outgoingEdges) return undefined;
  const visited = new Set([rootDeclaration.artifact.id]);
  const budget: LocalBudget = { limits, targets: new Set(), work: 0, maxDepth: 0 };
  const now = context.now ?? (() => performance.now());
  const started = now();
  const expired = () => now() - started >= GRAPH_ANALYSIS_DEADLINE_MS;
  const built = buildLocal(rootFile, rootPath, name, visited, budget, 0);
  if (built === undefined || !built.complete ||
    !permitLocalGraphFacts(limits, budget.work, budget.maxDepth, budget.targets.size, 0)) return undefined;
  const unit: ReviewUnit = { root: built.node };
  let nextId = 1;
  const pending = new Map<number, Pending>();
  const pathForTarget = new Map<number, { readonly path: string; readonly name: string; readonly edge: Pending }>();
  const targetIds = new Map<string, number>([[`${rootPath}\0${name}`, 1]]);
  const artifactsByTarget = new Map<number, string>([[1, rootDeclaration.artifact.id]]);
  let nextTargetId = 2;
  const addEdges = (edges: ReadonlyArray<Pending>): number[] => edges.map((edge) => {
    const id = nextId++;
    pending.set(id, edge);
    return id;
  });
  const remainingWork = Math.max(1, limits.work - budget.work);
  let state = initialImportGraph({ ...limits, work: remainingWork });
  let transition = stepImportGraph(state, { kind: "root", target: 1, sourceBytes: rootCapture.byteLength, treeBytes: bytes(unit), edges: addEdges(built.pending) });
  state = transition.state;
  let command: ImportGraphCommand = transition.command;
  let complete = true;
  const captured = new Map<string, { readonly file: GraphFile; readonly sourceBytes: number }>([[rootPath, { file: rootFile, sourceBytes: rootCapture.byteLength }]]);
  for (let step = 0; step < limits.work * 8 + 16; step += 1) {
    if (expired()) {
      transition = stepImportGraph(state, { kind: "deadlineReached" });
      return undefined;
    }
    if (command.kind === "unitComplete") return complete && bytes(unit) <= limits.treeBytes ? unit : undefined;
    if (command.kind === "unitIncomplete") return undefined;
    if (command.kind === "skipImport") complete = false;
    if (command.kind === "none" || command.kind === "skipImport") {
      transition = stepImportGraph(state, { kind: "next" });
    } else if (command.kind === "resolveEdge") {
      const edge = pending.get(command.edge);
      if (edge === undefined) return undefined;
      const base = normalize(join(dirname(edge.from), edge.importPath));
      if (base === ".." || base.startsWith(`..${sep}`) || isAbsolute(base)) {
        transition = stepImportGraph(state, { kind: "resolved", target: nextTargetId++, result: "unsupported" });
        state = transition.state;
        command = transition.command;
        continue;
      }
      const extension = extname(base);
      const choices = extension === "" ? sourceExtensions.map((candidate) => `${base}${candidate}`)
        : extension === ".js" ? [base.slice(0, -3) + ".ts", base.slice(0, -3) + ".tsx"]
        : extension === ".mjs" ? [base.slice(0, -4) + ".mts"]
        : extension === ".cjs" ? [base.slice(0, -4) + ".cts"]
        : [base];
      const existing: string[] = [];
      for (const choice of choices) {
        const status = yield* Effect.promise(() => lstat(join(context.root, choice)).catch(() => undefined));
        if (status?.isFile()) existing.push(choice);
      }
      if (existing.length !== 1) {
        transition = stepImportGraph(state, { kind: "resolved", target: nextTargetId++, result: existing.length === 0 ? "missing" : "ambiguous" });
      } else {
        const selectedPath = existing[0];
        if (selectedPath === undefined) return undefined;
        const targetFile = captured.get(selectedPath)?.file;
        const targetName = edge.name;
        const key = `${selectedPath}\0${targetName}`;
        const targetId = targetIds.get(key) ?? nextTargetId++;
        targetIds.set(key, targetId);
        if (targetFile !== undefined && !targetFile.declarations.get(targetName)?.exported) {
          transition = stepImportGraph(state, { kind: "resolved", target: targetId, result: "missing" });
        } else {
          // Bend must issue CheckPath before any new supporting source read.
          transition = stepImportGraph(state, { kind: "resolved", target: targetId, result: "found" });
          if (transition.command.kind === "none") {
            const artifactId = artifactsByTarget.get(targetId);
            if (artifactId !== undefined) edge.owner.references[edge.index] = {
              kind: "included", site: { symbol: edge.name }, target: artifactId,
            };
          }
          pathForTarget.set(targetId, { path: selectedPath, name: targetName, edge });
        }
      }
    } else if (command.kind === "checkPath") {
      const target = pathForTarget.get(command.target);
      if (target === undefined) return undefined;
      const selected = yield* eligibleNamedPath(context.root, target.path, context.policy, context.rootIdentity);
      transition = stepImportGraph(state, { kind: "pathChecked", allowed: selected !== undefined });
    } else if (command.kind === "readSource") {
      const target = pathForTarget.get(command.target);
      if (target === undefined) return undefined;
      const selected = yield* eligibleNamedPath(context.root, target.path, context.policy, context.rootIdentity);
      if (selected === undefined) {
        transition = stepImportGraph(state, { kind: "captureFailed" });
      } else {
        let source = context.captureCache?.get(selected.relativePath);
        if (source === undefined) {
          source = yield* (context.captureSource ?? captureStable)(context.root, selected, context.captureHooks, context.rootIdentity);
          if (source !== undefined) context.captureCache?.set(selected.relativePath, source);
        }
        if (source === undefined || source.byteLength > limits.sourceBytes) {
          transition = stepImportGraph(state, { kind: "captureFailed" });
        } else {
          const file = inspectGraphFile(selected.relativePath, source.text);
          const declaration = file?.declarations.get(target.name);
          if (file === undefined || declaration === undefined || !declaration.exported) {
            transition = stepImportGraph(state, { kind: "captureFailed" });
          } else {
            const child = buildLocal(file, selected.relativePath, target.name, visited, budget, target.edge.depth + 1);
            if (child === undefined || !child.complete ||
              !permitLocalGraphFacts(limits, budget.work, budget.maxDepth,
                budget.targets.size, projectImportGraph(state).work)) {
              transition = stepImportGraph(state, { kind: "captureFailed" });
            } else {
              const previous = bytes(unit);
              target.edge.owner.references[target.edge.index] = { kind: "expanded", site: { symbol: target.edge.name }, node: child.node };
              const contribution = bytes(unit) - previous;
              transition = stepImportGraph(state, { kind: "captured", sourceBytes: source.byteLength, treeBytes: Math.max(0, contribution), edges: addEdges(child.pending) });
              if (transition.command.kind === "skipImport") {
                target.edge.owner.references[target.edge.index] = { kind: "omitted", site: { symbol: target.edge.name }, target: { kind: "unresolved", symbol: target.edge.name }, reason: "reference-limit" };
              } else {
                captured.set(selected.relativePath, { file, sourceBytes: source.byteLength });
                artifactsByTarget.set(command.target, declaration.artifact.id);
              }
            }
          }
        }
      }
    } else return undefined;
    state = transition.state;
    command = transition.command;
    if (projectImportGraph(state).phase === "complete") return complete && bytes(unit) <= limits.treeBytes ? unit : undefined;
    if (projectImportGraph(state).phase === "incomplete") return undefined;
  }
  return undefined;
});
