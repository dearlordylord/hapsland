import { descendants, sameSyntaxNode } from "./native-parser.ts";
import { createHash } from "node:crypto";
import { extname } from "node:path";

import { typeScriptRoot, type SyntaxNode } from "./native-parser.ts";

import type {
  FunctionReference,
  FunctionArtifact,
  FunctionDeclarationFact,
  TypeDeclarationFact,
  FunctionFileAnalysis,
} from "./function-facts.ts";
const extensions = new Set([".ts", ".tsx", ".mts", ".cts"]);
const intrinsicTypes = new Set([
  "Array",
  "ReadonlyArray",
  "Promise",
  "Record",
  "Partial",
  "Required",
  "Pick",
  "Omit",
  "Exclude",
  "Extract",
  "NonNullable",
  "ReturnType",
  "Parameters",
  "Awaited",
  "ThisType",
  "Map",
  "Set",
  "ReadonlyMap",
  "ReadonlySet",
  "Date",
  "Error",
  "RegExp",
  "String",
  "Number",
  "Boolean",
  "Object",
  "Function",
  "unknown",
  "never",
]);

const artifact = <K extends FunctionArtifact["kind"]>(
  path: string,
  kind: K,
  name: string,
  source: string,
): FunctionArtifact & { readonly kind: K } => ({
  path,
  id: `${path}:${kind}:${name}`,
  kind,
  name,
  source,
  sourceHash: createHash("sha256").update(source, "utf8").digest("hex"),
});

const exportSource = (
  node: SyntaxNode,
): {
  readonly source: string;
  readonly exported: boolean;
  readonly location: FunctionDeclarationFact["location"];
} => {
  const wrapper =
    node.parent?.type === "export_statement" ? node.parent : undefined;
  const selected = wrapper ?? node;
  return {
    source: selected.text,
    exported: wrapper !== undefined,
    location: {
      start: {
        line: selected.startPosition.row + 1,
        column: selected.startPosition.column + 1,
      },
      end: {
        line: selected.endPosition.row + 1,
        column: selected.endPosition.column + 1,
      },
    },
  };
};

const typeParameters = (node: SyntaxNode): ReadonlySet<string> => {
  const names = new Set<string>();
  for (const parameter of node.namedChildren.find(
    (child) => child.type === "type_parameters",
  )?.namedChildren ?? []) {
    const name = parameter.namedChildren.find(
      (child) => child.type === "type_identifier",
    );
    if (name !== undefined) names.add(name.text);
  }
  return names;
};

const namedTypeReferences = (
  node: SyntaxNode,
  ownName: string,
  importedNames: ReadonlySet<string>,
): FunctionReference[] => {
  const parameters = typeParameters(node);
  const references: FunctionReference[] = [];
  for (const child of descendants(node)) {
    if (
      [
        "nested_type_identifier",
        "type_query",
        "computed_property_name",
        "import_type",
      ].includes(child.type)
    ) {
      references.push({ kind: "unsupported", name: child.text });
    } else if (
      child.type === "type_identifier" &&
      child.text !== ownName &&
      child.parent?.type !== "type_parameter" &&
      child.parent?.type !== "nested_type_identifier" &&
      !parameters.has(child.text) &&
      (!intrinsicTypes.has(child.text) || importedNames.has(child.text))
    ) {
      references.push({ kind: "named-type", name: child.text });
    }
  }
  return references;
};

const functionReferences = (
  node: SyntaxNode,
  name: string,
  boundTypes: ReadonlySet<string>,
  boundFunctions: ReadonlySet<string>,
  valueFunctions: ReadonlySet<string>,
): FunctionReference[] => {
  const localBindings = new Set<string>();
  localBindings.add("arguments");
  const unsupportedBindings: {
    readonly offset: number;
    readonly reference: FunctionReference;
  }[] = [];
  let uncertainBinding = false;
  for (const child of descendants(node)) {
    // Catch and for-in/of bind or assign names outside the ordinary parameter /
    // variable-declarator nodes. Nested declarations also introduce lexical
    // names. Without a scope checker, any such form makes the root incomplete.
    if (
      [
        "catch_clause",
        "for_in_statement",
        "function_declaration",
        "generator_function_declaration",
        "class_declaration",
        "class_expression",
      ].includes(child.type)
    ) {
      uncertainBinding = true;
      unsupportedBindings.push({
        offset: child.startIndex,
        reference: { kind: "unsupported", name: child.text },
      });
    }
    if (
      child.type === "assignment_expression" ||
      child.type === "augmented_assignment_expression" ||
      child.type === "update_expression"
    ) {
      const target = child.namedChildren[0];
      if (
        (target?.type === "identifier" && boundFunctions.has(target.text)) ||
        target?.type === "object_pattern" ||
        target?.type === "array_pattern" ||
        target?.type === "parenthesized_expression"
      ) {
        uncertainBinding = true;
        unsupportedBindings.push({
          offset: child.startIndex,
          reference: { kind: "unsupported", name: child.text },
        });
      }
    }
    if (
      child.type === "required_parameter" ||
      child.type === "optional_parameter" ||
      child.type === "variable_declarator"
    ) {
      const binding = child.namedChildren[0];
      if (binding?.type === "identifier") localBindings.add(binding.text);
      else {
        uncertainBinding = true;
        unsupportedBindings.push({
          offset: child.startIndex,
          reference: { kind: "unsupported", name: child.text },
        });
      }
    }
  }
  const calls: {
    readonly offset: number;
    readonly reference: FunctionReference;
  }[] = [];
  for (const child of descendants(node)) {
    if (
      [
        "new_expression",
        "arrow_function",
        "function_expression",
        "function_declaration",
        "generator_function_declaration",
        "generator_function",
      ].includes(child.type)
    ) {
      calls.push({
        offset: child.startIndex,
        reference: { kind: "unsupported", name: child.text },
      });
    }
    if (child.type !== "call_expression") continue;
    const callee = child.namedChildren[0];
    if (callee === undefined) continue;
    const supported =
      callee.type === "identifier" &&
      !uncertainBinding &&
      !localBindings.has(callee.text);
    calls.push({
      offset: child.startIndex,
      reference: {
        kind: supported ? "named-function" : "unsupported",
        name: callee.text,
      },
    });
  }
  const declarationName = node.namedChildren.find(
    (child) => child.type === "identifier",
  );
  const values: {
    readonly offset: number;
    readonly reference: FunctionReference;
  }[] = [];
  for (const child of descendants(node)) {
    if (
      child.type === "this" ||
      child.type === "super" ||
      child.type === "meta_property"
    ) {
      values.push({
        offset: child.startIndex,
        reference: { kind: "unsupported", name: child.text },
      });
      continue;
    }
    if (
      child.type !== "identifier" &&
      child.type !== "shorthand_property_identifier"
    )
      continue;
    if (sameSyntaxNode(child, declarationName)) continue;
    const parent = child.parent;
    if (parent === undefined || parent === null) continue;
    // The direct callee is already represented by the call edge. Parameter and
    // variable names are declarations; member property names have a different
    // syntax kind and are never mistaken for value reads here.
    if (
      parent.type === "call_expression" &&
      sameSyntaxNode(parent.namedChildren[0], child)
    )
      continue;
    if (
      [
        "required_parameter",
        "optional_parameter",
        "variable_declarator",
      ].includes(parent.type) &&
      sameSyntaxNode(parent.namedChildren[0], child)
    )
      continue;
    const kind = localBindings.has(child.text)
      ? undefined
      : valueFunctions.has(child.text) && !uncertainBinding
        ? "named-function"
        : "unsupported";
    if (kind !== undefined)
      values.push({
        offset: child.startIndex,
        reference: { kind, name: child.text },
      });
  }
  // Type references and calls both carry offsets in the source tree. Recollect the
  // type sites here so the graph adapter sees one deterministic lexical order.
  // A function may share its name with a type. Its return annotation can be
  // that type, so the function name is not an own-name type exclusion.
  const types = namedTypeReferencesWithOffsets(node, "", boundTypes);
  return [...types, ...calls, ...values, ...unsupportedBindings]
    .sort((a, b) => a.offset - b.offset)
    .map(({ reference }) => reference);
};

const namedTypeReferencesWithOffsets = (
  node: SyntaxNode,
  ownName: string,
  importedNames: ReadonlySet<string>,
): { readonly offset: number; readonly reference: FunctionReference }[] => {
  const parameters = typeParameters(node);
  const references: {
    readonly offset: number;
    readonly reference: FunctionReference;
  }[] = [];
  for (const child of descendants(node)) {
    if (
      [
        "nested_type_identifier",
        "type_query",
        "computed_property_name",
        "import_type",
      ].includes(child.type)
    ) {
      references.push({
        offset: child.startIndex,
        reference: { kind: "unsupported", name: child.text },
      });
    } else if (
      child.type === "type_identifier" &&
      child.text !== ownName &&
      child.parent?.type !== "type_parameter" &&
      child.parent?.type !== "nested_type_identifier" &&
      !parameters.has(child.text) &&
      (!intrinsicTypes.has(child.text) || importedNames.has(child.text))
    ) {
      references.push({
        offset: child.startIndex,
        reference: { kind: "named-type", name: child.text },
      });
    }
  }
  return references;
};

/** Conservative native facts. Undefined means this file cannot support a complete function unit. */
export const analyzeFunctionFile = (
  path: string,
  source: string,
): FunctionFileAnalysis | undefined => {
  const extension = extname(path).toLowerCase();
  if (!extensions.has(extension)) return undefined;
  try {
    const root = typeScriptRoot(path, source);
    if (root.hasError) return undefined;
    const functions = new Map<string, FunctionDeclarationFact>();
    const types = new Map<string, TypeDeclarationFact>();
    const imports = new Map<
      string,
      {
        readonly path: string;
        readonly name: string;
        readonly typeOnly: boolean;
      }
    >();
    const top = root.namedChildren.flatMap((child) =>
      child.type === "export_statement"
        ? child.namedChildren.filter((item) => item.type !== "export_clause")
        : [child],
    );
    const signatures = new Set<string>();
    for (const node of top) {
      if (node.type !== "function_signature") continue;
      const name = node.namedChildren.find(
        (child) => child.type === "identifier",
      )?.text;
      if (name !== undefined) signatures.add(name);
    }
    for (const node of top) {
      if (node.type === "import_statement") {
        const module = node.namedChildren
          .find((child) => child.type === "string")
          ?.namedChildren.find(
            (child) => child.type === "string_fragment",
          )?.text;
        const clause = node.namedChildren.find(
          (child) => child.type === "import_clause",
        );
        if (module === undefined || clause === undefined) return undefined;
        for (const specifier of descendants(clause).filter(
          (child) => child.type === "import_specifier",
        )) {
          const names = specifier.namedChildren.filter(
            (child) => child.type === "identifier",
          );
          const imported = names[0]?.text;
          const local = names.at(-1)?.text;
          if (
            imported === undefined ||
            local === undefined ||
            imports.has(local)
          )
            return undefined;
          imports.set(local, {
            path: module,
            name: imported,
            typeOnly:
              /^import\s+type\b/u.test(node.text) ||
              /^type\b/u.test(specifier.text),
          });
        }
      }
    }
    const boundTypes = new Set(imports.keys());
    const boundFunctions = new Set(imports.keys());
    const valueFunctions = new Set(
      [...imports]
        .filter(([, binding]) => !binding.typeOnly)
        .map(([name]) => name),
    );
    const otherTopLevelBindings = new Set<string>();
    for (const node of top) {
      if (
        node.type !== "interface_declaration" &&
        node.type !== "type_alias_declaration"
      )
        continue;
      const name = node.namedChildren.find(
        (child) => child.type === "type_identifier",
      )?.text;
      if (name !== undefined) boundTypes.add(name);
    }
    for (const node of top) {
      if (node.type !== "function_declaration") continue;
      const name = node.namedChildren.find(
        (child) => child.type === "identifier",
      )?.text;
      if (name !== undefined) {
        boundFunctions.add(name);
        valueFunctions.add(name);
      }
    }
    for (const node of top) {
      if (node.type === "class_declaration") {
        const name = node.namedChildren.find(
          (child) => child.type === "type_identifier",
        )?.text;
        if (name !== undefined) otherTopLevelBindings.add(name);
      }
      if (
        node.type === "lexical_declaration" ||
        node.type === "variable_declaration"
      ) {
        for (const declarator of node.namedChildren.filter(
          (child) => child.type === "variable_declarator",
        )) {
          const binding = declarator.namedChildren[0];
          // Destructured top-level bindings can shadow an import or a named
          // declaration. We do not claim a graph from a file whose top-level
          // scope contains an unsupported binding pattern.
          if (binding?.type !== "identifier") return undefined;
          const name = binding.text;
          if (name !== undefined) otherTopLevelBindings.add(name);
        }
      }
    }
    if ([...otherTopLevelBindings].some((name) => imports.has(name)))
      return undefined;
    for (const node of top) {
      if (node.type === "import_statement") continue;
      if (node.type === "function_declaration") {
        const identifier = node.namedChildren.find(
          (child) => child.type === "identifier",
        );
        const body = node.namedChildren.find(
          (child) => child.type === "statement_block",
        );
        if (
          identifier === undefined ||
          body === undefined ||
          signatures.has(identifier.text) ||
          functions.has(identifier.text) ||
          imports.has(identifier.text) ||
          otherTopLevelBindings.has(identifier.text)
        )
          return undefined;
        const rendered = exportSource(node);
        functions.set(identifier.text, {
          artifact: artifact(
            path,
            "function",
            identifier.text,
            rendered.source,
          ),
          references: functionReferences(
            node,
            identifier.text,
            boundTypes,
            boundFunctions,
            valueFunctions,
          ),
          exported: rendered.exported,
          location: rendered.location,
        });
        if (functions.size + types.size > 64) return undefined;
        continue;
      }
      const kind =
        node.type === "interface_declaration"
          ? "interface"
          : node.type === "type_alias_declaration"
            ? "type-alias"
            : undefined;
      if (kind !== undefined) {
        const identifier = node.namedChildren.find(
          (child) => child.type === "type_identifier",
        );
        if (
          identifier === undefined ||
          types.has(identifier.text) ||
          imports.has(identifier.text)
        )
          return undefined;
        const rendered = exportSource(node);
        types.set(identifier.text, {
          artifact: artifact(path, kind, identifier.text, rendered.source),
          references: namedTypeReferences(node, identifier.text, boundTypes),
          exported: rendered.exported,
          location: rendered.location,
        });
        if (functions.size + types.size > 64) return undefined;
      }
    }
    return { path, functions, types, imports };
  } catch {
    return undefined;
  }
};
