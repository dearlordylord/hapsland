import type {
  TypeExtractionFailure,
  AnalyzerMaterializationPreflight,
  GraphDeclaration,
  GraphFile
} from "./languages/contracts.ts"
import type {
  ArtifactReference,
  ReviewArtifact,
  ReviewNode,
  ReviewUnit,
  TypeDeclaration
} from "@hapsland/source-artifacts/direct-event/artifact-model"
import { languageForPath } from "./languages/registry.ts"
export type { GraphDeclaration, GraphFile }
type ParsedDeclaration = GraphDeclaration
export type UnitAnalysis =
  | { readonly status: "ready"; readonly unit: ReviewUnit }
  | {
      readonly status: "unsupported"
      readonly root: ReviewArtifact
      readonly unit: ReviewUnit
      readonly reason: "missing-evidence" | "unsupported-reference" | "reference-limit"
    }

export type TypeFileAnalysis =
  | TypeExtractionFailure
  | { readonly status: "analyzed"; readonly units: ReadonlyArray<UnitAnalysis> }
export { MAX_TYPE_DECLARATIONS } from "./languages/contracts.ts"
/** The root is deliberately excluded from this count. */
export const MAX_REFERENCED_NAMES = 16

const parsedDeclarations = (
  path: string,
  source: string,
  allowImports = false
): TypeExtractionFailure | ReadonlyArray<ParsedDeclaration> =>
  languageForPath(path)?.parseTypes(path, source, allowImports) ?? {
    status: "unsupported",
    reason: "extension",
    units: []
  }
export const inspectGraphFile = (path: string, source: string): GraphFile | undefined =>
  languageForPath(path)?.inspect(path, source)
type LocalGraphTraversal = {
  readonly rootName: string
  readonly expanded: Set<string>
  readonly referencedNames: Set<string>
  readonly declarations: ReadonlyMap<string, ParsedDeclaration>
}
type UnitTraversal = LocalGraphTraversal & {
  reason: Extract<UnitAnalysis, { status: "unsupported" }>["reason"] | undefined
}
const localTraversal = (
  root: ParsedDeclaration,
  declarations: ReadonlyMap<string, ParsedDeclaration>
): LocalGraphTraversal => ({
  rootName: root.artifact.name,
  expanded: new Set([root.artifact.id]),
  referencedNames: new Set(),
  declarations
})
const namedTarget = (state: LocalGraphTraversal, name: string): ParsedDeclaration | undefined => {
  if (name !== state.rootName) state.referencedNames.add(name)
  return state.declarations.get(name)
}
const referenceTarget = (
  name: string,
  target: ParsedDeclaration | undefined
): Extract<ArtifactReference, { kind: "omitted" }>["target"] =>
  target === undefined ? { kind: "unresolved", symbol: name } : { kind: "known", artifactId: target.artifact.id }
const visitNamedReference = (state: UnitTraversal, name: string): ArtifactReference => {
  const target = namedTarget(state, name)
  const site = { symbol: name }
  if (state.referencedNames.size > MAX_REFERENCED_NAMES) {
    state.reason ??= "reference-limit"
    return { kind: "omitted", site, target: referenceTarget(name, target), reason: "reference-limit" }
  }
  if (target === undefined) {
    state.reason ??= "missing-evidence"
    return { kind: "omitted", site, target: { kind: "unresolved", symbol: name }, reason: "unresolved" }
  }
  if (state.expanded.has(target.artifact.id)) return { kind: "included", site, target: target.artifact.id }
  state.expanded.add(target.artifact.id)
  return { kind: "expanded", site, node: visitUnitDeclaration(state, target) }
}
const visitUnitReference = (
  state: UnitTraversal,
  reference: ParsedDeclaration["references"][number]
): ArtifactReference => {
  if (reference.kind !== "unsupported") return visitNamedReference(state, reference.name)
  state.reason ??= "unsupported-reference"
  return {
    kind: "omitted",
    site: { symbol: reference.name },
    target: { kind: "unresolved", symbol: reference.name },
    reason: "unsupported"
  }
}
const visitUnitDeclaration = (state: UnitTraversal, declaration: ParsedDeclaration): ReviewNode => ({
  artifact: declaration.artifact,
  references: declaration.references.map((reference) => visitUnitReference(state, reference))
})
const unitFor = (root: ParsedDeclaration, declarations: ReadonlyMap<string, ParsedDeclaration>): UnitAnalysis => {
  const state: UnitTraversal = { ...localTraversal(root, declarations), reason: undefined }
  const unit = { root: visitUnitDeclaration(state, root) } satisfies ReviewUnit
  return state.reason === undefined
    ? { status: "ready", unit }
    : { status: "unsupported", root: root.artifact, unit, reason: state.reason }
}

export const analyzeTypeFile = (path: string, source: string): TypeFileAnalysis => {
  const parsed = parsedDeclarations(path, source)
  if ("status" in parsed) return parsed
  const byName = new Map(parsed.map((declaration) => [declaration.artifact.name, declaration]))
  return { status: "analyzed", units: parsed.map((declaration) => unitFor(declaration, byName)) }
}

/** Bounded preflight count used before recursive ReviewUnit materialization. */
export type { AnalyzerMaterializationPreflight } from "./languages/contracts.ts"
const encodedBytes = (value: unknown): number => Buffer.byteLength(JSON.stringify(value), "utf8")

/**
 * Conservative logical bound computed without constructing recursive units.
 * Exact artifact/id/site payload bytes are charged with ample per-node/edge
 * structural allowance, following the same expansion and reference ceilings
 * as unitFor.
 */
const preflightTarget = (
  state: LocalGraphTraversal,
  reference: ParsedDeclaration["references"][number]
): ParsedDeclaration | undefined => (reference.kind === "named" ? namedTarget(state, reference.name) : undefined)
const canExpandPreflightTarget = (
  state: LocalGraphTraversal,
  target: ParsedDeclaration | undefined
): target is ParsedDeclaration => {
  if (target === undefined) return false
  return state.referencedNames.size <= MAX_REFERENCED_NAMES && !state.expanded.has(target.artifact.id)
}
const targetEncodedBytes = (target: ParsedDeclaration | undefined): number =>
  target === undefined ? 0 : encodedBytes(target.artifact.id)
const preflightDeclarationBytes = (state: LocalGraphTraversal, declaration: ParsedDeclaration): number => {
  let bytes = encodedBytes(declaration.artifact) + 512
  for (const reference of declaration.references) {
    const target = preflightTarget(state, reference)
    // Covers tagged edge keys, site/symbol, omitted target/reason, and an
    // included target ID at its exact escaped byte length.
    bytes += 512 + 2 * encodedBytes(reference.name) + targetEncodedBytes(target)
    if (canExpandPreflightTarget(state, target)) {
      state.expanded.add(target.artifact.id)
      bytes += preflightDeclarationBytes(state, target)
    }
  }
  return bytes
}
export const analyzerMaterializationPreflight = (
  path: string,
  source: string,
  allowImports = false
): AnalyzerMaterializationPreflight | undefined => {
  const parsed = parsedDeclarations(path, source, allowImports)
  if ("status" in parsed) return undefined
  const byName = new Map(parsed.map((declaration) => [declaration.artifact.name, declaration]))
  let expandedUnitBytes = 0
  for (const root of parsed) {
    expandedUnitBytes += preflightDeclarationBytes(localTraversal(root, byName), root)
  }
  return {
    declarations: parsed.length,
    expandedUnitBytes,
    ...(allowImports ? { hasImports: languageForPath(path)?.hasImports(source) ?? false } : {})
  }
}

export const combinedAnalyzerMaterializationPreflight = (
  path: string,
  source: string
): AnalyzerMaterializationPreflight | undefined =>
  languageForPath(path)?.combinedPreflight(path, source, analyzerMaterializationPreflight(path, source, true))
export const typeDeclarationCount = (path: string, source: string): number | undefined =>
  analyzerMaterializationPreflight(path, source)?.declarations

export const readyTypeUnits = (path: string, source: string): ReadonlyArray<ReviewUnit> => {
  const analysis = analyzeTypeFile(path, source)
  return analysis.status === "analyzed"
    ? analysis.units.flatMap((outcome) => (outcome.status === "ready" ? [outcome.unit] : []))
    : []
}

/** Compatibility helper for the original Add-only surface. */
export const analyzeSingleType = (path: string, source: string): TypeDeclaration | undefined => {
  const units = readyTypeUnits(path, source)
  const artifact = units.length === 1 ? units[0]?.root.artifact : undefined
  return artifact?.kind === "function" ? undefined : artifact
}

/** Revalidation returns the named root only when its complete evidence remains available. */
export const analyzeNamedUnit = (path: string, source: string, name: string): ReviewUnit | undefined =>
  readyTypeUnits(path, source).find(({ root }) => root.artifact.name === name)

export const analyzeNamedType = (path: string, source: string, name: string): TypeDeclaration | undefined => {
  const artifact = analyzeNamedUnit(path, source, name)?.root.artifact
  return artifact?.kind === "function" ? undefined : artifact
}
