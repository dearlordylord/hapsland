import { dirname, isAbsolute, join, normalize, sep } from "node:path"
import { lstat } from "node:fs/promises"
import * as Effect from "effect/Effect"
import {
  initialImportGraph,
  permitLocalGraphFacts,
  projectImportGraph,
  stepImportGraph,
  type ImportGraphCommand,
  type ImportGraphEvent
} from "../canonical/graph-adapter.ts"
import { GRAPH_LIMIT_CEILINGS, type GraphLimits } from "../configuration/graph-limits.ts"
import { languageForPath } from "./languages/registry.ts"
import type { GraphFacts, LanguageGraphHost, PreparedGraph } from "./languages/contracts.ts"
import { captureStable, type StableCapture } from "./capture.ts"
import type { ArtifactReference, ReviewArtifact, ReviewNode, ReviewUnit } from "./model.ts"
import { contextDirectFilePolicy, eligibleNamedPath } from "./selection.ts"

type MutableNode = { artifact: ReviewNode["artifact"]; references: ArtifactReference[] }
type Pending = {
  readonly owner: MutableNode
  readonly index: number
  readonly from: string
  readonly symbol: string
  readonly importPath: string
  readonly name: string
  readonly depth: number
  readonly expectedKind?: "type" | "function"
}
type Built = { readonly node: ReviewNode; readonly pending: ReadonlyArray<Pending> }
type LocalBudget = {
  readonly limits: GraphLimits
  /** Distinct outbound targets are charged to their source file, not the unit. */
  readonly targetsByPath: Map<string, Set<string>>
  maxTargetsInFile: number
  work: number
  /** Import work already charged in Bend, excluding local work in this budget. */
  graphWork: number
  maxDepth: number
}
type FactFile = GraphFacts
const factKey = (file: FactFile, name: string, expected: "type" | "function" | undefined): string =>
  file.kindAware ? `${expected ?? "function"}:${name}` : name
const declarationFor = (file: FactFile, name: string, expected: "type" | "function" | undefined) =>
  file.declarations.get(factKey(file, name, expected))
const correctKind = (artifact: ReviewArtifact, expected: "type" | "function" | undefined): boolean =>
  expected === undefined || (expected === "function" ? artifact.kind === "function" : artifact.kind !== "function")
export const GRAPH_ANALYSIS_DEADLINE_MS = 5_000
export const MAX_OBSERVATION_GRAPH_FILES = 64
export const MAX_OBSERVATION_GRAPH_READ_BYTES = 16 * 1024 * 1024
export const MAX_OBSERVATION_GRAPH_UNITS = 64
const bytes = (value: unknown): number => Buffer.byteLength(JSON.stringify(value), "utf8")
const mayCaptureForObservation = (captures: ReadonlyMap<string, StableCapture>, path: string): boolean =>
  captures.has(path) ||
  (captures.size < MAX_OBSERVATION_GRAPH_FILES &&
    [...captures.values()].reduce((sum, source) => sum + source.byteLength, 0) + GRAPH_LIMIT_CEILINGS.sourceBytes <=
      MAX_OBSERVATION_GRAPH_READ_BYTES)

type FactDeclaration = NonNullable<ReturnType<FactFile["declarations"]["get"]>>
type FactImport = NonNullable<ReturnType<FactFile["imports"]["get"]>>
type FactReference = FactDeclaration["references"][number]
type LocalFrame = {
  readonly file: FactFile
  readonly path: string
  readonly visited: Set<string>
  readonly budget: LocalBudget
  readonly depth: number
  readonly node: MutableNode
  readonly pending: Pending[]
  readonly fileTargets: Set<string>
}
const omittedReference = (
  symbol: string,
  reason: Extract<ArtifactReference, { kind: "omitted" }>["reason"],
  targetSymbol = symbol
): ArtifactReference => ({
  kind: "omitted",
  site: { symbol },
  target: { kind: "unresolved", symbol: targetSymbol },
  reason
})
const localReferenceTargetKey = (
  path: string,
  name: string,
  local: FactDeclaration | undefined,
  imported: FactImport | undefined
): string => {
  if (local !== undefined) return local.artifact.id
  return imported === undefined ? name : `${path}\0${imported.path}\0${imported.name}`
}
const ambiguousLocalReference = (
  local: FactDeclaration | undefined,
  imported: FactImport | undefined,
  expectedKind: "type" | "function" | undefined
): boolean => {
  if (local === undefined) return false
  return imported !== undefined || !correctKind(local.artifact, expectedKind)
}
const expandLocalReference = (frame: LocalFrame, reference: FactReference, local: FactDeclaration): void => {
  if (frame.visited.has(local.artifact.id)) {
    frame.node.references.push({ kind: "included", site: { symbol: reference.name }, target: local.artifact.id })
    return
  }
  frame.visited.add(local.artifact.id)
  const child = buildLocal(
    frame.file,
    frame.path,
    reference.name,
    frame.visited,
    frame.budget,
    frame.depth + 1,
    reference.expectedKind
  )
  if (child === undefined) {
    frame.visited.delete(local.artifact.id)
    frame.node.references.push(omittedReference(reference.name, "unresolved"))
    return
  }
  frame.node.references.push({ kind: "expanded", site: { symbol: reference.name }, node: child.node })
  frame.pending.push(...child.pending)
}
const queueImportedReference = (
  frame: LocalFrame,
  reference: FactReference,
  imported: FactImport | undefined
): void => {
  if (imported === undefined) {
    frame.node.references.push(omittedReference(reference.name, "unresolved"))
    return
  }
  if (reference.expectedKind === "function" && imported.typeOnly === true) {
    frame.node.references.push(omittedReference(reference.name, "unsupported"))
    return
  }
  const index = frame.node.references.length
  frame.node.references.push(omittedReference(reference.name, "unavailable"))
  frame.pending.push({
    owner: frame.node,
    index,
    from: frame.path,
    symbol: reference.name,
    importPath: imported.path,
    name: imported.name,
    depth: frame.depth,
    ...(reference.expectedKind === undefined ? {} : { expectedKind: reference.expectedKind })
  })
}
const materializeLocalReference = (frame: LocalFrame, reference: FactReference): void => {
  const { budget, fileTargets } = frame
  budget.maxDepth = Math.max(budget.maxDepth, frame.depth + 1)
  if (reference.kind === "unsupported") {
    frame.node.references.push(omittedReference(reference.name, "unsupported"))
    return
  }
  const local = declarationFor(frame.file, reference.name, reference.expectedKind)
  const imported = frame.file.imports.get(reference.name)
  fileTargets.add(localReferenceTargetKey(frame.path, reference.name, local, imported))
  budget.maxTargetsInFile = Math.max(budget.maxTargetsInFile, fileTargets.size)
  if (ambiguousLocalReference(local, imported, reference.expectedKind)) {
    frame.node.references.push(omittedReference(reference.name, "unsupported"))
    return
  }
  if (local !== undefined) budget.work += 1
  // Bend owns effective local-work, depth and per-file target ceilings.
  if (!permitLocalGraphFacts(budget.limits, budget.work, budget.maxDepth, fileTargets.size, budget.graphWork)) {
    frame.node.references.push(omittedReference(reference.name, "reference-limit"))
    return
  }
  if (local !== undefined) expandLocalReference(frame, reference, local)
  else queueImportedReference(frame, reference, imported)
}
/** Materialize bounded supporting evidence without turning imports into edited roots. */
const buildLocal = (
  file: FactFile,
  path: string,
  name: string,
  visited: Set<string>,
  budget: LocalBudget,
  depth: number,
  expectedKind: "type" | "function" | undefined = undefined
): Built | undefined => {
  const declaration = declarationFor(file, name, expectedKind)
  if (declaration === undefined) return undefined
  const node: MutableNode = { artifact: declaration.artifact, references: [] }
  const pending: Pending[] = []
  const fileTargets = budget.targetsByPath.get(path) ?? new Set<string>()
  budget.targetsByPath.set(path, fileTargets)
  const frame: LocalFrame = { file, path, visited, budget, depth, node, pending, fileTargets }
  for (const reference of declaration.references) materializeLocalReference(frame, reference)
  return { node, pending }
}

export type GraphResolveContext = LanguageGraphHost

type GraphBinding = PreparedGraph & {
  readonly context: GraphResolveContext
  readonly branch: "type" | "function"
  readonly expired: () => boolean
}
type GraphTarget = { readonly path: string; readonly name: string; readonly edge: Pending }
type GraphFrame = GraphBinding & {
  readonly unit: ReviewUnit
  readonly budget: LocalBudget
  readonly visited: Set<string>
  readonly pending: Map<number, Pending>
  readonly pathForTarget: Map<number, GraphTarget>
  readonly targetIds: Map<string, number>
  readonly artifactsByTarget: Map<number, string>
  readonly captured: Map<string, { readonly file: FactFile; readonly sourceBytes: number }>
  nextId: number
  nextTargetId: number
  state: unknown
  command: ImportGraphCommand
}
type GraphIteration = { readonly done: false } | { readonly done: true; readonly unit: ReviewUnit | undefined }
type GraphCommandResult = "next" | "continue" | "invalid"
const graphClock = (context: GraphResolveContext) => {
  const limits = context.limits ?? GRAPH_LIMIT_CEILINGS
  const now = context.now ?? (() => performance.now())
  const started = now()
  return { limits, expired: () => now() - started >= GRAPH_ANALYSIS_DEADLINE_MS }
}
const rootGraphBudgetAvailable = (limits: GraphLimits, rootCapture: StableCapture, expired: () => boolean): boolean =>
  !(limits.files < 1 || limits.work < 1 || limits.readBytes < rootCapture.byteLength || expired())
const prepareGraphBinding = Effect.fn("DirectEvent.prepareGraphBinding")(function* (
  rootPath: string,
  rootCapture: StableCapture,
  context: GraphResolveContext
) {
  const clock = graphClock(context)
  const language = languageForPath(rootPath)
  if (language === undefined) return undefined
  const binding = yield* language.prepareGraph(rootPath, rootCapture, context, clock.limits, clock.expired)
  if (binding === undefined) return undefined
  if (!rootGraphBudgetAvailable(binding.limits, rootCapture, clock.expired)) return undefined
  return { ...binding, context, branch: context.branch ?? "type", expired: clock.expired } satisfies GraphBinding
})
const rootExpectedKind = (context: GraphResolveContext): "function" | undefined =>
  context.branch === "function" ? "function" : undefined
const rootReviewUnit = (built: Built, dependencies: readonly string[]): ReviewUnit => ({
  root: built.node,
  ...(dependencies.length === 0 ? {} : { sourceDependencies: dependencies })
})
const addGraphEdges = (frame: GraphFrame, edges: readonly Pending[]): number[] =>
  edges.map((edge) => {
    const id = frame.nextId++
    frame.pending.set(id, edge)
    return id
  })
const advanceGraph = (frame: GraphFrame, event: ImportGraphEvent): void => {
  const transition = stepImportGraph(frame.state, event)
  frame.state = transition.state
  frame.command = transition.command
}
const prepareGraphFrame = Effect.fn("DirectEvent.prepareGraphFrame")(function* (
  rootPath: string,
  rootCapture: StableCapture,
  name: string,
  context: GraphResolveContext
) {
  const binding = yield* prepareGraphBinding(rootPath, rootCapture, context)
  if (binding === undefined) return undefined
  const rootFile = binding.session.inspect(rootPath, rootCapture.text, binding.branch)
  if (rootFile === undefined) return undefined
  const rootDeclaration = declarationFor(rootFile, name, rootExpectedKind(context))
  if (rootDeclaration === undefined) return undefined
  const visited = new Set([rootDeclaration.artifact.id])
  const budget: LocalBudget = {
    limits: binding.limits,
    targetsByPath: new Map(),
    maxTargetsInFile: 0,
    work: 0,
    graphWork: 0,
    maxDepth: 0
  }
  const built = buildLocal(rootFile, rootPath, name, visited, budget, 0)
  if (
    built === undefined ||
    !permitLocalGraphFacts(binding.limits, budget.work, budget.maxDepth, budget.maxTargetsInFile, 0)
  )
    return undefined
  const unit = rootReviewUnit(built, binding.dependencies)
  const frame: GraphFrame = {
    ...binding,
    unit,
    visited,
    budget,
    nextId: 1,
    nextTargetId: 2,
    pending: new Map(),
    pathForTarget: new Map(),
    targetIds: new Map([[`${rootPath}\0${binding.branch}\0${name}`, 1]]),
    artifactsByTarget: new Map([[1, rootDeclaration.artifact.id]]),
    captured: new Map([[rootPath, { file: rootFile, sourceBytes: rootCapture.byteLength }]]),
    state: initialImportGraph(binding.limits),
    command: { kind: "none" }
  }
  advanceGraph(frame, {
    kind: "root",
    target: 1,
    sourceBytes: rootCapture.byteLength,
    treeBytes: bytes(unit),
    localWork: budget.work,
    edges: addGraphEdges(frame, built.pending)
  })
  return frame
})
const hasOmissions = (node: ReviewNode): boolean =>
  node.references.some(
    (reference) => reference.kind === "omitted" || (reference.kind === "expanded" && hasOmissions(reference.node))
  )
const completedGraphUnit = (frame: GraphFrame): ReviewUnit | undefined =>
  bytes(frame.unit) <= frame.limits.treeBytes ? frame.unit : undefined
const partialGraphUnit = (frame: GraphFrame, reason: string): ReviewUnit | undefined =>
  reason !== "Deadline" &&
  reason !== "ProtocolViolation" &&
  projectImportGraph(frame.state).files > 0 &&
  hasOmissions(frame.unit.root) &&
  bytes(frame.unit) <= frame.limits.treeBytes
    ? frame.unit
    : undefined
const graphCommandCompletion = (frame: GraphFrame): GraphIteration => {
  if (frame.command.kind === "unitComplete") return { done: true, unit: completedGraphUnit(frame) }
  if (frame.command.kind === "unitIncomplete")
    return { done: true, unit: partialGraphUnit(frame, frame.command.reason) }
  return { done: false }
}
const graphPhaseCompletion = (frame: GraphFrame): GraphIteration => {
  const projection = projectImportGraph(frame.state)
  if (projection.phase === "complete") return { done: true, unit: completedGraphUnit(frame) }
  if (projection.phase === "incomplete")
    return { done: true, unit: partialGraphUnit(frame, projection.reason ?? "ProtocolViolation") }
  return { done: false }
}
const outsideImportPath = (path: string): boolean => path === ".." || path.startsWith(`..${sep}`) || isAbsolute(path)
const existingImportChoices = Effect.fn("DirectEvent.existingImportChoices")(function* (
  frame: GraphFrame,
  choices: readonly string[]
) {
  const existing: string[] = []
  for (const choice of choices) {
    if (outsideImportPath(choice)) continue
    const status = yield* Effect.promise(() => lstat(join(frame.context.root, choice)).catch(() => undefined))
    if (status?.isFile()) existing.push(choice)
  }
  return existing
})
const supportedExport = (
  declaration: FactDeclaration | undefined,
  expectedKind: "type" | "function" | undefined
): declaration is FactDeclaration =>
  declaration !== undefined && declaration.exported && correctKind(declaration.artifact, expectedKind)
const includeKnownTarget = (frame: GraphFrame, targetId: number, edge: Pending): void => {
  if (frame.command.kind !== "none") return
  const artifactId = frame.artifactsByTarget.get(targetId)
  if (artifactId !== undefined)
    edge.owner.references[edge.index] = { kind: "included", site: { symbol: edge.symbol }, target: artifactId }
}
const graphTargetKey = (path: string, edge: Pending): string => `${path}\0${edge.expectedKind ?? "type"}\0${edge.name}`
const graphTargetId = (frame: GraphFrame, key: string): number => frame.targetIds.get(key) ?? frame.nextTargetId++
const resolveKnownTarget = (frame: GraphFrame, selectedPath: string, edge: Pending): void => {
  const targetFile = frame.captured.get(selectedPath)?.file
  const key = graphTargetKey(selectedPath, edge)
  const targetId = graphTargetId(frame, key)
  frame.targetIds.set(key, targetId)
  const declaration = targetFile === undefined ? undefined : declarationFor(targetFile, edge.name, edge.expectedKind)
  if (targetFile !== undefined && !supportedExport(declaration, edge.expectedKind)) {
    advanceGraph(frame, { kind: "resolved", target: targetId, result: "missing" })
    return
  }
  // Only Bend can authorize a new supporting source read through CheckPath.
  advanceGraph(frame, { kind: "resolved", target: targetId, result: "found" })
  includeKnownTarget(frame, targetId, edge)
  frame.pathForTarget.set(targetId, { path: selectedPath, name: edge.name, edge })
}
const missingImportResult = (count: number): "missing" | "ambiguous" => (count === 0 ? "missing" : "ambiguous")
const resolveGraphEdge = Effect.fn("DirectEvent.resolveGraphEdge")(function* (
  frame: GraphFrame,
  edgeId: number
): Effect.fn.Return<GraphCommandResult> {
  const edge = frame.pending.get(edgeId)
  if (edge === undefined) return "invalid"
  const base = normalize(join(dirname(edge.from), edge.importPath))
  if (outsideImportPath(base)) {
    advanceGraph(frame, { kind: "resolved", target: frame.nextTargetId++, result: "unsupported" })
    return "continue"
  }
  const choices = frame.session.importCandidates(edge.from, edge.importPath)
  if (choices.length === 0) {
    advanceGraph(frame, { kind: "resolved", target: frame.nextTargetId++, result: "unsupported" })
    return "continue"
  }
  const existing = yield* existingImportChoices(frame, choices)
  if (existing.length !== 1) {
    advanceGraph(frame, {
      kind: "resolved",
      target: frame.nextTargetId++,
      result: missingImportResult(existing.length)
    })
    return "next"
  }
  const selectedPath = existing[0]
  if (selectedPath === undefined) return "invalid"
  resolveKnownTarget(frame, selectedPath, edge)
  return "next"
})
const checkGraphPath = Effect.fn("DirectEvent.checkGraphPath")(function* (
  frame: GraphFrame,
  targetId: number
): Effect.fn.Return<GraphCommandResult> {
  const target = frame.pathForTarget.get(targetId)
  if (target === undefined) return "invalid"
  const selected = yield* eligibleNamedPath(
    frame.context.root,
    target.path,
    contextDirectFilePolicy(frame.context.policy),
    frame.context.rootIdentity
  )
  advanceGraph(frame, { kind: "pathChecked", allowed: selected !== undefined })
  return "next"
})
const captureBudgetAvailable = (context: GraphResolveContext, path: string): boolean =>
  context.captureCache === undefined || mayCaptureForObservation(context.captureCache, path)
const captureGraphSource = Effect.fn("DirectEvent.captureGraphSource")(function* (
  frame: GraphFrame,
  selected: NonNullable<Effect.Success<ReturnType<typeof eligibleNamedPath>>>
) {
  let source = frame.context.captureCache?.get(selected.relativePath)
  if (source === undefined) {
    source = yield* (frame.context.captureSource ?? captureStable)(
      frame.context.root,
      selected,
      frame.context.captureHooks,
      frame.context.rootIdentity,
      frame.limits.sourceBytes
    )
    if (source !== undefined) frame.context.captureCache?.set(selected.relativePath, source)
  }
  return source
})
const sourceFileDeclaration = (file: FactFile | undefined, target: GraphTarget): FactDeclaration | undefined => {
  if (file === undefined) return undefined
  const declaration = declarationFor(file, target.name, target.edge.expectedKind)
  return supportedExport(declaration, target.edge.expectedKind) ? declaration : undefined
}
const capturedChildAllowed = (frame: GraphFrame, child: Built | undefined): child is Built =>
  child !== undefined &&
  permitLocalGraphFacts(
    frame.limits,
    frame.budget.work,
    frame.budget.maxDepth,
    frame.budget.maxTargetsInFile,
    frame.budget.graphWork
  )
const attachCapturedChild = (
  frame: GraphFrame,
  targetId: number,
  target: GraphTarget,
  path: string,
  source: StableCapture,
  file: FactFile,
  declaration: FactDeclaration,
  child: Built,
  localWorkBefore: number
): void => {
  const previous = bytes(frame.unit)
  target.edge.owner.references[target.edge.index] = {
    kind: "expanded",
    site: { symbol: target.edge.symbol },
    node: child.node
  }
  const contribution = bytes(frame.unit) - previous
  advanceGraph(frame, {
    kind: "captured",
    sourceBytes: source.byteLength,
    treeBytes: Math.max(0, contribution),
    localWork: frame.budget.work - localWorkBefore,
    edges: addGraphEdges(frame, child.pending)
  })
  if (frame.command.kind === "skipImport") {
    target.edge.owner.references[target.edge.index] = omittedReference(
      target.edge.symbol,
      "reference-limit",
      target.edge.name
    )
  } else {
    frame.captured.set(path, { file, sourceBytes: source.byteLength })
    frame.artifactsByTarget.set(targetId, declaration.artifact.id)
  }
}
const inspectCapturedSource = (
  frame: GraphFrame,
  targetId: number,
  target: GraphTarget,
  path: string,
  source: StableCapture
): void => {
  const localWorkBefore = frame.budget.work
  frame.budget.graphWork = projectImportGraph(frame.state).work - frame.budget.work
  const file = frame.session.inspect(path, source.text, frame.branch)
  const declaration = sourceFileDeclaration(file, target)
  if (file === undefined || declaration === undefined) {
    advanceGraph(frame, { kind: "captureFailed" })
    return
  }
  const child = buildLocal(
    file,
    path,
    target.name,
    frame.visited,
    frame.budget,
    target.edge.depth + 1,
    target.edge.expectedKind
  )
  if (!permitLocalGraphFacts(frame.limits, frame.budget.work, 0, 0, frame.budget.graphWork)) {
    advanceGraph(frame, {
      kind: "captured",
      sourceBytes: source.byteLength,
      treeBytes: 0,
      localWork: frame.budget.work - localWorkBefore,
      edges: []
    })
    return
  }
  if (!capturedChildAllowed(frame, child)) {
    advanceGraph(frame, { kind: "captureFailed" })
    return
  }
  attachCapturedChild(frame, targetId, target, path, source, file, declaration, child, localWorkBefore)
}
const readGraphSource = Effect.fn("DirectEvent.readGraphSource")(function* (
  frame: GraphFrame,
  targetId: number
): Effect.fn.Return<GraphCommandResult> {
  const target = frame.pathForTarget.get(targetId)
  if (target === undefined) return "invalid"
  const selected = yield* eligibleNamedPath(
    frame.context.root,
    target.path,
    contextDirectFilePolicy(frame.context.policy),
    frame.context.rootIdentity
  )
  if (selected === undefined || !captureBudgetAvailable(frame.context, selected.relativePath)) {
    advanceGraph(frame, { kind: "captureFailed" })
    return "next"
  }
  const source = yield* captureGraphSource(frame, selected)
  if (source === undefined) {
    advanceGraph(frame, { kind: "captureFailed" })
    return "next"
  }
  if (source.byteLength > frame.limits.sourceBytes) {
    // Reject measured source bytes in Bend before inspecting or retaining text.
    advanceGraph(frame, { kind: "captured", sourceBytes: source.byteLength, treeBytes: 0, edges: [] })
    return "next"
  }
  inspectCapturedSource(frame, targetId, target, selected.relativePath, source)
  return "next"
})
const executeGraphCommand = (frame: GraphFrame): Effect.Effect<GraphCommandResult> => {
  const command = frame.command
  switch (command.kind) {
    case "none":
    case "skipImport":
      advanceGraph(frame, { kind: "next" })
      return Effect.succeed("next")
    case "resolveEdge":
      return resolveGraphEdge(frame, command.edge)
    case "checkPath":
      return checkGraphPath(frame, command.target)
    case "readSource":
      return readGraphSource(frame, command.target)
    default:
      return Effect.succeed("invalid")
  }
}
const graphIteration = Effect.fn("DirectEvent.graphIteration")(function* (
  frame: GraphFrame
): Effect.fn.Return<GraphIteration> {
  if (frame.expired()) {
    advanceGraph(frame, { kind: "deadlineReached" })
    return { done: true, unit: undefined }
  }
  const completion = graphCommandCompletion(frame)
  if (completion.done) return completion
  const result = yield* executeGraphCommand(frame)
  if (result === "invalid") return { done: true, unit: undefined }
  if (result === "continue") return { done: false }
  return graphPhaseCompletion(frame)
})
/** Run one finite, source-free Bend graph per named edited root. */
export const resolveGraphUnit = Effect.fn("DirectEvent.resolveGraphUnit")(function* (
  rootPath: string,
  rootCapture: StableCapture,
  name: string,
  context: GraphResolveContext
) {
  const frame = yield* prepareGraphFrame(rootPath, rootCapture, name, context)
  if (frame === undefined) return undefined
  for (let step = 0; step < frame.limits.work * 8 + 16; step += 1) {
    const outcome = yield* graphIteration(frame)
    if (outcome.done) return outcome.unit
  }
  return undefined
})
