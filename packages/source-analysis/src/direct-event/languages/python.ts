import { createHash } from "node:crypto"
import { createPythonGraphPreparation } from "./python-module-context.ts"
import { LANGUAGE_EXTENSIONS } from "@hapsland/native-observation/direct-event/languages/path-language"
import { Parser, Python, type SyntaxNode, descendants } from "./native-parser.ts"
import {
  MAX_TYPE_DECLARATIONS,
  type GraphDeclaration,
  type GraphReference,
  type LanguageAdapter,
  type TypeExtractionFailure
} from "./contracts.ts"

const location = (node: SyntaxNode) => ({
  start: { line: node.startPosition.row + 1, column: node.startPosition.column + 1 },
  end: { line: node.endPosition.row + 1, column: node.endPosition.column + 1 }
})
const assignment = (node: SyntaxNode): SyntaxNode | undefined =>
  node.type === "expression_statement" && node.namedChildren[0]?.type === "assignment"
    ? node.namedChildren[0]
    : undefined
const classNode = (node: SyntaxNode): SyntaxNode | undefined =>
  node.type === "class_definition"
    ? node
    : node.type === "decorated_definition"
      ? (node.childForFieldName("definition") ?? undefined)
      : undefined
const boundName = (node: SyntaxNode): string | undefined => {
  if (node.type === "type_alias_statement") {
    const wrapped = node.childForFieldName("left")
    const left = wrapped?.type === "type" ? wrapped.namedChildren[0] : wrapped
    return left?.type === "generic_type" ? left.namedChildren[0]?.text : left?.text
  }
  return (
    classNode(node)?.childForFieldName("name")?.text ??
    node.childForFieldName("name")?.text ??
    assignment(node)?.childForFieldName("left")?.text
  )
}
const rootFor = (source: string): SyntaxNode => {
  const parser = new Parser()
  parser.setLanguage(Python)
  return (parser.parse(source) as unknown as { rootNode: SyntaxNode }).rootNode
}
const standard = new Set(["dataclasses", "typing", "typing_extensions", "pydantic", "__future__"])
/** Visit bindings evaluated in this lexical scope, excluding nested bodies. */
const scopedNodes = (node: SyntaxNode): SyntaxNode[] => {
  if (node.type === "lambda") return node.childForFieldName("parameters")?.namedChildren.flatMap(scopedNodes) ?? []
  const nested = ["class_definition", "function_definition"].includes(node.type)
  return [node, ...node.namedChildren.filter((child) => !(nested && child.type === "block")).flatMap(scopedNodes)]
}
const targetNames = (node: SyntaxNode): string[] =>
  node.type === "identifier"
    ? [node.text]
    : ["attribute", "subscript"].includes(node.type)
      ? node.namedChildren[0]
        ? targetNames(node.namedChildren[0])
        : []
      : node.namedChildren.flatMap(targetNames)
type Binding = { readonly name: string; readonly identity?: string }
const scopeBindings = (node: SyntaxNode, staticImport = false): Binding[] =>
  scopedNodes(node).flatMap((child): Binding[] => {
    if (["import_statement", "import_from_statement"].includes(child.type)) {
      const module = child.childForFieldName("module_name")?.text
      return child.namedChildren.flatMap((part): Binding[] => {
        if (part.text === module || part.type === "wildcard_import") return []
        const target = part.type === "aliased_import" ? part.childForFieldName("name")?.text : part.text
        const name = part.type === "aliased_import" ? part.childForFieldName("alias")?.text : target?.split(".")[0]
        if (!target || !name) return []
        const identity = module === undefined ? target : `${module}.${target}`
        return [{ name, ...(staticImport || child.parent?.type === "module" ? { identity } : {}) }]
      })
    }
    if (["class_definition", "function_definition", "type_alias_statement"].includes(child.type)) {
      const name = boundName(child)
      return name === undefined ? [] : [{ name }]
    }
    if (child.type === "for_statement") {
      const target = child.childForFieldName("left")
      return target === null ? [] : targetNames(target).map((name) => ({ name }))
    }
    if (child.type === "as_pattern") {
      const target =
        child.childForFieldName("alias") ??
        (child.parent?.type === "case_pattern" ? child.namedChildren.at(-1) : undefined)
      return target === null || target === undefined ? [] : targetNames(target).map((name) => ({ name }))
    }
    if (child.type === "splat_pattern") return child.namedChildren.flatMap(targetNames).map((name) => ({ name }))
    if (child.type === "case_pattern" && child.namedChildren.length === 1) {
      const pattern = child.namedChildren[0]
      if (pattern?.type === "dotted_name" && pattern.namedChildren.length === 1)
        return [{ name: pattern.namedChildren[0]!.text }]
    }
    if (["assignment", "augmented_assignment", "named_expression"].includes(child.type)) {
      const target = child.childForFieldName(child.type === "named_expression" ? "name" : "left")
      return target === null ? [] : targetNames(target).map((name) => ({ name }))
    }
    return child.type === "delete_statement" ? child.namedChildren.flatMap(targetNames).map((name) => ({ name })) : []
  })
/** Imported identity is invalidated by every competing lexical binding. */
const identities = (facts: ReadonlyArray<Binding>): Map<string, string> => {
  const bindings = new Map<string, string>()
  const counts = new Map<string, number>()
  for (const fact of facts) {
    counts.set(fact.name, (counts.get(fact.name) ?? 0) + 1)
    if (fact.identity !== undefined) bindings.set(fact.name, fact.identity)
  }
  for (const [name, count] of counts) if (count !== 1) bindings.delete(name)
  return bindings
}
const identityFor = (text: string, bindings: ReadonlyMap<string, string>): string | undefined => {
  const [head, ...tail] = text.split(".")
  const identity = head === undefined ? undefined : bindings.get(head)
  return identity === undefined ? undefined : [identity, ...tail].join(".")
}
const typingMarker = (identity: string | undefined, marker: string): boolean =>
  identity === `typing.${marker}` || identity === `typing_extensions.${marker}`
const primitives = new Set([
  "str",
  "int",
  "float",
  "bool",
  "bytes",
  "object",
  "None",
  "list",
  "dict",
  "set",
  "frozenset",
  "tuple"
])
const typingLeaves = new Set(["Any", "Never", "NoReturn", "Self", "LiteralString"])
const typingContainers = new Set([
  "Optional",
  "Union",
  "List",
  "Dict",
  "Set",
  "FrozenSet",
  "Tuple",
  "Sequence",
  "Mapping",
  "Iterable",
  "ClassVar",
  "Final",
  "Required",
  "NotRequired",
  "ReadOnly",
  "Annotated",
  "Literal",
  "Generic"
])
type Scope = {
  readonly bindings: ReadonlyMap<string, string>
  readonly locals: ReadonlySet<string>
  readonly parameters: ReadonlySet<string>
  readonly shadowed: ReadonlySet<string>
}
const scopedIdentity = (text: string, scope: Scope): string | undefined => {
  const head = text.split(".")[0]!
  return scope.parameters.has(head) || scope.shadowed.has(head) ? undefined : identityFor(text, scope.bindings)
}
const references = (node: SyntaxNode, scope: Scope): GraphReference[] => {
  if (node.type === "type") return node.namedChildren.flatMap((child) => references(child, scope))
  if (["identifier", "attribute"].includes(node.type)) {
    const name = node.text
    if (scope.parameters.has(name)) return []
    if (scope.shadowed.has(name.split(".")[0]!)) return [{ kind: "unsupported", name: "binding" }]
    const identity = identityFor(name, scope.bindings)
    if (identity === undefined && !scope.locals.has(name) && primitives.has(name)) return []
    if (
      identity !== undefined &&
      /^(typing|typing_extensions)\./u.test(identity) &&
      (typingLeaves.has(identity.split(".")[1] ?? "") || typingContainers.has(identity.split(".")[1] ?? ""))
    )
      return []
    if (["pydantic.BaseModel", "typing.TypedDict", "typing_extensions.TypedDict"].includes(identity ?? "")) return []
    return [{ kind: "named", name }]
  }
  if (node.type === "string") {
    const match = /^(?:[uU])?(['"])([^'"\n\\]+)\1$/u.exec(node.text)
    if (match?.[2] === undefined) return [{ kind: "unsupported", name: "annotation" }]
    const parsed = rootFor(`value: ${match[2]}`)
    const type = assignment(parsed.namedChildren[0]!)?.childForFieldName("type")
    return parsed.hasError || type === null || type === undefined
      ? [{ kind: "unsupported", name: "annotation" }]
      : references(type, scope)
  }
  if (node.type === "none") return []
  if (node.type === "union_type") return node.namedChildren.flatMap((child) => references(child, scope))
  if (node.type === "binary_operator" && node.text.includes("|"))
    return node.namedChildren.flatMap((child) => references(child, scope))
  if (["generic_type", "subscript"].includes(node.type)) {
    const children = node.namedChildren
    const base = children[0]
    if (base === undefined) return [{ kind: "unsupported", name: "annotation" }]
    if (scope.parameters.has(base.text.split(".")[0]!)) return [{ kind: "unsupported", name: "annotation" }]
    const identity = scopedIdentity(base.text, scope)
    const args = children
      .slice(1)
      .flatMap((child) => (child.type === "type_parameter" ? child.namedChildren : [child]))
      .map((child) => (child.type === "type" && child.namedChildren.length === 1 ? child.namedChildren[0]! : child))
    if (typingMarker(identity, "Literal"))
      return args.every(
        (arg) =>
          (arg.type === "string" && staticValue(arg)) ||
          ["integer", "true", "false", "none"].includes(arg.type) ||
          (arg.type === "unary_operator" &&
            /^[+-]/u.test(arg.text) &&
            arg.childForFieldName("argument")?.type === "integer")
      )
        ? []
        : [{ kind: "unsupported", name: "Literal" }]
    if (typingMarker(identity, "Annotated")) {
      // Preserve metadata source; unknown executable metadata cannot establish closure.
      return args.flatMap((arg, index) => (index === 0 ? references(arg, scope) : metadataReferences(arg, scope)))
    }
    return [...references(base, scope), ...args.flatMap((arg) => references(arg, scope))]
  }
  if (["type_parameter", "tuple", "list"].includes(node.type))
    return node.namedChildren.flatMap((child) => references(child, scope))
  return [{ kind: "unsupported", name: "annotation" }]
}
const staticValue = (node: SyntaxNode): boolean =>
  (node.type === "string" && !node.namedChildren.some((child) => child.type === "interpolation")) ||
  ["integer", "float", "true", "false", "none"].includes(node.type) ||
  (["list", "tuple", "dictionary", "pair", "unary_operator"].includes(node.type) &&
    node.namedChildren.every(staticValue))
const metadataReferences = (node: SyntaxNode, scope: Scope): GraphReference[] => {
  if (staticValue(node)) return []
  if (node.type !== "call") return [{ kind: "unsupported", name: "metadata" }]
  const identity = scopedIdentity(node.childForFieldName("function")?.text ?? "", scope)
  if (!["pydantic.Field", "dataclasses.field", "pydantic.ConfigDict"].includes(identity ?? ""))
    return [{ kind: "unsupported", name: "metadata" }]
  return (node.childForFieldName("arguments")?.namedChildren ?? []).flatMap((arg): GraphReference[] => {
    if (arg.type !== "keyword_argument") return staticValue(arg) ? [] : [{ kind: "unsupported", name: "metadata" }]
    const key = arg.childForFieldName("name")?.text
    const value = arg.childForFieldName("value")
    if (!value) return [{ kind: "unsupported", name: "metadata" }]
    if (key === "default_factory" || (identity === "pydantic.ConfigDict" && key === "ignored_types"))
      return references(value, scope)
    return staticValue(value) ? [] : [{ kind: "unsupported", name: "metadata" }]
  })
}
const fieldsFor = (cls: SyntaxNode): SyntaxNode[] =>
  (cls.childForFieldName("body")?.namedChildren ?? []).flatMap((node) => {
    const value = assignment(node)
    return value?.childForFieldName("type") && value.childForFieldName("left")?.type === "identifier" ? [value] : []
  })
/** Only a positive, unshadowed typing.TYPE_CHECKING guard with imports is static authority. */
const staticTypeBlock = (node: SyntaxNode, bindings: ReadonlyMap<string, string>): boolean => {
  if (node.type !== "if_statement") return false
  const condition = node.childForFieldName("condition")
  const consequence = node.childForFieldName("consequence")
  return (
    condition !== null &&
    typingMarker(identityFor(condition.text, bindings), "TYPE_CHECKING") &&
    consequence !== null &&
    node.namedChildren.every((child) => child.startIndex === condition.startIndex || child.type === "block") &&
    node.namedChildren.filter((child) => child.type === "block").length === 1 &&
    consequence.namedChildren.every((child) =>
      ["import_statement", "import_from_statement", "comment", "pass_statement"].includes(child.type)
    )
  )
}
const moduleScope = (root: SyntaxNode) => {
  const direct = identities(
    root.namedChildren.filter((node) => node.type !== "if_statement").flatMap((node) => scopeBindings(node))
  )
  const staticBlocks = new Set(
    root.namedChildren.filter((node) => staticTypeBlock(node, direct)).map((node) => node.startIndex)
  )
  const facts = root.namedChildren.flatMap((node) => scopeBindings(node, staticBlocks.has(node.startIndex)))
  return { facts, bindings: identities(facts), staticBlocks }
}
export type PythonImport = {
  readonly path: string
  readonly name: string
  readonly module: boolean
  readonly prefix: string
}
const evaluatedNodes = (node: SyntaxNode): SyntaxNode[] => [
  node,
  ...node.namedChildren
    .filter((child) => !(node.type === "function_definition" && child.type === "block"))
    .flatMap(evaluatedNodes)
]
/** Dynamic loader or imported-namespace mutation cannot establish a static target. */
const unavailableImportNamespace = (root: SyntaxNode, bindings: ReadonlyMap<string, string>): boolean =>
  root.namedChildren
    .filter((node) => !["class_definition", "function_definition", "decorated_definition"].includes(node.type))
    .flatMap(evaluatedNodes)
    .some((node) => {
      if (node.type !== "call") return false
      const name = node.childForFieldName("function")?.text ?? ""
      return !["typing.NewType", "typing_extensions.NewType"].includes(identityFor(name, bindings) ?? "")
    }) ||
  evaluatedNodes(root).some((node) => {
    if (["assignment", "augmented_assignment", "named_expression", "delete_statement"].includes(node.type)) {
      const targets = node.type === "delete_statement" ? node.namedChildren : [node.childForFieldName("left")]
      if (
        targets.some(
          (target) => target !== null && target.type !== "identifier" && bindings.has(target.text.split(/[.[]/u)[0]!)
        )
      )
        return true
    }
    if (node.type !== "call") return false
    const name = node.childForFieldName("function")?.text ?? ""
    const identity = identityFor(name, bindings) ?? name
    return (
      /^(?:sys\.(?:path|meta_path|path_hooks|modules)(?:[.[]|$)|importlib\.|builtins\.(?:__import__|exec|eval|setattr|delattr))/u.test(
        identity
      ) || /^(?:__import__|exec|eval|globals|locals|setattr|delattr)(?:$|\()/u.test(identity)
    )
  })
export const pythonImports = (source: string): ReadonlyMap<string, PythonImport> | undefined => {
  const root = rootFor(source)
  if (root.hasError) return undefined
  const { facts, bindings, staticBlocks } = moduleScope(root)
  if (descendants(root).some((node) => node.type === "wildcard_import")) return undefined
  if (
    facts.some((fact) => ["__path__", "__getattr__"].includes(fact.name)) ||
    unavailableImportNamespace(root, bindings)
  )
    return undefined
  const statements = root.namedChildren.flatMap((node) =>
    staticBlocks.has(node.startIndex) ? (node.childForFieldName("consequence")?.namedChildren ?? []) : [node]
  )
  const result = new Map<string, PythonImport>()
  for (const node of statements) {
    if (!["import_statement", "import_from_statement"].includes(node.type)) continue
    const module = node.childForFieldName("module_name")?.text
    for (const part of node.namedChildren) {
      if (part.text === module || part.type === "wildcard_import") continue
      const target = part.type === "aliased_import" ? part.childForFieldName("name")?.text : part.text
      const alias = part.type === "aliased_import" ? part.childForFieldName("alias")?.text : undefined
      const name = alias ?? target?.split(".")[0]
      if (!target || !name || !bindings.has(name)) continue
      if (standard.has((module ?? target).split(".")[0]!)) continue
      result.set(name, {
        path: module ?? target,
        name: module === undefined ? "" : target,
        module: module === undefined,
        prefix: module === undefined && alias === undefined ? target : name
      })
    }
  }
  return result
}
/** Initializer authority cannot assume the effects of executable loader/path setup. */
const staticPackageAuthority = (source: string): boolean => {
  const root = rootFor(source)
  if (root.hasError || pythonImports(source) === undefined) return false
  const { bindings, staticBlocks } = moduleScope(root)
  const statements = root.namedChildren.flatMap((node) =>
    staticBlocks.has(node.startIndex) ? (node.childForFieldName("consequence")?.namedChildren ?? []) : [node]
  )
  for (const node of statements) {
    if (
      [
        "if_statement",
        "for_statement",
        "while_statement",
        "try_statement",
        "with_statement",
        "delete_statement"
      ].includes(node.type)
    )
      return false
    for (const evaluated of evaluatedNodes(node)) {
      if (
        ["assignment", "augmented_assignment", "named_expression"].includes(evaluated.type) &&
        evaluated.childForFieldName("left")?.type !== "identifier"
      )
        return false
      if (evaluated.type !== "call") continue
      const identity = identityFor(evaluated.childForFieldName("function")?.text ?? "", bindings)
      if (
        ![
          "dataclasses.dataclass",
          "dataclasses.field",
          "pydantic.Field",
          "pydantic.ConfigDict",
          "typing.NewType",
          "typing_extensions.NewType"
        ].includes(identity ?? "")
      )
        return false
    }
  }
  return true
}

const importedReference = (name: string, imports: ReadonlyMap<string, PythonImport>) => {
  const [head, ...tail] = name.split(".")
  const imported = imports.get(head ?? "")
  if (imported === undefined) return undefined
  if (imported.module) {
    if (!name.startsWith(`${imported.prefix}.`)) return undefined
    const rest = name.slice(imported.prefix.length + 1).split(".")
    return { path: imported.path, name: rest.join(".") }
  }
  return { path: imported.path, name: [imported.name, ...tail].join(".") }
}
const parsePython = (path: string, source: string): TypeExtractionFailure | readonly GraphDeclaration[] => {
  const root = rootFor(source)
  if (root.hasError) return { status: "unsupported", reason: "parse", units: [] }
  const { facts: bindingFacts, bindings, staticBlocks } = moduleScope(root)
  const locals = new Set(bindingFacts.map((fact) => fact.name))
  const uncertainBindings = root.namedChildren.some(
    (node) =>
      (["if_statement", "for_statement", "while_statement", "try_statement", "with_statement"].includes(node.type) &&
        !staticBlocks.has(node.startIndex)) ||
      (assignment(node) !== undefined && assignment(node)?.childForFieldName("left")?.type !== "identifier")
  )
  const counts = new Map<string, number>()
  for (const fact of bindingFacts) counts.set(fact.name, (counts.get(fact.name) ?? 0) + 1)
  const wildcard = descendants(root).some((node) => node.type === "wildcard_import")
  if (wildcard) bindings.clear()
  const classes = root.namedChildren.flatMap((node) => {
    const cls = classNode(node)
    return cls?.type === "class_definition" ? [{ node, cls, name: cls.childForFieldName("name")?.text ?? "" }] : []
  })
  if (classes.length > MAX_TYPE_DECLARATIONS) return { status: "unsupported", reason: "declaration-limit", units: [] }
  const imports = pythonImports(source) ?? new Map<string, PythonImport>()
  const admitted = new Set<string>()
  for (let pass = 0; pass <= classes.length; pass++) {
    let changed = false
    for (const { node, cls, name } of classes) {
      const bases = cls.childForFieldName("superclasses")?.namedChildren ?? []
      const decorated = node.namedChildren
        .filter((child) => child.type === "decorator")
        .some((child) => {
          const value = child.namedChildren[0]
          return (
            identityFor(
              value?.type === "call" ? (value.childForFieldName("function")?.text ?? "") : (value?.text ?? ""),
              bindings
            ) === "dataclasses.dataclass"
          )
        })
      if (
        !admitted.has(name) &&
        (fieldsFor(cls).length > 0 ||
          decorated ||
          bases.some(
            (base) =>
              admitted.has(
                ["generic_type", "subscript"].includes(base.type) ? (base.namedChildren[0]?.text ?? "") : base.text
              ) ||
              importedReference(
                ["generic_type", "subscript"].includes(base.type) ? (base.namedChildren[0]?.text ?? "") : base.text,
                imports
              ) !== undefined ||
              ["pydantic.BaseModel", "typing.TypedDict", "typing_extensions.TypedDict"].includes(
                identityFor(base.text, bindings) ?? ""
              )
          ))
      ) {
        admitted.add(name)
        changed = true
      }
    }
    if (!changed) break
  }
  const declarations: GraphDeclaration[] = []
  for (const node of root.namedChildren) {
    const cls = classNode(node)
    const value = assignment(node)
    let name = cls?.childForFieldName("name")?.text
    let kind: "class" | "type-alias" = "class"
    const expressions: SyntaxNode[] = []
    const defining = [] as ReturnType<typeof location>[]
    const extra: GraphReference[] = wildcard || uncertainBindings ? [{ kind: "unsupported", name: "namespace" }] : []
    const parameters = new Set<string>()
    const collectParameters = (container: SyntaxNode | null | undefined) => {
      for (const wrapped of container?.namedChildren ?? []) {
        const parameter = wrapped.type === "type" ? wrapped.namedChildren[0] : wrapped
        const constrained = parameter?.type === "constrained_type"
        const binder = constrained ? parameter.namedChildren[0]?.namedChildren[0] : parameter
        if (binder?.type === "identifier") parameters.add(binder.text)
        else extra.push({ kind: "unsupported", name: "type-parameter" })
        if (constrained) expressions.push(...parameter.namedChildren.slice(1))
      }
    }
    collectParameters((cls ?? node).childForFieldName("type_parameters"))
    const classLocals = new Set(locals)
    const classBindings = new Map(bindings)
    const shadowed = new Set<string>()
    for (const member of cls?.childForFieldName("body")?.namedChildren ?? []) {
      const bareAnnotation = assignment(member)?.childForFieldName("right") === null
      for (const { name: local } of scopeBindings(member)) {
        if (!bareAnnotation) shadowed.add(local)
        classLocals.add(local)
        classBindings.delete(local)
      }
    }
    const scope = { bindings: classBindings, locals: classLocals, parameters, shadowed }
    if (cls?.type === "class_definition" && name && admitted.has(name)) {
      const body = cls.childForFieldName("body")
      const header = location(node)
      const bodyStart = body === null ? header.end : location(body).start
      // Do not include indentation of the first method/validator in the header.
      const preceding =
        body === null ? "" : source.slice(source.lastIndexOf("\n", body.startIndex - 1) + 1, body.startIndex)
      defining.push({ start: header.start, end: preceding.trim() === "" ? { ...bodyStart, column: 1 } : bodyStart })
      for (const field of fieldsFor(cls)) {
        defining.push(location(field))
        const annotation = field.childForFieldName("type")
        if (annotation) expressions.push(annotation)
        const defaultValue = field.childForFieldName("right")
        // Defaults do not add helper traversal; dynamic values remain uncertain.
        if (defaultValue && !staticValue(defaultValue)) extra.push(...metadataReferences(defaultValue, scope))
      }
      for (const base of cls.childForFieldName("superclasses")?.namedChildren ?? []) {
        if (base.type === "keyword_argument") {
          if (
            base.childForFieldName("name")?.text !== "total" ||
            !base.childForFieldName("value") ||
            !staticValue(base.childForFieldName("value")!)
          )
            extra.push({ kind: "unsupported", name: "base" })
        } else if (parameters.has(base.text.split(".")[0]!)) extra.push({ kind: "unsupported", name: "base" })
        else extra.push(...references(base, { bindings, locals, parameters, shadowed: new Set() }))
      }
      for (const decorator of node.namedChildren.filter((child) => child.type === "decorator")) {
        const marker = decorator.namedChildren[0]
        const identity = identityFor(
          marker?.type === "call" ? (marker.childForFieldName("function")?.text ?? "") : (marker?.text ?? ""),
          bindings
        )
        if (
          identity !== "dataclasses.dataclass" ||
          (marker?.type === "call" &&
            !(marker.childForFieldName("arguments")?.namedChildren ?? []).every(
              (arg) =>
                arg.type === "keyword_argument" &&
                arg.childForFieldName("value") !== null &&
                staticValue(arg.childForFieldName("value")!)
            ))
        )
          extra.push({ kind: "unsupported", name: "decorator" })
      }
      for (const member of body?.namedChildren ?? []) {
        if (
          ![
            "expression_statement",
            "function_definition",
            "decorated_definition",
            "class_definition",
            "pass_statement",
            "comment"
          ].includes(member.type)
        ) {
          defining.push(location(member))
          extra.push({ kind: "unsupported", name: "schema-behavior" })
        }
        const config = assignment(member)
        const target = config?.childForFieldName("left")
        const schemaMutation = config && (target?.type !== "identifier" || target.text === "__annotations__")
        const untypedValue = config?.childForFieldName("type") ? undefined : config?.childForFieldName("right")
        const expression = config
          ? undefined
          : member.type === "expression_statement"
            ? member.namedChildren[0]
            : undefined
        if (
          schemaMutation ||
          (untypedValue &&
            config?.childForFieldName("left")?.text !== "model_config" &&
            !["identifier", "attribute"].includes(untypedValue.type) &&
            !staticValue(untypedValue)) ||
          (expression && !staticValue(expression))
        ) {
          defining.push(location(member))
          extra.push({ kind: "unsupported", name: "schema-behavior" })
        }
        if (config?.childForFieldName("left")?.text === "model_config") {
          defining.push(location(member))
          const right = config.childForFieldName("right")
          if (right) extra.push(...metadataReferences(right, scope))
        }
        if (member.type === "class_definition" && member.childForFieldName("name")?.text === "Config") {
          defining.push(location(member))
          extra.push({ kind: "unsupported", name: "Config" })
        }
        const method = member.type === "decorated_definition" ? member.childForFieldName("definition") : member
        if (
          method?.type === "function_definition" &&
          (member.type === "decorated_definition" ||
            ["__init__", "__new__", "__init_subclass__"].includes(method.childForFieldName("name")?.text ?? ""))
        )
          extra.push({ kind: "unsupported", name: "behavior" })
      }
    } else {
      kind = "type-alias"
      name = value?.childForFieldName("left")?.text
      const right = value?.childForFieldName("right")
      const annotation = value?.childForFieldName("type")?.text
      if (name && right && typingMarker(identityFor(annotation ?? "", bindings), "TypeAlias")) expressions.push(right)
      else if (
        name &&
        right?.type === "call" &&
        typingMarker(identityFor(right.childForFieldName("function")?.text ?? "", bindings), "NewType")
      ) {
        const args = right.childForFieldName("arguments")?.namedChildren ?? []
        if (args.length !== 2 || !args[0] || !args[1] || !["'" + name + "'", '"' + name + '"'].includes(args[0].text))
          continue
        expressions.push(args[1])
      } else if (node.type === "type_alias_statement") {
        const leftNode = node.childForFieldName("left")
        const left = leftNode?.type === "type" ? leftNode.namedChildren[0] : leftNode
        const target = node.childForFieldName("right")
        name = left?.namedChildren[0]?.text ?? left?.text
        if (left?.type === "generic_type") {
          name = left.namedChildren[0]?.text
          for (const container of left.namedChildren.slice(1)) collectParameters(container)
        }
        if (target) expressions.push(target)
      } else continue
    }
    if (name !== undefined && (counts.get(name) ?? 0) > 1) extra.push({ kind: "unsupported", name: "namespace" })
    if (!name || !/^[\p{ID_Start}_][\p{ID_Continue}]*$/u.test(name)) continue
    const rendered = source.slice(node.startIndex, node.endIndex)
    const refs = [...extra, ...expressions.flatMap((expression) => references(expression, scope))]
    declarations.push({
      artifact: {
        path,
        id: `${path}:${kind}:${name}`,
        kind,
        name,
        source: rendered,
        sourceHash: createHash("sha256").update(rendered).digest("hex")
      },
      references: [...new Map(refs.map((ref) => [`${ref.kind}:${ref.name}`, ref])).values()],
      exported: true,
      location: location(node),
      ...(kind === "class" ? { selectionLocations: defining } : {})
    })
  }
  if (declarations.length > MAX_TYPE_DECLARATIONS)
    return { status: "unsupported", reason: "declaration-limit", units: [] }
  if (new Set(declarations.map((declaration) => declaration.artifact.name)).size !== declarations.length)
    return { status: "unsupported", reason: "declaration-merge", units: [] }
  return declarations.length === 0 ? { status: "unsupported", reason: "no-declarations", units: [] } : declarations
}
const parseTypes: LanguageAdapter["parseTypes"] = (path, source) => {
  try {
    return parsePython(path, source)
  } catch {
    return { status: "unsupported", reason: "parse", units: [] }
  }
}
export const inspectPython: LanguageAdapter["inspect"] = (path, source) => {
  const parsed = parseTypes(path, source)
  const imports = pythonImports(source)
  if (imports === undefined || ("status" in parsed && parsed.reason !== "no-declarations")) return undefined
  const declarations = "status" in parsed ? [] : parsed
  if (declarations.length === 0 && imports.size === 0) return undefined
  const graphImports = new Map<string, { readonly path: string; readonly name: string }>()
  for (const [name, imported] of imports) {
    graphImports.set(name, {
      path: imported.module && imported.prefix.includes(".") ? imported.path.split(".")[0]! : imported.path,
      name: imported.name
    })
  }
  for (const declaration of declarations)
    for (const reference of declaration.references) {
      const imported = importedReference(reference.name, imports)
      if (imported !== undefined) graphImports.set(reference.name, imported)
    }
  return {
    declarations: new Map(declarations.map((declaration) => [declaration.artifact.name, declaration])),
    imports: graphImports
  }
}
export const pythonAdapter: LanguageAdapter = {
  id: "python",
  extensions: LANGUAGE_EXTENSIONS.python,
  displayName: "Python",
  probe: { path: "doctor.py", source: "class DoctorProbe:\n    ready: bool" },
  parseTypes,
  inspect: inspectPython,
  hasImports: (source) => (pythonImports(source)?.size ?? 0) > 0,
  combinedPreflight: (_path, _source, bound) => bound,
  prepareGraph: createPythonGraphPreparation(inspectPython, staticPackageAuthority, (source, name) =>
    moduleScope(rootFor(source)).facts.some((fact) => fact.name === name)
  )
}
