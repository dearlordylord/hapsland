import { LANGUAGE_EXTENSIONS } from "@hapsland/native-observation/direct-event/languages/path-language"
import { createHash } from "node:crypto"
import { dirname, extname, join, normalize } from "node:path"
import * as Effect from "effect/Effect"
import { MAX_TYPE_DECLARATIONS, type GraphFile, type LanguageAdapter } from "../contracts.ts"
import { bundledBendArtifact, bundledBendDeclarations } from "./bundled-evidence.ts"
import { extractBendDeclarations } from "./extractor.ts"

/** Normalize Bend surface facts without imposing another language's parser shape. */
export const parseBendDeclarations = (path: string, source: string, limit: number) => {
  const extracted = extractBendDeclarations(source, limit)
  if ("reason" in extracted) return extracted
  return {
    declarations: extracted.declarations.map((declaration) => ({
      artifact: {
        id: `${path}:datatype:${declaration.name}`,
        kind: "datatype" as const,
        name: declaration.name,
        source: declaration.source,
        sourceHash: createHash("sha256").update(declaration.source, "utf8").digest("hex")
      },
      references: declaration.references.map((reference) => ({
        kind: reference.kind,
        name: reference.name,
        ...(reference.library === "bend/Base" && bundledBendArtifact(reference.name) !== undefined
          ? { targetId: bundledBendArtifact(reference.name)!.id }
          : {})
      })),
      exported: true,
      location: {
        start: { line: declaration.startPosition.row + 1, column: declaration.startPosition.column + 1 },
        end: { line: declaration.endPosition.row + 1, column: declaration.endPosition.column + 1 }
      }
    })),
    imports: extracted.imports
  }
}

/** Candidate spelling is language-owned; shared traversal validates and captures it. */
export const bendImportCandidates = (from: string, imported: string): ReadonlyArray<string> =>
  /^(?:\.\/|\.\.\/)/u.test(imported) && extname(imported).toLowerCase() === ".bend"
    ? [normalize(join(dirname(from), imported))]
    : []

const inspectBend = (path: string, source: string): GraphFile | undefined => {
  const parsed = parseBendDeclarations(path, source, MAX_TYPE_DECLARATIONS)
  if ("reason" in parsed) return undefined
  return {
    declarations: new Map(
      parsed.declarations.map((declaration) => [
        declaration.artifact.name,
        { ...declaration, artifact: { ...declaration.artifact, path } }
      ])
    ),
    imports: parsed.imports,
    supportingDeclarations: bundledBendDeclarations()
  }
}

export const bendAdapter: LanguageAdapter = {
  id: "bend",
  extensions: LANGUAGE_EXTENSIONS.bend,
  displayName: "Bend",
  probe: { path: "doctor.bend", source: "type DoctorProbe is Data:\n  DoctorProbe{}" },
  parseTypes(path, source) {
    const parsed = parseBendDeclarations(path, source, MAX_TYPE_DECLARATIONS)
    return "reason" in parsed ? { status: "unsupported", reason: parsed.reason, units: [] } : parsed.declarations
  },
  inspect: inspectBend,
  supportingTypes: () => bundledBendDeclarations(),
  hasImports: (source) => /\bimport\b/u.test(source),
  combinedPreflight: (_path, _source, typeBound) => typeBound,
  prepareGraph: (_path, _capture, _host, limits) =>
    Effect.succeed({
      session: {
        inspect: (path, source, branch) => (branch === "type" ? inspectBend(path, source) : undefined),
        importCandidates: bendImportCandidates
      },
      dependencies: [],
      limits
    })
}
