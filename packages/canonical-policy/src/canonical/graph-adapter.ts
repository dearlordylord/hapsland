import {
  bendImportGraphInitial,
  bendImportGraphStep,
  bendImportGraphLocalBudget
} from "@hapsland/agent-flow-bend/import-graph"
import { GRAPH_LIMIT_CEILINGS, validateGraphLimits, type GraphLimits } from "./graph-limits.ts"
import {
  decodeGraphEvent,
  decodeGraphState,
  decodeGraphStep,
  decodeGraphEdge,
  decodeGraphProfile,
  decodeNativeNatural,
  type ImportGraphEvent,
  type ImportGraphCommand,
  type ImportGraphProjection
} from "./graph-schema.ts"
import { readNat, readBendList, readRecord } from "./boundary-schema.ts"
import { freezeCanonicalData } from "./immutable.ts"

export { GRAPH_LIMIT_CEILINGS, validateGraphLimits, type GraphLimits } from "./graph-limits.ts"

export type { ImportGraphEvent, ImportGraphCommand, ImportGraphProjection } from "./graph-schema.ts"

const nat = readNat
const list = (items: readonly number[]): unknown =>
  items.reduceRight<unknown>((tail, head) => ({ $: "Con", head, tail }), { $: "Nil" })
const readList = <T>(value: unknown, decode: (value: unknown) => T): T[] => readBendList(value, decode, 128)
const emptyGraphEvents = {
  next: { $: "ImportGraph.Next" },
  captureFailed: { $: "ImportGraph.CaptureFailed" },
  deadlineReached: { $: "ImportGraph.DeadlineReached" }
} as const
const captureEventFields = (event: Extract<ImportGraphEvent, { readonly kind: "root" | "captured" }>) => ({
  source_bytes: event.sourceBytes,
  tree_bytes: event.treeBytes,
  local_work: event.localWork ?? 0,
  edges: list(event.edges)
})
const encode = (input: ImportGraphEvent): unknown => {
  const event = decodeGraphEvent(input)
  if (event.kind === "root") return { $: "ImportGraph.Root", target: event.target, ...captureEventFields(event) }
  if (event.kind === "captured") {
    const fields = captureEventFields(event)
    return {
      $: "ImportGraph.Captured",
      source_bytes: fields.source_bytes,
      node_bytes: fields.tree_bytes,
      local_work: fields.local_work,
      edges: fields.edges
    }
  }
  if (event.kind === "resolved")
    return {
      $: "ImportGraph.Resolved",
      target: event.target,
      result: {
        $: (
          {
            found: "ImportGraph.Found",
            missing: "ImportGraph.NotFound",
            ambiguous: "ImportGraph.Many",
            unsupported: "ImportGraph.Unhandled"
          } as const
        )[event.result]
      }
    }
  if (event.kind === "pathChecked") return { $: "ImportGraph.PathChecked", allowed: event.allowed }
  return emptyGraphEvents[event.kind]
}
export const encodeImportGraphEvent = (input: ImportGraphEvent): unknown => freezeCanonicalData(encode(input))
const reason = (value: { readonly $: string }): string => value.$.replace("ImportGraph.", "")
type NativeGraphCommand = ReturnType<typeof decodeGraphStep>["command"]
const emptyGraphCommands = {
  NoCommand: { kind: "none" },
  "ImportGraph.NoCommand": { kind: "none" },
  UnitComplete: { kind: "unitComplete" },
  "ImportGraph.UnitComplete": { kind: "unitComplete" }
} as const
const targetGraphCommand = (value: Extract<NativeGraphCommand, { readonly target: number }>): ImportGraphCommand => {
  if ("reason" in value) return { kind: "skipImport", target: value.target, reason: reason(value.reason) }
  const kind = value.$ === "CheckPath" || value.$ === "ImportGraph.CheckPath" ? "checkPath" : "readSource"
  return { kind, target: value.target }
}
const command = (value: NativeGraphCommand): ImportGraphCommand => {
  if ("edge" in value) return { kind: "resolveEdge", edge: value.edge }
  if ("target" in value) return targetGraphCommand(value)
  if ("reason" in value) return { kind: "unitIncomplete", reason: reason(value.reason) }
  return emptyGraphCommands[value.$]
}
const phases = {
  Idle: "idle",
  Ready: "ready",
  Resolving: "resolving",
  Checking: "checking",
  Capturing: "capturing",
  Complete: "complete",
  Incomplete: "incomplete"
} as const
const projections = new WeakMap<object, ImportGraphProjection>()
export const projectImportGraph = (state: unknown): ImportGraphProjection => {
  // Copies continue through full decoding; only registered frozen objects are memoized.
  if (typeof state === "object" && state !== null) {
    const cached = projections.get(state)
    if (cached !== undefined) return cached
  }
  const { graph: object } = decodeGraphState(state)
  const name = object.phase.$.replace(/^ImportGraph\./, "") as keyof typeof phases
  const phase = phases[name]
  const raw = object.limits
  const limits = decodeGraphProfile({
    version: raw.version,
    sourceBytes: raw.source_bytes,
    treeBytes: raw.tree_bytes,
    files: raw.files,
    readBytes: raw.read_bytes,
    outgoingEdges: raw.outgoing_edges,
    depth: raw.depth,
    work: raw.work
  })
  return freezeCanonicalData({
    limits,
    phase,
    ...("reason" in object.phase ? { reason: reason(object.phase.reason) } : {}),
    pending: readList(object.pending, (edge) => decodeGraphEdge(edge).id),
    visited: readList(object.visited, decodeNativeNatural),
    files: object.files,
    readBytes: object.read_bytes,
    treeBytes: object.tree_bytes,
    work: object.work,
    skippedTree: object.skipped_tree,
    skippedExcluded: object.skipped_excluded,
    skippedOther: object.skipped_other
  })
}
export const initialImportGraph = (limits: GraphLimits = GRAPH_LIMIT_CEILINGS): unknown => {
  const effective = validateGraphLimits(limits)
  const state = bendImportGraphInitial({
    $: "ImportGraph.Limits",
    version: nat(effective.version),
    source_bytes: nat(effective.sourceBytes),
    tree_bytes: nat(effective.treeBytes),
    files: nat(effective.files),
    read_bytes: nat(effective.readBytes),
    outgoing_edges: nat(effective.outgoingEdges),
    depth: nat(effective.depth),
    work: nat(effective.work)
  })
  const projection = projectImportGraph(state)
  const identity = freezeCanonicalData(readRecord(state))
  projections.set(identity, projection)
  return identity
}

/** Bend checks native local-reference facts against the same frozen graph profile. */
export const permitLocalGraphFacts = (
  limits: GraphLimits,
  localWork: number,
  localDepth: number,
  distinctTargets: number,
  graphWork: number
): boolean => {
  const effective = validateGraphLimits(limits)
  return bendImportGraphLocalBudget(
    {
      $: "ImportGraph.Limits",
      version: nat(effective.version),
      source_bytes: nat(effective.sourceBytes),
      tree_bytes: nat(effective.treeBytes),
      files: nat(effective.files),
      read_bytes: nat(effective.readBytes),
      outgoing_edges: nat(effective.outgoingEdges),
      depth: nat(effective.depth),
      work: nat(effective.work)
    },
    nat(localWork),
    nat(localDepth),
    nat(distinctTargets),
    nat(graphWork)
  )
}
export const stepImportGraph = (
  state: unknown,
  event: ImportGraphEvent
): { readonly state: unknown; readonly command: ImportGraphCommand } => {
  projectImportGraph(state)
  return decodeImportGraphStep(bendImportGraphStep(state, encodeImportGraphEvent(event)))
}
export const decodeImportGraphStep = (
  value: unknown
): { readonly state: unknown; readonly command: ImportGraphCommand } => {
  const raw = decodeGraphStep(value)
  const projection = projectImportGraph(raw.state)
  const identity = freezeCanonicalData(readRecord(raw.state))
  projections.set(identity, projection)
  return { state: identity, command: command(raw.command) }
}
