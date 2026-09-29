import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const nativeRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../native/prebuilt", `${process.platform}-${process.arch}`);
const parserRuntime = resolve(nativeRoot, "tree-sitter");
const parserLanguage = resolve(nativeRoot, "tree-sitter-typescript");
if (existsSync(resolve(parserRuntime, "build/Release/tree_sitter_runtime_binding.node")) &&
    existsSync(resolve(parserLanguage, "build/Release/tree_sitter_typescript_binding.node"))) {
  process.env.TREE_SITTER_PREBUILD = parserRuntime;
  process.env.TREE_SITTER_TYPESCRIPT_PREBUILD = parserLanguage;
}
const { default: Parser } = await import("tree-sitter");
const { default: TypeScript } = await import("tree-sitter-typescript");

type SyntaxNode = {
  readonly type: string;
  readonly text: string;
  readonly startIndex: number;
  readonly endIndex: number;
  readonly namedChildren: ReadonlyArray<SyntaxNode>;
  readonly parent?: SyntaxNode | null;
  readonly hasError?: boolean;
};

export type FunctionReference = {
  readonly kind: "named-type" | "named-function" | "unsupported";
  readonly name: string;
};

export type FunctionArtifact = {
  readonly id: string;
  readonly kind: "function" | "interface" | "type-alias";
  readonly name: string;
  readonly source: string;
  readonly sourceHash: string;
};

export type FunctionDeclarationFact = {
  readonly artifact: FunctionArtifact & { readonly kind: "function" };
  readonly references: ReadonlyArray<FunctionReference>;
  readonly exported: boolean;
};

export type TypeDeclarationFact = {
  readonly artifact: FunctionArtifact & { readonly kind: "interface" | "type-alias" };
  readonly references: ReadonlyArray<FunctionReference>;
  readonly exported: boolean;
};

export type FunctionFileAnalysis = {
  readonly path: string;
  readonly functions: ReadonlyMap<string, FunctionDeclarationFact>;
  readonly types: ReadonlyMap<string, TypeDeclarationFact>;
  /** Import specifiers are raw; path authorization and resolution belong to the caller. */
  readonly imports: ReadonlyMap<string, { readonly path: string; readonly name: string; readonly typeOnly: boolean }>;
};

const extensions = new Set([".ts", ".tsx", ".mts", ".cts"]);
const intrinsicTypes = new Set(["Array", "ReadonlyArray", "Promise", "Record", "Partial", "Required", "Pick", "Omit", "Exclude", "Extract", "NonNullable", "ReturnType", "Parameters", "Awaited", "ThisType", "Map", "Set", "ReadonlyMap", "ReadonlySet", "Date", "Error", "RegExp", "String", "Number", "Boolean", "Object", "Function", "unknown", "never"]);

const descendants = (node: SyntaxNode): ReadonlyArray<SyntaxNode> => {
  const result: SyntaxNode[] = [];
  const pending = [...node.namedChildren].reverse();
  while (pending.length > 0) {
    const current = pending.pop();
    if (current === undefined) continue;
    result.push(current);
    for (let i = current.namedChildren.length - 1; i >= 0; i -= 1) {
      const child = current.namedChildren[i];
      if (child !== undefined) pending.push(child);
    }
  }
  return result;
};

const artifact = <K extends FunctionArtifact["kind"]>(path: string, kind: K, name: string, source: string): FunctionArtifact & { readonly kind: K } => ({
  id: `${path}:${kind}:${name}`,
  kind,
  name,
  source,
  sourceHash: createHash("sha256").update(source, "utf8").digest("hex"),
});

const exportSource = (node: SyntaxNode): { readonly source: string; readonly exported: boolean } => {
  const wrapper = node.parent?.type === "export_statement" ? node.parent : undefined;
  return { source: (wrapper ?? node).text, exported: wrapper !== undefined };
};

const typeParameters = (node: SyntaxNode): ReadonlySet<string> => {
  const names = new Set<string>();
  for (const parameter of node.namedChildren.find((child) => child.type === "type_parameters")?.namedChildren ?? []) {
    const name = parameter.namedChildren.find((child) => child.type === "type_identifier");
    if (name !== undefined) names.add(name.text);
  }
  return names;
};

const namedTypeReferences = (node: SyntaxNode, ownName: string, importedNames: ReadonlySet<string>): FunctionReference[] => {
  const parameters = typeParameters(node);
  const references: FunctionReference[] = [];
  for (const child of descendants(node)) {
    if (["nested_type_identifier", "type_query", "computed_property_name", "import_type"].includes(child.type)) {
      references.push({ kind: "unsupported", name: child.text });
    } else if (child.type === "type_identifier" && child.text !== ownName &&
      child.parent?.type !== "type_parameter" && child.parent?.type !== "nested_type_identifier" &&
      !parameters.has(child.text) && (!intrinsicTypes.has(child.text) || importedNames.has(child.text))) {
      references.push({ kind: "named-type", name: child.text });
    }
  }
  return references;
};

const functionReferences = (node: SyntaxNode, name: string, boundTypes: ReadonlySet<string>, boundFunctions: ReadonlySet<string>): FunctionReference[] => {
  const localBindings = new Set<string>();
  const unsupportedBindings: { readonly offset: number; readonly reference: FunctionReference }[] = [];
  let uncertainBinding = false;
  for (const child of descendants(node)) {
    // Catch and for-in/of bind or assign names outside the ordinary parameter /
    // variable-declarator nodes. Nested declarations also introduce lexical
    // names. Without a scope checker, any such form makes the root incomplete.
    if (["catch_clause", "for_in_statement", "function_declaration", "generator_function_declaration", "class_declaration", "class_expression"].includes(child.type)) {
      uncertainBinding = true;
      unsupportedBindings.push({ offset: child.startIndex, reference: { kind: "unsupported", name: child.text } });
    }
    if (child.type === "assignment_expression" || child.type === "augmented_assignment_expression" || child.type === "update_expression") {
      const target = child.namedChildren[0];
      if ((target?.type === "identifier" && boundFunctions.has(target.text)) ||
        target?.type === "object_pattern" || target?.type === "array_pattern") {
        uncertainBinding = true;
        unsupportedBindings.push({ offset: child.startIndex, reference: { kind: "unsupported", name: child.text } });
      }
    }
    if (child.type === "required_parameter" || child.type === "optional_parameter" || child.type === "variable_declarator") {
      const binding = child.namedChildren.find((part) => part.type === "identifier");
      if (binding !== undefined) localBindings.add(binding.text);
      else {
        uncertainBinding = true;
        unsupportedBindings.push({ offset: child.startIndex, reference: { kind: "unsupported", name: child.text } });
      }
    }
  }
  const calls: { readonly offset: number; readonly reference: FunctionReference }[] = [];
  for (const child of descendants(node)) {
    if (["new_expression", "arrow_function", "function_expression", "function_declaration", "generator_function_declaration", "generator_function"].includes(child.type)) {
      calls.push({ offset: child.startIndex, reference: { kind: "unsupported", name: child.text } });
    }
    if (child.type !== "call_expression") continue;
    const callee = child.namedChildren[0];
    if (callee === undefined) continue;
    const supported = callee.type === "identifier" && !uncertainBinding && !localBindings.has(callee.text);
    calls.push({ offset: child.startIndex, reference: { kind: supported ? "named-function" : "unsupported", name: callee.text } });
  }
  // Type references and calls both carry offsets in the source tree. Recollect the
  // type sites here so the graph adapter sees one deterministic lexical order.
  const types = namedTypeReferencesWithOffsets(node, name, boundTypes);
  return [...types, ...calls, ...unsupportedBindings].sort((a, b) => a.offset - b.offset).map(({ reference }) => reference);
};

const namedTypeReferencesWithOffsets = (node: SyntaxNode, ownName: string, importedNames: ReadonlySet<string>): { readonly offset: number; readonly reference: FunctionReference }[] => {
  const parameters = typeParameters(node);
  const references: { readonly offset: number; readonly reference: FunctionReference }[] = [];
  for (const child of descendants(node)) {
    if (["nested_type_identifier", "type_query", "computed_property_name", "import_type"].includes(child.type)) {
      references.push({ offset: child.startIndex, reference: { kind: "unsupported", name: child.text } });
    } else if (child.type === "type_identifier" && child.text !== ownName &&
      child.parent?.type !== "type_parameter" && child.parent?.type !== "nested_type_identifier" &&
      !parameters.has(child.text) && (!intrinsicTypes.has(child.text) || importedNames.has(child.text))) {
      references.push({ offset: child.startIndex, reference: { kind: "named-type", name: child.text } });
    }
  }
  return references;
};

/** Conservative native facts. Undefined means this file cannot support a complete function unit. */
export const analyzeFunctionFile = (path: string, source: string): FunctionFileAnalysis | undefined => {
  const extension = extname(path).toLowerCase();
  if (!extensions.has(extension)) return undefined;
  try {
    const parser = new Parser();
    parser.setLanguage(extension === ".tsx" ? TypeScript.tsx : TypeScript.typescript);
    const root = (parser.parse(source) as unknown as { readonly rootNode: SyntaxNode }).rootNode;
    if (root.hasError) return undefined;
    const functions = new Map<string, FunctionDeclarationFact>();
    const types = new Map<string, TypeDeclarationFact>();
    const imports = new Map<string, { readonly path: string; readonly name: string; readonly typeOnly: boolean }>();
    const top = root.namedChildren.flatMap((child) => child.type === "export_statement" ? child.namedChildren.filter((item) => item.type !== "export_clause") : [child]);
    const signatures = new Set<string>();
    for (const node of top) {
      if (node.type !== "function_signature") continue;
      const name = node.namedChildren.find((child) => child.type === "identifier")?.text;
      if (name !== undefined) signatures.add(name);
    }
    for (const node of top) {
      if (node.type === "import_statement") {
        const module = node.namedChildren.find((child) => child.type === "string")?.namedChildren.find((child) => child.type === "string_fragment")?.text;
        const clause = node.namedChildren.find((child) => child.type === "import_clause");
        if (module === undefined || clause === undefined) return undefined;
        for (const specifier of descendants(clause).filter((child) => child.type === "import_specifier")) {
          const names = specifier.namedChildren.filter((child) => child.type === "identifier");
          const imported = names[0]?.text;
          const local = names.at(-1)?.text;
          if (imported === undefined || local === undefined || imports.has(local)) return undefined;
          imports.set(local, { path: module, name: imported, typeOnly: /^import\s+type\b/u.test(node.text) || /^type\b/u.test(specifier.text) });
        }
      }
    }
    const boundTypes = new Set(imports.keys());
    const boundFunctions = new Set(imports.keys());
    const otherTopLevelBindings = new Set<string>();
    for (const node of top) {
      if (node.type !== "interface_declaration" && node.type !== "type_alias_declaration") continue;
      const name = node.namedChildren.find((child) => child.type === "type_identifier")?.text;
      if (name !== undefined) boundTypes.add(name);
    }
    for (const node of top) {
      if (node.type !== "function_declaration") continue;
      const name = node.namedChildren.find((child) => child.type === "identifier")?.text;
      if (name !== undefined) boundFunctions.add(name);
    }
    for (const node of top) {
      if (node.type === "class_declaration") {
        const name = node.namedChildren.find((child) => child.type === "type_identifier")?.text;
        if (name !== undefined) otherTopLevelBindings.add(name);
      }
      if (node.type === "lexical_declaration" || node.type === "variable_declaration") {
        for (const declarator of node.namedChildren.filter((child) => child.type === "variable_declarator")) {
          const name = declarator.namedChildren.find((child) => child.type === "identifier")?.text;
          if (name !== undefined) otherTopLevelBindings.add(name);
        }
      }
    }
    for (const node of top) {
      if (node.type === "import_statement") continue;
      if (node.type === "function_declaration") {
        const identifier = node.namedChildren.find((child) => child.type === "identifier");
        const body = node.namedChildren.find((child) => child.type === "statement_block");
        if (identifier === undefined || body === undefined || signatures.has(identifier.text) || functions.has(identifier.text) || types.has(identifier.text) || imports.has(identifier.text) || otherTopLevelBindings.has(identifier.text)) return undefined;
        const rendered = exportSource(node);
        functions.set(identifier.text, { artifact: artifact(path, "function", identifier.text, rendered.source), references: functionReferences(node, identifier.text, boundTypes, boundFunctions), exported: rendered.exported });
        if (functions.size + types.size > 64) return undefined;
        continue;
      }
      const kind = node.type === "interface_declaration" ? "interface" : node.type === "type_alias_declaration" ? "type-alias" : undefined;
      if (kind !== undefined) {
        const identifier = node.namedChildren.find((child) => child.type === "type_identifier");
        if (identifier === undefined || types.has(identifier.text) || functions.has(identifier.text) || imports.has(identifier.text)) return undefined;
        const rendered = exportSource(node);
        types.set(identifier.text, { artifact: artifact(path, kind, identifier.text, rendered.source), references: namedTypeReferences(node, identifier.text, boundTypes), exported: rendered.exported });
        if (functions.size + types.size > 64) return undefined;
      }
    }
    return { path, functions, types, imports };
  } catch {
    return undefined;
  }
};
