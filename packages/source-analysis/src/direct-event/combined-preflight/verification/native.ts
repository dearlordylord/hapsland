// Independent previous combined-preflight policy. Delete with the other native
// oracles only after whole Preparation acceptance; production never imports it.
import { withNativeTypeScriptPreflight } from "../../languages/typescript.ts"
import { inspectGoFile } from "../../languages/go.ts"
import { languageForPath } from "../../languages/registry.ts"
import { MAX_TYPE_DECLARATIONS, type AnalyzerMaterializationPreflight } from "../../languages/contracts.ts"
import type { TypeScriptPreflightInput, TypeScriptPreflightEffects } from "../contracts.ts"
export const nativeTypeScriptPreflight = (
  input: TypeScriptPreflightInput,
  bound: AnalyzerMaterializationPreflight | undefined,
  effects: TypeScriptPreflightEffects
): AnalyzerMaterializationPreflight | undefined => {
  if (!input.parseValid) return undefined
  const count = input.types + input.functions
  if (count > MAX_TYPE_DECLARATIONS) return undefined
  if (count === 0)
    return { declarations: 0, expandedUnitBytes: 0, hasImports: effects.rootImports() || effects.typeImports() }
  if (input.types > 0 && bound === undefined) return undefined
  let total = 0
  for (let f = 0; f < input.functions; f++) {
    let bytes = effects.artifactBytes(f) + 1024
    const count = effects.observeSites(f)
    for (let site = 0; site < count; site++)
      bytes += 4 * (1024 + 6 * effects.siteBytes(f, site) + 2 * effects.pathBytes())
    total += bytes
  }
  return {
    declarations: count,
    expandedUnitBytes: effects.typeBytes() + total,
    hasImports: effects.rootImports() || effects.typeImports()
  }
}
export const combinedNativePreflight = (
  path: string,
  source: string,
  bound: AnalyzerMaterializationPreflight | undefined
): AnalyzerMaterializationPreflight | undefined => {
  const language = languageForPath(path)
  if (language === undefined) return undefined
  if (language.id === "typescript") return withNativeTypeScriptPreflight(path, source, bound, nativeTypeScriptPreflight)
  if (language.id === "go")
    return (
      bound ??
      (inspectGoFile("preflight.go", source) === undefined
        ? undefined
        : { declarations: 0, expandedUnitBytes: 0, hasImports: true })
    )
  return bound
}
