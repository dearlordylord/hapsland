import type * as Effect from "effect/Effect"
import type { GraphLimits } from "@hapsland/canonical-policy/canonical/graph-limits"
import {
  type captureStable,
  type CaptureHooks,
  type StableCapture
} from "@hapsland/native-observation/direct-event/capture"
import type { ReviewArtifact, TypeDeclaration } from "@hapsland/source-artifacts/direct-event/artifact-model"
import type { PhysicalRootIdentity } from "@hapsland/native-observation/direct-event/observation"
import type { DirectFilePolicy } from "@hapsland/native-observation/direct-event/selection"
export type TypeExtractionFailure = {
  readonly status: "unsupported"
  readonly reason: "extension" | "parse" | "import" | "declaration-limit" | "declaration-merge" | "no-declarations"
  readonly units: readonly []
}
export const MAX_TYPE_DECLARATIONS = 64
export type AnalyzerMaterializationPreflight = {
  readonly declarations: number
  readonly expandedUnitBytes: number
  readonly hasImports?: boolean
}

export type GraphReference = {
  readonly kind: "named" | "unsupported"
  readonly name: string
  readonly expectedKind?: "type" | "function"
}
export type GraphDeclaration = {
  readonly artifact: TypeDeclaration
  readonly references: readonly GraphReference[]
  readonly exported: boolean
  readonly location: {
    readonly start: { readonly line: number; readonly column: number }
    readonly end: { readonly line: number; readonly column: number }
  }
}
export type GraphFile = {
  readonly declarations: ReadonlyMap<string, GraphDeclaration>
  readonly imports: ReadonlyMap<string, { readonly path: string; readonly name: string }>
}
export type GraphFacts = {
  readonly declarations: ReadonlyMap<
    string,
    { readonly artifact: ReviewArtifact; readonly references: readonly GraphReference[]; readonly exported: boolean }
  >
  readonly imports: ReadonlyMap<string, { readonly path: string; readonly name: string; readonly typeOnly?: boolean }>
  readonly kindAware?: boolean
}
export type LanguageGraphHost = {
  readonly branch?: "type" | "function"
  readonly root: string
  readonly rootIdentity: PhysicalRootIdentity
  readonly policy: DirectFilePolicy
  readonly limits?: GraphLimits
  readonly captureHooks?: CaptureHooks
  readonly captureSource?: typeof captureStable
  readonly captureCache?: Map<string, StableCapture>
  readonly now?: () => number
}
export type GraphSession = {
  inspect(path: string, source: string, branch: "type" | "function"): GraphFacts | undefined
  importCandidates(from: string, importPath: string): readonly string[]
}
export type PreparedGraph = {
  readonly session: GraphSession
  readonly dependencies: readonly string[]
  readonly limits: GraphLimits
}
export type LanguageAdapter = {
  readonly id: string
  readonly extensions: readonly string[]
  readonly displayName: string
  readonly probe: { readonly path: string; readonly source: string }
  analyzeFunctions?(path: string, source: string): import("./function-facts.ts").FunctionFileAnalysis | undefined
  parseTypes(path: string, source: string, allowImports?: boolean): TypeExtractionFailure | readonly GraphDeclaration[]
  inspect(path: string, source: string): GraphFile | undefined
  hasImports(source: string): boolean
  combinedPreflight(
    path: string,
    source: string,
    typeBound: AnalyzerMaterializationPreflight | undefined
  ): AnalyzerMaterializationPreflight | undefined
  prepareGraph(
    path: string,
    capture: StableCapture,
    host: LanguageGraphHost,
    limits: GraphLimits,
    expired: () => boolean
  ): Effect.Effect<PreparedGraph | undefined>
}
