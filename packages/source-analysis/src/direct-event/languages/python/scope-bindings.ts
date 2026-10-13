import type { SyntaxNode } from "../native-parser.ts"

export const assignment = (node: SyntaxNode): SyntaxNode | undefined =>
  node.type === "expression_statement" && node.namedChildren[0]?.type === "assignment"
    ? node.namedChildren[0]
    : undefined
export const classNode = (node: SyntaxNode): SyntaxNode | undefined =>
  node.type === "class_definition"
    ? node
    : node.type === "decorated_definition"
      ? (node.childForFieldName("definition") ?? undefined)
      : undefined
export const boundName = (node: SyntaxNode): string | undefined => {
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
export const scopeBindings = (node: SyntaxNode, staticImport = false): Binding[] =>
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
export const identities = (facts: ReadonlyArray<Binding>): Map<string, string> => {
  const bindings = new Map<string, string>()
  const counts = new Map<string, number>()
  for (const fact of facts) {
    counts.set(fact.name, (counts.get(fact.name) ?? 0) + 1)
    if (fact.identity !== undefined) bindings.set(fact.name, fact.identity)
  }
  for (const [name, count] of counts) if (count !== 1) bindings.delete(name)
  return bindings
}
export const identityFor = (text: string, bindings: ReadonlyMap<string, string>): string | undefined => {
  const [head, ...tail] = text.split(".")
  const identity = head === undefined ? undefined : bindings.get(head)
  return identity === undefined ? undefined : [identity, ...tail].join(".")
}
export const typingMarker = (identity: string | undefined, marker: string): boolean =>
  identity === `typing.${marker}` || identity === `typing_extensions.${marker}`
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
export const moduleScope = (root: SyntaxNode) => {
  const direct = identities(
    root.namedChildren.filter((node) => node.type !== "if_statement").flatMap((node) => scopeBindings(node))
  )
  const staticBlocks = new Set(
    root.namedChildren.filter((node) => staticTypeBlock(node, direct)).map((node) => node.startIndex)
  )
  const facts = root.namedChildren.flatMap((node) => scopeBindings(node, staticBlocks.has(node.startIndex)))
  return { facts, bindings: identities(facts), staticBlocks }
}
