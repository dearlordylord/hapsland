import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

type JsonRecord = Record<string, any>;

const root = resolve(import.meta.dirname, "../..");
const command = resolve(root, "experiments/declaration-extraction/extract.ts");
const fixtureRoot = resolve(root, "experiments/declaration-extraction/fixtures");
const output = resolve(root, "experiments/declaration-extraction/evidence/records.jsonl");

const fixture = (name: string) => resolve(fixtureRoot, name);

const run = (fixtureName: string, edit?: string, args: string[] = []) => {
  try {
    const commandArgs = [command, "--fixture", fixture(fixtureName), ...(edit ? ["--edit", edit] : []), ...args];
    const stdout = execFileSync(process.execPath, commandArgs, {
      cwd: root,
      encoding: "utf8",
      timeout: 30_000,
      maxBuffer: 4_000_000,
    });
    return JSON.parse(stdout.trim()) as JsonRecord;
  } catch (error) {
    return {
      status: "generator-error",
      error: error instanceof Error ? error.message.split("\n")[0] : String(error),
    } satisfies JsonRecord;
  }
};

const unique = (values: unknown[]) => [...new Set(values.filter((value): value is string => typeof value === "string"))].sort();

const summarize = (record: JsonRecord, fixtureName: string, fixtureClass: string, requestedCaps?: JsonRecord) => {
  if (record.status !== "ok") {
    return {
      schemaVersion: 2,
      recordType: "synthetic-extraction-observation",
      fixture: fixtureName,
      fixtureClass,
      status: record.status,
      error: "bounded command failed; details intentionally omitted",
      requestedCaps: requestedCaps ?? null,
      sanitized: true,
    };
  }
  const extraction = record.extraction as JsonRecord;
  const roots = (extraction.roots ?? []) as JsonRecord[];
  const context = (extraction.context ?? []) as JsonRecord[];
  const edges = (extraction.edges ?? []) as JsonRecord[];
  const omissions = edges.map((edge) => edge.omission).filter(Boolean);
  const positional = record.positionalRequestCounts as JsonRecord;
  const observations = record.observations as JsonRecord;
  const evaluation = record.evaluation as JsonRecord;
  const faultEvidence = (record.lsp as JsonRecord).faultEvidence as JsonRecord;
  return {
    schemaVersion: 2,
    recordType: "synthetic-extraction-observation",
    fixture: fixtureName,
    fixtureClass,
    status: record.status,
    edit: (record.input as JsonRecord).edit.name,
    versions: {
      typescript: record.versions.typescript,
      parser: record.versions.parser,
      grammar: record.versions.grammar,
      runtime: record.versions.runtime.name,
      runtimeVersion: record.versions.runtime.version,
      bindingParser: `${record.versions.binding.parser.package}@${record.versions.binding.parser.version}`,
      bindingGrammar: `${record.versions.binding.grammar.package}@${record.versions.binding.grammar.version}`,
      zod: record.versions.zod,
      effect: record.versions.effectSchema,
    },
    roots: roots.map((root) => ({ kind: root.kind, name: root.name, parserError: root.parserError, sourceHash: root.sourceHash })),
    context: context.map((declaration) => ({ kind: declaration.kind, name: declaration.name, sourceHash: declaration.sourceHash })),
    navigationOutcomes: unique(edges.map((edge) => edge.resolution)),
    resolvedReferences: edges
      .filter((edge) => edge.resolution === "resolved" && edge.included)
      .map((edge) => `${edge.reference?.name ?? "<unknown>"}->${edge.sourceDeclaration?.name ?? "<unknown>"}`),
    explicitOmissions: unique(omissions),
    completeness: {
      complete: extraction.completeness.complete,
      reasons: extraction.completeness.reasons,
      omittedEdgeCount: extraction.completeness.omittedEdges.length,
    },
    caps: extraction.completeness.caps,
    requestedCaps: requestedCaps ?? null,
    observed: {
      declarations: extraction.completeness.observed.declarations,
      depth: extraction.completeness.observed.depth,
      sourceCharacters: extraction.completeness.observed.sourceCharacters,
      files: extraction.completeness.observed.files,
      externalPackages: extraction.completeness.observed.externalPackages,
    },
    latency: {
      cold: "measured-and-recorded-in-local-run",
      warm: "measured-and-recorded-in-local-run",
      scalarValues: "omitted-from-checked-in-summary-to-avoid-machine-specific-timing-noise",
    },
    positionalRequestCounts: positional,
    resourceObservations: {
      files: observations.files,
      subprocess: observations.subprocess,
      network: observations.network,
    },
    evaluation: {
      modulesImported: evaluation.modulesImported,
      noEvaluationObserved: evaluation.noEvaluationObserved,
    },
    fault: (record.lsp as JsonRecord).fault,
    faultEvidence,
    deterministicColdWarm: record.determinism.coldWarmStable,
    sanitized: true,
  };
};

const cases: Array<[string, string | undefined, string, string[]?, JsonRecord?]> = [
  ["representative", "interface", "typescript-interface"],
  ["representative", "alias", "typescript-type-alias"],
  ["malformed-half-written", "half-written", "degradation-malformed"],
  ["missing-config", "root", "degradation-missing-config"],
  ["unresolved-import", "root", "degradation-unresolved-import"],
  ["cycles", "root", "degradation-cycle"],
  ["evolution", "formatting", "identity-formatting"],
  ["evolution", "rename", "identity-rename"],
  ["evolution", "import-retarget", "identity-import-retarget"],
  ["evolution", "multiple-root", "identity-multiple-root"],
  ["evolution", "move", "identity-move"],
  ["evolution", "deletion", "identity-deletion"],
  ["evolution", "generic", "identity-generic"],
  ["rule-controls", "missing-context", "classifier-missing-context"],
  ["rule-controls", "diff-sufficient", "classifier-diff-sufficient-control"],
  ["zod", "composed", "zod"],
  ["zod-operations", "all", "zod-opaque-operations"],
  ["zod-shadow", "all", "zod-shadow-identity"],
  ["effect", "composed", "effect-schema"],
  ["cross-framework-context", "root", "cross-framework-context"],
  ["representative", "interface", "fault-timeout-cancellation", ["--fault", "nonresponding", "--caps", JSON.stringify({ elapsedMs: 25 })], { elapsedMs: 25 }],
  ["representative", "interface", "fault-server-crash", ["--fault", "crash"]],
  ["representative", "interface", "fault-stale-document", ["--fault", "stale-document"]],
  ["representative", "interface", "cap-declarations", ["--caps", JSON.stringify({ declarations: 1 })], { declarations: 1 }],
  ["representative", "interface", "cap-depth", ["--caps", JSON.stringify({ depth: 0 })], { depth: 0 }],
  ["representative", "interface", "cap-source-characters", ["--caps", JSON.stringify({ sourceCharacters: 1 })], { sourceCharacters: 1 }],
  ["representative", "interface", "cap-files", ["--caps", JSON.stringify({ files: 1 })], { files: 1 }],
  ["representative", "interface", "cap-external-packages", ["--caps", JSON.stringify({ externalPackages: 0 })], { externalPackages: 0 }],
  ["representative", "interface", "profile-depth-1", ["--caps", JSON.stringify({ depth: 1 })], { depth: 1 }],
  ["representative", "interface", "profile-source-500", ["--caps", JSON.stringify({ sourceCharacters: 500 })], { sourceCharacters: 500 }],
];

const records = cases.map(([fixtureName, edit, fixtureClass, args, requestedCaps]) =>
  summarize(run(fixtureName, edit, args), fixtureName, fixtureClass, requestedCaps));

mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, `${records.map((record) => JSON.stringify(record)).join("\n")}\n`, "utf8");
process.stdout.write(`${output}\n`);
