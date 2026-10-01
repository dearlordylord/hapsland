import type {
  TypeExtractionFailure,
  AnalyzerMaterializationPreflight,
} from "./languages/contracts.ts";
import type {
  ArtifactReference,
  ReviewArtifact,
  ReviewNode,
  ReviewUnit,
  TypeDeclaration,
} from "./model.ts";
import { languageForPath } from "./languages/registry.ts";
import type { GraphDeclaration, GraphFile } from "./languages/contracts.ts";
export type { GraphDeclaration, GraphFile };
type ParsedDeclaration = GraphDeclaration;
export type UnitAnalysis =
  | { readonly status: "ready"; readonly unit: ReviewUnit }
  | {
      readonly status: "unsupported";
      readonly root: ReviewArtifact;
      readonly unit: ReviewUnit;
      readonly reason:
        "missing-evidence" | "unsupported-reference" | "reference-limit";
    };

export type TypeFileAnalysis =
  | TypeExtractionFailure
  | {
      readonly status: "analyzed";
      readonly units: ReadonlyArray<UnitAnalysis>;
    };
export { MAX_TYPE_DECLARATIONS } from "./languages/contracts.ts";
/** The root is deliberately excluded from this count. */
export const MAX_REFERENCED_NAMES = 16;

const parsedDeclarations = (
  path: string,
  source: string,
  allowImports = false,
): TypeExtractionFailure | ReadonlyArray<ParsedDeclaration> =>
  languageForPath(path)?.parseTypes(path, source, allowImports) ?? {
    status: "unsupported",
    reason: "extension",
    units: [],
  };
export const inspectGraphFile = (
  path: string,
  source: string,
): GraphFile | undefined => languageForPath(path)?.inspect(path, source);
const unitFor = (
  root: ParsedDeclaration,
  declarations: ReadonlyMap<string, ParsedDeclaration>,
): UnitAnalysis => {
  const expanded = new Set<string>([root.artifact.id]);
  const referencedNames = new Set<string>();
  let reason:
    Extract<UnitAnalysis, { status: "unsupported" }>["reason"] | undefined;

  const visit = (declaration: ParsedDeclaration): ReviewNode => {
    const references: Array<ArtifactReference> = [];
    for (const reference of declaration.references) {
      if (reference.kind === "unsupported") {
        reason ??= "unsupported-reference";
        references.push({
          kind: "omitted",
          site: { symbol: reference.name },
          target: { kind: "unresolved", symbol: reference.name },
          reason: "unsupported",
        });
        continue;
      }
      if (reference.name !== root.artifact.name)
        referencedNames.add(reference.name);
      const target = declarations.get(reference.name);
      if (referencedNames.size > MAX_REFERENCED_NAMES) {
        reason ??= "reference-limit";
        references.push({
          kind: "omitted",
          site: { symbol: reference.name },
          target:
            target === undefined
              ? { kind: "unresolved", symbol: reference.name }
              : { kind: "known", artifactId: target.artifact.id },
          reason: "reference-limit",
        });
      } else if (target === undefined) {
        reason ??= "missing-evidence";
        references.push({
          kind: "omitted",
          site: { symbol: reference.name },
          target: { kind: "unresolved", symbol: reference.name },
          reason: "unresolved",
        });
      } else if (expanded.has(target.artifact.id)) {
        references.push({
          kind: "included",
          site: { symbol: reference.name },
          target: target.artifact.id,
        });
      } else {
        expanded.add(target.artifact.id);
        references.push({
          kind: "expanded",
          site: { symbol: reference.name },
          node: visit(target),
        });
      }
    }
    return { artifact: declaration.artifact, references };
  };

  const unit = { root: visit(root) } satisfies ReviewUnit;
  return reason === undefined
    ? { status: "ready", unit }
    : { status: "unsupported", root: root.artifact, unit, reason };
};

export const analyzeTypeFile = (
  path: string,
  source: string,
): TypeFileAnalysis => {
  const parsed = parsedDeclarations(path, source);
  if ("status" in parsed) return parsed;
  const byName = new Map(
    parsed.map((declaration) => [declaration.artifact.name, declaration]),
  );
  return {
    status: "analyzed",
    units: parsed.map((declaration) => unitFor(declaration, byName)),
  };
};

/** Bounded preflight count used before recursive ReviewUnit materialization. */
export type { AnalyzerMaterializationPreflight } from "./languages/contracts.ts";
const encodedBytes = (value: unknown): number =>
  Buffer.byteLength(JSON.stringify(value), "utf8");

/**
 * Conservative logical bound computed without constructing recursive units.
 * Exact artifact/id/site payload bytes are charged with ample per-node/edge
 * structural allowance, following the same expansion and reference ceilings
 * as unitFor.
 */
export const analyzerMaterializationPreflight = (
  path: string,
  source: string,
  allowImports = false,
): AnalyzerMaterializationPreflight | undefined => {
  const parsed = parsedDeclarations(path, source, allowImports);
  if ("status" in parsed) return undefined;
  const byName = new Map(
    parsed.map((declaration) => [declaration.artifact.name, declaration]),
  );
  let expandedUnitBytes = 0;
  for (const root of parsed) {
    const expanded = new Set<string>([root.artifact.id]);
    const referencedNames = new Set<string>();
    const visit = (declaration: ParsedDeclaration): number => {
      let bytes = encodedBytes(declaration.artifact) + 512;
      for (const reference of declaration.references) {
        const target =
          reference.kind === "named" ? byName.get(reference.name) : undefined;
        if (
          reference.kind === "named" &&
          reference.name !== root.artifact.name
        ) {
          referencedNames.add(reference.name);
        }
        // Covers tagged edge keys, site/symbol, omitted target/reason, and an
        // included target ID at its exact escaped byte length.
        bytes +=
          512 +
          2 * encodedBytes(reference.name) +
          (target === undefined ? 0 : encodedBytes(target.artifact.id));
        if (
          reference.kind === "named" &&
          referencedNames.size <= MAX_REFERENCED_NAMES &&
          target !== undefined &&
          !expanded.has(target.artifact.id)
        ) {
          expanded.add(target.artifact.id);
          bytes += visit(target);
        }
      }
      return bytes;
    };
    expandedUnitBytes += visit(root);
  }
  return {
    declarations: parsed.length,
    expandedUnitBytes,
    ...(allowImports
      ? { hasImports: languageForPath(path)?.hasImports(source) ?? false }
      : {}),
  };
};

export const combinedAnalyzerMaterializationPreflight = (
  path: string,
  source: string,
): AnalyzerMaterializationPreflight | undefined =>
  languageForPath(path)?.combinedPreflight(
    path,
    source,
    analyzerMaterializationPreflight(path, source, true),
  );
export const typeDeclarationCount = (
  path: string,
  source: string,
): number | undefined =>
  analyzerMaterializationPreflight(path, source)?.declarations;

export const readyTypeUnits = (
  path: string,
  source: string,
): ReadonlyArray<ReviewUnit> => {
  const analysis = analyzeTypeFile(path, source);
  return analysis.status === "analyzed"
    ? analysis.units.flatMap((outcome) =>
        outcome.status === "ready" ? [outcome.unit] : [],
      )
    : [];
};

/** Compatibility helper for the original Add-only surface. */
export const analyzeSingleType = (
  path: string,
  source: string,
): TypeDeclaration | undefined => {
  const units = readyTypeUnits(path, source);
  const artifact = units.length === 1 ? units[0]?.root.artifact : undefined;
  return artifact?.kind === "function" ? undefined : artifact;
};

/** Revalidation returns the named root only when its complete evidence remains available. */
export const analyzeNamedUnit = (
  path: string,
  source: string,
  name: string,
): ReviewUnit | undefined =>
  readyTypeUnits(path, source).find(({ root }) => root.artifact.name === name);

export const analyzeNamedType = (
  path: string,
  source: string,
  name: string,
): TypeDeclaration | undefined => {
  const artifact = analyzeNamedUnit(path, source, name)?.root.artifact;
  return artifact?.kind === "function" ? undefined : artifact;
};
