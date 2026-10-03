import { descendants, sameSyntaxNode } from "./native-parser.ts";
import { createHash } from "node:crypto";
import { basename, extname } from "node:path";
import { Parser, Rust, type SyntaxNode } from "./native-parser.ts";
import type { TypeDeclaration } from "../model.ts";
import { MAX_TYPE_DECLARATIONS, type TypeExtractionFailure } from "./contracts.ts";
type ParsedDeclaration = {
  readonly node: SyntaxNode;
  readonly nameNode: SyntaxNode;
  readonly artifact: TypeDeclaration;
  readonly references: ReadonlyArray<
    { readonly kind: "named"; readonly name: string } | { readonly kind: "unsupported"; readonly name: string }
  >;
};

import type { GraphDeclaration, GraphFile } from "./contracts.ts";
const declarationNameNode = (node: SyntaxNode): SyntaxNode | undefined =>
  node.namedChildren.find((child) => child.type === "type_identifier" || child.type === "identifier");

const rustBuiltins = new Set(["String", "str", "Option", "Result", "Vec", "Box"]);

export type GraphInspectionOptions = {
  readonly rustCrateRoot?: boolean;
  readonly rustExternalModule?: boolean;
  readonly rustCrateModules?: ReadonlyMap<string, string>;
};

type RustNamespace = {
  readonly imports: Map<string, { path: string; name: string }>;
  readonly uncertain: boolean;
};

const rustNamespaceModules = (root: SyntaxNode) => {
  const modules = new Set<string>();
  const typeBindings = new Set(
    root.namedChildren
      .filter((node) => ["struct_item", "enum_item", "type_item", "trait_item", "union_item"].includes(node.type))
      .map((node) => declarationNameNode(node)?.text),
  );
  let uncertain = false;
  for (const node of root.namedChildren) {
    if (node.type !== "mod_item") continue;
    const name = node.childForFieldName("name")?.text;
    if (name === undefined || node.childForFieldName("body") !== null || modules.has(name)) uncertain = true;
    else {
      modules.add(name);
      if (typeBindings.has(name)) uncertain = true;
    }
  }
  return { modules, typeBindings, uncertain };
};

const rustNamespaceDirectory = (path: string, modules: ReadonlySet<string>, options: GraphInspectionOptions) => {
  const stem = basename(path, ".rs");
  return {
    uncertain: !options.rustCrateRoot && !options.rustExternalModule && modules.size > 0,
    directory: options.rustCrateRoot || stem === "mod" ? "." : `./${stem}`,
  };
};

const rustUseIdentity = (item: SyntaxNode) => {
  if (item.type === "identifier") return { name: item.text, local: item.text };
  if (item.type === "use_as_clause")
    return { name: item.childForFieldName("path")?.text, local: item.childForFieldName("alias")?.text };
  return { name: undefined, local: undefined };
};

const bindRustUseAlias = (argument: SyntaxNode, bind: (local: string, spelling: string) => void): boolean => {
  const target = argument.childForFieldName("path")?.text;
  const local = argument.childForFieldName("alias")?.text;
  if (target === undefined || local === undefined) return false;
  bind(local, target);
  return true;
};

const bindRustUseList = (argument: SyntaxNode, bind: (local: string, spelling: string) => void): boolean => {
  let valid = true;
  const prefix = argument.childForFieldName("path")?.text;
  for (const item of argument.childForFieldName("list")?.namedChildren ?? []) {
    const { name, local } = rustUseIdentity(item);
    if (prefix === undefined || name === undefined || local === undefined) valid = false;
    else bind(local, `${prefix}::${name}`);
  }
  return valid;
};

const bindRustUse = (node: SyntaxNode, bind: (local: string, spelling: string) => void): boolean => {
  // Reexports require visibility and namespace traversal beyond this profile.
  if (node.namedChildren.some((child) => child.type === "visibility_modifier")) return false;
  const argument = node.childForFieldName("argument");
  switch (argument?.type) {
    case "scoped_use_list":
      return bindRustUseList(argument, bind);
    case "scoped_identifier":
      bind(argument.childForFieldName("name")?.text ?? "", argument.text);
      return true;
    case "use_as_clause":
      return bindRustUseAlias(argument, bind);
    default:
      return false;
  }
};

const bindRustUses = (root: SyntaxNode, bind: (local: string, spelling: string) => void): boolean => {
  let valid = true;
  for (const node of root.namedChildren) {
    if (node.type === "use_declaration" && !bindRustUse(node, bind)) valid = false;
  }
  return valid;
};

const resolveRustScopedTypes = (
  root: SyntaxNode,
  imports: RustNamespace["imports"],
  resolveType: (spelling: string) => { path: string; name: string } | undefined,
) => {
  for (const node of descendants(root)) {
    if (node.type !== "scoped_type_identifier") continue;
    const target = resolveType(node.text);
    if (target !== undefined) imports.set(node.text, target);
  }
};

const hasRustFileAttributes = (root: SyntaxNode): boolean =>
  descendants(root).some((node) => node.type === "attribute_item" || node.type === "inner_attribute_item");

const resolveRustCrateSpelling = (
  spelling: string,
  options: GraphInspectionOptions,
): string | { path: string; name: string } | undefined => {
  if (spelling.startsWith("crate::")) {
    const match = /^crate::([A-Za-z_][A-Za-z0-9_]*)::([A-Za-z_][A-Za-z0-9_]*)$/.exec(spelling);
    if (match?.[1] === undefined || match[2] === undefined) return undefined;
    const target = options.rustCrateModules?.get(match[1]);
    if (target !== undefined) return { path: target, name: match[2] };
    if (!options.rustCrateRoot) return undefined;
    return spelling.slice("crate::".length);
  }
  return spelling;
};

/** Resolve only explicit imports from modules declared in this source scope. */
const rustNamespace = (
  path: string,
  root: SyntaxNode,
  options: GraphInspectionOptions = {},
  moduleLinksOnly = false,
): RustNamespace => {
  const imports = new Map<string, { path: string; name: string }>();
  const collected = rustNamespaceModules(root);
  const { modules, typeBindings } = collected;
  const scoped = rustNamespaceDirectory(path, modules, options);
  const directory = scoped.directory;
  let uncertain = collected.uncertain || scoped.uncertain;
  const resolveType = (spelling: string): { path: string; name: string } | undefined => {
    const resolved = resolveRustCrateSpelling(spelling, options);
    if (typeof resolved !== "string") return resolved;
    spelling = resolved;
    const match = /^(?:self::)?([A-Za-z_][A-Za-z0-9_]*)::([A-Za-z_][A-Za-z0-9_]*)$/.exec(spelling);
    if (match?.[1] === undefined || match[2] === undefined || !modules.has(match[1])) return undefined;
    return { path: `${directory}/${match[1]}`, name: match[2] };
  };
  const bind = (local: string, spelling: string) => {
    const target = resolveType(spelling);
    if (
      (!moduleLinksOnly && target === undefined) ||
      imports.has(local) ||
      typeBindings.has(local) ||
      modules.has(local) ||
      !/^[A-Za-z_][A-Za-z0-9_]*$/.test(local)
    ) {
      uncertain = true;
      return;
    }
    imports.set(local, target ?? { path: "", name: local });
  };
  if (!bindRustUses(root, bind)) uncertain = true;
  resolveRustScopedTypes(root, imports, resolveType);
  if (hasRustFileAttributes(root)) uncertain = true;
  return { imports: uncertain ? new Map() : imports, uncertain };
};

/** Source-only module links; the resolver establishes Cargo origin and captures. */
export const inspectRustModules = (source: string): { readonly names: ReadonlyArray<string> } | undefined => {
  try {
    const parser = new Parser();
    parser.setLanguage(Rust);
    const root = (parser.parse(source) as unknown as { readonly rootNode: SyntaxNode }).rootNode;
    if (
      root.hasError ||
      descendants(root).some((node) =>
        ["macro_definition", "macro_invocation", "extern_crate_declaration", "foreign_mod_item"].includes(node.type),
      )
    )
      return undefined;
    if (rustNamespace("lib.rs", root, { rustCrateRoot: true }, true).uncertain) return undefined;
    const names = root.namedChildren
      .filter((node) => node.type === "mod_item")
      .map((node) => node.childForFieldName("name")?.text);
    if (names.some((name) => name === undefined || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(name))) return undefined;
    return { names: names as ReadonlyArray<string> };
  } catch {
    return undefined;
  }
};

const rustTypeScope = (path: string, root: SyntaxNode, allowImports: boolean, options: GraphInspectionOptions) => {
  const namespace = rustNamespace(path, root, options);
  const localNames = new Set(
    root.namedChildren
      .filter((node) =>
        ["struct_item", "enum_item", "type_item", "union_item", "trait_item", "mod_item"].includes(node.type),
      )
      .map((node) => declarationNameNode(node)?.text),
  );
  // Imports, modules, macros and file attributes can change name resolution or
  // emitted declarations. Keep explicit roots, but never claim their closure.
  const uncertainScope =
    namespace.uncertain ||
    (!allowImports && root.namedChildren.some((node) => node.type === "mod_item" || node.type === "use_declaration")) ||
    [root, ...descendants(root)].some((node) =>
      [
        "macro_definition",
        "macro_invocation",
        "inner_attribute_item",
        "attribute_item",
        "extern_crate_declaration",
        "foreign_mod_item",
      ].includes(node.type),
    );
  return { namespace, localNames, uncertainScope };
};

const unsupportedRustTypeSyntax = (child: SyntaxNode): boolean =>
  [
    "attribute_item",
    "macro_invocation",
    "qualified_type",
    "trait_bounds",
    "where_clause",
    "const_parameter",
    "dynamic_type",
    "abstract_type",
  ].includes(child.type);

const unsupportedRustConst = (child: SyntaxNode): boolean =>
  (child.type === "array_type" && child.childForFieldName("length")?.type !== "integer_literal") ||
  (child.type === "enum_variant" &&
    child.childForFieldName("value") !== null &&
    child.childForFieldName("value")?.type !== "integer_literal");

const unsupportedRustTypeArgument = (child: SyntaxNode): boolean =>
  child.parent?.type === "type_arguments" &&
  ![
    "type_identifier",
    "primitive_type",
    "generic_type",
    "reference_type",
    "tuple_type",
    "array_type",
    "scoped_type_identifier",
    "lifetime",
    "unit_type",
    "pointer_type",
    "function_type",
  ].includes(child.type);

const excludedRustReference = (
  child: SyntaxNode,
  nameNode: SyntaxNode,
  parameters: ReadonlySet<string | undefined>,
): boolean =>
  child.type !== "type_identifier" ||
  child.parent?.type === "scoped_type_identifier" ||
  sameSyntaxNode(child, nameNode) ||
  (sameSyntaxNode(child, child.parent?.childForFieldName("name")) && child.parent?.type === "type_parameter") ||
  parameters.has(child.text);

type RustReference = ParsedDeclaration["references"][number];
const ordinaryRustReference = (
  child: SyntaxNode,
  nameNode: SyntaxNode,
  parameters: ReadonlySet<string | undefined>,
  scope: ReturnType<typeof rustTypeScope>,
): RustReference | undefined => {
  if (excludedRustReference(child, nameNode, parameters)) return undefined;
  if (child.text === "Self") return { kind: "named", name: nameNode.text };
  if (scope.localNames.has(child.text) || scope.namespace.imports.has(child.text) || !rustBuiltins.has(child.text))
    return { kind: "named", name: child.text };
  return undefined;
};

const rustNodeReferences = (
  child: SyntaxNode,
  nameNode: SyntaxNode,
  parameters: ReadonlySet<string | undefined>,
  scope: ReturnType<typeof rustTypeScope>,
): ReadonlyArray<RustReference> => {
  if (child.type === "scoped_type_identifier") {
    const shadowed = parameters.has(child.text.split("::")[0]);
    return [{ kind: !shadowed && scope.namespace.imports.has(child.text) ? "named" : "unsupported", name: child.text }];
  }
  const references: RustReference[] = [];
  if (unsupportedRustTypeSyntax(child)) references.push({ kind: "unsupported", name: nameNode.text });
  if (unsupportedRustConst(child) || unsupportedRustTypeArgument(child))
    references.push({ kind: "unsupported", name: nameNode.text });
  const reference = ordinaryRustReference(child, nameNode, parameters, scope);
  if (reference !== undefined) references.push(reference);
  return references;
};

const rustDeclarationReferences = (
  node: SyntaxNode,
  nameNode: SyntaxNode,
  attributed: boolean,
  scope: ReturnType<typeof rustTypeScope>,
): ReadonlyArray<RustReference> => {
  const parameters = new Set(
    node.namedChildren
      .find((child) => child.type === "type_parameters")
      ?.namedChildren.filter((child) => child.type === "type_parameter")
      .map((child) => child.childForFieldName("name")?.text) ?? [],
  );
  const references: RustReference[] = [];
  if (scope.uncertainScope || attributed) references.push({ kind: "unsupported", name: nameNode.text });
  references.push(...descendants(node).flatMap((child) => rustNodeReferences(child, nameNode, parameters, scope)));
  return [...new Map(references.map((reference) => [`${reference.kind}:${reference.name}`, reference])).values()];
};

const rustDeclaration = (
  path: string,
  source: string,
  node: SyntaxNode,
  attributes: ReadonlyArray<SyntaxNode>,
  scope: ReturnType<typeof rustTypeScope>,
): ParsedDeclaration | undefined => {
  const nameNode = declarationNameNode(node);
  if (nameNode === undefined || !/^[\p{ID_Start}_][\p{ID_Continue}]*$/u.test(nameNode.text)) return undefined;
  const kind = node.type === "struct_item" ? "struct" : node.type === "enum_item" ? "enum" : "type-alias";
  const start = attributes[0]?.startPosition ?? node.startPosition;
  const rendered = source.slice(attributes[0]?.startIndex ?? node.startIndex, node.endIndex);
  return {
    node: { ...node, startPosition: start, endPosition: node.endPosition },
    nameNode,
    artifact: {
      id: `${path}:${kind}:${nameNode.text}`,
      kind,
      name: nameNode.text,
      source: rendered,
      sourceHash: createHash("sha256").update(rendered, "utf8").digest("hex"),
    },
    references: rustDeclarationReferences(node, nameNode, attributes.length > 0, scope),
  };
};

const collectRustDeclarations = (
  path: string,
  source: string,
  root: SyntaxNode,
  declarations: ReadonlyArray<SyntaxNode>,
  scope: ReturnType<typeof rustTypeScope>,
): ReadonlyArray<ParsedDeclaration> | undefined => {
  const parsed: ParsedDeclaration[] = [];
  let attributes: SyntaxNode[] = [];
  for (const node of root.namedChildren) {
    if (node.type === "attribute_item") {
      attributes.push(node);
      continue;
    }
    if (node.type === "line_comment" || node.type === "block_comment") continue;
    if (!declarations.some((declaration) => sameSyntaxNode(declaration, node))) {
      attributes = [];
      continue;
    }
    const declaration = rustDeclaration(path, source, node, attributes, scope);
    if (declaration === undefined) return undefined;
    parsed.push(declaration);
    attributes = [];
  }
  return parsed;
};

/** Rust facts intentionally stay in one top-level scope without expansion. */
const parseRustTypes = (
  path: string,
  source: string,
  allowImports: boolean,
  options: GraphInspectionOptions = {},
): TypeExtractionFailure | ReadonlyArray<ParsedDeclaration> => {
  const parser = new Parser();
  parser.setLanguage(Rust);
  const root = (parser.parse(source) as unknown as { readonly rootNode: SyntaxNode }).rootNode;
  if (root.hasError) return { status: "unsupported", reason: "parse", units: [] };
  const declarations = root.namedChildren.filter((node) =>
    ["struct_item", "enum_item", "type_item"].includes(node.type),
  );
  if (declarations.length === 0) return { status: "unsupported", reason: "no-declarations", units: [] };
  if (declarations.length > MAX_TYPE_DECLARATIONS)
    return { status: "unsupported", reason: "declaration-limit", units: [] };
  const scope = rustTypeScope(path, root, allowImports, options);
  const parsed = collectRustDeclarations(path, source, root, declarations, scope);
  if (parsed === undefined) return { status: "unsupported", reason: "parse", units: [] };
  if (new Set(parsed.map(({ artifact }) => artifact.name)).size !== parsed.length)
    return { status: "unsupported", reason: "declaration-merge", units: [] };
  return parsed;
};

export const inspectRust = (
  path: string,
  source: string,
  options: GraphInspectionOptions = {},
): GraphFile | undefined => {
  const parsed = parseRustTypes(path, source, true, options);
  if ("status" in parsed) return undefined;
  {
    const parser = new Parser();
    parser.setLanguage(Rust);
    const root = (parser.parse(source) as unknown as { readonly rootNode: SyntaxNode }).rootNode;
    return {
      declarations: new Map(
        parsed.map(({ artifact, references, node }) => [
          artifact.name,
          {
            artifact: { ...artifact, path },
            references,
            exported: /^(?:pub\s|pub\(crate\)\s)/u.test(artifact.source),
            location: {
              start: {
                line: node.startPosition.row + 1,
                column: node.startPosition.column + 1,
              },
              end: {
                line: node.endPosition.row + 1,
                column: node.endPosition.column + 1,
              },
            },
          },
        ]),
      ),
      imports: rustNamespace(path, root, options).imports,
    };
  }
};

const normalized = (
  parsed: TypeExtractionFailure | ReadonlyArray<ParsedDeclaration>,
): TypeExtractionFailure | ReadonlyArray<GraphDeclaration> =>
  "status" in parsed
    ? parsed
    : parsed.map(({ artifact, references, node }) => ({
        artifact,
        references,
        exported: false,
        location: {
          start: {
            line: node.startPosition.row + 1,
            column: node.startPosition.column + 1,
          },
          end: {
            line: node.endPosition.row + 1,
            column: node.endPosition.column + 1,
          },
        },
      }));
export const parseTypes = (path: string, source: string, allowImports = false) => {
  try {
    return normalized(parseRustTypes(path, source, allowImports));
  } catch {
    return { status: "unsupported", reason: "parse", units: [] } as const;
  }
};
