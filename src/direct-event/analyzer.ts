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

const requiredTypeReferences = (declaration: SyntaxNode, nameNode: SyntaxNode) => {
  const parameters = new Set<string>();
  for (const node of descendants(declaration)) {
    if (node.type !== "type_parameter") continue;
    const name = node.namedChildren.find((child) => child.type === "type_identifier");
    if (name !== undefined) parameters.add(name.text);
  }
  return descendants(declaration).filter((node) =>
    node.type === "nested_type_identifier" ||
    node.type === "type_query" ||
    (
      node.type === "type_identifier" &&
      node !== nameNode &&
      node.parent?.type !== "type_parameter" &&
      !parameters.has(node.text)
    )
  );
};

const parseDeclarations = (
  path: string,
  source: string,
): ReadonlyArray<SyntaxNode> | undefined => {
  const extension = extname(path).toLowerCase();
  if (!supported.has(extension)) return undefined;
  try {
    const parser = new Parser();
    parser.setLanguage(extension === ".tsx" ? TypeScript.tsx : TypeScript.typescript);
    const tree = parser.parse(source) as unknown as { readonly rootNode: SyntaxNode };
    if (tree.rootNode.hasError) return undefined;
    const nodes = [tree.rootNode, ...descendants(tree.rootNode)];
    if (nodes.some((node) => node.type === "import_statement")) return undefined;
    return nodes.filter((node) => kindOf(node) !== undefined);
  } catch {
    return undefined;
  }
};

const declarationArtifact = (declaration: SyntaxNode): TypeDeclaration | undefined => {
  if (declaration.hasError) return undefined;
  const nameNode = declarationNameNode(declaration);
  const kind = kindOf(declaration);
  if (nameNode === undefined || kind === undefined || nameNode.text.length === 0) return undefined;
  if (requiredTypeReferences(declaration, nameNode).length > 0) return undefined;
  const rendered = declaration.text;
  return {
    kind,
    name: nameNode.text,
    source: rendered,
    sourceHash: createHash("sha256").update(rendered, "utf8").digest("hex"),
  };
};

/**
 * Initial analyzer profile: exactly one named interface/type alias in the file,
 * with no declaration merge, parse error, or required named type reference.
 */
export const analyzeSingleType = (
  path: string,
  source: string,
): TypeDeclaration | undefined => {
  const declarations = parseDeclarations(path, source);
  if (declarations === undefined || declarations.length !== 1) return undefined;
  const declaration = declarations[0];
  return declaration === undefined ? undefined : declarationArtifact(declaration);
};

/** Revalidation identifies the frozen root without requiring sibling stability. */
export const analyzeNamedType = (
  path: string,
  source: string,
  name: string,
): TypeDeclaration | undefined => {
  const declarations = parseDeclarations(path, source);
  if (declarations === undefined) return undefined;
  const matching = declarations.filter((declaration) =>
    declarationNameNode(declaration)?.text === name);
  if (matching.length !== 1) return undefined;
  const declaration = matching[0];
  return declaration === undefined ? undefined : declarationArtifact(declaration);
};
