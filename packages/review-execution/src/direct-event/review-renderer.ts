import { createHash } from "node:crypto"
import { posix } from "node:path"
import {
  bundledArtifactDomain,
  type BundledArtifactOrigin
} from "@hapsland/source-artifacts/direct-event/artifact-model"
import { isBundledBendArtifact } from "@hapsland/source-analysis/direct-event/languages/bend/bundled-evidence"
import { canonicalValue } from "@hapsland/review-definition/direct-event/model"

export const CANDIDATE_RENDERER_VERSION = "candidate-semantic-evidence/1"
export const MAX_CANDIDATE_TREE_BYTES = 20 * 1024
const MAX_CANDIDATE_SOURCE_BYTES = 256 * 1024
const MAX_CANDIDATE_NODES = 128
const MAX_CANDIDATE_EDGES = 128
const sha256 = (value: string): string => createHash("sha256").update(value, "utf8").digest("hex")
export const CANDIDATE_RENDERER_DIGEST = sha256(
  "candidate-semantic-evidence/1:artifact(kind,name,domain,source):evidence(rootId,nodes[id,kind,name,domain,source,origin?,order],edges[from,to?,kind,symbol,reason?,order];omitted-symbol=bounded-opaque-source):inputContract(id,completeness,projectionFingerprint,rendererVersion,rendererDigest)"
)

type Kind = "interface" | "type-alias" | "struct" | "enum" | "datatype" | "function"
type Artifact = Readonly<{
  id: string
  kind: Kind
  name: string
  domain: string
  source: string
  origin?: BundledArtifactOrigin
}>
type Node = Artifact & Readonly<{ order: number }>
type Edge =
  | Readonly<{ from: string; to: string; kind: "expanded" | "included"; symbol: string; order: number }>
  | Readonly<{
      from: string
      kind: "omitted"
      symbol: string
      reason: "unresolved" | "unsupported" | "reference-limit" | "unavailable"
      order: number
    }>
export type CandidateInputFailure =
  | {
      readonly code: "review-input-invalid"
      readonly args: {
        readonly reason:
          | "root-invalid"
          | "supporting-artifact-invalid"
          | "duplicate-expanded-target"
          | "included-target-unavailable"
          | "projection-invalid"
          | "request-invalid"
      }
    }
  | {
      readonly code: "review-input-limit"
      readonly args: { readonly constraint: "tree-bytes"; readonly observedBytes: number; readonly limitBytes: number }
    }
export type ReportCandidateInputFailure = (failure: CandidateInputFailure) => void

export type CandidateReviewInput = Readonly<{
  contract: "direct-event/type-shape/v1" | "direct-event/function/v1"
  completeness: "complete" | "incomplete-irrelevant"
  treeBytesLimit: number
  artifact: Artifact
  nodes: ReadonlyArray<Node>
  edges: ReadonlyArray<Edge>
}>
export type RenderedCandidateReviewInput = Readonly<{
  artifact: Readonly<{ kind: Kind; name: string; domain: string; source: string }>
  evidence: Readonly<{ rootId: string; nodes: ReadonlyArray<Node>; edges: ReadonlyArray<Edge> }>
  inputContract: Readonly<{
    id: CandidateReviewInput["contract"]
    completeness: CandidateReviewInput["completeness"]
    projectionFingerprint: string
    rendererVersion: typeof CANDIDATE_RENDERER_VERSION
    rendererDigest: string
  }>
}>

const record = (value: unknown): Record<string, unknown> | undefined =>
  typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined
const exactKeys = (value: Record<string, unknown>, keys: ReadonlyArray<string>): boolean =>
  Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key))
const relativeDomainSyntax = (value: string): boolean =>
  !value.includes("\\") &&
  !value.includes("\0") &&
  !value.startsWith("/") &&
  !/^[A-Za-z]:/.test(value) &&
  value.split("/").every((part) => part !== "" && part !== "." && part !== "..") &&
  posix.normalize(value) === value
const relativeDomain = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0 && value.length <= 4096 && relativeDomainSyntax(value)
const identifier = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0 && value.length <= 256 && !value.includes("\0")
const declarationName = (value: unknown): value is string =>
  typeof value === "string" && value.length <= 256 && /^[\p{ID_Start}_$][\p{ID_Continue}$\u200C\u200D]*$/u.test(value)
// Qualified reference sites are distinct from declaration names. Keep the
// original alias/path spelling while binding the edge to its canonical target.
const referenceName = (value: unknown): value is string =>
  typeof value === "string" && value.length <= 256 && value.split(/::|\./u).every(declarationName)
const kind = (value: unknown): value is Kind =>
  value === "interface" ||
  value === "type-alias" ||
  value === "struct" ||
  value === "enum" ||
  value === "datatype" ||
  value === "function"
const source = (value: unknown): value is string =>
  typeof value === "string" && Buffer.byteLength(value, "utf8") <= MAX_CANDIDATE_SOURCE_BYTES
const bundledWireArtifactValid = (item: Record<string, unknown>): boolean => {
  const origin = record(item.origin)
  if (
    origin === undefined ||
    !exactKeys(origin, ["kind", "library", "compilerVersion", "compilerSource", "moduleHash", "declarationHash"])
  )
    return false
  const typed = origin as BundledArtifactOrigin
  return (
    isBundledBendArtifact({
      id: item.id as string,
      kind: item.kind as "datatype",
      name: item.name as string,
      source: item.source as string,
      sourceHash: typeof item.source === "string" ? sha256(item.source) : "",
      origin: typed
    }) && item.domain === bundledArtifactDomain(typed)
  )
}
const artifactIdentityValid = (item: Record<string, unknown>): boolean =>
  identifier(item.id) &&
  kind(item.kind) &&
  declarationName(item.name) &&
  (item.origin === undefined ? relativeDomain(item.domain) : bundledWireArtifactValid(item)) &&
  source(item.source) &&
  item.id === `${item.domain}:${item.kind}:${item.name}`
const validOrder = (value: unknown): boolean => Number.isSafeInteger(value) && Number(value) >= 0

const artifact = (value: unknown, ordered: boolean): Artifact | Node | undefined => {
  const item = record(value)
  if (
    item === undefined ||
    !exactKeys(
      item,
      ordered
        ? ["id", "kind", "name", "domain", "source", "order", ...(item.origin === undefined ? [] : ["origin"])]
        : ["id", "kind", "name", "domain", "source"]
    ) ||
    !artifactIdentityValid(item) ||
    (ordered && !validOrder(item.order))
  )
    return undefined
  return item as Artifact | Node
}
// Omitted references preserve bounded opaque syntax without claiming a resolved binding.
const omittedReference = (value: unknown): value is string => source(value) && value.length > 0 && !value.includes("\0")
const edgeSymbolValid = (item: Record<string, unknown>): boolean =>
  item.kind === "omitted" ? omittedReference(item.symbol) : referenceName(item.symbol)
const edgeShapeValid = (item: Record<string, unknown>): boolean => {
  if (item.kind === "omitted")
    return (
      exactKeys(item, ["from", "kind", "symbol", "reason", "order"]) &&
      ["unresolved", "unsupported", "reference-limit", "unavailable"].includes(String(item.reason))
    )
  return (
    exactKeys(item, ["from", "to", "kind", "symbol", "order"]) &&
    identifier(item.to) &&
    (item.kind === "expanded" || item.kind === "included")
  )
}
const edge = (value: unknown): Edge | undefined => {
  const item = record(value)
  if (
    item === undefined ||
    !identifier(item.from) ||
    !edgeSymbolValid(item) ||
    !validOrder(item.order) ||
    !edgeShapeValid(item)
  )
    return undefined
  return item as Edge
}

const candidateNode = (value: unknown): Node | undefined => {
  const parsed = artifact(value, true)
  if (parsed === undefined || !("order" in parsed) || typeof parsed.order !== "number") return undefined
  return parsed
}

const decodedElements = <A>(
  values: ReadonlyArray<unknown>,
  decode: (value: unknown) => A | undefined
): A[] | undefined => {
  const result: A[] = []
  for (const value of values) {
    const decoded = decode(value)
    if (decoded === undefined) return undefined
    result.push(decoded)
  }
  return result
}

const candidateContract = (value: unknown): value is CandidateReviewInput["contract"] =>
  value === "direct-event/type-shape/v1" || value === "direct-event/function/v1"
const candidateCompleteness = (value: unknown): value is CandidateReviewInput["completeness"] =>
  value === "complete" || value === "incomplete-irrelevant"
const validTreeLimit = (value: unknown): value is number =>
  Number.isSafeInteger(value) && Number(value) >= 1 && Number(value) <= MAX_CANDIDATE_TREE_BYTES
const boundedArray = (value: unknown, maximum: number): value is unknown[] =>
  Array.isArray(value) && value.length <= maximum
type CandidateHeader = Record<string, unknown> & {
  contract: CandidateReviewInput["contract"]
  completeness: CandidateReviewInput["completeness"]
  treeBytesLimit: number
  nodes: unknown[]
  edges: unknown[]
}
const candidateHeader = (input: Record<string, unknown>): input is CandidateHeader =>
  exactKeys(input, ["contract", "completeness", "treeBytesLimit", "artifact", "nodes", "edges"]) &&
  candidateContract(input.contract) &&
  candidateCompleteness(input.completeness) &&
  validTreeLimit(input.treeBytesLimit) &&
  boundedArray(input.nodes, MAX_CANDIDATE_NODES) &&
  boundedArray(input.edges, MAX_CANDIDATE_EDGES)

const candidateIdentities = (root: Artifact, nodes: ReadonlyArray<Node>): Set<string> | undefined => {
  const ids = new Set([root.id])
  for (const node of nodes) {
    if (ids.has(node.id) || node.source.length === 0) return undefined
    ids.add(node.id)
  }
  return ids
}
const validProjectionEvidence = (
  root: Artifact,
  edges: ReadonlyArray<Edge>,
  ids: ReadonlySet<string>,
  completeness: CandidateReviewInput["completeness"]
): boolean => {
  const hasOmissions = edges.some((item) => item.kind === "omitted")
  return !(
    (completeness === "complete") === hasOmissions ||
    root.source.length === 0 ||
    edges.some((item) => !ids.has(item.from) || (item.kind !== "omitted" && !ids.has(item.to)))
  )
}
const rootedProjection = (root: Artifact, edges: ReadonlyArray<Edge>, ids: ReadonlySet<string>): boolean => {
  // An included edge cannot introduce an unrelated node or its source.
  const reached = new Set([root.id])
  for (const item of edges) {
    if (!reached.has(item.from)) return false
    if (item.kind === "omitted") continue
    if (item.kind === "expanded") {
      if (reached.has(item.to)) return false
      reached.add(item.to)
    } else if (!reached.has(item.to)) return false
  }
  return reached.size === ids.size
}
const artifactMatchesContract = (root: Artifact, contract: CandidateReviewInput["contract"]): boolean =>
  contract === "direct-event/function/v1" ? root.kind === "function" : root.kind !== "function"

const freeze = <A>(value: A): A => {
  if (typeof value === "object" && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value)
    for (const child of Object.values(value)) freeze(child)
  }
  return value
}

const decodeCandidateProjection = (input: CandidateHeader) => {
  const root = artifact(input.artifact, false)
  if (root === undefined) return undefined
  if (!artifactMatchesContract(root, input.contract)) return undefined
  const nodes = decodedElements(input.nodes, candidateNode)
  const edges = decodedElements(input.edges, edge)
  if (nodes === undefined || edges === undefined) return undefined
  if (input.contract === "direct-event/type-shape/v1" && nodes.some((item) => item?.kind === "function"))
    return undefined
  return { root, nodes, edges }
}

const orderCandidateProjection = (
  root: Artifact,
  nodes: Node[],
  edges: Edge[],
  completeness: CandidateReviewInput["completeness"]
) => {
  const orderedNodes = nodes.sort(
    (a, b) =>
      a.order - b.order ||
      a.domain.localeCompare(b.domain) ||
      a.kind.localeCompare(b.kind) ||
      a.name.localeCompare(b.name) ||
      a.id.localeCompare(b.id)
  )
  const orderedEdges = edges.sort(
    (a, b) =>
      a.order - b.order ||
      a.from.localeCompare(b.from) ||
      ("to" in a ? a.to : "").localeCompare("to" in b ? b.to : "") ||
      a.symbol.localeCompare(b.symbol)
  )
  const ids = candidateIdentities(root, orderedNodes)
  if (
    ids === undefined ||
    !validProjectionEvidence(root, orderedEdges, ids, completeness) ||
    !rootedProjection(root, orderedEdges, ids)
  )
    return undefined
  return { orderedNodes, orderedEdges }
}

/** Candidate wire proposal only; the accepted adoption gate must freeze its exact shape before egress. */
export const renderCandidateReviewInput = (
  value: unknown,
  report?: ReportCandidateInputFailure
): RenderedCandidateReviewInput | undefined => {
  const invalid = () => {
    report?.({ code: "review-input-invalid", args: { reason: "projection-invalid" } })
    return undefined
  }
  const input = record(value)
  if (input === undefined || !candidateHeader(input)) return invalid()
  const projection = decodeCandidateProjection(input)
  if (projection === undefined) return invalid()
  const { root, nodes, edges } = projection
  const ordered = orderCandidateProjection(root, nodes, edges, input.completeness)
  if (ordered === undefined) return invalid()
  const { orderedNodes, orderedEdges } = ordered
  const tree = {
    artifact: { kind: root.kind, name: root.name, domain: root.domain, source: root.source },
    evidence: { rootId: root.id, nodes: orderedNodes, edges: orderedEdges }
  }
  const encodedTree = canonicalValue(tree)
  const rendered: RenderedCandidateReviewInput = {
    ...tree,
    inputContract: {
      id: input.contract,
      completeness: input.completeness,
      projectionFingerprint: sha256(encodedTree),
      rendererVersion: CANDIDATE_RENDERER_VERSION,
      rendererDigest: CANDIDATE_RENDERER_DIGEST
    }
  }
  const observedBytes = Buffer.byteLength(canonicalValue(rendered), "utf8")
  if (observedBytes > Number(input.treeBytesLimit)) {
    report?.({
      code: "review-input-limit",
      args: { constraint: "tree-bytes", observedBytes, limitBytes: Number(input.treeBytesLimit) }
    })
    return undefined
  }
  return freeze(rendered)
}
