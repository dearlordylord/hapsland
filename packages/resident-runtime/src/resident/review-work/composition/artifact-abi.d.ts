// Exact namespace relocation used by artifact-dispatcher for resident cores.
type ResolverModule = "Types" | "State" | "Protocol" | "Loop" | "ComposedBudget" | "Clock"
type GoModule = "PreparationModel" | "Configuration" | "RawText" | "Input" | "Package" | "ArtifactProtocol"
type PythonModule = "Session" | "ArtifactProtocol"
type NamespaceMap = {
  [Module in ResolverModule]: `../../../../../source-analysis/src/direct-event/graph-resolution/${Module}.`
} & {
  [Module in GoModule as `go-module/${Module}`]: `../../../../../source-analysis/src/direct-event/graph-resolution/go-module/${Module}.`
} & {
  [Module in PythonModule as `python-module/${Module}`]: `../../../../../source-analysis/src/direct-event/graph-resolution/python-module/${Module}.`
} & {
  "traversal/core": "../../../../../source-analysis/src/direct-event/graph-resolution/traversal/core."
  "../../../../source-artifacts/src/direct-event/value/Value": "../../../../../source-artifacts/src/direct-event/value/Value."
  "../../../../agent-flow-bend/ImportGraph": "../../../../../agent-flow-bend/ImportGraph."
}
type Relocated<Tag extends string> = {
  [Module in keyof NamespaceMap]: Tag extends `${Module}.${infer Name}` ? `${NamespaceMap[Module]}${Name}` : never
}[keyof NamespaceMap]
type ArtifactTag<Tag extends string> = [Relocated<Tag>] extends [never] ? Tag : Relocated<Tag>
export type ArtifactAbi<Value> = Value extends object
  ? {
      readonly [Key in keyof Value]: Key extends "$"
        ? Value[Key] extends string
          ? ArtifactTag<Value[Key]>
          : Value[Key]
        : ArtifactAbi<Value[Key]>
    }
  : Value
type Restored<Tag extends string> = {
  [Module in keyof NamespaceMap]: Tag extends `${NamespaceMap[Module]}${infer Name}` ? `${Module}.${Name}` : never
}[keyof NamespaceMap]
type ResolverTag<Tag extends string> = [Restored<Tag>] extends [never] ? Tag : Restored<Tag>
export type ResolverAbi<Value> = Value extends object
  ? {
      readonly [Key in keyof Value]: Key extends "$"
        ? Value[Key] extends string
          ? ResolverTag<Value[Key]>
          : Value[Key]
        : ResolverAbi<Value[Key]>
    }
  : Value
export type Tagged<Name extends string, Fields = object> = { readonly $: Name } & Fields
export type Maybe<Value> = Tagged<"None"> | Tagged<"Some", { readonly value: Value }>
export type Token<Name extends "CaptureToken" | "ClockToken" | "CacheToken"> = Tagged<
  `../../../../../source-analysis/src/direct-event/graph-resolution/Types.${Name}`,
  { readonly invocation: bigint; readonly id: bigint }
>
