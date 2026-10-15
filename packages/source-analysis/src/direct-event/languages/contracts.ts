import type { AnalyzerMaterializationPreflight, CombinedPreflightPolicy } from "../combined-preflight/contracts.ts"
import type { GraphLimits } from "@hapsland/canonical-policy/canonical/graph-limits"
import {
  type captureStable,
  type CaptureHooks,
  type CaptureDiagnostic,
  type StableCapture
} from "@hapsland/native-observation/direct-event/capture"
import type { ReviewArtifact, TypeDeclaration } from "@hapsland/source-artifacts/direct-event/artifact-model"
import type { PhysicalRootIdentity } from "@hapsland/native-observation/direct-event/observation"
import type { DirectFilePolicy } from "@hapsland/native-observation/direct-event/selection"
export type TypeExtractionFailure = {
  readonly status: "unsupported"
  readonly reason:
    | "extension"
    | "parse"
    | "import"
    | "declaration-limit"
    | "declaration-merge"
    | "no-declarations"
    | "constant-only-demand-gap"
  readonly units: readonly []
}
export const MAX_TYPE_DECLARATIONS = 1024
export type { AnalyzerMaterializationPreflight } from "../combined-preflight/contracts.ts"

export type GraphReference = {
  readonly kind: "named" | "unsupported"
  readonly name: string
  /** Adapter-owned local lookup key; the source reference name remains the wire site. */
  readonly bindingName?: string
  readonly expectedKind?: "type" | "function"
  /** Explicit identity for language-owned supporting evidence, never a project lookup. */
  readonly targetId?: string
}
export type GraphDeclaration = {
  readonly artifact: TypeDeclaration
  readonly references: readonly GraphReference[]
  readonly exported: boolean
  /** Update spans must touch model-defining ranges when present. */
  readonly selectionLocations?: ReadonlyArray<
    import("@hapsland/native-observation/direct-event/edit-attribution").PostEditLocation
  >
  readonly location: {
    readonly start: { readonly line: number; readonly column: number }
    readonly end: { readonly line: number; readonly column: number }
  }
}
export type GraphFile = {
  readonly supportingDeclarations?: ReadonlyMap<string, GraphDeclaration>
  readonly declarations: ReadonlyMap<string, GraphDeclaration>
  readonly imports: ReadonlyMap<string, { readonly path: string; readonly name: string }>
}
export type GraphFacts = {
  readonly supportingDeclarations?: GraphFile["supportingDeclarations"]
  readonly declarations: ReadonlyMap<
    string,
    { readonly artifact: ReviewArtifact; readonly references: readonly GraphReference[]; readonly exported: boolean }
  >
  readonly imports: ReadonlyMap<string, { readonly path: string; readonly name: string; readonly typeOnly?: boolean }>
  readonly kindAware?: boolean
}
export type LanguageGraphHost = {
  readonly analysisConfigurationIdentity?: string
  readonly analysisConfiguration?: {
    readonly go?: { readonly goos: string; readonly goarch: string; readonly tags: readonly string[] }
  }
  readonly branch?: "type" | "function"
  readonly root: string
  readonly rootIdentity: PhysicalRootIdentity
  readonly policy: DirectFilePolicy
  readonly limits?: GraphLimits
  readonly captureHooks?: CaptureHooks
  readonly captureSource?: typeof captureStable
  readonly captureCache?: Map<string, StableCapture>
  readonly observeCaptureDiagnostic?: (sourcePath: string, diagnostic: CaptureDiagnostic) => void
  readonly now?: () => number
}
/** Invocation-local foreign parser projections; no syntax state crosses commands. */
export type NativeSourceExtraction = {
  readonly graph: GraphFile | undefined
  readonly functions: import("./function-facts.ts").FunctionFileAnalysis | undefined
  parseTypes(allowImports: boolean): TypeExtractionFailure | readonly GraphDeclaration[]
}
export type LanguageAdapter = {
  readonly id: string
  readonly extensions: readonly string[]
  readonly displayName: string
  readonly probe: { readonly path: string; readonly source: string }
  /** Validate exact provenance for adapter-owned built-in support artifacts. */
  isBundledArtifact?(artifact: ReviewArtifact): boolean
  analyzeFunctions?(path: string, source: string): import("./function-facts.ts").FunctionFileAnalysis | undefined
  extractSource(path: string, source: string): NativeSourceExtraction
  /** One Preflight command; parser resources never escape into ExtractSource. */
  preflightSource?(
    path: string,
    source: string
  ): {
    parseTypes(): TypeExtractionFailure | readonly GraphDeclaration[]
    combinedPreflight(
      bound: AnalyzerMaterializationPreflight | undefined,
      policy: CombinedPreflightPolicy
    ): AnalyzerMaterializationPreflight | undefined
  }
  parseTypes(path: string, source: string, allowImports?: boolean): TypeExtractionFailure | readonly GraphDeclaration[]
  inspect(path: string, source: string): GraphFile | undefined
  supportingTypes?(path: string, source: string): ReadonlyMap<string, GraphDeclaration>
  unselectedTypeEditReason?(
    source: string,
    spans: readonly import("@hapsland/native-observation/direct-event/edit-attribution").PostEditLocation[]
  ): "constant-only-demand-gap" | undefined
  hasImports(source: string): boolean
  combinedPreflight(
    path: string,
    source: string,
    typeBound: AnalyzerMaterializationPreflight | undefined,
    policy: CombinedPreflightPolicy
  ): AnalyzerMaterializationPreflight | undefined
}
