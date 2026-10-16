import { createHash } from "node:crypto"
import { Parser, Go, descendants, sameSyntaxNode, type SyntaxNode } from "./native-parser.ts"
import {
  MAX_TYPE_DECLARATIONS,
  type GraphDeclaration,
  type GraphReference,
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
  readonly members: readonly { readonly name: string; readonly typeName?: string; readonly expression?: SyntaxNode }[]
  readonly names: readonly string[]
  readonly references: readonly GraphReference[]
}
export type GoFile = {
  readonly path: string
  readonly imports: readonly { readonly path: string; readonly name?: string }[]
  readonly aliases: ReadonlyMap<string, string>
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
  const bindings: { path: string; name?: string }[] = []
  const names = new Set<string>()
  let uncertain = false
  let cgo = false
  for (const declaration of root.namedChildren.filter((node) => node.type === "import_declaration")) {
    for (const spec of descendants(declaration).filter((node) => node.type === "import_spec")) {
      const imported = spec.childForFieldName("path")?.text.slice(1, -1)
      const name = spec.childForFieldName("name")?.text
      if (imported !== undefined) bindings.push({ path: imported, ...(name === undefined ? {} : { name }) })
      if (imported === "C") cgo = true
      if (name === "_") continue
      if (name === ".") uncertain = true
      else if (name !== undefined) names.add(name)
    }
  }
  return { names, uncertain, cgo, bindings }
}
const typeParameters = (node: SyntaxNode): Set<string> => {
  const parameters = new Set<string>()
  for (const parameter of descendants(node.childForFieldName("type_parameters") ?? { ...node, namedChildren: [] })) {
    if (parameter.type === "identifier" && parameter.parent?.type === "type_parameter_declaration")
      parameters.add(parameter.text)
  }
  return parameters
}
const typeReferences = (node: SyntaxNode, name: SyntaxNode, imported: ReturnType<typeof imports>): GraphReference[] => {
  const parameters = typeParameters(node)
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
      add(
        imported.names.has(child.text) || (imported.uncertain && /^\p{Lu}/u.test(child.text)) ? "unsupported" : "named",
        child.text
      )
    } else if (child.type === "array_type") {
      const length = child.childForFieldName("length")
      if (length !== null && length !== undefined && length.type !== "int_literal")
        add(length.type === "identifier" ? "named" : "unsupported", length.text)
    }
  }
  return [...references.values()]
}
/** Parentheses preserve a named type's identity, including instantiated aliases. */
const namedType = (node: SyntaxNode): string | undefined => {
  let current: SyntaxNode | undefined = node
  while (current?.type === "parenthesized_type") current = current.namedChildren[0]
  return current?.type === "type_identifier" || current?.type === "qualified_type"
    ? current.text
    : current?.type === "generic_type"
      ? current.namedChildren[0]?.text
      : undefined
}
export const inspectGoFile = (path: string, source: string): GoFile | undefined => {
  const root = nodes(source)
  const packageName = root?.namedChildren.find((node) => node.type === "package_clause")?.namedChildren[0]?.text
  if (root === undefined || packageName === undefined || root.namedChildren.length > MAX_TYPE_DECLARATIONS)
    return undefined
  const imported = imports(root)
  const types: GraphDeclaration[] = []
  const aliases = new Map<string, string>()
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
        const aliasTarget = namedType(type)
        if (
          spec.type === "type_alias" &&
          aliasTarget !== undefined &&
          !imported.uncertain &&
          !imported.names.has(aliasTarget) &&
          !typeParameters(spec).has(aliasTarget)
        )
          aliases.set(name.text, aliasTarget)
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
          exported: /^\p{Lu}/u.test(name.text),
          location: {
            start: { line: sourceNode.startPosition.row + 1, column: sourceNode.startPosition.column + 1 },
            end: { line: sourceNode.endPosition.row + 1, column: sourceNode.endPosition.column + 1 }
          }
        })
        bindings.push(name.text)
      }
    } else if (declaration.type === "const_declaration") {
      const members: GoConstantGroup["members"][number][] = []
      const names: string[] = []
      const references = new Map<string, GraphReference>()
      let implicitType: string | undefined
      let implicitValues: readonly SyntaxNode[] = []
      for (const spec of declaration.namedChildren.filter((node) => node.type === "const_spec")) {
        const value = spec.childForFieldName("value")
        const type = spec.childForFieldName("type")
        if (type !== null) {
          implicitType = namedType(type)
          for (const part of [type, ...descendants(type)]) {
            if (part.type === "qualified_type") references.set(part.text, { kind: "unsupported", name: part.text })
            else if (part.type === "type_identifier" && part.parent?.type !== "qualified_type")
              references.set(part.text, { kind: "named", name: part.text })
          }
        } else if (value !== null) implicitType = undefined
        if (value !== null) {
          implicitValues = value.type === "expression_list" ? value.namedChildren : [value]
          for (const part of descendants(value)) {
            if (part.type === "selector_expression" || part.type === "qualified_type")
              references.set(part.text, { kind: "unsupported", name: part.text })
            else if (
              ["identifier", "iota", "true", "false", "type_identifier"].includes(part.type) &&
              part.parent?.type !== "selector_expression" &&
              part.parent?.type !== "qualified_type"
            )
              references.set(part.text, {
                kind: part.type === "type_identifier" ? "named" : "unsupported",
                name: part.text
              })
          }
        }
        let position = 0
        for (const child of spec.namedChildren)
          if (child.type === "identifier") {
            bindings.push(child.text)
            names.push(child.text)
            const expression = implicitValues[position++]
            members.push({
              name: child.text,
              ...(implicitType === undefined ? {} : { typeName: implicitType }),
              ...(expression === undefined ? {} : { expression })
            })
          }
      }
      if (imported.uncertain)
        for (const [key, reference] of references)
          if (/^\p{Lu}/u.test(reference.name)) references.set(key, { kind: "unsupported", name: reference.name })
      constants.push({
        artifact: artifact(
          path,
          "constant-group",
          `GoConstants_${hash(path).slice(0, 16)}_${declaration.startIndex}`,
          declaration.text
        ),
        members,
        names,
        references: [...references.values()]
      })
    } else if (declaration.type === "var_declaration") {
      const specs = declaration.namedChildren.flatMap((node) =>
        node.type === "var_spec"
          ? [node]
          : node.type === "var_spec_list"
            ? node.namedChildren.filter((child) => child.type === "var_spec")
            : []
      )
      for (const spec of specs)
        for (const child of spec.namedChildren) if (child.type === "identifier") bindings.push(child.text)
    } else if (declaration.type === "function_declaration") {
      const name = declaration.childForFieldName("name")?.text
      if (name !== undefined && name !== "init" && name !== "_") bindings.push(name)
    }
  }
  if (types.length > MAX_TYPE_DECLARATIONS) return undefined
  return {
    path,
    packageName,
    imports: imported.bindings,
    aliases,
    types,
    constants,
    bindings,
    importedNames: imported.names,
    uncertainImports: imported.uncertain,
    cgo: imported.cgo
  }
}
export const localGoDeclarations = (file: GoFile | undefined): TypeExtractionFailure | readonly GraphDeclaration[] => {
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

export const parseGoTypes = (path: string, source: string): TypeExtractionFailure | readonly GraphDeclaration[] =>
  localGoDeclarations(inspectGoFile(path, source))

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
