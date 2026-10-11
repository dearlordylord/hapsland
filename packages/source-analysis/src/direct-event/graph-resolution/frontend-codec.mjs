import { list, binary64 } from "./service-session.mjs"
const tagged = (name, fields = {}) => ({ $: "Types." + name, ...fields })
const maybe = (value) => (value === undefined ? { $: "None" } : { $: "Some", value })
const tuple = (key, value) => tagged("OrderedField", { key, value })
const artifactKinds = {
  interface: "InterfaceArtifact",
  "type-alias": "TypeAliasArtifact",
  struct: "StructArtifact",
  enum: "EnumArtifact",
  datatype: "DatatypeArtifact",
  function: "FunctionArtifact",
  class: "ClassArtifact"
}
const artifactKeys = {
  origin: "OriginKey",
  path: "ArtifactPathKey",
  id: "ArtifactIdKey",
  kind: "ArtifactKindKey",
  name: "ArtifactNameKey",
  source: "ArtifactSourceKey",
  sourceHash: "ArtifactHashKey"
}
const originKeys = {
  kind: "OriginKindKey",
  library: "LibraryKey",
  compilerVersion: "CompilerVersionKey",
  compilerSource: "CompilerSourceKey",
  moduleHash: "ModuleHashKey",
  declarationHash: "DeclarationHashKey"
}
function orderedKeys(value, keys) {
  return list(
    Object.keys(value).map((key) => {
      if (!Object.hasOwn(keys, key)) throw new Error("unsupported artifact field")
      return tagged(keys[key])
    })
  )
}
function origin(value) {
  for (const key of ["compilerVersion", "compilerSource", "moduleHash", "declarationHash"])
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
export function artifact(value) {
  if (value.path !== undefined && typeof value.path !== "string") throw new Error("invalid artifact path")
  if (!Object.hasOwn(artifactKinds, value.kind)) throw new Error("unknown artifact kind")
  for (const key of ["id", "name", "source", "sourceHash"])
    if (typeof value[key] !== "string") throw new Error("invalid artifact " + key)
  return tagged("Artifact", {
    origin: maybe(value.origin === undefined ? undefined : origin(value.origin)),
    path: maybe(value.path),
    id: value.id,
    kind: tagged(artifactKinds[value.kind]),
    name: value.name,
    source: value.source,
    source_hash: value.sourceHash,
    order: orderedKeys(value, artifactKeys)
  })
}
const expected = (kind) => {
  if (kind !== undefined && kind !== "type" && kind !== "function") throw new Error("invalid expected kind")
  return { $: "./traversal/core." + (kind === "type" ? "TypeKind" : kind === "function" ? "FunctionKind" : "AnyKind") }
}
function declaration(key, value) {
  if (typeof key !== "string" || typeof value.exported !== "boolean") throw new Error("invalid declaration")
  for (const ref of value.references) {
    if (
      !["named", "unsupported"].includes(ref.kind) ||
      typeof ref.name !== "string" ||
      (ref.targetId !== undefined && typeof ref.targetId !== "string")
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
          kind: { $: "./traversal/core." + (ref.kind === "named" ? "Named" : "Unsupported") },
          name: ref.name,
          expected: expected(ref.expectedKind),
          target: maybe(ref.targetId)
        })
      )
    )
  })
}
export function sourceFacts(facts) {
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
    declarations: list([...facts.declarations].map(([key, value]) => declaration(key, value))),
    imports: list(
      [...facts.imports].map(([key, value]) =>
        tagged("FactImport", { key, path: value.path, name: value.name, type_only: maybe(value.typeOnly) })
      )
    ),
    supporting: list([...(facts.supportingDeclarations ?? [])].map(([key, value]) => declaration(key, value)))
  })
}
export function tomlValue(value) {
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
