export type FunctionReference = {
  readonly kind: "named-type" | "named-function" | "unsupported";
  readonly name: string;
};

export type FunctionArtifact = {
  readonly path: string;
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
  readonly location: {
    readonly start: { readonly line: number; readonly column: number };
    readonly end: { readonly line: number; readonly column: number };
  };
};

export type TypeDeclarationFact = {
  readonly artifact: FunctionArtifact & {
    readonly kind: "interface" | "type-alias";
  };
  readonly references: ReadonlyArray<FunctionReference>;
  readonly exported: boolean;
  readonly location: FunctionDeclarationFact["location"];
};

export type FunctionFileAnalysis = {
  readonly path: string;
  readonly functions: ReadonlyMap<string, FunctionDeclarationFact>;
  readonly types: ReadonlyMap<string, TypeDeclarationFact>;
  /** Import specifiers are raw; path authorization and resolution belong to the caller. */
  readonly imports: ReadonlyMap<
    string,
    { readonly path: string; readonly name: string; readonly typeOnly: boolean }
  >;
};
