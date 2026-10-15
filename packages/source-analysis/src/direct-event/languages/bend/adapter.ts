import { LANGUAGE_EXTENSIONS } from "@hapsland/native-observation/direct-event/languages/path-language"
import { createHash } from "node:crypto"
import { MAX_TYPE_DECLARATIONS, type GraphFile, type LanguageAdapter } from "../contracts.ts"
import { bundledBendArtifact, bundledBendDeclarations, isBundledBendArtifact } from "./bundled-evidence.ts"
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

const graphProjection = (path: string, parsed: ReturnType<typeof parseBendDeclarations>): GraphFile | undefined => {
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

const localProjection = (parsed: ReturnType<typeof parseBendDeclarations>) =>
  "reason" in parsed
    ? { status: "unsupported" as const, reason: parsed.reason, units: [] as const }
    : parsed.declarations
const inspectBend = (path: string, source: string): GraphFile | undefined =>
  graphProjection(path, parseBendDeclarations(path, source, MAX_TYPE_DECLARATIONS))

export const bendAdapter: LanguageAdapter = {
  id: "bend",
  extensions: LANGUAGE_EXTENSIONS.bend,
  displayName: "Bend",
  probe: { path: "doctor.bend", source: "type DoctorProbe is Data:\n  DoctorProbe{}" },
  isBundledArtifact: isBundledBendArtifact,
  parseTypes: (path, source) => localProjection(parseBendDeclarations(path, source, MAX_TYPE_DECLARATIONS)),
  extractSource(path, source) {
    const parsed = parseBendDeclarations(path, source, MAX_TYPE_DECLARATIONS)
    return { graph: graphProjection(path, parsed), functions: undefined, parseTypes: () => localProjection(parsed) }
  },
  inspect: inspectBend,
  supportingTypes: () => bundledBendDeclarations(),
  hasImports: (source) => /\bimport\b/u.test(source),
  combinedPreflight: (_path, _source, typeBound) => typeBound
}
