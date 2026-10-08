import { createHash } from "node:crypto"
import {
  bundledArtifactDomain,
  type ReviewArtifact,
  type TypeDeclaration
} from "@hapsland/source-artifacts/direct-event/artifact-model"
import type { GraphDeclaration } from "../contracts.ts"
import catalog from "./base-declarations.generated.json" with { type: "json" }
import { extractBendDeclarations } from "./extractor.ts"

const declarations = new Map<string, GraphDeclaration>()
for (const declaration of catalog.declarations) {
  const extracted = extractBendDeclarations(declaration.source, 1)
  if (
    !("declarations" in extracted) ||
    extracted.declarations[0]?.name !== declaration.name ||
    declaration.sourceHash !== createHash("sha256").update(declaration.source).digest("hex")
  ) {
    throw new Error("Invalid generated Bend Base evidence")
  }
  const origin = Object.freeze({
    kind: "bundled" as const,
    library: "bend/Base" as const,
    compilerVersion: catalog.compilerVersion,
    compilerSource: catalog.compilerSource,
    moduleHash: catalog.moduleHash,
    declarationHash: declaration.sourceHash
  })
  const id = `${bundledArtifactDomain(origin)}:datatype:${declaration.name}`
  const source = extracted.declarations[0]!
  declarations.set(
    id,
    Object.freeze({
      artifact: Object.freeze({
        id,
        name: declaration.name,
        kind: "datatype",
        source: declaration.source,
        sourceHash: declaration.sourceHash,
        origin
      }),
      references: Object.freeze(
        source.references.map((reference) =>
          Object.freeze({ ...reference, ...(reference.name === declaration.name ? { targetId: id } : {}) })
        )
      ),
      exported: true,
      location: Object.freeze({
        start: Object.freeze({ line: 1, column: 1 }),
        end: Object.freeze({ line: source.endPosition.row + 1, column: source.endPosition.column + 1 })
      })
    })
  )
}

export const bundledBendDeclarations = (): ReadonlyMap<string, GraphDeclaration> => new Map(declarations)
export const bundledBendArtifact = (name: string): TypeDeclaration | undefined =>
  [...declarations.values()].find((declaration) => declaration.artifact.name === name)?.artifact

/** Provenance is accepted only for an exact compiler-generated catalog member. */
const validBundledOrigin = (origin: ReviewArtifact["origin"]): origin is NonNullable<ReviewArtifact["origin"]> =>
  origin !== undefined &&
  origin !== null &&
  typeof origin === "object" &&
  !Array.isArray(origin) &&
  Object.keys(origin).length === 6
export const isBundledBendArtifact = (artifact: ReviewArtifact): boolean => {
  const actual = declarations.get(artifact.id)?.artifact
  const origin = artifact.origin
  if (
    actual === undefined ||
    !validBundledOrigin(origin) ||
    artifact.path !== undefined ||
    artifact.kind !== actual.kind ||
    artifact.name !== actual.name ||
    artifact.source !== actual.source ||
    artifact.sourceHash !== actual.sourceHash
  )
    return false
  return Object.entries(actual.origin!).every(([key, value]) => origin[key as keyof typeof origin] === value)
}
