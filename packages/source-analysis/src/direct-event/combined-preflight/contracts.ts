// The combined materialization bound and its native parser/measurement port.
// Language bindings depend on this contract; only the analyzer composition imports
// the Bend driver, keeping parser-only consumers outside its runtime closure.
export type AnalyzerMaterializationPreflight = {
  readonly declarations: number
  readonly expandedUnitBytes: number
  readonly hasImports?: boolean
}

export type TypeScriptPreflightInput = {
  readonly parseValid: boolean
  readonly types: number
  readonly functions: number
}
export type TypeScriptPreflightEffects = {
  artifactBytes(slot: number): number
  observeSites(slot: number): number
  siteBytes(slot: number, site: number): number
  pathBytes(): number
  typeBytes(): number
  rootImports(): boolean
  typeImports(): boolean
}
export type CombinedPreflightPolicy = {
  typescript(
    input: TypeScriptPreflightInput,
    bound: AnalyzerMaterializationPreflight | undefined,
    effects: TypeScriptPreflightEffects
  ): AnalyzerMaterializationPreflight | undefined
  go(
    bound: AnalyzerMaterializationPreflight | undefined,
    inspectGo: () => boolean
  ): AnalyzerMaterializationPreflight | undefined
}
