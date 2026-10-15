import type {
  TypeExtractionFailure,
  AnalyzerMaterializationPreflight,
  GraphDeclaration,
  GraphFile
} from "./languages/contracts.ts"
import type { ReviewUnit, TypeDeclaration } from "@hapsland/source-artifacts/direct-event/artifact-model"
import { languageForPath } from "./languages/registry.ts"
import { combinedPreflightPolicy } from "./combined-preflight/native.ts"
import {
  analyzeDeclarations,
  declarationOutcomes,
  preflightDeclarations,
  type UnitAnalysis,
  type UnitOutcome
} from "./local-analysis/native.ts"
export type { GraphDeclaration, GraphFile, UnitAnalysis, UnitOutcome }
export type TypeFileAnalysis =
  | TypeExtractionFailure
  | { readonly status: "analyzed"; readonly units: ReadonlyArray<UnitAnalysis> }
export type TypeFileOutcomes =
  | TypeExtractionFailure
  | { readonly status: "analyzed"; readonly units: ReadonlyArray<UnitOutcome> }
export { MAX_TYPE_DECLARATIONS } from "./languages/contracts.ts"
/** The root is deliberately excluded from this count. */
export const MAX_REFERENCED_NAMES = 16

const parsedDeclarations = (
  path: string,
  source: string,
  allowImports = false
): TypeExtractionFailure | ReadonlyArray<GraphDeclaration> =>
  languageForPath(path)?.parseTypes(path, source, allowImports) ?? {
    status: "unsupported",
    reason: "extension",
    units: []
  }
export const inspectGraphFile = (path: string, source: string): GraphFile | undefined =>
  languageForPath(path)?.inspect(path, source)
export const analyzeTypeFile = (path: string, source: string, allowImports = false): TypeFileAnalysis => {
  const parsed = parsedDeclarations(path, source, allowImports)
  if ("status" in parsed) return parsed
  return {
    status: "analyzed",
    units: analyzeDeclarations(parsed, languageForPath(path)?.supportingTypes?.(path, source) ?? new Map())
  }
}

/** Source consumes decisions without constructing discarded ReviewUnit trees. */
export const analyzeTypeOutcomes = (path: string, source: string, allowImports = false): TypeFileOutcomes => {
  const parsed = parsedDeclarations(path, source, allowImports)
  if ("status" in parsed) return parsed
  return {
    status: "analyzed",
    units: declarationOutcomes(parsed, languageForPath(path)?.supportingTypes?.(path, source) ?? new Map())
  }
}

export type { AnalyzerMaterializationPreflight } from "./languages/contracts.ts"
export const analyzerMaterializationPreflight = (
  path: string,
  source: string,
  allowImports = false
): AnalyzerMaterializationPreflight | undefined => {
  return materializationPreflight(path, source, allowImports, parsedDeclarations(path, source, allowImports))
}
const materializationPreflight = (
  path: string,
  source: string,
  allowImports: boolean,
  parsed: TypeExtractionFailure | readonly GraphDeclaration[]
): AnalyzerMaterializationPreflight | undefined => {
  if ("status" in parsed) return undefined
  const expandedUnitBytes = preflightDeclarations(
    parsed,
    languageForPath(path)?.supportingTypes?.(path, source) ?? new Map()
  )
  return {
    declarations: parsed.length,
    expandedUnitBytes,
    ...(allowImports ? { hasImports: languageForPath(path)?.hasImports(source) ?? false } : {})
  }
}

export const combinedAnalyzerMaterializationPreflight = (
  path: string,
  source: string
): AnalyzerMaterializationPreflight | undefined => {
  const language = languageForPath(path)
  const session = language?.preflightSource?.(path, source)
  // Native type measurements intentionally remain outside the combined catch.
  const bound =
    session === undefined
      ? analyzerMaterializationPreflight(path, source, true)
      : materializationPreflight(path, source, true, session.parseTypes())
  return session === undefined
    ? language?.combinedPreflight(path, source, bound, combinedPreflightPolicy)
    : session.combinedPreflight(bound, combinedPreflightPolicy)
}
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
  return artifact?.kind === "function" || artifact?.kind === "constant-group" ? undefined : artifact
}

/** Revalidation returns the named root only when its complete evidence remains available. */
export const analyzeNamedUnit = (path: string, source: string, name: string): ReviewUnit | undefined =>
  readyTypeUnits(path, source).find(({ root }) => root.artifact.name === name)

export const analyzeNamedType = (path: string, source: string, name: string): TypeDeclaration | undefined => {
  const artifact = analyzeNamedUnit(path, source, name)?.root.artifact
  return artifact?.kind === "function" || artifact?.kind === "constant-group" ? undefined : artifact
}
