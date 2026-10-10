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
export const goGraphFacts = (
  files: readonly GoFile[],
  workLimit = 128
):
  | (GraphFacts & {
      readonly discoveryWork: number
      readonly constantTypes: ReadonlyMap<string, readonly { readonly name: string; readonly sourcePath?: string }[]>
    })
  | undefined => {
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
  const members = constants.flatMap((group) => group.members)
  const memberBindings = new Map(members.filter((member) => member.name !== "_").map((member) => [member.name, member]))
  const memberTypes = new Map(members.map((member) => [member, new Set<string>()]))
  const aliases = new Map(files.flatMap((file) => [...file.aliases]))
  const aliasFiles = new Map(files.flatMap((file) => [...file.aliases.keys()].map((name) => [name, file] as const)))
  const qualifiedTypes = new Map<string, { readonly name: string; readonly sourcePath: string }>()
  // Qualified spellings are file scoped, including those reached through an
  // alias or copied from another constant. Keep provenance in inference keys.
  const qualifiedType = (name: string, file: GoFile): string => {
    const identity = JSON.stringify([file.path, name])
    qualifiedTypes.set(identity, { name, sourcePath: file.path })
    return identity
  }
  const declaredTypes = (name: string): readonly string[] => {
    const names = new Set<string>()
    let current: string | undefined = name
    let origin: GoFile | undefined
    while (current !== undefined && typeNames.has(current) && !names.has(current)) {
      if (++discoveryWork > workLimit) throw new RangeError("constant-discovery-work")
      names.add(current)
      origin = aliasFiles.get(current)
      current = aliases.get(current)
    }
    if (
      current !== undefined &&
      origin !== undefined &&
      /^[\p{L}_][\p{L}\p{N}_]*\.[\p{L}_][\p{L}\p{N}_]*$/u.test(current)
    )
      names.add(qualifiedType(current, origin))
    return [...names]
  }
  const typeExpression = (node: SyntaxNode | undefined, file: GoFile): readonly string[] => {
    const imported = file.importedNames
    if (node === undefined) return []
    if (++discoveryWork > workLimit) throw new RangeError("constant-discovery-work")
    if (["identifier", "iota", "true", "false"].includes(node.type))
      return imported.has(node.text)
        ? []
        : [...(memberBindings.has(node.text) ? memberTypes.get(memberBindings.get(node.text)!)! : [])]
    if (node.type === "selector_expression") return [qualifiedType(node.text, file)]
    if (node.type === "parenthesized_expression") return typeExpression(node.namedChildren[0], file)
    if (node.type === "unary_expression") return typeExpression(node.childForFieldName("operand") ?? undefined, file)
    if (node.type === "binary_expression") {
      const operator = node.childForFieldName("operator")?.text
      if (["==", "!=", "<", "<=", ">", ">="].includes(operator ?? "")) return []
      const left = typeExpression(node.childForFieldName("left") ?? undefined, file)
      return operator === "<<" || operator === ">>"
        ? left
        : [...left, ...typeExpression(node.childForFieldName("right") ?? undefined, file)]
    }
    if (node.type === "call_expression" || node.type === "type_conversion_expression") {
      let target = node.childForFieldName(node.type === "call_expression" ? "function" : "type")
      while (target?.type === "parenthesized_expression" || target?.type === "parenthesized_type") {
        if (++discoveryWork > workLimit) throw new RangeError("constant-discovery-work")
        target = target.namedChildren[0] ?? null
      }
      const name =
        target?.type === "identifier" ||
        target?.type === "type_identifier" ||
        target?.type === "qualified_type" ||
        target?.type === "selector_expression"
          ? target.text
          : target?.type === "type_instantiation_expression" || target?.type === "generic_type"
            ? target.namedChildren[0]?.text
            : undefined
      if (name === undefined || imported.has(name)) return []
      if (/^[\p{L}_][\p{L}\p{N}_]*\.[\p{L}_][\p{L}\p{N}_]*$/u.test(name)) return [qualifiedType(name, file)]
      if (typeNames.has(name)) return declaredTypes(name)
      if (["min", "max"].includes(name) && !packageNames.has(name))
        return (node.childForFieldName("arguments")?.namedChildren ?? []).flatMap((argument) =>
          typeExpression(argument, file)
        )
    }
    return []
  }
  // Infer types per constant binding. Comparisons produce an untyped boolean;
  // they must not turn an unrelated group into this named type's evidence.
  try {
    for (let pass = 0; pass <= members.length; pass++) {
      let changed = false
      for (const file of files)
        for (const group of file.constants)
          for (const member of group.members) {
            if (++discoveryWork > workLimit) return undefined
            const inferred =
              member.typeName === undefined
                ? typeExpression(member.expression, file)
                : typeNames.has(member.typeName) && !file.importedNames.has(member.typeName)
                  ? declaredTypes(member.typeName)
                  : /^[\p{L}_][\p{L}\p{N}_]*\.[\p{L}_][\p{L}\p{N}_]*$/u.test(member.typeName)
                    ? [qualifiedType(member.typeName, file)]
                    : []
            const known = memberTypes.get(member)!
            for (const name of inferred)
              if (!known.has(name)) {
                known.add(name)
                changed = true
              }
          }
      if (!changed) break
    }
  } catch {
    return undefined
  }
  const relevantTypes = new Map(
    constants.map((group) => [group, new Set(group.members.flatMap((member) => [...memberTypes.get(member)!]))])
  )
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
              !(builtins.has(r.name) && !packageNames.has(r.name) && !file.importedNames.has(r.name)) &&
              !(
                ["iota", "true", "false", "min", "max"].includes(r.name) &&
                !packageNames.has(r.name) &&
                !file.importedNames.has(r.name)
              )
          )
          .map((reference) => {
            if (file.importedNames.has(reference.name)) return { kind: "unsupported" as const, name: reference.name }
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
  return {
    declarations,
    imports: new Map(),
    discoveryWork,
    constantTypes: new Map(
      [...relevantTypes].map(([group, names]) => [
        group.artifact.name,
        [...names].map((name) => qualifiedTypes.get(name) ?? { name })
      ])
    )
  }
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
