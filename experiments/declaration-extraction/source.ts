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

export type DeclarationKind = "interface" | "type-alias" | "schema";

/**
 * The experiment deliberately keeps schema interpretation small and explicit.
 * A const becomes a schema artifact only after its constructor position has
 * been resolved by the native language server (see extract.ts).  The parser
 * contributes expression shape and exact source; it never decides framework
 * identity from a spelling such as `z` or `Schema`.
 */
export type SchemaFramework = "zod" | "effect-schema";

export type SchemaProvenance =
  | "native-lsp"
  | "null"
  | "multiple"
  | "external"
  | "project"
  | "unresolved";

export type SchemaOpaqueSegment = {
  source: string;
  range: ExactRange;
  reason: string;
};

export type SchemaEvidence = {
  framework: SchemaFramework | null;
  provenance: SchemaProvenance;
  constructor: {
    name: string;
    range: ExactRange;
    definition: {
      uri: string;
      path: string;
      packageName: string | null;
      external: boolean;
      range: LspRange;
    } | null;
    definitions: Array<{
      uri: string;
      path: string;
      packageName: string | null;
      external: boolean;
      symbolName: string | null;
      range: LspRange;
    }>;
  };
  expression: string;
  expressionRange: ExactRange;
  interpretation: "complete" | "partial" | "unresolved";
  opaque: SchemaOpaqueSegment[];
  referencedSchemaIds: string[];
};

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
  schema?: SchemaEvidence;
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

const sourceSlice = (source: string, start: number, end: number) =>
  Buffer.from(source, "utf8").subarray(start, end).toString("utf8");

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

export const artifactsFor = (sourceFile: SourceFile, path = sourceFile.path): DeclarationArtifact[] => {
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
    const source = sourceSlice(sourceFile.text, artifactNode.startIndex, artifactNode.endIndex);
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

const lexicalDeclarations = (tree: Tree) => {
  const result: TreeNode[] = [];
  const visit = (node: TreeNode) => {
    if (node.type === "lexical_declaration" && /^\s*const\b/.test(node.text)) result.push(node);
    for (const child of node.namedChildren) visit(child);
  };
  visit(tree.rootNode);
  return result.sort((left, right) => left.startIndex - right.startIndex || left.endIndex - right.endIndex);
};

const variableDeclarators = (declaration: TreeNode) =>
  declaration.namedChildren.filter((child) => child.type === "variable_declarator");

const variableName = (declarator: TreeNode) =>
  declarator.namedChildren.find((child) => child.type === "identifier")?.text;

const variableValue = (declarator: TreeNode) =>
  declarator.namedChildren.find((child) => child.type !== "identifier");

const unwrapExpression = (node: TreeNode): TreeNode => {
  if (node.type === "parenthesized_expression" || node.type === "await_expression") {
    return node.namedChildren[0] ? unwrapExpression(node.namedChildren[0]) : node;
  }
  return node;
};

type ConstructorShape = { name: string; node: TreeNode; positionNode: TreeNode };

/** Find the left-most callable/member expression in a schema expression. */
const constructorShape = (input: TreeNode): ConstructorShape | undefined => {
  const node = unwrapExpression(input);
  if (node.type === "call_expression") {
    const callee = node.namedChildren.find((child) =>
      child.type === "member_expression" ||
      child.type === "optional_member_expression" ||
      child.type === "identifier" ||
      child.type === "call_expression" ||
      child.type === "parenthesized_expression",
    );
    return callee ? constructorShape(callee) : undefined;
  }
  if (node.type === "member_expression" || node.type === "optional_member_expression") {
    const property = node.namedChildren.find(
      (child) => child.type === "property_identifier" || child.type === "private_property_identifier",
    );
    if (property) return { name: property.text, node, positionNode: property };
    const object = node.namedChildren[0];
    return object ? constructorShape(object) : undefined;
  }
  if (node.type === "identifier" || node.type === "type_identifier") {
    return { name: node.text, node, positionNode: node };
  }
  return undefined;
};

const importedFrameworkNames = (tree: Tree) => {
  const names = new Set<string>();
  const visit = (node: TreeNode) => {
    if (node.type === "import_statement") {
      const source = node.namedChildren.find((child) => child.type === "string")?.text.slice(1, -1) ?? "";
      const frameworkImport = source === "zod" || source === "zod/v4" || source === "effect/Schema";
      if (frameworkImport) {
        for (const child of descendants(node)) {
          if (child.type === "namespace_import" || child.type === "import_specifier") {
            const identifiers = child.namedChildren.filter((item) => item.type === "identifier");
            const local = identifiers.at(-1);
            if (local) names.add(local.text);
          }
        }
      }
    }
    for (const child of node.namedChildren) visit(child);
  };
  visit(tree.rootNode);
  return names;
};

const localBindingNames = (root: TreeNode) => {
  const names = new Set<string>();
  for (const node of descendants(root)) {
    if (node.type === "arrow_function" || node.type === "function_declaration" || node.type === "function_expression") {
      const parameters = node.namedChildren.find(
        (child) => child.type === "formal_parameters" || child.type === "required_parameter" || child.type === "parameters",
      );
      if (parameters) {
        for (const nested of descendants(parameters)) {
          if (nested.type === "identifier") names.add(nested.text);
        }
      }
    }
  }
  return names;
};

const isObjectKey = (node: TreeNode) => {
  const parent = node.parent;
  if (parent?.type === "pair") return parent.namedChildren[0] === node;
  if (parent?.type === "method_definition") return parent.namedChildren[0] === node;
  return false;
};

const schemaReferences = (
  root: TreeNode,
  source: string,
  declarationNameText: string,
  frameworkNames: Set<string>,
) => {
  const localNames = localBindingNames(root);
  const references: SyntaxReference[] = [];
  for (const node of descendants(root)) {
    if (node.type !== "identifier") continue;
    if (node.text === declarationNameText || frameworkNames.has(node.text) || localNames.has(node.text)) continue;
    if (isObjectKey(node)) continue;
    // A named property is represented separately as property_identifier and
    // therefore never reaches this branch. Keep references to identifiers in
    // arguments (local schema composition and wrappers) for native LSP.
    references.push({
      name: node.text,
      syntaxKind: "schema-value",
      sourceRange: exactRange(source, node.startIndex, node.endIndex),
      startByte: node.startIndex,
    });
  }
  const seen = new Set<string>();
  return references
    .sort((left, right) => left.startByte - right.startByte || left.name.localeCompare(right.name))
    .filter((reference) => {
      const key = `${reference.startByte}:${reference.name}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
};

const schemaExpressionShape = (value: TreeNode) => {
  const expression = unwrapExpression(value);
  return expression.type === "call_expression" ||
    expression.type === "member_expression" ||
    expression.type === "optional_member_expression" ||
    expression.type === "identifier";
};

/**
 * Enumerate syntactic const roots.  This is intentionally a candidate pass:
 * every candidate starts with unresolved provenance and must be annotated by
 * a native-LSP definition lookup before a framework is reported.
 */
export const schemaCandidatesFor = (sourceFile: SourceFile, path = sourceFile.path): DeclarationArtifact[] => {
  const occurrences = new Map<string, number>();
  const frameworkNames = importedFrameworkNames(sourceFile.tree);
  const candidates: DeclarationArtifact[] = [];
  for (const declaration of lexicalDeclarations(sourceFile.tree)) {
    for (const declarator of variableDeclarators(declaration)) {
      const name = variableName(declarator);
      const value = variableValue(declarator);
      if (!name || !value || !schemaExpressionShape(value)) continue;
      const occurrence = occurrences.get(name) ?? 0;
      occurrences.set(name, occurrence + 1);
      const artifactNode = declaration.parent?.type === "export_statement" ? declaration.parent : declaration;
      const source = sourceSlice(sourceFile.text, artifactNode.startIndex, artifactNode.endIndex);
      const expression = sourceSlice(sourceFile.text, value.startIndex, value.endIndex);
      const constructor = constructorShape(value);
      if (!constructor) continue;
      const constructorRange = exactRange(sourceFile.text, constructor.positionNode.startIndex, constructor.positionNode.endIndex);
      const schema: SchemaEvidence = {
        framework: null,
        provenance: "unresolved",
        constructor: {
          name: constructor.name,
          range: constructorRange,
          definition: null,
          definitions: [],
        },
        expression,
        expressionRange: exactRange(sourceFile.text, value.startIndex, value.endIndex),
        interpretation: "unresolved",
        opaque: [{
          source: expression,
          range: exactRange(sourceFile.text, value.startIndex, value.endIndex),
          reason: "constructor provenance pending native LSP resolution",
        }],
        referencedSchemaIds: [],
      };
      candidates.push({
        id: `${path}:schema:${name}:${occurrence}`,
        path,
        kind: "schema",
        name,
        source,
        sourceHash: sha256(source),
        range: exactRange(sourceFile.text, artifactNode.startIndex, artifactNode.endIndex),
        references: schemaReferences(value, sourceFile.text, name, frameworkNames),
        parserError: Boolean(declaration.hasError || value.hasError),
        node: declaration,
        schema,
      });
    }
  }
  return candidates.sort((left, right) => left.range.byte.start - right.range.byte.start || left.name.localeCompare(right.name));
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
