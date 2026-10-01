import { dirname, isAbsolute, join, normalize, sep } from "node:path";
import { lstat } from "node:fs/promises";
import * as Effect from "effect/Effect";
import { initialImportGraph, permitLocalGraphFacts, projectImportGraph, stepImportGraph, type ImportGraphCommand } from "../canonical/graph-adapter.ts";
import { GRAPH_LIMIT_CEILINGS, type GraphLimits } from "../configuration/graph-limits.ts";
import { languageForPath } from "./languages/registry.ts";
import type { GraphFacts, LanguageGraphHost } from "./languages/contracts.ts";
import { captureStable, type StableCapture } from "./capture.ts";
import type { ArtifactReference, ReviewArtifact, ReviewNode, ReviewUnit } from "./model.ts";
import { eligibleNamedPath } from "./selection.ts";

type MutableNode = { artifact: ReviewNode["artifact"]; references: ArtifactReference[] };
type Pending = { readonly owner: MutableNode; readonly index: number; readonly from: string; readonly symbol: string; readonly importPath: string; readonly name: string; readonly depth: number; readonly expectedKind?: "type" | "function" };
type Built = { readonly node: ReviewNode; readonly pending: ReadonlyArray<Pending> };
type LocalBudget = {
  readonly limits: GraphLimits;
  /** Distinct outbound targets are charged to their source file, not the unit. */
  readonly targetsByPath: Map<string, Set<string>>;
  maxTargetsInFile: number;
  work: number;
  /** Import work already charged in Bend, excluding local work in this budget. */
  graphWork: number;
  maxDepth: number;
};
type FactFile = GraphFacts;
const factKey = (file: FactFile, name: string, expected: "type" | "function" | undefined): string =>
  file.kindAware ? `${expected ?? "function"}:${name}` : name;
const declarationFor = (file: FactFile, name: string, expected: "type" | "function" | undefined) =>
  file.declarations.get(factKey(file, name, expected));
const correctKind = (artifact: ReviewArtifact, expected: "type" | "function" | undefined): boolean =>
  expected === undefined || (expected === "function" ? artifact.kind === "function" : artifact.kind !== "function");
export const GRAPH_ANALYSIS_DEADLINE_MS = 5_000;
export const MAX_OBSERVATION_GRAPH_FILES = 64;
export const MAX_OBSERVATION_GRAPH_READ_BYTES = 16 * 1024 * 1024;
export const MAX_OBSERVATION_GRAPH_UNITS = 64;
const bytes = (value: unknown): number => Buffer.byteLength(JSON.stringify(value), "utf8");
const mayCaptureForObservation = (captures: ReadonlyMap<string, StableCapture>, path: string): boolean =>
  captures.has(path) || (captures.size < MAX_OBSERVATION_GRAPH_FILES &&
    [...captures.values()].reduce((sum, source) => sum + source.byteLength, 0) + GRAPH_LIMIT_CEILINGS.sourceBytes <=
      MAX_OBSERVATION_GRAPH_READ_BYTES);

/** Materialize bounded supporting evidence without turning imports into edited roots. */
const buildLocal = (file: FactFile, path: string, name: string, visited: Set<string>, budget: LocalBudget, depth: number,
  expectedKind: "type" | "function" | undefined = undefined): Built | undefined => {
  const declaration = declarationFor(file, name, expectedKind);
  if (declaration === undefined) return undefined;
  const node: MutableNode = {
    artifact: declaration.artifact, references: [],
  };
  const pending: Pending[] = [];
  const fileTargets = budget.targetsByPath.get(path) ?? new Set<string>();
  budget.targetsByPath.set(path, fileTargets);
  for (const reference of declaration.references) {
    budget.maxDepth = Math.max(budget.maxDepth, depth + 1);
    if (reference.kind === "unsupported") {
      node.references.push({ kind: "omitted", site: { symbol: reference.name },
        target: { kind: "unresolved", symbol: reference.name }, reason: "unsupported" });
      continue;
    }
    const local = declarationFor(file, reference.name, reference.expectedKind);
    const imported = file.imports.get(reference.name);
    const targetKey = local?.artifact.id ?? (imported === undefined ? reference.name : `${path}\0${imported.path}\0${imported.name}`);
    fileTargets.add(targetKey);
    budget.maxTargetsInFile = Math.max(budget.maxTargetsInFile, fileTargets.size);
    if (local !== undefined && imported !== undefined ||
      local !== undefined && !correctKind(local.artifact, reference.expectedKind)) {
      node.references.push({ kind: "omitted", site: { symbol: reference.name },
        target: { kind: "unresolved", symbol: reference.name }, reason: "unsupported" });
      continue;
    }
    if (local !== undefined) budget.work += 1;
    // Bend owns the effective depth, local-work, and per-file target ceilings.
    // Ask before recursing or queuing a supporting-file read.
    if (!permitLocalGraphFacts(budget.limits, budget.work, budget.maxDepth, fileTargets.size, budget.graphWork)) {
      node.references.push({ kind: "omitted", site: { symbol: reference.name },
        target: { kind: "unresolved", symbol: reference.name }, reason: "reference-limit" });
      continue;
    }
    if (local !== undefined) {
      if (visited.has(local.artifact.id)) {
        node.references.push({ kind: "included", site: { symbol: reference.name }, target: local.artifact.id });
      } else {
        visited.add(local.artifact.id);
        const child = buildLocal(file, path, reference.name, visited, budget, depth + 1, reference.expectedKind);
        if (child === undefined) {
          visited.delete(local.artifact.id);
          node.references.push({ kind: "omitted", site: { symbol: reference.name },
            target: { kind: "unresolved", symbol: reference.name }, reason: "unresolved" });
          continue;
        }
        node.references.push({ kind: "expanded", site: { symbol: reference.name }, node: child.node });
        pending.push(...child.pending);
      }
    } else if (imported !== undefined) {
      if (reference.expectedKind === "function" && imported.typeOnly === true) {
        node.references.push({ kind: "omitted", site: { symbol: reference.name },
          target: { kind: "unresolved", symbol: reference.name }, reason: "unsupported" });
        continue;
      }
      const index = node.references.length;
      node.references.push({ kind: "omitted", site: { symbol: reference.name }, target: { kind: "unresolved", symbol: reference.name }, reason: "unavailable" });
      pending.push({ owner: node, index, from: path, symbol: reference.name, importPath: imported.path, name: imported.name, depth,
        ...(reference.expectedKind === undefined ? {} : { expectedKind: reference.expectedKind }) });
    } else {
      node.references.push({ kind: "omitted", site: { symbol: reference.name }, target: { kind: "unresolved", symbol: reference.name }, reason: "unresolved" });
    }
  }
  return { node, pending };
};

export type GraphResolveContext = LanguageGraphHost;

/** Run one finite, source-free Bend graph per named edited root. */
export const resolveGraphUnit = Effect.fn("DirectEvent.resolveGraphUnit")(function* (
  rootPath: string,
  rootCapture: StableCapture,
  name: string,
  context: GraphResolveContext,
) {
  let limits = context.limits ?? GRAPH_LIMIT_CEILINGS;
  const now = context.now ?? (() => performance.now());
  const started = now();
  const expired = () => now() - started >= GRAPH_ANALYSIS_DEADLINE_MS;
  const language = languageForPath(rootPath);
  if (language === undefined) return undefined;
  const binding = yield* language.prepareGraph(rootPath, rootCapture, context, limits, expired);
  if (binding === undefined) return undefined;
  const { session, dependencies } = binding;
  limits = binding.limits;
  if (limits.files < 1 || limits.work < 1 || limits.readBytes < rootCapture.byteLength || expired()) return undefined;
  const branch = context.branch ?? "type";
  const rootFile = session.inspect(rootPath, rootCapture.text, branch);
  if (rootFile === undefined) return undefined;
  const rootDeclaration = declarationFor(rootFile, name, context.branch === "function" ? "function" : undefined);
  if (rootDeclaration === undefined) return undefined;
  const visited = new Set([rootDeclaration.artifact.id]);
  const budget: LocalBudget = { limits, targetsByPath: new Map(), maxTargetsInFile: 0, work: 0, graphWork: 0, maxDepth: 0 };
  const built = buildLocal(rootFile, rootPath, name, visited, budget, 0);
  if (built === undefined ||
    !permitLocalGraphFacts(limits, budget.work, budget.maxDepth, budget.maxTargetsInFile, 0)) return undefined;
  const unit: ReviewUnit = { root: built.node, ...(dependencies.length === 0 ? {} : { sourceDependencies: dependencies }) };
  let nextId = 1;
  const pending = new Map<number, Pending>();
  const pathForTarget = new Map<number, { readonly path: string; readonly name: string; readonly edge: Pending }>();
  const targetIds = new Map<string, number>([[`${rootPath}\0${context.branch === "function" ? "function" : "type"}\0${name}`, 1]]);
  const artifactsByTarget = new Map<number, string>([[1, rootDeclaration.artifact.id]]);
  let nextTargetId = 2;
  const addEdges = (edges: ReadonlyArray<Pending>): number[] => edges.map((edge) => {
    const id = nextId++;
    pending.set(id, edge);
    return id;
  });
  let state = initialImportGraph(limits);
  let transition = stepImportGraph(state, { kind: "root", target: 1, sourceBytes: rootCapture.byteLength,
    treeBytes: bytes(unit), localWork: budget.work, edges: addEdges(built.pending) });
  state = transition.state;
  let command: ImportGraphCommand = transition.command;
  const hasOmissions = (node: ReviewNode): boolean => node.references.some((reference) =>
    reference.kind === "omitted" || reference.kind === "expanded" && hasOmissions(reference.node));
  const partialUnit = (reason: string): ReviewUnit | undefined =>
    reason !== "Deadline" && reason !== "ProtocolViolation" &&
    projectImportGraph(state).files > 0 && hasOmissions(unit.root) &&
    bytes(unit) <= limits.treeBytes ? unit : undefined;
  const captured = new Map<string, { readonly file: FactFile; readonly sourceBytes: number }>([[rootPath, { file: rootFile, sourceBytes: rootCapture.byteLength }]]);
  for (let step = 0; step < limits.work * 8 + 16; step += 1) {
    if (expired()) {
      transition = stepImportGraph(state, { kind: "deadlineReached" });
      return undefined;
    }
    if (command.kind === "unitComplete") return bytes(unit) <= limits.treeBytes ? unit : undefined;
    if (command.kind === "unitIncomplete") return partialUnit(command.reason);
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
      // The adapter supplies language binding candidates. The shared host
      // owns containment, eligibility, capture, and graph transitions.
      const choices = session.importCandidates(edge.from, edge.importPath);
      if (choices.length === 0) {
        transition = stepImportGraph(state, { kind: "resolved", target: nextTargetId++, result: "unsupported" });
        state = transition.state;
        command = transition.command;
        continue;
      }
      const existing: string[] = [];
      for (const choice of choices) {
        if (choice === ".." || choice.startsWith(`..${sep}`) || isAbsolute(choice)) continue;
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
        const key = `${selectedPath}\0${edge.expectedKind ?? "type"}\0${targetName}`;
        const targetId = targetIds.get(key) ?? nextTargetId++;
        targetIds.set(key, targetId);
        const knownDeclaration = targetFile === undefined ? undefined : declarationFor(targetFile, targetName, edge.expectedKind);
        if (targetFile !== undefined && (!knownDeclaration?.exported ||
          !correctKind(knownDeclaration.artifact, edge.expectedKind))) {
          transition = stepImportGraph(state, { kind: "resolved", target: targetId, result: "missing" });
        } else {
          // Bend must issue CheckPath before any new supporting source read.
          transition = stepImportGraph(state, { kind: "resolved", target: targetId, result: "found" });
          if (transition.command.kind === "none") {
            const artifactId = artifactsByTarget.get(targetId);
            if (artifactId !== undefined) edge.owner.references[edge.index] = {
              kind: "included", site: { symbol: edge.symbol }, target: artifactId,
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
      if (selected === undefined || (context.captureCache !== undefined &&
        !mayCaptureForObservation(context.captureCache, selected.relativePath))) {
        transition = stepImportGraph(state, { kind: "captureFailed" });
      } else {
        let source = context.captureCache?.get(selected.relativePath);
        if (source === undefined) {
          source = yield* (context.captureSource ?? captureStable)(
            context.root, selected, context.captureHooks, context.rootIdentity, limits.sourceBytes,
          );
          if (source !== undefined) context.captureCache?.set(selected.relativePath, source);
        }
        if (source === undefined) {
          transition = stepImportGraph(state, { kind: "captureFailed" });
        } else if (source.byteLength > limits.sourceBytes) {
          // The stable capture supplied measured bytes. Let Bend reject the
          // effective source cap before inspecting or retaining its text.
          transition = stepImportGraph(state, { kind: "captured", sourceBytes: source.byteLength, treeBytes: 0, edges: [] });
        } else {
          const localWorkBefore = budget.work;
          budget.graphWork = projectImportGraph(state).work - budget.work;
          const file = session.inspect(selected.relativePath, source.text, branch);
          const declaration = file === undefined ? undefined : declarationFor(file, target.name, target.edge.expectedKind);
          if (file === undefined || declaration === undefined || !declaration.exported ||
            !correctKind(declaration.artifact, target.edge.expectedKind)) {
            transition = stepImportGraph(state, { kind: "captureFailed" });
          } else {
            const child = buildLocal(file, selected.relativePath, target.name, visited, budget, target.edge.depth + 1,
              target.edge.expectedKind);
            if (!permitLocalGraphFacts(limits, budget.work, 0, 0, budget.graphWork)) {
              transition = stepImportGraph(state, { kind: "captured", sourceBytes: source.byteLength,
                treeBytes: 0, localWork: budget.work - localWorkBefore, edges: [] });
            } else if (child === undefined ||
              !permitLocalGraphFacts(limits, budget.work, budget.maxDepth,
                budget.maxTargetsInFile, budget.graphWork)) {
              transition = stepImportGraph(state, { kind: "captureFailed" });
            } else {
              const previous = bytes(unit);
              target.edge.owner.references[target.edge.index] = { kind: "expanded", site: { symbol: target.edge.symbol }, node: child.node };
              const contribution = bytes(unit) - previous;
              transition = stepImportGraph(state, { kind: "captured", sourceBytes: source.byteLength,
                treeBytes: Math.max(0, contribution), localWork: budget.work - localWorkBefore, edges: addEdges(child.pending) });
              if (transition.command.kind === "skipImport") {
                target.edge.owner.references[target.edge.index] = { kind: "omitted", site: { symbol: target.edge.symbol }, target: { kind: "unresolved", symbol: target.edge.name }, reason: "reference-limit" };
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
    if (projectImportGraph(state).phase === "complete") return bytes(unit) <= limits.treeBytes ? unit : undefined;
    if (projectImportGraph(state).phase === "incomplete") return partialUnit(projectImportGraph(state).reason ?? "ProtocolViolation");
  }
  return undefined;
});
