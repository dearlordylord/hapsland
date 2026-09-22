import { extname } from "node:path";
import { createHash } from "node:crypto";
import Parser from "tree-sitter";
import TypeScript from "tree-sitter-typescript";
import type { TypeDeclaration } from "./model.ts";

type SyntaxNode = {
  readonly type: string;
  readonly text: string;
  readonly startIndex: number;
  readonly endIndex: number;
  readonly namedChildren: ReadonlyArray<SyntaxNode>;
  readonly parent?: SyntaxNode | null;
  readonly hasError?: boolean;
};

const supported = new Set([".ts", ".tsx", ".mts", ".cts"]);

const descendants = function* (node: SyntaxNode): Generator<SyntaxNode> {
  for (const child of node.namedChildren) {
    yield child;
    yield* descendants(child);
  }
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

const requiredTypeReferences = (declaration: SyntaxNode, nameNode: SyntaxNode) => {
  const parameters = new Set<string>();
  for (const node of descendants(declaration)) {
    if (node.type !== "type_parameter") continue;
    const name = node.namedChildren.find((child) => child.type === "type_identifier");
    if (name !== undefined) parameters.add(name.text);
  }
  return [...descendants(declaration)].filter((node) =>
    node.type === "type_identifier" &&
    node !== nameNode &&
    node.parent?.type !== "type_parameter" &&
    node.parent?.type !== "nested_type_identifier" &&
    !parameters.has(node.text)
  );
};

/**
 * Initial analyzer profile: exactly one named interface/type alias in the file,
 * with no declaration merge, parse error, or required named type reference.
 */
export const analyzeSingleType = (
  path: string,
  source: string,
): TypeDeclaration | undefined => {
  const extension = extname(path).toLowerCase();
  if (!supported.has(extension)) return undefined;
  const parser = new Parser();
  parser.setLanguage(extension === ".tsx" ? TypeScript.tsx : TypeScript.typescript);
  const tree = parser.parse(source) as unknown as { readonly rootNode: SyntaxNode };
  if (tree.rootNode.hasError) return undefined;
  if ([tree.rootNode, ...descendants(tree.rootNode)].some((node) => node.type === "import_statement")) {
    return undefined;
  }
  const declarations = [tree.rootNode, ...descendants(tree.rootNode)]
    .filter((node) => kindOf(node) !== undefined);
  if (declarations.length !== 1) return undefined;
  const declaration = declarations[0];
  if (declaration === undefined || declaration.hasError) return undefined;
  const nameNode = declarationNameNode(declaration);
  const kind = kindOf(declaration);
  if (nameNode === undefined || kind === undefined || nameNode.text.length === 0) return undefined;
  if (requiredTypeReferences(declaration, nameNode).length > 0) return undefined;
  // The native binding reports offsets in parser coordinates; node.text is the
  // authoritative slice and remains correct when a UTF-8 BOM is present.
  const rendered = declaration.text;
  return {
    kind,
    name: nameNode.text,
    source: rendered,
    sourceHash: createHash("sha256").update(rendered, "utf8").digest("hex"),
  };
};
