import { Parser, Python, type SyntaxNode, descendants, sameSyntaxNode } from "../native-parser.ts"
import { moduleScope, scopeBindings, identityFor } from "./scope-bindings.ts"

export const rootFor = (source: string): SyntaxNode => {
  const parser = new Parser()
  parser.setLanguage(Python)
  return (parser.parse(source) as unknown as { rootNode: SyntaxNode }).rootNode
}
const standard = new Set(["dataclasses", "typing", "typing_extensions", "pydantic", "__future__"])
export type PythonImport = {
  readonly path: string
  readonly name: string
  readonly module: boolean
  readonly prefix: string
}
export const evaluatedNodes = (node: SyntaxNode): SyntaxNode[] => [
  node,
  ...node.namedChildren
    .filter(
      (child) =>
        !(node.type === "function_definition" && child.type === "block") &&
        !(node.type === "lambda" && sameSyntaxNode(child, node.childForFieldName("body")))
    )
    .flatMap(evaluatedNodes)
]
const declarativeImportCalls = new Set([
  "dataclasses.dataclass",
  "dataclasses.field",
  "pydantic.Field",
  "pydantic.ConfigDict",
  "pydantic.field_validator",
  "pydantic.model_validator",
  "pydantic.validator",
  "pydantic.root_validator",
  "typing.NewType",
  "typing_extensions.NewType"
])
/** Class bodies, decorators and defaults execute; function/lambda bodies do not. */
export const unknownEvaluatedCall = (
  node: SyntaxNode,
  bindings: ReadonlyMap<string, string>,
  shadowed: ReadonlySet<string>
): boolean => {
  if (
    node.type === "class_definition" &&
    node
      .childForFieldName("superclasses")
      ?.namedChildren.some(
        (base) => base.type === "keyword_argument" && base.childForFieldName("name")?.text === "metaclass"
      )
  )
    return true
  if (node.type === "call" || node.type === "decorator") {
    const marker = node.type === "decorator" ? node.namedChildren[0] : node
    const name = marker?.type === "call" ? (marker.childForFieldName("function")?.text ?? "") : (marker?.text ?? "")
    const identity = identityFor(name, bindings)
    const builtinDecorator =
      node.type === "decorator" && !shadowed.has(name) && ["classmethod", "staticmethod", "property"].includes(name)
    if (!builtinDecorator && !declarativeImportCalls.has(identity ?? "")) return true
  }
  return node.namedChildren.some((child) => {
    if (node.type === "function_definition" && child.type === "block") return false
    if (node.type === "lambda" && sameSyntaxNode(child, node.childForFieldName("body"))) return false
    if (node.type === "class_definition" && child.type === "block") {
      const scoped = new Map(bindings)
      const localNames = new Set(shadowed)
      for (const member of child.namedChildren)
        for (const binding of scopeBindings(member)) {
          scoped.delete(binding.name)
          localNames.add(binding.name)
        }
      return unknownEvaluatedCall(child, scoped, localNames)
    }
    return unknownEvaluatedCall(child, bindings, shadowed)
  })
}
const namespaceTargets = (node: SyntaxNode): SyntaxNode[] =>
  ["attribute", "subscript"].includes(node.type) ? [node] : node.namedChildren.flatMap(namespaceTargets)
/** Dynamic loader or imported-namespace mutation cannot establish a static target. */
export const unavailableImportNamespace = (root: SyntaxNode, bindings: ReadonlyMap<string, string>): boolean =>
  unknownEvaluatedCall(root, bindings, new Set(moduleScope(root).facts.map((fact) => fact.name))) ||
  evaluatedNodes(root).some((node) => {
    if (["assignment", "augmented_assignment", "named_expression", "delete_statement"].includes(node.type)) {
      const target = node.childForFieldName("left")
      const targets =
        node.type === "delete_statement"
          ? node.namedChildren.flatMap(namespaceTargets)
          : target === null
            ? []
            : namespaceTargets(target)
      if (
        targets.some((target) =>
          moduleScope(root).facts.some(
            (fact) => fact.identity !== undefined && fact.name === target.text.split(/[.[]/u)[0]!
          )
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
export const pythonImportsForRoot = (root: SyntaxNode): ReadonlyMap<string, PythonImport> | undefined => {
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
export const pythonImports = (source: string): ReadonlyMap<string, PythonImport> | undefined =>
  pythonImportsForRoot(rootFor(source))
/** Initializer authority cannot assume the effects of executable loader/path setup. */
export const staticPackageAuthority = (source: string): boolean => {
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
      if (!declarativeImportCalls.has(identity ?? "")) return false
    }
  }
  return true
}
