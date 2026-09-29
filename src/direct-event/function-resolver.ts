import type { FunctionArtifact, FunctionFileAnalysis, FunctionReference } from "./function-analyzer.ts";

export type FunctionBindingFact = {
  readonly reference: FunctionReference;
  readonly target:
    | { readonly kind: "local"; readonly artifact: FunctionArtifact }
    | { readonly kind: "import"; readonly path: string; readonly name: string }
    | { readonly kind: "unresolved" | "unsupported" };
};

export type FunctionRootFacts = {
  readonly root: FunctionArtifact & { readonly kind: "function" };
  readonly references: ReadonlyArray<FunctionBindingFact>;
};

/**
 * Bind one named function's direct references. This supplies native syntax and
 * binding facts only; the checked Bend graph adapter owns every expansion,
 * authorization, budget, and completeness transition.
 */
export const resolveFunctionUnit = (file: FunctionFileAnalysis, rootName: string): FunctionRootFacts | undefined => {
  const functionRoot = file.functions.get(rootName);
  if (functionRoot === undefined) return undefined;
  const references = functionRoot.references.map((reference): FunctionBindingFact => {
    if (reference.kind === "unsupported") return { reference, target: { kind: "unsupported" } };
    const local = reference.kind === "named-function"
      ? file.functions.get(reference.name)
      : file.types.get(reference.name);
    if (local !== undefined) return { reference, target: { kind: "local", artifact: local.artifact } };
    const imported = file.imports.get(reference.name);
    if (imported !== undefined) return imported.typeOnly && reference.kind === "named-function"
      ? { reference, target: { kind: "unsupported" } }
      : { reference, target: { kind: "import", path: imported.path, name: imported.name } };
    return { reference, target: { kind: "unresolved" } };
  });
  return { root: functionRoot.artifact, references };
};
