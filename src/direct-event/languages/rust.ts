import { descendants, sameSyntaxNode } from "./native-parser.ts";
import { createHash } from "node:crypto";
import { basename, extname } from "node:path";
import { Parser, Rust, type SyntaxNode } from "./native-parser.ts";
import type { TypeDeclaration } from "../model.ts";
import {
  MAX_TYPE_DECLARATIONS,
  type TypeExtractionFailure,
} from "./contracts.ts";
type ParsedDeclaration = {
  readonly node: SyntaxNode;
  readonly nameNode: SyntaxNode;
  readonly artifact: TypeDeclaration;
  readonly references: ReadonlyArray<
    | { readonly kind: "named"; readonly name: string }
    | { readonly kind: "unsupported"; readonly name: string }
  >;
};

import type { GraphDeclaration, GraphFile } from "./contracts.ts";
const declarationNameNode = (node: SyntaxNode): SyntaxNode | undefined =>
  node.namedChildren.find(
    (child) => child.type === "type_identifier" || child.type === "identifier",
  );

const rustBuiltins = new Set([
  "String",
  "str",
  "Option",
  "Result",
  "Vec",
  "Box",
]);

export type GraphInspectionOptions = {
  readonly rustCrateRoot?: boolean;
  readonly rustExternalModule?: boolean;
  readonly rustCrateModules?: ReadonlyMap<string, string>;
};

type RustNamespace = {
  readonly imports: Map<string, { path: string; name: string }>;
  readonly uncertain: boolean;
};

/** Resolve only explicit imports from modules declared in this source scope. */
const rustNamespace = (
  path: string,
  root: SyntaxNode,
  options: GraphInspectionOptions = {},
  moduleLinksOnly = false,
): RustNamespace => {
  const imports = new Map<string, { path: string; name: string }>();
  const modules = new Set<string>();
  const typeBindings = new Set(
    root.namedChildren
      .filter((node) =>
        [
          "struct_item",
          "enum_item",
          "type_item",
          "trait_item",
          "union_item",
        ].includes(node.type),
      )
      .map((node) => declarationNameNode(node)?.text),
  );
  let uncertain = false;
  for (const node of root.namedChildren) {
    if (node.type !== "mod_item") continue;
    const name = node.childForFieldName("name")?.text;
    if (
      name === undefined ||
      node.childForFieldName("body") !== null ||
      modules.has(name)
    )
      uncertain = true;
    else {
      modules.add(name);
      if (typeBindings.has(name)) uncertain = true;
    }
  }
  const stem = basename(path, ".rs");
  if (!options.rustCrateRoot && !options.rustExternalModule && modules.size > 0)
    uncertain = true;
  const directory = options.rustCrateRoot || stem === "mod" ? "." : `./${stem}`;
  const resolveType = (
    spelling: string,
  ): { path: string; name: string } | undefined => {
    if (spelling.startsWith("crate::")) {
      const match =
        /^crate::([A-Za-z_][A-Za-z0-9_]*)::([A-Za-z_][A-Za-z0-9_]*)$/.exec(
          spelling,
        );
      if (match?.[1] === undefined || match[2] === undefined) return undefined;
      const target = options.rustCrateModules?.get(match[1]);
      if (target !== undefined) return { path: target, name: match[2] };
      if (!options.rustCrateRoot) return undefined;
      spelling = spelling.slice("crate::".length);
    }
    const match =
      /^(?:self::)?([A-Za-z_][A-Za-z0-9_]*)::([A-Za-z_][A-Za-z0-9_]*)$/.exec(
        spelling,
      );
    if (
      match?.[1] === undefined ||
      match[2] === undefined ||
      !modules.has(match[1])
    )
      return undefined;
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
  for (const node of root.namedChildren) {
    if (node.type !== "use_declaration") continue;
    // Reexports need visibility and namespace traversal beyond this profile.
    if (
      node.namedChildren.some((child) => child.type === "visibility_modifier")
    ) {
      uncertain = true;
      continue;
    }
    const argument = node.childForFieldName("argument");
    if (argument?.type === "scoped_use_list") {
      const prefix = argument.childForFieldName("path")?.text;
      for (const item of argument.childForFieldName("list")?.namedChildren ??
        []) {
        const name =
          item.type === "identifier"
            ? item.text
            : item.type === "use_as_clause"
              ? item.childForFieldName("path")?.text
              : undefined;
        const local =
          item.type === "use_as_clause"
            ? item.childForFieldName("alias")?.text
            : name;
        if (prefix === undefined || name === undefined || local === undefined)
          uncertain = true;
        else bind(local, `${prefix}::${name}`);
      }
    } else if (argument?.type === "scoped_identifier") {
      bind(argument.childForFieldName("name")?.text ?? "", argument.text);
    } else if (argument?.type === "use_as_clause") {
      const target = argument.childForFieldName("path")?.text;
      const local = argument.childForFieldName("alias")?.text;
      if (target === undefined || local === undefined) uncertain = true;
      else bind(local, target);
    } else uncertain = true;
  }
  for (const node of descendants(root)) {
    if (node.type !== "scoped_type_identifier") continue;
    const target = resolveType(node.text);
    if (target !== undefined) imports.set(node.text, target);
  }
  if (
    descendants(root).some(
      (node) =>
        node.type === "attribute_item" || node.type === "inner_attribute_item",
    )
  )
    uncertain = true;
  return { imports: uncertain ? new Map() : imports, uncertain };
};

/** Source-only module links; the resolver establishes Cargo origin and captures. */
export const inspectRustModules = (
  source: string,
): { readonly names: ReadonlyArray<string> } | undefined => {
  try {
    const parser = new Parser();
    parser.setLanguage(Rust);
    const root = (
      parser.parse(source) as unknown as { readonly rootNode: SyntaxNode }
    ).rootNode;
    if (
      root.hasError ||
      descendants(root).some((node) =>
        [
          "macro_definition",
          "macro_invocation",
          "extern_crate_declaration",
          "foreign_mod_item",
        ].includes(node.type),
      )
    )
      return undefined;
    if (rustNamespace("lib.rs", root, { rustCrateRoot: true }, true).uncertain)
      return undefined;
    const names = root.namedChildren
      .filter((node) => node.type === "mod_item")
      .map((node) => node.childForFieldName("name")?.text);
    if (
      names.some(
        (name) => name === undefined || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(name),
      )
    )
      return undefined;
    return { names: names as ReadonlyArray<string> };
  } catch {
    return undefined;
  }
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
  const root = (
    parser.parse(source) as unknown as { readonly rootNode: SyntaxNode }
  ).rootNode;
  if (root.hasError)
    return { status: "unsupported", reason: "parse", units: [] };
  const declarations = root.namedChildren.filter((node) =>
    ["struct_item", "enum_item", "type_item"].includes(node.type),
  );
  if (declarations.length === 0)
    return { status: "unsupported", reason: "no-declarations", units: [] };
  if (declarations.length > MAX_TYPE_DECLARATIONS)
    return { status: "unsupported", reason: "declaration-limit", units: [] };
  const namespace = rustNamespace(path, root, options);
  const localNames = new Set(
    root.namedChildren
      .filter((node) =>
        [
          "struct_item",
          "enum_item",
          "type_item",
          "union_item",
          "trait_item",
          "mod_item",
        ].includes(node.type),
      )
      .map((node) => declarationNameNode(node)?.text),
  );
  // Imports, modules, macros and file attributes can change name resolution or
  // emitted declarations. Keep explicit roots, but never claim their closure.
  const uncertainScope =
    namespace.uncertain ||
    (!allowImports &&
      root.namedChildren.some(
        (node) => node.type === "mod_item" || node.type === "use_declaration",
      )) ||
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
  const parsed: ParsedDeclaration[] = [];
  let attributes: SyntaxNode[] = [];
  for (const node of root.namedChildren) {
    if (node.type === "attribute_item") {
      attributes.push(node);
      continue;
    }
    if (node.type === "line_comment" || node.type === "block_comment") continue;
    if (
      !declarations.some((declaration) => sameSyntaxNode(declaration, node))
    ) {
      attributes = [];
      continue;
    }
    const nameNode = declarationNameNode(node);
    if (
      nameNode === undefined ||
      !/^[\p{ID_Start}_][\p{ID_Continue}]*$/u.test(nameNode.text)
    )
      return { status: "unsupported", reason: "parse", units: [] };
    const kind =
      node.type === "struct_item"
        ? "struct"
        : node.type === "enum_item"
          ? "enum"
          : "type-alias";
    const start = attributes[0]?.startPosition ?? node.startPosition;
    const rendered = source.slice(
      attributes[0]?.startIndex ?? node.startIndex,
      node.endIndex,
    );
    const parameters = new Set(
      node.namedChildren
        .find((child) => child.type === "type_parameters")
        ?.namedChildren.filter((child) => child.type === "type_parameter")
        .map((child) => child.childForFieldName("name")?.text) ?? [],
    );
    const references: ParsedDeclaration["references"][number][] = [];
    if (uncertainScope || attributes.length > 0)
      references.push({ kind: "unsupported", name: nameNode.text });
    for (const child of descendants(node)) {
      if (child.type === "scoped_type_identifier") {
        const shadowed = parameters.has(child.text.split("::")[0]);
        references.push({
          kind:
            !shadowed && namespace.imports.has(child.text)
              ? "named"
              : "unsupported",
          name: child.text,
        });
        continue;
      }
      if (
        [
          "attribute_item",
          "macro_invocation",
          "qualified_type",
          "trait_bounds",
          "where_clause",
          "const_parameter",
          "dynamic_type",
          "abstract_type",
        ].includes(child.type)
      ) {
        references.push({ kind: "unsupported", name: nameNode.text });
      }
      if (
        (child.type === "array_type" &&
          child.childForFieldName("length")?.type !== "integer_literal") ||
        (child.type === "enum_variant" &&
          child.childForFieldName("value") !== null &&
          child.childForFieldName("value")?.type !== "integer_literal") ||
        (child.parent?.type === "type_arguments" &&
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
          ].includes(child.type))
      ) {
        references.push({ kind: "unsupported", name: nameNode.text });
      }
      if (
        child.type !== "type_identifier" ||
        child.parent?.type === "scoped_type_identifier" ||
        sameSyntaxNode(child, nameNode) ||
        (sameSyntaxNode(child, child.parent?.childForFieldName("name")) &&
          child.parent?.type === "type_parameter") ||
        parameters.has(child.text)
      )
        continue;
      if (child.text === "Self")
        references.push({ kind: "named", name: nameNode.text });
      else if (
        localNames.has(child.text) ||
        namespace.imports.has(child.text) ||
        !rustBuiltins.has(child.text)
      )
        references.push({ kind: "named", name: child.text });
    }
    const unique = [
      ...new Map(
        references.map((reference) => [
          `${reference.kind}:${reference.name}`,
          reference,
        ]),
      ).values(),
    ];
    parsed.push({
      node: { ...node, startPosition: start, endPosition: node.endPosition },
      nameNode,
      artifact: {
        id: `${path}:${kind}:${nameNode.text}`,
        kind,
        name: nameNode.text,
        source: rendered,
        sourceHash: createHash("sha256").update(rendered, "utf8").digest("hex"),
      },
      references: unique,
    });
    attributes = [];
  }
  if (
    new Set(parsed.map(({ artifact }) => artifact.name)).size !== parsed.length
  )
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
    const root = (
      parser.parse(source) as unknown as { readonly rootNode: SyntaxNode }
    ).rootNode;
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
export const parseTypes = (
  path: string,
  source: string,
  allowImports = false,
) => {
  try {
    return normalized(parseRustTypes(path, source, allowImports));
  } catch {
    return { status: "unsupported", reason: "parse", units: [] } as const;
  }
};
