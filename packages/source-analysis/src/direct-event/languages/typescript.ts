import { LANGUAGE_EXTENSIONS } from "@hapsland/native-observation/direct-event/languages/path-language"
import { descendants, sameSyntaxNode, typeScriptRoot, type SyntaxNode } from "./native-parser.ts"
import { createHash } from "node:crypto"
import { extname } from "node:path"
import type { TypeDeclaration } from "@hapsland/source-artifacts/direct-event/artifact-model"
import {
  MAX_TYPE_DECLARATIONS,
  type TypeExtractionFailure,
  type GraphDeclaration,
  type GraphFile,
  type LanguageAdapter,
  type GraphFacts
} from "./contracts.ts"
import { analyzeFunctionFile, analyzeFunctionRoot, functionDeclarationNodes } from "./typescript-functions.ts"
import { type TypeScriptPreflightInput, type TypeScriptPreflightEffects } from "../combined-preflight/contracts.ts"

type ParsedDeclaration = {
  readonly node: SyntaxNode
  readonly nameNode: SyntaxNode
  readonly artifact: TypeDeclaration
  readonly references: ReadonlyArray<
    { readonly kind: "named"; readonly name: string } | { readonly kind: "unsupported"; readonly name: string }
  >
}

const supported = new Set<string>(LANGUAGE_EXTENSIONS.typescript)
const importSyntax = new Set(["import", "import_alias", "import_require_clause", "import_statement", "import_type"])
const valueImportStatement = (node: SyntaxNode): boolean =>
  node.type === "import_statement" &&
  !/^import\s+type\b/u.test(node.text) &&
  node.namedChildren.some((child) => child.type === "import_clause")

/** Iterative traversal contains adversarially deep, but byte-bounded, syntax. */
const kindOf = (node: SyntaxNode): TypeDeclaration["kind"] | undefined =>
  node.type === "interface_declaration"
    ? "interface"
    : node.type === "type_alias_declaration"
      ? "type-alias"
      : undefined

const declarationNameNode = (node: SyntaxNode): SyntaxNode | undefined =>
  node.namedChildren.find((child) => child.type === "type_identifier" || child.type === "identifier")

const rootTypeParameters = (declaration: SyntaxNode): ReadonlySet<string> => {
  const names = new Set<string>()
  const parameters = declaration.namedChildren.find((node) => node.type === "type_parameters")
  for (const node of parameters?.namedChildren ?? []) {
    if (node.type !== "type_parameter") continue
    const name = node.namedChildren.find((child) => child.type === "type_identifier")
    if (name !== undefined) names.add(name.text)
  }
  return names
}

const unsupportedReferenceNodes = new Set(["nested_type_identifier", "type_query", "computed_property_name"])
const ignoredTypeParents = new Set(["type_parameter", "nested_type_identifier"])
const intrinsicContainers = new Set(["Readonly", "ReadonlyArray", "Array"])
const removeImportedIntrinsics = (statement: SyntaxNode, names: Set<string>): void => {
  for (const binding of descendants(statement))
    if (binding.type === "identifier" || binding.type === "type_identifier") names.delete(binding.text)
}
const unshadowedIntrinsicContainers = (nodes: ReadonlyArray<SyntaxNode>): ReadonlySet<string> => {
  const names = new Set(intrinsicContainers)
  for (const declaration of nodes) names.delete(declarationNameNode(declaration)?.text ?? "")
  let root = nodes[0]!
  while (root.parent != null) root = root.parent
  for (const statement of root.namedChildren) {
    if (statement.type !== "import_statement") continue
    removeImportedIntrinsics(statement, names)
  }
  return names
}
const intrinsicContainerReference = (node: SyntaxNode, names: ReadonlySet<string>): boolean => {
  const parent = node.parent
  return (
    parent?.type === "generic_type" &&
    names.has(node.text) &&
    sameSyntaxNode(parent.namedChildren[0]!, node) &&
    parent.namedChildren.find((child) => child.type === "type_arguments")?.namedChildren.length === 1
  )
}
const typeReference = (
  node: SyntaxNode,
  nameNode: SyntaxNode,
  parameters: ReadonlySet<string>,
  intrinsicNames: ReadonlySet<string>
): ParsedDeclaration["references"][number] | undefined => {
  if (unsupportedReferenceNodes.has(node.type)) return { kind: "unsupported", name: node.text }
  if (node.type !== "type_identifier" || sameSyntaxNode(node, nameNode)) return undefined
  if (ignoredTypeParents.has(node.parent?.type ?? "") || parameters.has(node.text)) return undefined
  if (intrinsicContainerReference(node, intrinsicNames)) return undefined
  return { kind: "named", name: node.text }
}
const distinctReferences = (references: ParsedDeclaration["references"]): ParsedDeclaration["references"] => {
  const seen = new Set<string>()
  return references.filter((reference) => {
    const key = `${reference.kind}:${reference.name}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}
const referencesOf = (
  declaration: SyntaxNode,
  nameNode: SyntaxNode,
  intrinsicNames: ReadonlySet<string>
): ParsedDeclaration["references"] => {
  const parameters = rootTypeParameters(declaration)
  const references: Array<ParsedDeclaration["references"][number]> = []
  for (const node of descendants(declaration)) {
    const reference = typeReference(node, nameNode, parameters, intrinsicNames)
    if (reference !== undefined) references.push(reference)
  }
  return distinctReferences(references)
}
const exportedSourceNode = (node: SyntaxNode): SyntaxNode =>
  node.parent?.type === "export_statement" ? node.parent : node
const topLevelTypes = (root: SyntaxNode): ReadonlyArray<SyntaxNode> =>
  root.namedChildren.flatMap((node) =>
    node.type === "export_statement"
      ? node.namedChildren.filter((child) => kindOf(child) !== undefined)
      : kindOf(node) === undefined
        ? []
        : [node]
  )
const parseDeclaration = (
  path: string,
  node: SyntaxNode,
  intrinsicNames: ReadonlySet<string>
): ParsedDeclaration | undefined => {
  const nameNode = declarationNameNode(node)
  const kind = kindOf(node)
  if (nameNode === undefined || kind === undefined || nameNode.text.length === 0 || node.hasError) return undefined
  const rendered = exportedSourceNode(node).text
  return {
    node,
    nameNode,
    artifact: {
      id: `${path}:${kind}:${nameNode.text}`,
      kind,
      name: nameNode.text,
      source: rendered,
      sourceHash: createHash("sha256").update(rendered, "utf8").digest("hex")
    },
    references: referencesOf(node, nameNode, intrinsicNames)
  }
}
const parseDeclarationNodes = (
  path: string,
  nodes: ReadonlyArray<SyntaxNode>
): TypeExtractionFailure | ReadonlyArray<ParsedDeclaration> => {
  if (nodes.length === 0) return { status: "unsupported", reason: "no-declarations", units: [] }
  if (nodes.length > MAX_TYPE_DECLARATIONS) return { status: "unsupported", reason: "declaration-limit", units: [] }
  const intrinsicNames = unshadowedIntrinsicContainers(nodes)
  const parsed: Array<ParsedDeclaration> = []
  for (const node of nodes) {
    const declaration = parseDeclaration(path, node, intrinsicNames)
    if (declaration === undefined) return { status: "unsupported", reason: "parse", units: [] }
    parsed.push(declaration)
  }
  if (new Set(parsed.map(({ artifact }) => artifact.name)).size !== parsed.length)
    return { status: "unsupported", reason: "declaration-merge", units: [] }
  return parsed
}
const parsedDeclarations = (
  path: string,
  source: string,
  allowImports = false,
  readRoot: () => SyntaxNode = () => typeScriptRoot(path, source)
): TypeExtractionFailure | ReadonlyArray<ParsedDeclaration> => {
  const extension = extname(path).toLowerCase()
  if (!supported.has(extension)) return { status: "unsupported", reason: "extension", units: [] }
  try {
    const tree = { rootNode: readRoot() }
    if (tree.rootNode.hasError) return { status: "unsupported", reason: "parse", units: [] }
    const nodes = [tree.rootNode, ...descendants(tree.rootNode)]
    if (!allowImports && nodes.some((node) => importSyntax.has(node.type) && !valueImportStatement(node))) {
      return { status: "unsupported", reason: "import", units: [] }
    }
    const declarations = allowImports
      ? topLevelTypes(tree.rootNode)
      : nodes.filter((node) => kindOf(node) !== undefined)
    return parseDeclarationNodes(path, declarations)
  } catch {
    return { status: "unsupported", reason: "parse", units: [] }
  }
}

type TypeImport = { readonly path: string; readonly name: string }
const collectTypeSpecifier = (
  specifier: string,
  path: string,
  statementTypeOnly: boolean,
  imports: Map<string, TypeImport>
): boolean => {
  const part = /^\s*(type\s+)?([A-Za-z_$][\w$]*)(?:\s+as\s+([A-Za-z_$][\w$]*))?\s*$/.exec(specifier)
  if (part?.[2] === undefined) return false
  if (!statementTypeOnly && part[1] === undefined) return false
  const local = part[3] ?? part[2]
  if (imports.has(local)) return false
  imports.set(local, { path, name: part[2] })
  return true
}
const collectTypeImport = (node: SyntaxNode, imports: Map<string, TypeImport>): boolean => {
  const match = /^import\s+(type\s+)?\{([^{}]+)\}\s*from\s*["'](\.[^"']+)["']\s*;?\s*$/.exec(node.text)
  if (match?.[2] === undefined || match[3] === undefined) return false
  for (const specifier of match[2].split(",")) {
    if (!collectTypeSpecifier(specifier, match[3], match[1] !== undefined, imports)) return false
  }
  return true
}
const unsupportedTypeImport = (node: SyntaxNode): boolean =>
  importSyntax.has(node.type) && node.type !== "import_statement" && node.parent?.type !== "import_statement"
const graphTypeImports = (root: SyntaxNode): Map<string, TypeImport> | undefined => {
  const imports = new Map<string, TypeImport>()
  for (const node of root.namedChildren) {
    if (node.type !== "import_statement") continue
    if (!collectTypeImport(node, imports) && !valueImportStatement(node)) return undefined
  }
  for (const node of descendants(root)) {
    if (unsupportedTypeImport(node)) return undefined
  }
  return imports
}
const graphTypeDeclaration = (path: string, parsed: ParsedDeclaration): GraphDeclaration => {
  const { artifact, references, node } = parsed
  const sourceNode = exportedSourceNode(node)
  return {
    artifact: { ...artifact, path },
    references,
    exported: node.parent?.type === "export_statement",
    location: {
      start: { line: sourceNode.startPosition.row + 1, column: sourceNode.startPosition.column + 1 },
      end: { line: sourceNode.endPosition.row + 1, column: sourceNode.endPosition.column + 1 }
    }
  }
}
const inspectDeclarations = (
  path: string,
  parsed: ReturnType<typeof parsedDeclarations>,
  readRoot: () => SyntaxNode
): GraphFile | undefined => {
  if ("status" in parsed) return undefined
  const tree = { rootNode: readRoot() }
  if (tree.rootNode.hasError) return undefined
  const imports = graphTypeImports(tree.rootNode)
  if (imports === undefined) return undefined
  return {
    declarations: new Map(
      parsed.map((declaration) => [declaration.artifact.name, graphTypeDeclaration(path, declaration)])
    ),
    imports
  }
}

export const inspectTypeScript = (path: string, source: string): GraphFile | undefined =>
  inspectDeclarations(path, parsedDeclarations(path, source, true), () => typeScriptRoot(path, source))

const normalized = (
  parsed: TypeExtractionFailure | ReadonlyArray<ParsedDeclaration>
): TypeExtractionFailure | ReadonlyArray<GraphDeclaration> =>
  "status" in parsed
    ? parsed
    : parsed.map(({ artifact, references, node }) => ({
        artifact,
        references,
        exported: false,
        location: {
          start: { line: node.startPosition.row + 1, column: node.startPosition.column + 1 },
          end: { line: node.endPosition.row + 1, column: node.endPosition.column + 1 }
        }
      }))
export const parseTypes = (path: string, source: string, allowImports = false) =>
  normalized(parsedDeclarations(path, source, allowImports))

const extractTypeScriptSource: LanguageAdapter["extractSource"] = (path, source) => {
  let root: SyntaxNode | undefined
  const readRoot = () => (root ??= typeScriptRoot(path, source))
  const parsed = parsedDeclarations(path, source, true, readRoot)
  const graph = inspectDeclarations(path, parsed, readRoot)
  let functions: ReturnType<typeof analyzeFunctionRoot>
  try {
    functions = analyzeFunctionRoot(path, readRoot())
  } catch {
    functions = undefined
  }
  return {
    graph,
    functions,
    parseTypes: (allowImports) =>
      normalized(
        allowImports && !("status" in parsed) ? parsed : parsedDeclarations(path, source, allowImports, readRoot)
      )
  }
}

const encodedBytes = (value: unknown): number => Buffer.byteLength(JSON.stringify(value), "utf8")
const isReviewDeclaration = (node: SyntaxNode): boolean =>
  kindOf(node) !== undefined || node.type === "function_declaration"
const preflightDeclarations = (root: SyntaxNode): ReadonlyArray<SyntaxNode> =>
  root.namedChildren
    .flatMap((node) => (node.type === "export_statement" ? node.namedChildren.filter(isReviewDeclaration) : [node]))
    .filter(isReviewDeclaration)
// Foreign syntax facts and measurements only; admission and sizing live in Bend.
// The callback also lets the independent verification owner reuse native facts
// without calling the production policy machine.
export const withNativeTypeScriptPreflight = (
  path: string,
  source: string,
  typeBound: import("./contracts.ts").AnalyzerMaterializationPreflight | undefined,
  consume: (
    input: TypeScriptPreflightInput,
    bound: import("./contracts.ts").AnalyzerMaterializationPreflight | undefined,
    effects: TypeScriptPreflightEffects
  ) => import("./contracts.ts").AnalyzerMaterializationPreflight | undefined,
  readRoot: () => SyntaxNode = () => typeScriptRoot(path, source)
): import("./contracts.ts").AnalyzerMaterializationPreflight | undefined => {
  if (!supported.has(extname(path).toLowerCase())) return undefined
  try {
    const root = readRoot()
    const parseValid = !root.hasError
    // Keep native declaration reads after hasError, including on invalid trees.
    const types = parseValid ? preflightDeclarations(root).filter((node) => kindOf(node) !== undefined).length : 0
    const functions = parseValid ? functionDeclarationNodes(root) : []
    const sites = new Map<number, ReadonlyArray<SyntaxNode>>()
    return consume({ parseValid, types, functions: functions.length }, typeBound, {
      artifactBytes(slot) {
        const { node, name } = functions[slot]!
        const rendered = exportedSourceNode(node)
        return encodedBytes({
          path,
          id: `${path}:function:${name}`,
          kind: "function",
          name,
          source: rendered.text,
          sourceHash: "0".repeat(64)
        })
      },
      observeSites(slot) {
        const observed = descendants(functions[slot]!.node)
        sites.set(slot, observed)
        return observed.length
      },
      siteBytes: (slot, site) => Buffer.byteLength(sites.get(slot)![site]!.text, "utf8"),
      pathBytes: () => Buffer.byteLength(path, "utf8"),
      typeBytes: () => typeBound?.expandedUnitBytes ?? 0,
      rootImports: () => root.namedChildren.some((node) => node.type === "import_statement"),
      typeImports: () => typeBound?.hasImports === true
    })
  } catch {
    return undefined
  }
}
export const combinedPreflight = (
  path: string,
  source: string,
  typeBound: import("./contracts.ts").AnalyzerMaterializationPreflight | undefined,
  policy: import("../combined-preflight/contracts.ts").CombinedPreflightPolicy
): import("./contracts.ts").AnalyzerMaterializationPreflight | undefined =>
  withNativeTypeScriptPreflight(path, source, typeBound, policy.typescript)

export const inspectTypeScriptFunctions = (path: string, source: string): GraphFacts | undefined => {
  const file = analyzeFunctionFile(path, source)
  if (file === undefined || file.failure !== undefined) return undefined
  return {
    declarations: new Map(
      [...file.types.values(), ...file.functions.values()].map((fact) => [
        `${fact.artifact.kind === "function" ? "function" : "type"}:${fact.artifact.name}`,
        {
          artifact: fact.artifact,
          exported: fact.exported,
          references: fact.references.map((reference) => ({
            kind: reference.kind === "unsupported" ? ("unsupported" as const) : ("named" as const),
            name: reference.name,
            ...(reference.kind === "named-function"
              ? { expectedKind: "function" as const }
              : reference.kind === "named-type"
                ? { expectedKind: "type" as const }
                : {})
          }))
        }
      ])
    ),
    imports: file.imports,
    kindAware: true
  }
}
export const tsAdapter: LanguageAdapter = {
  id: "typescript",
  extensions: [...supported],
  displayName: "TypeScript",
  probe: { path: "doctor.ts", source: "export interface DoctorProbe { ready: boolean }" },
  analyzeFunctions: analyzeFunctionFile,
  extractSource: extractTypeScriptSource,
  preflightSource(path, source) {
    let root: SyntaxNode | undefined
    const readRoot = () => (root ??= typeScriptRoot(path, source))
    return {
      parseTypes: () => normalized(parsedDeclarations(path, source, true, readRoot)),
      combinedPreflight: (bound, policy) =>
        withNativeTypeScriptPreflight(path, source, bound, policy.typescript, readRoot)
    }
  },
  parseTypes,
  inspect: inspectTypeScript,
  hasImports: (source) => /\bimport\b/u.test(source),
  combinedPreflight
}
