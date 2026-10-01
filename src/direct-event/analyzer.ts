import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { ArtifactReference, ReviewArtifact, ReviewNode, ReviewUnit, TypeDeclaration } from "./model.ts";

const nativeRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../native/prebuilt", `${process.platform}-${process.arch}`);
const parserRuntime = resolve(nativeRoot, "tree-sitter");
const rustLanguage = resolve(nativeRoot, "tree-sitter-rust");
if (existsSync(resolve(rustLanguage, "build/Release/tree_sitter_rust_binding.node"))) {
  process.env.TREE_SITTER_RUST_PREBUILD = rustLanguage;
}
const parserLanguage = resolve(nativeRoot, "tree-sitter-typescript");
if (existsSync(resolve(parserRuntime, "build/Release/tree_sitter_runtime_binding.node")) &&
    existsSync(resolve(parserLanguage, "build/Release/tree_sitter_typescript_binding.node"))) {
  process.env.TREE_SITTER_PREBUILD = parserRuntime;
  process.env.TREE_SITTER_TYPESCRIPT_PREBUILD = parserLanguage;
}
const { default: Parser } = await import("tree-sitter");
const { default: TypeScript } = await import("tree-sitter-typescript");
const { default: Rust } = await import("tree-sitter-rust");

type SyntaxNode = {
  readonly type: string;
  readonly startIndex: number;
  readonly endIndex: number;
  childForFieldName(name: string): SyntaxNode | null;
  readonly text: string;
  readonly namedChildren: ReadonlyArray<SyntaxNode>;
  readonly startPosition: { readonly row: number; readonly column: number };
  readonly endPosition: { readonly row: number; readonly column: number };
  readonly parent?: SyntaxNode | null;
  readonly hasError?: boolean;
};

type ParsedDeclaration = {
  readonly node: SyntaxNode;
  readonly nameNode: SyntaxNode;
  readonly artifact: TypeDeclaration;
  readonly references: ReadonlyArray<
    | { readonly kind: "named"; readonly name: string }
    | { readonly kind: "unsupported"; readonly name: string }
  >;
};

export type GraphDeclaration = {
  readonly artifact: TypeDeclaration;
  readonly references: ParsedDeclaration["references"];
  readonly exported: boolean;
  readonly location: {
    readonly start: { readonly line: number; readonly column: number };
    readonly end: { readonly line: number; readonly column: number };
  };
};

export type GraphFile = {
  readonly declarations: ReadonlyMap<string, GraphDeclaration>;
  readonly imports: ReadonlyMap<string, { readonly path: string; readonly name: string }>;
};

export type UnitAnalysis =
  | { readonly status: "ready"; readonly unit: ReviewUnit }
  | {
      readonly status: "unsupported";
      readonly root: ReviewArtifact;
      readonly unit: ReviewUnit;
      readonly reason: "missing-evidence" | "unsupported-reference" | "reference-limit";
    };

export type TypeFileAnalysis =
  | { readonly status: "unsupported"; readonly reason: "extension" | "parse" | "import" | "declaration-limit" | "declaration-merge" | "no-declarations"; readonly units: readonly [] }
  | { readonly status: "analyzed"; readonly units: ReadonlyArray<UnitAnalysis> };

export const MAX_TYPE_DECLARATIONS = 64;
/** The root is deliberately excluded from this count. */
export const MAX_REFERENCED_NAMES = 16;

const supported = new Set([".ts", ".tsx", ".mts", ".cts", ".rs"]);
const importSyntax = new Set([
  "import",
  "import_alias",
  "import_require_clause",
  "import_statement",
  "import_type",
]);

/** Iterative traversal contains adversarially deep, but byte-bounded, syntax. */
const descendants = (node: SyntaxNode): ReadonlyArray<SyntaxNode> => {
  const result: Array<SyntaxNode> = [];
  const pending = [...node.namedChildren].reverse();
  while (pending.length > 0) {
    const current = pending.pop();
    if (current === undefined) continue;
    result.push(current);
    for (let index = current.namedChildren.length - 1; index >= 0; index -= 1) {
      const child = current.namedChildren[index];
      if (child !== undefined) pending.push(child);
    }
  }
  return result;
};

const kindOf = (node: SyntaxNode): TypeDeclaration["kind"] | undefined =>
  node.type === "interface_declaration"
    ? "interface"
    : node.type === "type_alias_declaration"
      ? "type-alias"
      : undefined;

const declarationNameNode = (node: SyntaxNode): SyntaxNode | undefined =>
  node.namedChildren.find(
    (child) => child.type === "type_identifier" || child.type === "identifier",
  );

const rootTypeParameters = (declaration: SyntaxNode): ReadonlySet<string> => {
  const names = new Set<string>();
  const parameters = declaration.namedChildren.find((node) => node.type === "type_parameters");
  for (const node of parameters?.namedChildren ?? []) {
    if (node.type !== "type_parameter") continue;
    const name = node.namedChildren.find((child) => child.type === "type_identifier");
    if (name !== undefined) names.add(name.text);
  }
  return names;
};

const referencesOf = (declaration: SyntaxNode, nameNode: SyntaxNode): ParsedDeclaration["references"] => {
  const parameters = rootTypeParameters(declaration);
  const result: Array<ParsedDeclaration["references"][number]> = [];
  for (const node of descendants(declaration)) {
    if (node.type === "nested_type_identifier" || node.type === "type_query" || node.type === "computed_property_name") {
      result.push({ kind: "unsupported", name: node.text });
      continue;
    }
    if (
      node.type !== "type_identifier" ||
      node === nameNode ||
      node.parent?.type === "type_parameter" ||
      node.parent?.type === "nested_type_identifier" ||
      parameters.has(node.text)
    ) continue;
    result.push({ kind: "named", name: node.text });
  }
  const seen = new Set<string>();
  return result.filter((reference) => {
    const key = `${reference.kind}:${reference.name}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const rustBuiltins = new Set(["String", "str", "Option", "Result", "Vec", "Box"]);

/** Rust facts intentionally stay in one top-level scope without expansion. */
const rustDeclarations = (path: string, source: string): TypeFileAnalysis | ReadonlyArray<ParsedDeclaration> => {
  const parser = new Parser();
  parser.setLanguage(Rust);
  const root = (parser.parse(source) as unknown as { readonly rootNode: SyntaxNode }).rootNode;
  if (root.hasError) return { status: "unsupported", reason: "parse", units: [] };
  const declarations = root.namedChildren.filter((node) => ["struct_item", "enum_item", "type_item"].includes(node.type));
  if (declarations.length === 0) return { status: "unsupported", reason: "no-declarations", units: [] };
  if (declarations.length > MAX_TYPE_DECLARATIONS) return { status: "unsupported", reason: "declaration-limit", units: [] };
  const localNames = new Set(root.namedChildren.filter((node) => ["struct_item", "enum_item", "type_item", "union_item", "trait_item"].includes(node.type))
    .map((node) => declarationNameNode(node)?.text));
  // Imports, modules, macros and file attributes can change name resolution or
  // emitted declarations. Keep explicit roots, but never claim their closure.
  const uncertainScope = [root, ...descendants(root)].some((node) => ["use_declaration", "mod_item", "macro_definition", "macro_invocation", "inner_attribute_item", "attribute_item", "extern_crate_declaration", "foreign_mod_item"].includes(node.type));
  const parsed: ParsedDeclaration[] = [];
  let attributes: SyntaxNode[] = [];
  for (const node of root.namedChildren) {
    if (node.type === "attribute_item") { attributes.push(node); continue; }
    if (node.type === "line_comment" || node.type === "block_comment") continue;
    if (!declarations.includes(node)) { attributes = []; continue; }
    const nameNode = declarationNameNode(node);
    if (nameNode === undefined || !/^[\p{ID_Start}_][\p{ID_Continue}]*$/u.test(nameNode.text)) return { status: "unsupported", reason: "parse", units: [] };
    const kind = node.type === "struct_item" ? "struct" : node.type === "enum_item" ? "enum" : "type-alias";
    const start = attributes[0]?.startPosition ?? node.startPosition;
    const rendered = source.slice(attributes[0]?.startIndex ?? node.startIndex, node.endIndex);
    const parameters = new Set(node.namedChildren.find((child) => child.type === "type_parameters")?.namedChildren
      .filter((child) => child.type === "type_parameter").map((child) => child.childForFieldName("name")?.text) ?? []);
    const references: ParsedDeclaration["references"][number][] = [];
    if (uncertainScope || attributes.length > 0) references.push({ kind: "unsupported", name: nameNode.text });
    for (const child of descendants(node)) {
      if (["attribute_item", "macro_invocation", "scoped_type_identifier", "qualified_type", "trait_bounds", "where_clause", "const_parameter", "dynamic_type", "abstract_type"].includes(child.type)) {
        references.push({ kind: "unsupported", name: nameNode.text });
      }
      if ((child.type === "array_type" && child.childForFieldName("length")?.type !== "integer_literal") ||
        (child.type === "enum_variant" && child.childForFieldName("value") !== null && child.childForFieldName("value")?.type !== "integer_literal") ||
        (child.parent?.type === "type_arguments" && !["type_identifier", "primitive_type", "generic_type", "reference_type", "tuple_type", "array_type", "scoped_type_identifier", "lifetime", "unit_type", "pointer_type", "function_type"].includes(child.type))) {
        references.push({ kind: "unsupported", name: nameNode.text });
      }
      if (child.type !== "type_identifier" || child === nameNode || (child === child.parent?.childForFieldName("name") && child.parent?.type === "type_parameter") || parameters.has(child.text)) continue;
      if (child.text === "Self") references.push({ kind: "named", name: nameNode.text });
      else if (localNames.has(child.text) || !rustBuiltins.has(child.text)) references.push({ kind: "named", name: child.text });
    }
    const unique = [...new Map(references.map((reference) => [`${reference.kind}:${reference.name}`, reference])).values()];
    parsed.push({ node: { ...node, startPosition: start, endPosition: node.endPosition }, nameNode,
      artifact: { id: `${path}:${kind}:${nameNode.text}`, kind, name: nameNode.text, source: rendered,
        sourceHash: createHash("sha256").update(rendered, "utf8").digest("hex") }, references: unique });
    attributes = [];
  }
  if (new Set(parsed.map(({ artifact }) => artifact.name)).size !== parsed.length) return { status: "unsupported", reason: "declaration-merge", units: [] };
  return parsed;
};

const parsedDeclarations = (path: string, source: string, allowImports = false): TypeFileAnalysis | ReadonlyArray<ParsedDeclaration> => {
  const extension = extname(path).toLowerCase();
  if (!supported.has(extension)) return { status: "unsupported", reason: "extension", units: [] };
  try {
    if (extension === ".rs") return rustDeclarations(path, source);
    const parser = new Parser();
    parser.setLanguage(extension === ".tsx" ? TypeScript.tsx : TypeScript.typescript);
    const tree = parser.parse(source) as unknown as { readonly rootNode: SyntaxNode };
    if (tree.rootNode.hasError) return { status: "unsupported", reason: "parse", units: [] };
    const nodes = [tree.rootNode, ...descendants(tree.rootNode)];
    if (!allowImports && nodes.some((node) => importSyntax.has(node.type))) {
      return { status: "unsupported", reason: "import", units: [] };
    }
    const declarations = (allowImports
      ? tree.rootNode.namedChildren.flatMap((node) => node.type === "export_statement"
        ? node.namedChildren.filter((child) => kindOf(child) !== undefined)
        : kindOf(node) === undefined ? [] : [node])
      : nodes.filter((node) => kindOf(node) !== undefined));
    if (declarations.length === 0) return { status: "unsupported", reason: "no-declarations", units: [] };
    if (declarations.length > MAX_TYPE_DECLARATIONS) {
      return { status: "unsupported", reason: "declaration-limit", units: [] };
    }
    const parsed: Array<ParsedDeclaration> = [];
    for (const node of declarations) {
      const nameNode = declarationNameNode(node);
      const kind = kindOf(node);
      if (nameNode === undefined || kind === undefined || nameNode.text.length === 0 || node.hasError) {
        return { status: "unsupported", reason: "parse", units: [] };
      }
      const sourceNode = node.parent?.type === "export_statement" ? node.parent : node;
      const rendered = sourceNode.text;
      const artifact: TypeDeclaration = {
        id: `${path}:${kind}:${nameNode.text}`,
        kind,
        name: nameNode.text,
        source: rendered,
        sourceHash: createHash("sha256").update(rendered, "utf8").digest("hex"),
      };
      parsed.push({ node, nameNode, artifact, references: referencesOf(node, nameNode) });
    }
    if (new Set(parsed.map(({ artifact }) => artifact.name)).size !== parsed.length) {
      return { status: "unsupported", reason: "declaration-merge", units: [] };
    }
    return parsed;
  } catch {
    return { status: "unsupported", reason: "parse", units: [] };
  }
};

/** Native syntax facts for the Bend-owned graph. Only static relative named type imports are admitted. */
export const inspectGraphFile = (path: string, source: string): GraphFile | undefined => {
  const parsed = parsedDeclarations(path, source, true);
  if ("status" in parsed) return undefined;
  if (extname(path).toLowerCase() === ".rs") return {
    declarations: new Map(parsed.map(({ artifact, references, node }) => [artifact.name, {
      artifact: { ...artifact, path }, references, exported: true,
      location: { start: { line: node.startPosition.row + 1, column: node.startPosition.column + 1 },
        end: { line: node.endPosition.row + 1, column: node.endPosition.column + 1 } },
    }])), imports: new Map(),
  };
  const parser = new Parser();
  parser.setLanguage(extname(path).toLowerCase() === ".tsx" ? TypeScript.tsx : TypeScript.typescript);
  const tree = parser.parse(source) as unknown as { readonly rootNode: SyntaxNode };
  if (tree.rootNode.hasError) return undefined;
  const imports = new Map<string, { path: string; name: string }>();
  for (const node of tree.rootNode.namedChildren) {
    if (node.type !== "import_statement") continue;
    const match = /^import\s+(type\s+)?\{([^{}]+)\}\s*from\s*["'](\.[^"']+)["']\s*;?\s*$/.exec(node.text);
    if (match?.[2] === undefined || match[3] === undefined) return undefined;
    for (const specifier of match[2].split(",")) {
      const part = /^\s*(type\s+)?([A-Za-z_$][\w$]*)(?:\s+as\s+([A-Za-z_$][\w$]*))?\s*$/.exec(specifier);
      if (part?.[2] === undefined || (match[1] === undefined && part[1] === undefined)) return undefined;
      const local = part[3] ?? part[2];
      if (imports.has(local)) return undefined;
      imports.set(local, { path: match[3], name: part[2] });
    }
  }
  // Imports in expressions, aliases, require calls, and nested syntax remain unsupported.
  for (const node of descendants(tree.rootNode)) {
    if (importSyntax.has(node.type) && node.type !== "import_statement" &&
      node.parent?.type !== "import_statement") return undefined;
  }
  return {
    declarations: new Map(parsed.map(({ artifact, references, node }) => [artifact.name, {
      artifact: { ...artifact, path }, references, exported: node.parent?.type === "export_statement",
      location: {
        start: { line: (node.parent?.type === "export_statement" ? node.parent : node).startPosition.row + 1,
          column: (node.parent?.type === "export_statement" ? node.parent : node).startPosition.column + 1 },
        end: { line: (node.parent?.type === "export_statement" ? node.parent : node).endPosition.row + 1,
          column: (node.parent?.type === "export_statement" ? node.parent : node).endPosition.column + 1 },
      },
    }])),
    imports,
  };
};

const unitFor = (root: ParsedDeclaration, declarations: ReadonlyMap<string, ParsedDeclaration>): UnitAnalysis => {
  const expanded = new Set<string>([root.artifact.id]);
  const referencedNames = new Set<string>();
  let reason: Extract<UnitAnalysis, { status: "unsupported" }>["reason"] | undefined;

  const visit = (declaration: ParsedDeclaration): ReviewNode => {
    const references: Array<ArtifactReference> = [];
    for (const reference of declaration.references) {
      if (reference.kind === "unsupported") {
        reason ??= "unsupported-reference";
        references.push({ kind: "omitted", site: { symbol: reference.name }, target: { kind: "unresolved", symbol: reference.name }, reason: "unsupported" });
        continue;
      }
      if (reference.name !== root.artifact.name) referencedNames.add(reference.name);
      const target = declarations.get(reference.name);
      if (referencedNames.size > MAX_REFERENCED_NAMES) {
        reason ??= "reference-limit";
        references.push({
          kind: "omitted",
          site: { symbol: reference.name },
          target: target === undefined
            ? { kind: "unresolved", symbol: reference.name }
            : { kind: "known", artifactId: target.artifact.id },
          reason: "reference-limit",
        });
      } else if (target === undefined) {
        reason ??= "missing-evidence";
        references.push({ kind: "omitted", site: { symbol: reference.name }, target: { kind: "unresolved", symbol: reference.name }, reason: "unresolved" });
      } else if (expanded.has(target.artifact.id)) {
        references.push({ kind: "included", site: { symbol: reference.name }, target: target.artifact.id });
      } else {
        expanded.add(target.artifact.id);
        references.push({ kind: "expanded", site: { symbol: reference.name }, node: visit(target) });
      }
    }
    return { artifact: declaration.artifact, references };
  };

  const unit = { root: visit(root) } satisfies ReviewUnit;
  return reason === undefined
    ? { status: "ready", unit }
    : { status: "unsupported", root: root.artifact, unit, reason };
};

export const analyzeTypeFile = (path: string, source: string): TypeFileAnalysis => {
  const parsed = parsedDeclarations(path, source);
  if ("status" in parsed) return parsed;
  const byName = new Map(parsed.map((declaration) => [declaration.artifact.name, declaration]));
  return { status: "analyzed", units: parsed.map((declaration) => unitFor(declaration, byName)) };
};

/** Bounded preflight count used before recursive ReviewUnit materialization. */
export type AnalyzerMaterializationPreflight = {
  readonly declarations: number;
  readonly expandedUnitBytes: number;
  readonly hasImports?: boolean;
};

const encodedBytes = (value: unknown): number =>
  Buffer.byteLength(JSON.stringify(value), "utf8");

/**
 * Conservative logical bound computed without constructing recursive units.
 * Exact artifact/id/site payload bytes are charged with ample per-node/edge
 * structural allowance, following the same expansion and reference ceilings
 * as unitFor.
 */
export const analyzerMaterializationPreflight = (
  path: string,
  source: string,
  allowImports = false,
): AnalyzerMaterializationPreflight | undefined => {
  const parsed = parsedDeclarations(path, source, allowImports);
  if ("status" in parsed) return undefined;
  const byName = new Map(parsed.map((declaration) => [declaration.artifact.name, declaration]));
  let expandedUnitBytes = 0;
  for (const root of parsed) {
    const expanded = new Set<string>([root.artifact.id]);
    const referencedNames = new Set<string>();
    const visit = (declaration: ParsedDeclaration): number => {
      let bytes = encodedBytes(declaration.artifact) + 512;
      for (const reference of declaration.references) {
        const target = reference.kind === "named" ? byName.get(reference.name) : undefined;
        if (reference.kind === "named" && reference.name !== root.artifact.name) {
          referencedNames.add(reference.name);
        }
        // Covers tagged edge keys, site/symbol, omitted target/reason, and an
        // included target ID at its exact escaped byte length.
        bytes += 512 + 2 * encodedBytes(reference.name) +
          (target === undefined ? 0 : encodedBytes(target.artifact.id));
        if (
          reference.kind === "named" &&
          referencedNames.size <= MAX_REFERENCED_NAMES &&
          target !== undefined &&
          !expanded.has(target.artifact.id)
        ) {
          expanded.add(target.artifact.id);
          bytes += visit(target);
        }
      }
      return bytes;
    };
    expandedUnitBytes += visit(root);
  }
  return { declarations: parsed.length, expandedUnitBytes,
    ...(allowImports ? { hasImports: /\bimport\b/u.test(source) } : {}) };
};

/**
 * Reserve both graph branches before either creates declaration facts or units.
 * The function bound counts syntax sites without constructing function facts.
 * Each site can produce several tagged references during binding; the per-site
 * allowance includes its escaped text, target ID, and object structure.
 */
export const combinedAnalyzerMaterializationPreflight = (
  path: string,
  source: string,
): AnalyzerMaterializationPreflight | undefined => {
  const extension = extname(path).toLowerCase();
  if (extension === ".rs") return analyzerMaterializationPreflight(path, source);
  if (!supported.has(extension)) return undefined;
  try {
    const parser = new Parser();
    parser.setLanguage(extension === ".tsx" ? TypeScript.tsx : TypeScript.typescript);
    const root = (parser.parse(source) as unknown as { readonly rootNode: SyntaxNode }).rootNode;
    if (root.hasError) return undefined;
    const top = root.namedChildren.flatMap((node) => node.type === "export_statement"
      ? node.namedChildren.filter((child) => kindOf(child) !== undefined || child.type === "function_declaration")
      : [node]);
    const declarations = top.filter((node) => kindOf(node) !== undefined || node.type === "function_declaration");
    if (declarations.length === 0 || declarations.length > MAX_TYPE_DECLARATIONS) return undefined;
    const typeBound = analyzerMaterializationPreflight(path, source, true);
    const functions = declarations.filter((node) => node.type === "function_declaration");
    // A source with types must have a valid type preflight. Function-only files
    // legitimately have no type units, so their type estimate is zero.
    if (declarations.length !== functions.length && typeBound === undefined) return undefined;
    let functionBytes = 0;
    for (const node of functions) {
      const rendered = node.parent?.type === "export_statement" ? node.parent : node;
      const name = declarationNameNode(node)?.text;
      if (name === undefined) return undefined;
      const artifact = { path, id: `${path}:function:${name}`, kind: "function", name,
        source: rendered.text, sourceHash: "0".repeat(64) };
      functionBytes += encodedBytes(artifact) + 1024;
      for (const site of descendants(node)) {
        // Binding may emit multiple facts for one syntax site. JSON escaping
        // can expand a source character by at most six ASCII bytes.
        functionBytes += 4 * (1024 + 6 * Buffer.byteLength(site.text, "utf8") +
          2 * Buffer.byteLength(path, "utf8"));
      }
    }
    return {
      declarations: declarations.length,
      expandedUnitBytes: (typeBound?.expandedUnitBytes ?? 0) + functionBytes,
      hasImports: root.namedChildren.some((node) => node.type === "import_statement") || typeBound?.hasImports === true,
    };
  } catch {
    return undefined;
  }
};

export const typeDeclarationCount = (path: string, source: string): number | undefined =>
  analyzerMaterializationPreflight(path, source)?.declarations;

export const readyTypeUnits = (path: string, source: string): ReadonlyArray<ReviewUnit> => {
  const analysis = analyzeTypeFile(path, source);
  return analysis.status === "analyzed"
    ? analysis.units.flatMap((outcome) => outcome.status === "ready" ? [outcome.unit] : [])
    : [];
};

/** Compatibility helper for the original Add-only surface. */
export const analyzeSingleType = (path: string, source: string): TypeDeclaration | undefined => {
  const units = readyTypeUnits(path, source);
  const artifact = units.length === 1 ? units[0]?.root.artifact : undefined;
  return artifact?.kind === "function" ? undefined : artifact;
};

/** Revalidation returns the named root only when its complete evidence remains available. */
export const analyzeNamedUnit = (path: string, source: string, name: string): ReviewUnit | undefined =>
  readyTypeUnits(path, source).find(({ root }) => root.artifact.name === name);

export const analyzeNamedType = (path: string, source: string, name: string): TypeDeclaration | undefined => {
  const artifact = analyzeNamedUnit(path, source, name)?.root.artifact;
  return artifact?.kind === "function" ? undefined : artifact;
};
