import { descendants, sameSyntaxNode } from "./native-parser.ts";
import { createHash } from "node:crypto";
import { extname } from "node:path";
import { typeScriptRoot, type SyntaxNode } from "./native-parser.ts";
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
const supported = new Set([".ts", ".tsx", ".mts", ".cts"]);
const importSyntax = new Set([
  "import",
  "import_alias",
  "import_require_clause",
  "import_statement",
  "import_type",
]);

/** Iterative traversal contains adversarially deep, but byte-bounded, syntax. */
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
  const parameters = declaration.namedChildren.find(
    (node) => node.type === "type_parameters",
  );
  for (const node of parameters?.namedChildren ?? []) {
    if (node.type !== "type_parameter") continue;
    const name = node.namedChildren.find(
      (child) => child.type === "type_identifier",
    );
    if (name !== undefined) names.add(name.text);
  }
  return names;
};

const referencesOf = (
  declaration: SyntaxNode,
  nameNode: SyntaxNode,
): ParsedDeclaration["references"] => {
  const parameters = rootTypeParameters(declaration);
  const result: Array<ParsedDeclaration["references"][number]> = [];
  for (const node of descendants(declaration)) {
    if (
      node.type === "nested_type_identifier" ||
      node.type === "type_query" ||
      node.type === "computed_property_name"
    ) {
      result.push({ kind: "unsupported", name: node.text });
      continue;
    }
    if (
      node.type !== "type_identifier" ||
      sameSyntaxNode(node, nameNode) ||
      node.parent?.type === "type_parameter" ||
      node.parent?.type === "nested_type_identifier" ||
      parameters.has(node.text)
    )
      continue;
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

const parsedDeclarations = (
  path: string,
  source: string,
  allowImports = false,
): TypeExtractionFailure | ReadonlyArray<ParsedDeclaration> => {
  const extension = extname(path).toLowerCase();
  if (!supported.has(extension))
    return { status: "unsupported", reason: "extension", units: [] };
  try {
    const tree = { rootNode: typeScriptRoot(path, source) };
    if (tree.rootNode.hasError)
      return { status: "unsupported", reason: "parse", units: [] };
    const nodes = [tree.rootNode, ...descendants(tree.rootNode)];
    if (!allowImports && nodes.some((node) => importSyntax.has(node.type))) {
      return { status: "unsupported", reason: "import", units: [] };
    }
    const declarations = allowImports
      ? tree.rootNode.namedChildren.flatMap((node) =>
          node.type === "export_statement"
            ? node.namedChildren.filter((child) => kindOf(child) !== undefined)
            : kindOf(node) === undefined
              ? []
              : [node],
        )
      : nodes.filter((node) => kindOf(node) !== undefined);
    if (declarations.length === 0)
      return { status: "unsupported", reason: "no-declarations", units: [] };
    if (declarations.length > MAX_TYPE_DECLARATIONS) {
      return { status: "unsupported", reason: "declaration-limit", units: [] };
    }
    const parsed: Array<ParsedDeclaration> = [];
    for (const node of declarations) {
      const nameNode = declarationNameNode(node);
      const kind = kindOf(node);
      if (
        nameNode === undefined ||
        kind === undefined ||
        nameNode.text.length === 0 ||
        node.hasError
      ) {
        return { status: "unsupported", reason: "parse", units: [] };
      }
      const sourceNode =
        node.parent?.type === "export_statement" ? node.parent : node;
      const rendered = sourceNode.text;
      const artifact: TypeDeclaration = {
        id: `${path}:${kind}:${nameNode.text}`,
        kind,
        name: nameNode.text,
        source: rendered,
        sourceHash: createHash("sha256").update(rendered, "utf8").digest("hex"),
      };
      parsed.push({
        node,
        nameNode,
        artifact,
        references: referencesOf(node, nameNode),
      });
    }
    if (
      new Set(parsed.map(({ artifact }) => artifact.name)).size !==
      parsed.length
    ) {
      return { status: "unsupported", reason: "declaration-merge", units: [] };
    }
    return parsed;
  } catch {
    return { status: "unsupported", reason: "parse", units: [] };
  }
};

export const inspectTypeScript = (
  path: string,
  source: string,
): GraphFile | undefined => {
  const parsed = parsedDeclarations(path, source, true);
  if ("status" in parsed) return undefined;
  const tree = { rootNode: typeScriptRoot(path, source) };
  if (tree.rootNode.hasError) return undefined;
  const imports = new Map<string, { path: string; name: string }>();
  for (const node of tree.rootNode.namedChildren) {
    if (node.type !== "import_statement") continue;
    const match =
      /^import\s+(type\s+)?\{([^{}]+)\}\s*from\s*["'](\.[^"']+)["']\s*;?\s*$/.exec(
        node.text,
      );
    if (match?.[2] === undefined || match[3] === undefined) return undefined;
    for (const specifier of match[2].split(",")) {
      const part =
        /^\s*(type\s+)?([A-Za-z_$][\w$]*)(?:\s+as\s+([A-Za-z_$][\w$]*))?\s*$/.exec(
          specifier,
        );
      if (
        part?.[2] === undefined ||
        (match[1] === undefined && part[1] === undefined)
      )
        return undefined;
      const local = part[3] ?? part[2];
      if (imports.has(local)) return undefined;
      imports.set(local, { path: match[3], name: part[2] });
    }
  }
  // Imports in expressions, aliases, require calls, and nested syntax remain unsupported.
  for (const node of descendants(tree.rootNode)) {
    if (
      importSyntax.has(node.type) &&
      node.type !== "import_statement" &&
      node.parent?.type !== "import_statement"
    )
      return undefined;
  }
  return {
    declarations: new Map(
      parsed.map(({ artifact, references, node }) => [
        artifact.name,
        {
          artifact: { ...artifact, path },
          references,
          exported: node.parent?.type === "export_statement",
          location: {
            start: {
              line:
                (node.parent?.type === "export_statement" ? node.parent : node)
                  .startPosition.row + 1,
              column:
                (node.parent?.type === "export_statement" ? node.parent : node)
                  .startPosition.column + 1,
            },
            end: {
              line:
                (node.parent?.type === "export_statement" ? node.parent : node)
                  .endPosition.row + 1,
              column:
                (node.parent?.type === "export_statement" ? node.parent : node)
                  .endPosition.column + 1,
            },
          },
        },
      ]),
    ),
    imports,
  };
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
) => normalized(parsedDeclarations(path, source, allowImports));

const encodedBytes = (value: unknown): number =>
  Buffer.byteLength(JSON.stringify(value), "utf8");
export const combinedPreflight = (
  path: string,
  source: string,
  typeBound:
    import("./contracts.ts").AnalyzerMaterializationPreflight | undefined,
): import("./contracts.ts").AnalyzerMaterializationPreflight | undefined => {
  const extension = extname(path).toLowerCase();
  if (!supported.has(extension)) return undefined;
  try {
    const root = typeScriptRoot(path, source);
    if (root.hasError) return undefined;
    const top = root.namedChildren.flatMap((node) =>
      node.type === "export_statement"
        ? node.namedChildren.filter(
            (child) =>
              kindOf(child) !== undefined ||
              child.type === "function_declaration",
          )
        : [node],
    );
    const declarations = top.filter(
      (node) =>
        kindOf(node) !== undefined || node.type === "function_declaration",
    );
    if (
      declarations.length === 0 ||
      declarations.length > MAX_TYPE_DECLARATIONS
    )
      return undefined;
    const functions = declarations.filter(
      (node) => node.type === "function_declaration",
    );
    // A source with types must have a valid type preflight. Function-only files
    // legitimately have no type units, so their type estimate is zero.
    if (declarations.length !== functions.length && typeBound === undefined)
      return undefined;
    let functionBytes = 0;
    for (const node of functions) {
      const rendered =
        node.parent?.type === "export_statement" ? node.parent : node;
      const name = declarationNameNode(node)?.text;
      if (name === undefined) return undefined;
      const artifact = {
        path,
        id: `${path}:function:${name}`,
        kind: "function",
        name,
        source: rendered.text,
        sourceHash: "0".repeat(64),
      };
      functionBytes += encodedBytes(artifact) + 1024;
      for (const site of descendants(node)) {
        // Binding may emit multiple facts for one syntax site. JSON escaping
        // can expand a source character by at most six ASCII bytes.
        functionBytes +=
          4 *
          (1024 +
            6 * Buffer.byteLength(site.text, "utf8") +
            2 * Buffer.byteLength(path, "utf8"));
      }
    }
    return {
      declarations: declarations.length,
      expandedUnitBytes: (typeBound?.expandedUnitBytes ?? 0) + functionBytes,
      hasImports:
        root.namedChildren.some((node) => node.type === "import_statement") ||
        typeBound?.hasImports === true,
    };
  } catch {
    return undefined;
  }
};

import { dirname, join, normalize } from "node:path";
import * as Effect from "effect/Effect";
import type { LanguageAdapter, GraphFacts } from "./contracts.ts";
import { analyzeFunctionFile } from "./typescript-functions.ts";
const functionFacts = (
  path: string,
  source: string,
): GraphFacts | undefined => {
  const file = analyzeFunctionFile(path, source);
  if (file === undefined) return undefined;
  return {
    declarations: new Map(
      [...file.types.values(), ...file.functions.values()].map((fact) => [
        `${fact.artifact.kind === "function" ? "function" : "type"}:${fact.artifact.name}`,
        {
          artifact: fact.artifact,
          exported: fact.exported,
          references: fact.references.map((reference) => ({
            kind:
              reference.kind === "unsupported"
                ? ("unsupported" as const)
                : ("named" as const),
            name: reference.name,
            ...(reference.kind === "named-function"
              ? { expectedKind: "function" as const }
              : reference.kind === "named-type"
                ? { expectedKind: "type" as const }
                : {}),
          })),
        },
      ]),
    ),
    imports: file.imports,
    kindAware: true,
  };
};
const extensions = [".ts", ".tsx", ".mts", ".cts"];
export const tsAdapter: LanguageAdapter = {
  id: "typescript",
  extensions: [...supported],
  displayName: "TypeScript",
  probe: {
    path: "doctor.ts",
    source: "export interface DoctorProbe { ready: boolean }",
  },
  analyzeFunctions: analyzeFunctionFile,
  parseTypes: parseTypes,
  inspect: inspectTypeScript,
  hasImports: (source) => /\bimport\b/u.test(source),
  combinedPreflight: combinedPreflight,
  prepareGraph: (_path, _capture, _host, limits) =>
    Effect.succeed({
      dependencies: [],
      limits,
      session: {
        inspect: (path, source, branch) =>
          branch === "function"
            ? functionFacts(path, source)
            : inspectTypeScript(path, source),
        importCandidates: (from, importPath) => {
          const base = normalize(join(dirname(from), importPath));
          const extension = extname(base).toLowerCase();
          return extension === ""
            ? extensions.map((candidate) => `${base}${candidate}`)
            : extension === ".js"
              ? [base.slice(0, -3) + ".ts", base.slice(0, -3) + ".tsx"]
              : extension === ".mjs"
                ? [base.slice(0, -4) + ".mts"]
                : extension === ".cjs"
                  ? [base.slice(0, -4) + ".cts"]
                  : extensions.includes(extension)
                    ? [base]
                    : [];
        },
      },
    }),
};
