import { descendants, sameSyntaxNode, typeScriptRoot, type SyntaxNode } from "./native-parser.ts"
import { createHash } from "node:crypto"
import { extname } from "node:path"

import type {
  FunctionReference,
  FunctionArtifact,
  FunctionDeclarationFact,
  TypeDeclarationFact,
  FunctionFileAnalysis
} from "./function-facts.ts"
const extensions = new Set([".ts", ".tsx", ".mts", ".cts"])
const intrinsicTypes = new Set([
  "Array",
  "ReadonlyArray",
  "Promise",
  "Record",
  "Partial",
  "Required",
  "Pick",
  "Omit",
  "Exclude",
  "Extract",
  "NonNullable",
  "ReturnType",
  "Parameters",
  "Awaited",
  "ThisType",
  "Map",
  "Set",
  "ReadonlyMap",
  "ReadonlySet",
  "Date",
  "Error",
  "RegExp",
  "String",
  "Number",
  "Boolean",
  "Object",
  "Function",
  "unknown",
  "never"
])

const artifact = <K extends FunctionArtifact["kind"]>(
  path: string,
  kind: K,
  name: string,
  source: string
): FunctionArtifact & { readonly kind: K } => ({
  path,
  id: `${path}:${kind}:${name}`,
  kind,
  name,
  source,
  sourceHash: createHash("sha256").update(source, "utf8").digest("hex")
})

const exportSource = (
  node: SyntaxNode
): { readonly source: string; readonly exported: boolean; readonly location: FunctionDeclarationFact["location"] } => {
  const wrapper = node.parent?.type === "export_statement" ? node.parent : undefined
  const selected = wrapper ?? node
  return {
    source: selected.text,
    exported: wrapper !== undefined,
    location: {
      start: { line: selected.startPosition.row + 1, column: selected.startPosition.column + 1 },
      end: { line: selected.endPosition.row + 1, column: selected.endPosition.column + 1 }
    }
  }
}

const typeParameters = (node: SyntaxNode): ReadonlySet<string> => {
  const names = new Set<string>()
  for (const parameter of node.namedChildren.find((child) => child.type === "type_parameters")?.namedChildren ?? []) {
    const name = parameter.namedChildren.find((child) => child.type === "type_identifier")
    if (name !== undefined) names.add(name.text)
  }
  return names
}

type ReferenceSite = { readonly offset: number; readonly reference: FunctionReference }
type FunctionScope = {
  readonly localBindings: Set<string>
  readonly unsupportedBindings: ReferenceSite[]
  uncertainBinding: boolean
}
const bindingSyntax = new Set(["required_parameter", "optional_parameter", "variable_declarator"])
const uncertainScopeSyntax = new Set([
  "catch_clause",
  "for_in_statement",
  "function_declaration",
  "generator_function_declaration",
  "class_declaration",
  "class_expression"
])
const uncertainAssignmentSyntax = new Set(["object_pattern", "array_pattern", "parenthesized_expression"])
const mutationSyntax = new Set(["assignment_expression", "augmented_assignment_expression", "update_expression"])
const unsupportedCallableSyntax = new Set([
  "new_expression",
  "arrow_function",
  "function_expression",
  "function_declaration",
  "generator_function_declaration",
  "generator_function"
])
const unsupportedTypeSyntax = new Set(["nested_type_identifier", "type_query", "computed_property_name", "import_type"])
const referenceSite = (node: SyntaxNode, kind: FunctionReference["kind"], name = node.text): ReferenceSite => ({
  offset: node.startIndex,
  reference: { kind, name }
})
const markUncertainBinding = (child: SyntaxNode, scope: FunctionScope): void => {
  scope.uncertainBinding = true
  scope.unsupportedBindings.push(referenceSite(child, "unsupported"))
}
const unsupportedAssignmentTarget = (target: SyntaxNode | undefined, boundFunctions: ReadonlySet<string>): boolean =>
  (target?.type === "identifier" && boundFunctions.has(target.text)) ||
  uncertainAssignmentSyntax.has(target?.type ?? "")
const inspectFunctionBinding = (child: SyntaxNode, scope: FunctionScope, boundFunctions: ReadonlySet<string>): void => {
  // A function root cannot claim a scope checker for nested declarations,
  // catch/loop bindings, destructive assignments or destructured local names.
  if (uncertainScopeSyntax.has(child.type)) {
    markUncertainBinding(child, scope)
    return
  }
  if (mutationSyntax.has(child.type) && unsupportedAssignmentTarget(child.namedChildren[0], boundFunctions)) {
    markUncertainBinding(child, scope)
  }
  if (!bindingSyntax.has(child.type)) return
  const binding = child.namedChildren[0]
  if (binding?.type === "identifier") {
    scope.localBindings.add(binding.text)
    return
  }
  markUncertainBinding(child, scope)
}
const functionScope = (children: readonly SyntaxNode[], boundFunctions: ReadonlySet<string>): FunctionScope => {
  const scope: FunctionScope = {
    localBindings: new Set(["arguments"]),
    unsupportedBindings: [],
    uncertainBinding: false
  }
  for (const child of children) inspectFunctionBinding(child, scope, boundFunctions)
  return scope
}
const namedCallReference = (child: SyntaxNode, scope: FunctionScope): ReferenceSite | undefined => {
  if (child.type !== "call_expression") return undefined
  const callee = child.namedChildren[0]
  if (callee === undefined) return undefined
  const supported = callee.type === "identifier" && !scope.uncertainBinding && !scope.localBindings.has(callee.text)
  return referenceSite(child, supported ? "named-function" : "unsupported", callee.text)
}
const functionCallSites = (children: readonly SyntaxNode[], scope: FunctionScope): ReferenceSite[] => {
  const calls: ReferenceSite[] = []
  for (const child of children) {
    if (unsupportedCallableSyntax.has(child.type)) calls.push(referenceSite(child, "unsupported"))
    const call = namedCallReference(child, scope)
    if (call !== undefined) calls.push(call)
  }
  return calls
}
const declarationIdentifierSyntax = new Set(["call_expression", ...bindingSyntax])
const ignoredValueIdentifier = (child: SyntaxNode, declarationName: SyntaxNode | undefined): boolean => {
  if (sameSyntaxNode(child, declarationName)) return true
  const parent = child.parent
  if (parent === undefined || parent === null) return true
  // Direct callees already have call edges; parameter and variable names are declarations.
  return declarationIdentifierSyntax.has(parent.type) && sameSyntaxNode(parent.namedChildren[0], child)
}
const valueReferenceKind = (
  child: SyntaxNode,
  scope: FunctionScope,
  valueFunctions: ReadonlySet<string>
): FunctionReference["kind"] | undefined =>
  scope.localBindings.has(child.text)
    ? undefined
    : valueFunctions.has(child.text) && !scope.uncertainBinding
      ? "named-function"
      : "unsupported"
const unsupportedValueSyntax = new Set(["this", "super", "meta_property"])
const valueIdentifierSyntax = new Set(["identifier", "shorthand_property_identifier"])
const functionValueSites = (
  node: SyntaxNode,
  children: readonly SyntaxNode[],
  scope: FunctionScope,
  valueFunctions: ReadonlySet<string>
): ReferenceSite[] => {
  const declarationName = node.namedChildren.find((child) => child.type === "identifier")
  const values: ReferenceSite[] = []
  for (const child of children) {
    if (unsupportedValueSyntax.has(child.type)) {
      values.push(referenceSite(child, "unsupported"))
      continue
    }
    if (!valueIdentifierSyntax.has(child.type)) continue
    if (ignoredValueIdentifier(child, declarationName)) continue
    const kind = valueReferenceKind(child, scope, valueFunctions)
    if (kind !== undefined) values.push(referenceSite(child, kind))
  }
  return values
}
const ignoredTypeParents = new Set(["type_parameter", "nested_type_identifier"])
const namedTypeContext = (child: SyntaxNode): boolean => !ignoredTypeParents.has(child.parent?.type ?? "")
const declaredTypeName = (name: string, importedNames: ReadonlySet<string>): boolean =>
  !intrinsicTypes.has(name) || importedNames.has(name)
const eligibleNamedType = (
  child: SyntaxNode,
  ownName: string,
  parameters: ReadonlySet<string>,
  importedNames: ReadonlySet<string>
): boolean =>
  child.type === "type_identifier" &&
  child.text !== ownName &&
  namedTypeContext(child) &&
  !parameters.has(child.text) &&
  declaredTypeName(child.text, importedNames)
const typeReferenceKind = (
  child: SyntaxNode,
  ownName: string,
  parameters: ReadonlySet<string>,
  importedNames: ReadonlySet<string>
): FunctionReference["kind"] | undefined => {
  if (unsupportedTypeSyntax.has(child.type)) return "unsupported"
  return eligibleNamedType(child, ownName, parameters, importedNames) ? "named-type" : undefined
}
const namedTypeReferencesWithOffsets = (
  node: SyntaxNode,
  ownName: string,
  importedNames: ReadonlySet<string>
): ReferenceSite[] => {
  const parameters = typeParameters(node)
  const references: ReferenceSite[] = []
  for (const child of descendants(node)) {
    const kind = typeReferenceKind(child, ownName, parameters, importedNames)
    if (kind !== undefined) references.push(referenceSite(child, kind))
  }
  return references
}
const namedTypeReferences = (
  node: SyntaxNode,
  ownName: string,
  importedNames: ReadonlySet<string>
): FunctionReference[] => namedTypeReferencesWithOffsets(node, ownName, importedNames).map(({ reference }) => reference)
const functionReferences = (
  node: SyntaxNode,
  boundTypes: ReadonlySet<string>,
  boundFunctions: ReadonlySet<string>,
  valueFunctions: ReadonlySet<string>
): FunctionReference[] => {
  const children = descendants(node)
  const scope = functionScope(children, boundFunctions)
  const calls = functionCallSites(children, scope)
  const values = functionValueSites(node, children, scope, valueFunctions)
  // A function can share a type's name: its return annotation must still have
  // that type edge. Merge all sites in the same deterministic lexical order.
  const types = namedTypeReferencesWithOffsets(node, "", boundTypes)
  return [...types, ...calls, ...values, ...scope.unsupportedBindings]
    .sort((a, b) => a.offset - b.offset)
    .map(({ reference }) => reference)
}

type ImportBinding = FunctionFileAnalysis["imports"] extends ReadonlyMap<string, infer Binding> ? Binding : never
type FunctionAnalysisState = {
  readonly path: string
  readonly functions: Map<string, FunctionDeclarationFact>
  readonly types: Map<string, TypeDeclarationFact>
  readonly imports: ReadonlyMap<string, ImportBinding>
  readonly signatures: ReadonlySet<string>
  readonly boundTypes: ReadonlySet<string>
  readonly boundFunctions: ReadonlySet<string>
  readonly valueFunctions: ReadonlySet<string>
  readonly otherTopLevelBindings: ReadonlySet<string>
}
const declarationName = (node: SyntaxNode, kind: string): string | undefined =>
  node.namedChildren.find((child) => child.type === kind)?.text
const signatureNames = (top: readonly SyntaxNode[]): ReadonlySet<string> => {
  const signatures = new Set<string>()
  for (const node of top) {
    if (node.type !== "function_signature") continue
    const name = declarationName(node, "identifier")
    if (name !== undefined) signatures.add(name)
  }
  return signatures
}
const importModule = (node: SyntaxNode): string | undefined =>
  node.namedChildren
    .find((child) => child.type === "string")
    ?.namedChildren.find((child) => child.type === "string_fragment")?.text
const collectImportSpecifiers = (
  node: SyntaxNode,
  clause: SyntaxNode,
  module: string,
  imports: Map<string, ImportBinding>
): boolean => {
  for (const specifier of descendants(clause).filter((child) => child.type === "import_specifier")) {
    const names = specifier.namedChildren.filter((child) => child.type === "identifier")
    const imported = names[0]?.text
    const local = names.at(-1)?.text
    if (imported === undefined || local === undefined || imports.has(local)) return false
    imports.set(local, {
      path: module,
      name: imported,
      typeOnly: /^import\s+type\b/u.test(node.text) || /^type\b/u.test(specifier.text)
    })
  }
  return true
}
const collectFunctionImports = (top: readonly SyntaxNode[]): ReadonlyMap<string, ImportBinding> | undefined => {
  const imports = new Map<string, ImportBinding>()
  for (const node of top) {
    if (node.type !== "import_statement") continue
    const module = importModule(node)
    const clause = node.namedChildren.find((child) => child.type === "import_clause")
    if (module === undefined || clause === undefined) return undefined
    if (!collectImportSpecifiers(node, clause, module, imports)) return undefined
  }
  return imports
}
const boundTypeNames = (
  top: readonly SyntaxNode[],
  imports: ReadonlyMap<string, ImportBinding>
): ReadonlySet<string> => {
  const names = new Set(imports.keys())
  for (const node of top) {
    if (node.type !== "interface_declaration" && node.type !== "type_alias_declaration") continue
    const name = declarationName(node, "type_identifier")
    if (name !== undefined) names.add(name)
  }
  return names
}
const boundFunctionNames = (top: readonly SyntaxNode[], imports: ReadonlyMap<string, ImportBinding>) => {
  const boundFunctions = new Set(imports.keys())
  const valueFunctions = new Set([...imports].filter(([, binding]) => !binding.typeOnly).map(([name]) => name))
  for (const node of top) {
    if (node.type !== "function_declaration") continue
    const name = declarationName(node, "identifier")
    if (name !== undefined) {
      boundFunctions.add(name)
      valueFunctions.add(name)
    }
  }
  return { boundFunctions, valueFunctions }
}
const collectVariableNames = (node: SyntaxNode, names: Set<string>): boolean => {
  for (const declarator of node.namedChildren.filter((child) => child.type === "variable_declarator")) {
    const binding = declarator.namedChildren[0]
    // Destructured top-level names can shadow imports or named declarations.
    // A file with this unsupported binding pattern cannot claim a function graph.
    if (binding?.type !== "identifier") return false
    names.add(binding.text)
  }
  return true
}
const collectOtherBinding = (node: SyntaxNode, names: Set<string>): boolean => {
  if (node.type === "class_declaration") {
    const name = declarationName(node, "type_identifier")
    if (name !== undefined) names.add(name)
  }
  if (node.type === "lexical_declaration" || node.type === "variable_declaration")
    return collectVariableNames(node, names)
  return true
}
const otherTopLevelNames = (top: readonly SyntaxNode[]): ReadonlySet<string> | undefined => {
  const names = new Set<string>()
  for (const node of top) if (!collectOtherBinding(node, names)) return undefined
  return names
}
const collectFunctionFact = (node: SyntaxNode, state: FunctionAnalysisState): boolean => {
  const identifier = node.namedChildren.find((child) => child.type === "identifier")
  const body = node.namedChildren.find((child) => child.type === "statement_block")
  if (
    identifier === undefined ||
    body === undefined ||
    state.signatures.has(identifier.text) ||
    state.functions.has(identifier.text) ||
    state.imports.has(identifier.text) ||
    state.otherTopLevelBindings.has(identifier.text)
  )
    return false
  const rendered = exportSource(node)
  state.functions.set(identifier.text, {
    artifact: artifact(state.path, "function", identifier.text, rendered.source),
    references: functionReferences(node, state.boundTypes, state.boundFunctions, state.valueFunctions),
    exported: rendered.exported,
    location: rendered.location
  })
  return true
}
const typeDeclarationKind = (node: SyntaxNode): TypeDeclarationFact["artifact"]["kind"] | undefined =>
  node.type === "interface_declaration"
    ? "interface"
    : node.type === "type_alias_declaration"
      ? "type-alias"
      : undefined
const collectTypeFact = (
  node: SyntaxNode,
  kind: TypeDeclarationFact["artifact"]["kind"],
  state: FunctionAnalysisState
): boolean => {
  const identifier = node.namedChildren.find((child) => child.type === "type_identifier")
  if (identifier === undefined || state.types.has(identifier.text) || state.imports.has(identifier.text)) return false
  const rendered = exportSource(node)
  state.types.set(identifier.text, {
    artifact: artifact(state.path, kind, identifier.text, rendered.source),
    references: namedTypeReferences(node, identifier.text, state.boundTypes),
    exported: rendered.exported,
    location: rendered.location
  })
  return true
}
const collectDeclarationFact = (node: SyntaxNode, state: FunctionAnalysisState): boolean => {
  if (node.type === "import_statement") return true
  if (node.type === "function_declaration") return collectFunctionFact(node, state)
  const kind = typeDeclarationKind(node)
  return kind === undefined || collectTypeFact(node, kind, state)
}
const collectFunctionFacts = (top: readonly SyntaxNode[], state: FunctionAnalysisState): boolean => {
  for (const node of top) {
    if (!collectDeclarationFact(node, state)) return false
    if (state.functions.size + state.types.size > 64) return false
  }
  return true
}
const analyzeFunctionRoot = (path: string, root: SyntaxNode): FunctionFileAnalysis | undefined => {
  if (root.hasError) return undefined
  const top = root.namedChildren.flatMap((child) =>
    child.type === "export_statement" ? child.namedChildren.filter((item) => item.type !== "export_clause") : [child]
  )
  const signatures = signatureNames(top)
  const imports = collectFunctionImports(top)
  if (imports === undefined) return undefined
  const boundTypes = boundTypeNames(top, imports)
  const { boundFunctions, valueFunctions } = boundFunctionNames(top, imports)
  const otherTopLevelBindings = otherTopLevelNames(top)
  if (otherTopLevelBindings === undefined) return undefined
  if ([...otherTopLevelBindings].some((name) => imports.has(name))) return undefined
  const functions = new Map<string, FunctionDeclarationFact>()
  const types = new Map<string, TypeDeclarationFact>()
  const state: FunctionAnalysisState = {
    path,
    functions,
    types,
    imports,
    signatures,
    boundTypes,
    boundFunctions,
    valueFunctions,
    otherTopLevelBindings
  }
  if (!collectFunctionFacts(top, state)) return undefined
  return { path, functions, types, imports }
}
/** Conservative native facts. Undefined means this file cannot support a complete function unit. */
export const analyzeFunctionFile = (path: string, source: string): FunctionFileAnalysis | undefined => {
  if (!extensions.has(extname(path).toLowerCase())) return undefined
  try {
    return analyzeFunctionRoot(path, typeScriptRoot(path, source))
  } catch {
    return undefined
  }
}
