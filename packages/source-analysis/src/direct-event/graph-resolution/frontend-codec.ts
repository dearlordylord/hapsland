import type { ReviewArtifact, BundledArtifactOrigin } from "@hapsland/source-artifacts/direct-event/artifact-model"
import type { GraphFacts, GraphReference } from "../languages/contracts.ts"
import {
  artifactValueTag,
  list,
  binary64,
  type List,
  type Binary64,
  type OrderedField
} from "@hapsland/source-artifacts/direct-event/value/codec"
export type TomlValue =
  | { readonly $: "Types.TomlString"; readonly value: string }
  | { readonly $: "Types.TomlBool"; readonly value: boolean }
  | { readonly $: "Types.TomlInteger"; readonly decimal: string }
  | { readonly $: "Types.TomlNumber"; readonly bits: Binary64 }
  | { readonly $: "Types.TomlDate"; readonly representation: string }
  | { readonly $: "Types.TomlArray"; readonly items: List<TomlValue> }
  | { readonly $: "Types.TomlRecord"; readonly fields: List<OrderedField<TomlValue>> }
type ValueConstructor =
  | "Binary64"
  | "OrderedField"
  | "ProductNull"
  | "ProductBool"
  | "ProductNumber"
  | "ProductText"
  | "ProductArray"
  | "ProductObject"
type ConstructorTag<Name extends string> = string extends Name
  ? string
  : Name extends ValueConstructor
    ? `../../../../source-artifacts/src/direct-event/value/Value.${Name}`
    : `Types.${Name}`
function tagged<Name extends string>(name: Name): { readonly $: ConstructorTag<Name> }
function tagged<Name extends string, Fields extends object>(
  name: Name,
  fields: Fields
): { readonly $: ConstructorTag<Name> } & Fields
function tagged(name: string, fields?: object) {
  return { $: artifactValueTag(name) ?? "Types." + name, ...fields }
}
const maybe = <Value>(
  value: Value | undefined
): { readonly $: "None" } | { readonly $: "Some"; readonly value: Value } =>
  value === undefined ? { $: "None" } : { $: "Some", value }
const tuple = <Value>(key: string, value: Value): OrderedField<Value> => ({
  $: "../../../../source-artifacts/src/direct-event/value/Value.OrderedField",
  key,
  value
})
const artifactKinds = {
  interface: "InterfaceArtifact",
  "type-alias": "TypeAliasArtifact",
  struct: "StructArtifact",
  enum: "EnumArtifact",
  datatype: "DatatypeArtifact",
  function: "FunctionArtifact",
  class: "ClassArtifact",
  "defined-type": "DefinedTypeArtifact",
  "constant-group": "ConstantGroupArtifact"
} as const satisfies Readonly<Record<string, string>>
const artifactKeys = {
  origin: "OriginKey",
  path: "ArtifactPathKey",
  id: "ArtifactIdKey",
  kind: "ArtifactKindKey",
  name: "ArtifactNameKey",
  source: "ArtifactSourceKey",
  sourceHash: "ArtifactHashKey"
} as const satisfies Readonly<Record<string, string>>
const originKeys = {
  kind: "OriginKindKey",
  library: "LibraryKey",
  compilerVersion: "CompilerVersionKey",
  compilerSource: "CompilerSourceKey",
  moduleHash: "ModuleHashKey",
  declarationHash: "DeclarationHashKey"
} as const satisfies Readonly<Record<string, string>>
function orderedKeys<Name extends string>(value: object, keys: Readonly<Record<string, Name>>) {
  return list(
    Object.keys(value).map((key) => {
      if (!Object.hasOwn(keys, key)) throw new Error("unsupported artifact field")
      const constructor = keys[key]
      if (constructor === undefined) throw new Error("unsupported artifact field")
      return tagged(constructor)
    })
  )
}
function origin(value: BundledArtifactOrigin) {
  for (const key of ["compilerVersion", "compilerSource", "moduleHash", "declarationHash"] as const)
    if (typeof value[key] !== "string") throw new Error("invalid origin " + key)
  if (value.kind !== "bundled" || value.library !== "bend/Base") throw new Error("unsupported origin")
  return tagged("BundledOrigin", {
    compiler_version: value.compilerVersion,
    compiler_source: value.compilerSource,
    module_hash: value.moduleHash,
    declaration_hash: value.declarationHash,
    order: orderedKeys(value, originKeys)
  })
}
export function artifact(value: ReviewArtifact) {
  if (value.path !== undefined && typeof value.path !== "string") throw new Error("invalid artifact path")
  const kind = Object.hasOwn(artifactKinds, value.kind)
    ? artifactKinds[value.kind as keyof typeof artifactKinds]
    : undefined
  if (kind === undefined) throw new Error("unknown artifact kind")
  for (const key of ["id", "name", "source", "sourceHash"] as const)
    if (typeof value[key] !== "string") throw new Error("invalid artifact " + key)
  return tagged("Artifact", {
    origin: maybe(value.origin === undefined ? undefined : origin(value.origin)),
    path: maybe(value.path),
    id: value.id,
    kind: tagged(kind),
    name: value.name,
    source: value.source,
    source_hash: value.sourceHash,
    order: orderedKeys(value, artifactKeys)
  })
}
const expected = (kind: GraphReference["expectedKind"]) => {
  if (kind !== undefined && kind !== "type" && kind !== "function") throw new Error("invalid expected kind")
  return kind === "type"
    ? { $: "traversal/core.TypeKind" as const }
    : kind === "function"
      ? { $: "traversal/core.FunctionKind" as const }
      : { $: "traversal/core.AnyKind" as const }
}
export function factDeclaration(
  key: string,
  value: GraphFacts["declarations"] extends ReadonlyMap<string, infer Value> ? Value : never
) {
  if (typeof key !== "string" || typeof value.exported !== "boolean") throw new Error("invalid declaration")
  for (const ref of value.references) {
    if (
      !["named", "unsupported"].includes(ref.kind) ||
      typeof ref.name !== "string" ||
      (ref.targetId !== undefined && typeof ref.targetId !== "string") ||
      (ref.bindingName !== undefined && typeof ref.bindingName !== "string")
    )
      throw new Error("invalid reference")
  }
  return tagged("FactDeclaration", {
    key,
    artifact: artifact(value.artifact),
    exported: value.exported,
    references: list(
      value.references.map((ref) =>
        tagged("FactReference", {
          kind:
            ref.kind === "named" && ref.bindingName !== undefined
              ? { $: "traversal/core.BoundNamed" as const, binding: ref.bindingName }
              : ref.kind === "named"
                ? { $: "traversal/core.Named" as const }
                : { $: "traversal/core.Unsupported" as const },
          name: ref.name,
          expected: expected(ref.expectedKind),
          target: maybe(ref.targetId)
        })
      )
    )
  })
}
export function sourceFacts(facts: GraphFacts) {
  if (facts.kindAware !== undefined && typeof facts.kindAware !== "boolean") throw new Error("invalid kindAware")
  for (const [key, value] of facts.imports) {
    if (
      typeof key !== "string" ||
      typeof value.path !== "string" ||
      typeof value.name !== "string" ||
      (value.typeOnly !== undefined && typeof value.typeOnly !== "boolean")
    )
      throw new Error("invalid import")
  }
  return tagged("SourceFacts", {
    kind_aware: maybe(facts.kindAware),
    declarations: list([...facts.declarations].map(([key, value]) => factDeclaration(key, value))),
    imports: list(
      [...facts.imports].map(([key, value]) =>
        tagged("FactImport", { key, path: value.path, name: value.name, type_only: maybe(value.typeOnly) })
      )
    ),
    supporting: list([...(facts.supportingDeclarations ?? [])].map(([key, value]) => factDeclaration(key, value)))
  })
}
export function tomlValue(value: unknown): TomlValue {
  if (typeof value === "string") return tagged("TomlString", { value })
  if (typeof value === "boolean") return tagged("TomlBool", { value })
  if (typeof value === "bigint") return tagged("TomlInteger", { decimal: String(value) })
  if (typeof value === "number") return tagged("TomlNumber", { bits: binary64(value) })
  if (value instanceof Date) return tagged("TomlDate", { representation: value.toISOString() })
  if (Array.isArray(value)) return tagged("TomlArray", { items: list(value.map(tomlValue)) })
  if (value !== null && typeof value === "object")
    return tagged("TomlRecord", {
      fields: list(Object.entries(value).map(([key, item]) => tuple(key, tomlValue(item))))
    })
  throw new Error("unsupported TOML engine value")
}

type NaturalReply<Value> = Value extends readonly (infer Item)[]
  ? NaturalReply<Item>[]
  : Value extends object
    ? {
        [Key in keyof Value]: Key extends "invocation" | "id" | "bytes"
          ? Value[Key] extends number
            ? bigint
            : NaturalReply<Value[Key]>
          : NaturalReply<Value[Key]>
      }
    : Value

// Mechanical graph ABI traversal preserves field order and sparse arrays while
// avoiding the JavaScript call-stack limit for source-bearing ProductValue trees.
export const mapGraphAbi = (value: unknown, field: (key: string, item: unknown) => unknown): unknown => {
  const result: Record<string, unknown> = {}
  type ValueTask = { value: unknown; target: object; key: string | number; field?: boolean }
  type ArrayTask = { source: unknown[]; target: unknown[]; index: number }
  const pending: Array<ValueTask | ArrayTask> = [{ value, target: result, key: "value" }]
  while (pending.length > 0) {
    const next = pending.pop()!
    if ("index" in next) {
      while (next.index < next.target.length && !(next.index in next.source)) next.index++
      if (next.index < next.target.length) {
        const key = next.index++
        const value = next.source[key]
        pending.push(next)
        pending.push({ value, target: next.target, key })
      }
      continue
    }
    const source = next.field ? field(String(next.key), next.value) : next.value
    let converted = source
    if (Array.isArray(source)) {
      const items = new Array<unknown>(source.length)
      converted = items
      pending.push({ source, target: items, index: 0 })
    } else if (source && typeof source === "object") {
      const fields: Record<string, unknown> = {}
      converted = fields
      for (const [key, item] of Object.entries(source).reverse())
        pending.push({ value: item, target: fields, key, field: true })
    }
    Object.defineProperty(next.target, next.key, {
      value: converted,
      enumerable: true,
      writable: true,
      configurable: true
    })
  }
  return result.value
}

// Only the emitted Nat ABI is converted here; graph decisions remain in Bend.
export function pureReply<Value>(value: Value): NaturalReply<Value> {
  return mapGraphAbi(value, (key, item) =>
    ["invocation", "id", "bytes"].includes(key) && typeof item === "number" ? BigInt(item) : item
  ) as NaturalReply<Value>
}
