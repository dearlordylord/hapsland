import Parser from "tree-sitter";
import TypeScript from "tree-sitter-typescript";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { basename, extname, relative, resolve } from "node:path";
import type { LspPosition, LspRange } from "./protocol.ts";

export type ByteRange = { start: number; end: number };

export type ExactRange = {
  byte: ByteRange;
  line: { start: number; end: number };
  utf16: LspRange;
};

export type DeclarationKind = "interface" | "type-alias";

export type SyntaxReference = {
  name: string;
  syntaxKind: string;
  sourceRange: ExactRange;
  startByte: number;
};

export type DeclarationArtifact = {
  id: string;
  path: string;
  kind: DeclarationKind;
  name: string;
  source: string;
  sourceHash: string;
  range: ExactRange;
  references: SyntaxReference[];
  parserError: boolean;
  node: TreeNode;
};

export type SourceFile = {
  path: string;
  absolutePath: string;
  text: string;
  uri: string;
  tree: Tree;
};

type Tree = {
  rootNode: TreeNode;
};

type TreeNode = {
  type: string;
  text: string;
  startIndex: number;
  endIndex: number;
  startPosition: { row: number; column: number };
  endPosition: { row: number; column: number };
  namedChildren: TreeNode[];
  parent?: TreeNode | null;
  hasError?: boolean;
};

const parser = new Parser();
// The grammar package is CommonJS-shaped and intentionally consumed through its
// default import. This is the supported runtime form for the pinned binding.
parser.setLanguage(TypeScript.typescript);

const utf16Length = (value: string) => value.length;

const byteOffsetAtUtf16Position = (source: string, position: LspPosition) => {
  const lines = source.split("\n");
  const line = lines[Math.max(0, Math.min(position.line, lines.length - 1))] ?? "";
  const character = Math.max(0, Math.min(position.character, line.length));
  const prefix = line.slice(0, character);
  const lineStart = lines
    .slice(0, Math.max(0, Math.min(position.line, lines.length - 1)))
    .reduce((sum, item) => sum + Buffer.byteLength(item, "utf8") + 1, 0);
  return lineStart + Buffer.byteLength(prefix, "utf8");
};

export const positionAtByte = (source: string, byte: number): LspPosition => {
  const bytes = Buffer.from(source, "utf8");
  const bounded = Math.max(0, Math.min(byte, bytes.length));
  const prefix = bytes.subarray(0, bounded).toString("utf8");
  const line = prefix.split("\n").length - 1;
  const lineText = prefix.slice(prefix.lastIndexOf("\n") + 1);
  return { line, character: utf16Length(lineText) };
};

export const exactRange = (source: string, start: number, end: number): ExactRange => {
  const startPosition = positionAtByte(source, start);
  const endPosition = positionAtByte(source, end);
  return {
    byte: { start, end },
    line: { start: startPosition.line, end: endPosition.line },
    utf16: { start: startPosition, end: endPosition },
  };
};

export const byteRangeFromLsp = (source: string, range: LspRange): ByteRange => ({
  start: byteOffsetAtUtf16Position(source, range.start),
  end: byteOffsetAtUtf16Position(source, range.end),
});

export const rangeIntersects = (node: ByteRange, change: ByteRange) => {
  if (change.start === change.end) {
    return node.start <= change.start && change.start <= node.end;
  }
  return node.start < change.end && change.start < node.end;
};

export const sha256 = (value: string) =>
  createHash("sha256").update(value, "utf8").digest("hex");

export const parseSource = (path: string, absolutePath: string, text: string, uri: string): SourceFile => ({
  path,
  absolutePath,
  text,
  uri,
  tree: parser.parse(text) as unknown as Tree,
});

const declarationKind = (node: TreeNode): DeclarationKind | undefined => {
  if (node.type === "interface_declaration") return "interface";
  if (node.type === "type_alias_declaration") return "type-alias";
  return undefined;
};

const declarationName = (node: TreeNode) => {
  const name = node.namedChildren.find(
    (child) => child.type === "type_identifier" || child.type === "identifier",
  );
  return name?.text ?? "<anonymous>";
};

const descendants = function* (node: TreeNode): Generator<TreeNode> {
  for (const child of node.namedChildren) {
    yield child;
    yield* descendants(child);
  }
};

const containsNode = (node: TreeNode, child: TreeNode) =>
  node.startIndex <= child.startIndex && child.endIndex <= node.endIndex;

const declarationNodes = (tree: Tree): TreeNode[] => {
  const result: TreeNode[] = [];
  const visit = (node: TreeNode) => {
    if (declarationKind(node)) result.push(node);
    for (const child of node.namedChildren) visit(child);
  };
  visit(tree.rootNode);
  return result.sort((left, right) => left.startIndex - right.startIndex || left.endIndex - right.endIndex);
};

const declaredTypeParameters = (root: TreeNode) => {
  const names = new Set<string>();
  for (const node of descendants(root)) {
    if (node.type === "type_parameter") {
      const name = node.namedChildren.find((child) => child.type === "type_identifier");
      if (name) names.add(name.text);
    }
  }
  return names;
};

const isDeclarationName = (root: TreeNode, node: TreeNode) => {
  const kind = declarationKind(root);
  if (!kind) return false;
  if (node.parent !== root) return false;
  return node.type === "type_identifier" && node.text === declarationName(root);
};

const referenceNameNode = (node: TreeNode) => {
  if (node.type !== "nested_type_identifier") return node;
  return (
    node.namedChildren.findLast((child) => child.type === "type_identifier") ??
    node.namedChildren[node.namedChildren.length - 1] ??
    node
  );
};

const referenceFor = (root: TreeNode, node: TreeNode, source: string, parameters: Set<string>) => {
  const parent = node.parent;
  if (node.type === "type_identifier") {
    if (isDeclarationName(root, node)) return undefined;
    if (parent?.type === "nested_type_identifier") return undefined;
    if (parent?.type === "type_parameter") return undefined;
    if (parameters.has(node.text)) return undefined;
  }
  if (node.type !== "type_identifier" && node.type !== "nested_type_identifier") return undefined;
  const target = referenceNameNode(node);
  return {
    name: target.text,
    syntaxKind: node.type,
    sourceRange: exactRange(source, target.startIndex, target.endIndex),
    startByte: target.startIndex,
  } satisfies SyntaxReference;
};

export const referencesFor = (root: TreeNode, source: string) => {
  const parameters = declaredTypeParameters(root);
  const references: SyntaxReference[] = [];
  for (const node of descendants(root)) {
    const reference = referenceFor(root, node, source, parameters);
    if (reference) references.push(reference);
  }
  const seen = new Set<string>();
  return references
    .sort((left, right) => left.startByte - right.startByte || left.name.localeCompare(right.name))
    .filter((reference) => {
      const key = `${reference.startByte}:${reference.name}:${reference.syntaxKind}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
};

export const artifactsFor = (sourceFile: SourceFile, path = sourceFile.path) => {
  const occurrences = new Map<string, number>();
  return declarationNodes(sourceFile.tree).map((node) => {
    const kind = declarationKind(node) as DeclarationKind;
    const name = declarationName(node);
    const occurrence = occurrences.get(`${kind}:${name}`) ?? 0;
    occurrences.set(`${kind}:${name}`, occurrence + 1);
    // Tree-sitter represents `export interface` as an export_statement whose
    // declaration child starts at `interface`. The artifact must retain that
    // modifier because it is part of the exact declaration source presented to
    // the review seam.
    const artifactNode = node.parent?.type === "export_statement" ? node.parent : node;
    const source = Buffer.from(sourceFile.text, "utf8")
      .subarray(artifactNode.startIndex, artifactNode.endIndex)
      .toString("utf8");
    return {
      id: `${path}:${kind}:${name}:${occurrence}`,
      path,
      kind,
      name,
      source,
      sourceHash: sha256(source),
      range: exactRange(sourceFile.text, artifactNode.startIndex, artifactNode.endIndex),
      references: referencesFor(node, sourceFile.text),
      parserError: Boolean(node.hasError),
      node,
    } satisfies DeclarationArtifact;
  });
};

export const findArtifactAt = (sourceFile: SourceFile, path: string, byte: number) =>
  artifactsFor(sourceFile, path).find((artifact) =>
    artifact.range.byte.start <= byte && byte <= artifact.range.byte.end,
  );

export const sourceFiles = (workspaceRoot: string, paths: string[]) =>
  paths
    .filter((path) => [".ts", ".tsx", ".mts", ".cts", ".d.ts"].some((suffix) => path.endsWith(suffix)))
    .map((path) => {
      const absolutePath = resolve(workspaceRoot, path);
      const text = readFileSync(absolutePath, "utf8");
      return parseSource(path, absolutePath, text, `file://${absolutePath}`);
    });

export const isTypeScriptPath = (path: string) =>
  [".ts", ".tsx", ".mts", ".cts", ".d.ts"].some((suffix) => path.endsWith(suffix));

export const pathFromUri = (workspaceRoot: string, uri: string) => {
  try {
    const value = new URL(uri);
    if (value.protocol !== "file:") return undefined;
    const path = decodeURIComponent(value.pathname);
    const normalized = process.platform === "win32" ? path.slice(1) : path;
    return relative(workspaceRoot, normalized).replaceAll("\\", "/");
  } catch {
    return undefined;
  }
};

export const fileName = (path: string) => basename(path);

export const fileExtension = (path: string) => extname(path);
