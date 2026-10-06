export type TypeDeclaration = {
  readonly path?: string
  readonly id: string
  readonly kind: "interface" | "type-alias" | "struct" | "enum" | "datatype"
  readonly name: string
  readonly source: string
  readonly sourceHash: string
}

export type ReviewArtifact = TypeDeclaration | (Omit<TypeDeclaration, "kind"> & { readonly kind: "function" })

export type ReferenceSite = { readonly symbol: string }

export type ArtifactReference =
  | { readonly kind: "expanded"; readonly site: ReferenceSite; readonly node: ReviewNode }
  | { readonly kind: "included"; readonly site: ReferenceSite; readonly target: string }
  | {
      readonly kind: "omitted"
      readonly site: ReferenceSite
      readonly target:
        | { readonly kind: "known"; readonly artifactId: string }
        | { readonly kind: "unresolved"; readonly symbol: string }
      readonly reason: "unresolved" | "unsupported" | "reference-limit" | "unavailable"
    }

export type ReviewNode = { readonly artifact: ReviewArtifact; readonly references: ReadonlyArray<ArtifactReference> }

export type ReviewUnit = {
  /** Captured files establishing import binding, also checked for freshness. */
  readonly sourceDependencies?: ReadonlyArray<string>
  readonly root: ReviewNode
}
