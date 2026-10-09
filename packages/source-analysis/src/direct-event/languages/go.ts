import { createHash } from "node:crypto"
import { Parser, Go, descendants, sameSyntaxNode, type SyntaxNode } from "./native-parser.ts"
import {
  MAX_TYPE_DECLARATIONS,
  type GraphDeclaration,
  type GraphReference,
  type GraphFacts,
  type TypeExtractionFailure
} from "./contracts.ts"
import type { ReviewArtifact } from "@hapsland/source-artifacts/direct-event/artifact-model"
const builtins = new Set([
  "bool",
  "byte",
  "complex64",
  "complex128",
  "error",
  "float32",
  "float64",
  "int",
  "int8",
  "int16",
  "int32",
  "int64",
  "rune",
  "string",
  "uint",
  "uint8",
  "uint16",
  "uint32",
  "uint64",
  "uintptr",
  "any",
  "comparable"
])
const hash = (source: string) => createHash("sha256").update(source, "utf8").digest("hex")
const nodes = (source: string): SyntaxNode | undefined => {
  try {
    const parser = new Parser()
    parser.setLanguage(Go)
    const root = (parser.parse(source) as unknown as { rootNode: SyntaxNode }).rootNode
    return root.hasError ? undefined : root
  } catch {
    return undefined
  }
}
export type GoConstantGroup = {
  readonly artifact: ReviewArtifact
  readonly types: readonly string[]
  readonly names: readonly string[]
  readonly references: readonly GraphReference[]
}
export type GoFile = {
  readonly packageName: string
  readonly types: readonly GraphDeclaration[]
  readonly constants: readonly GoConstantGroup[]
  readonly bindings: readonly string[]
  readonly importedNames: ReadonlySet<string>
  readonly uncertainImports: boolean
  readonly cgo: boolean
}
const artifact = (path: string, kind: ReviewArtifact["kind"], name: string, source: string): ReviewArtifact => ({
  path,
  id: `${path}:${kind}:${name}`,
  kind,
  name,
  source,
  sourceHash: hash(source)
})
const imports = (root: SyntaxNode) => {
  const names = new Set<string>()
  let uncertain = false
  let cgo = false
  for (const declaration of root.namedChildren.filter((node) => node.type === "import_declaration")) {
    for (const spec of descendants(declaration).filter((node) => node.type === "import_spec")) {
      const imported = spec.childForFieldName("path")?.text.slice(1, -1)
      const name = spec.childForFieldName("name")?.text
      if (imported === "C") cgo = true
      if (name === "_") continue
      if (name === ".") uncertain = true
      else if (name !== undefined) names.add(name)
    }
  }
  return { names, uncertain, cgo }
}
const typeReferences = (node: SyntaxNode, name: SyntaxNode, imported: ReturnType<typeof imports>): GraphReference[] => {
  const parameters = new Set<string>()
  for (const parameter of descendants(node.childForFieldName("type_parameters") ?? { ...node, namedChildren: [] })) {
    if (parameter.type === "identifier" && parameter.parent?.type === "type_parameter_declaration")
      parameters.add(parameter.text)
  }
  const references = new Map<string, GraphReference>()
  const add = (kind: GraphReference["kind"], value: string) => references.set(`${kind}:${value}`, { kind, name: value })
  for (const child of descendants(node)) {
    if (child.type === "qualified_type") add("unsupported", child.text)
    else if (
      child.type === "type_identifier" &&
      !sameSyntaxNode(child, name) &&
      child.parent?.type !== "qualified_type" &&
      !parameters.has(child.text)
    ) {
      // Builtin assumptions are resolved against package bindings by prepareGraph.
      add(imported.names.has(child.text) ? "unsupported" : "named", child.text)
    } else if (child.type === "array_type") {
      const length = child.childForFieldName("length")
      if (length !== null && length !== undefined && length.type !== "int_literal")
        add(length.type === "identifier" ? "named" : "unsupported", length.text)
    }
  }
  if (imported.uncertain) add("unsupported", "GoImportAuthority")
  return [...references.values()]
}
export const inspectGoFile = (path: string, source: string): GoFile | undefined => {
  const root = nodes(source)
  const packageName = root?.namedChildren.find((node) => node.type === "package_clause")?.namedChildren[0]?.text
  if (root === undefined || packageName === undefined || root.namedChildren.length > MAX_TYPE_DECLARATIONS)
    return undefined
  const imported = imports(root)
  const types: GraphDeclaration[] = []
  const bindings: string[] = []
  const constants: GoConstantGroup[] = []
  for (const declaration of root.namedChildren) {
    if (declaration.type === "type_declaration") {
      for (const spec of declaration.namedChildren.filter((child) =>
        ["type_spec", "type_alias"].includes(child.type)
      )) {
        const name = spec.childForFieldName("name")
        const type = spec.childForFieldName("type")
        if (name === null || type === null) return undefined
        const kind =
          spec.type === "type_alias"
            ? "type-alias"
            : type.type === "struct_type"
              ? "struct"
              : type.type === "interface_type"
                ? "interface"
                : "defined-type"
        // Single declarations include 'type'; grouped roots retain only their exact spec.
        const sourceNode =
          declaration.namedChildren.filter((n) => ["type_spec", "type_alias"].includes(n.type)).length === 1 &&
          !/^type\s*\(/u.test(declaration.text)
            ? declaration
            : spec
        const item = artifact(path, kind, name.text, sourceNode.text)
        if (item.kind === "constant-group" || item.kind === "function") return undefined
        types.push({
          artifact: item,
          references: typeReferences(spec, name, imported),
          exported: /^[A-Z]/u.test(name.text),
          location: {
            start: { line: sourceNode.startPosition.row + 1, column: sourceNode.startPosition.column + 1 },
            end: { line: sourceNode.endPosition.row + 1, column: sourceNode.endPosition.column + 1 }
          }
        })
        bindings.push(name.text)
      }
    } else if (declaration.type === "const_declaration") {
      const relevant = new Set<string>()
      const names: string[] = []
      const references = new Map<string, GraphReference>()
      let implicitType: string | undefined
      for (const spec of declaration.namedChildren.filter((node) => node.type === "const_spec")) {
        const value = spec.childForFieldName("value")
        const type = spec.childForFieldName("type")
        if (type !== null) {
          implicitType = type.type === "type_identifier" ? type.text : undefined
          references.set(type.text, {
            kind: type.type === "type_identifier" ? "named" : "unsupported",
            name: type.text
          })
        } else if (value !== null) implicitType = undefined
        if (implicitType !== undefined) relevant.add(implicitType)
        if (value !== null) {
          for (const call of descendants(value).filter((node) => node.type === "call_expression")) {
            const target = call.childForFieldName("function")
            if (target?.type === "identifier") relevant.add(target.text)
          }
          for (const name of descendants(value).filter((node) => node.type === "identifier" || node.type === "iota")) {
            references.set(name.text, { kind: "unsupported", name: name.text })
          }
        }
        for (const child of spec.namedChildren)
          if (child.type === "identifier") {
            bindings.push(child.text)
            names.push(child.text)
          }
      }
      constants.push({
        artifact: artifact(
          path,
          "constant-group",
          `GoConstants_${hash(path).slice(0, 16)}_${declaration.startIndex}`,
          declaration.text
        ),
        types: [...relevant],
        names,
        references: [...references.values()]
      })
    } else if (declaration.type === "var_declaration") {
      for (const spec of descendants(declaration).filter((node) => node.type === "var_spec"))
        for (const child of spec.namedChildren) if (child.type === "identifier") bindings.push(child.text)
    } else if (declaration.type === "function_declaration") {
      const name = declaration.childForFieldName("name")?.text
      if (name !== undefined) bindings.push(name)
    }
  }
  if (types.length > MAX_TYPE_DECLARATIONS) return undefined
  return {
    packageName,
    types,
    constants,
    bindings,
    importedNames: imported.names,
    uncertainImports: imported.uncertain,
    cgo: imported.cgo
  }
}
export const goGraphFacts = (
  files: readonly GoFile[],
  workLimit = 128
): (GraphFacts & { readonly discoveryWork: number }) | undefined => {
  let discoveryWork = files.reduce(
    (sum, file) =>
      sum +
      file.bindings.length +
      file.constants.length +
      file.types.reduce((total, type) => total + type.references.length, 0) +
      file.constants.reduce((total, group) => total + group.references.length, 0),
    0
  )
  if (discoveryWork > workLimit) return undefined
  const bindings = files.flatMap((file) => file.bindings).filter((name) => name !== "_")
  if (new Set(bindings).size !== bindings.length) return undefined
  const packageNames = new Set(bindings)
  const typeNames = new Set(files.flatMap((file) => file.types.map((type) => type.artifact.name)))
  const declarations: Map<
    string,
    GraphFacts["declarations"] extends ReadonlyMap<string, infer T> ? T : never
  > = new Map()
  const constants = files.flatMap((file) => file.constants)
  if (constants.some((group) => packageNames.has(group.artifact.name))) return undefined
  const constantBindings = new Map(constants.flatMap((group) => group.names.map((name) => [name, group] as const)))
  const relevantTypes = new Map(constants.map((group) => [group, new Set(group.types)]))
  // A constant alias retains its declared type. Discover its original group,
  // without evaluating values or fabricating isolated enumerators.
  for (let pass = 0; pass < constants.length; pass++) {
    let changed = false
    for (const group of constants) {
      const types = relevantTypes.get(group)!
      for (const reference of group.references) {
        if (++discoveryWork > workLimit) return undefined
        const dependency = constantBindings.get(reference.name)
        if (dependency === undefined) continue
        for (const name of relevantTypes.get(dependency)!) {
          if (++discoveryWork > workLimit) return undefined
          if (!types.has(name)) {
            types.add(name)
            changed = true
          }
        }
      }
    }
    if (!changed) break
  }
  for (const file of files) {
    for (const declaration of file.types) {
      const references = declaration.references
        .filter(
          (reference) =>
            !(reference.kind === "named" && builtins.has(reference.name) && !packageNames.has(reference.name))
        )
        .map((reference) => {
          const dependency = reference.kind === "named" ? constantBindings.get(reference.name) : undefined
          return dependency === undefined ? reference : { kind: "named" as const, name: dependency.artifact.name }
        })
      for (const group of constants) {
        if (++discoveryWork > workLimit) return undefined
        if (relevantTypes.get(group)!.has(declaration.artifact.name))
          references.push({ kind: "named", name: group.artifact.name })
      }
      declarations.set(declaration.artifact.name, { ...declaration, references })
    }
    for (const group of file.constants)
      declarations.set(group.artifact.name, {
        artifact: group.artifact,
        references: group.references
          .filter(
            (r) =>
              !group.names.includes(r.name) &&
              !(builtins.has(r.name) && !packageNames.has(r.name)) &&
              !(r.name === "iota" && !packageNames.has("iota"))
          )
          .map((reference) => {
            const dependency = constantBindings.get(reference.name)
            return dependency !== undefined
              ? { kind: "named" as const, name: dependency.artifact.name }
              : typeNames.has(reference.name)
                ? { kind: "named" as const, name: reference.name }
                : reference
          }),
        exported: false
      })
  }
  return { declarations, imports: new Map(), discoveryWork }
}
export const parseGoTypes = (path: string, source: string): TypeExtractionFailure | readonly GraphDeclaration[] => {
  const file = inspectGoFile(path, source)
  if (file === undefined) return { status: "unsupported", reason: "parse", units: [] }
  if (file.types.length === 0)
    return {
      status: "unsupported",
      reason: file.constants.length > 0 ? "constant-only-demand-gap" : "no-declarations",
      units: []
    }
  if (
    new Set(file.bindings.filter((name) => name !== "_")).size !== file.bindings.filter((name) => name !== "_").length
  )
    return { status: "unsupported", reason: "declaration-merge", units: [] }
  return file.types.map((type) => ({
    ...type,
    references: type.references.filter(
      (r) => !(r.kind === "named" && builtins.has(r.name) && !file.bindings.includes(r.name))
    )
  }))
}

export const goUnselectedTypeEditReason = (
  source: string,
  spans: readonly import("@hapsland/native-observation/direct-event/edit-attribution").PostEditLocation[]
): "constant-only-demand-gap" | undefined => {
  const groups = nodes(source)?.namedChildren.filter((node) => node.type === "const_declaration") ?? []
  const starts = [0]
  for (let i = 0; i < source.length; i++) if (source[i] === "\n") starts.push(i + 1)
  return spans.length > 0 &&
    spans.every((span) => {
      const lineStart = starts[span.start.line - 1]
      const lineEnd = starts[span.end.line - 1]
      if (lineStart === undefined || lineEnd === undefined) return false
      const start = lineStart + span.start.column - 1
      const end = lineEnd + span.end.column - 1
      return groups.some(
        (group) =>
          start < group.endIndex &&
          end > group.startIndex &&
          (start >= group.startIndex || source.slice(start, group.startIndex).trim() === "") &&
          (end <= group.endIndex || source.slice(group.endIndex, end).trim() === "")
      )
    })
    ? "constant-only-demand-gap"
    : undefined
}
