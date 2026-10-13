import type * as Effect from "effect/Effect"
import type { GraphLimits } from "@hapsland/canonical-policy/canonical/graph-limits"
import type { StableCapture } from "@hapsland/native-observation/direct-event/capture"
import type { GraphFacts, LanguageAdapter, LanguageGraphHost } from "../../languages/contracts.ts"

export type GraphSession = {
  inspect(path: string, source: string, branch: "type" | "function"): GraphFacts | undefined
  importCandidates(from: string, importPath: string): readonly string[]
  /** Language-owned binding authority, charged together with the canonical graph. */
  resolveImport?(
    from: string,
    importPath: string,
    name: string,
    remaining: { readonly files: number; readonly readBytes: number; readonly work: number }
  ): Effect.Effect<{ readonly path: string; readonly name: string } | undefined>
  authorityUsage?(): { readonly files: number; readonly readBytes: number; readonly work: number }
  validateAuthority?(remaining: {
    readonly files: number
    readonly readBytes: number
    readonly work: number
  }): Effect.Effect<boolean>
}
export type PreparedGraph = {
  readonly bindingFingerprint?: string
  readonly session: GraphSession
  readonly dependencies: readonly string[]
  readonly limits: GraphLimits
}

export type NativeLanguageAdapter = LanguageAdapter & {
  prepareGraph(
    path: string,
    capture: StableCapture,
    host: LanguageGraphHost,
    limits: GraphLimits,
    expired: () => boolean
  ): Effect.Effect<PreparedGraph | undefined>
}
