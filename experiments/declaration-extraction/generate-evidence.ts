import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

type JsonRecord = Record<string, any>;

const root = resolve(import.meta.dirname, "../..");
const command = resolve(root, "experiments/declaration-extraction/extract.ts");
const fixtureRoot = resolve(root, "experiments/declaration-extraction/fixtures");
const output = resolve(root, "experiments/declaration-extraction/evidence/records.jsonl");
const timingOutput = resolve(root, "experiments/declaration-extraction/evidence/timing-summary.json");

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

const timingPhases = [
  "processStartup",
  "initialize",
  "openDispatch",
  "coldExtraction",
  "warmExtraction",
] as const;
type TimingPhase = typeof timingPhases[number];

// Timing is retained as numeric, phase-aware upper-bound buckets. The lower
// subsecond buckets preserve cold/warm scale while the wider upper buckets
// absorb scheduler noise between repeated local runs.
const timingBucketBoundariesMs: Record<TimingPhase, number[]> = {
  processStartup: [25, 50, 100, 250, 500, 1_000, 5_000, 10_000],
  initialize: [250, 500, 1_000, 5_000, 10_000],
  openDispatch: [5, 10, 25, 50, 100, 250, 500, 1_000, 5_000, 10_000],
  coldExtraction: [500, 1_000, 5_000, 10_000],
  warmExtraction: [250, 500, 1_000, 5_000, 10_000],
};
const timingBucketMs = (value: unknown, phase: TimingPhase) => {
  const numeric = typeof value === "number" && Number.isFinite(value) ? Math.max(0, value) : 10_000;
  const boundaries = timingBucketBoundariesMs[phase];
  return boundaries.find((boundary) => numeric <= boundary) ?? boundaries[boundaries.length - 1];
};

const numericDistribution = (values: number[], phase: TimingPhase) => {
  if (values.length === 0) {
    return { sampleCount: 0, minMs: null, medianMs: null, maxMs: null, distributionMs: {} };
  }
  const buckets = values.map((value) => timingBucketMs(value, phase));
  const sorted = [...buckets].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  const medianMs = sorted.length % 2 === 1
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
  const distribution = new Map<number, number>();
  for (const bucket of buckets) distribution.set(bucket, (distribution.get(bucket) ?? 0) + 1);
  return {
    sampleCount: buckets.length,
    minMs: sorted[0],
    medianMs,
    maxMs: sorted[sorted.length - 1],
    distributionMs: Object.fromEntries([...distribution.entries()].sort(([left], [right]) => left - right)),
  };
};

const integerDistribution = (values: number[]) => {
  if (values.length === 0) return { sampleCount: 0, min: null, max: null, distribution: {} };
  const distribution = new Map<number, number>();
  for (const value of values) distribution.set(value, (distribution.get(value) ?? 0) + 1);
  return {
    sampleCount: values.length,
    min: Math.min(...values),
    max: Math.max(...values),
    distribution: Object.fromEntries([...distribution.entries()].sort(([left], [right]) => left - right)),
  };
};

const timingSummary = (timings: JsonRecord) => Object.fromEntries(
  timingPhases.map((phase) => [phase, numericDistribution([timings[phase]], phase)]),
);

const positionalSummary = (counts: JsonRecord) => Object.fromEntries(
  ["cold", "warm"].map((temperature) => {
    const values = Object.values((counts[temperature] ?? {}) as Record<string, unknown>)
      .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
    return [temperature, {
      sampleCount: values.length,
      min: values.length > 0 ? Math.min(...values) : 0,
      max: values.length > 0 ? Math.max(...values) : 0,
      total: values.reduce((sum, value) => sum + value, 0),
    }];
  }),
);

const fixtureGroupByCase: Record<string, string> = {
  "typescript-interface": "declarations",
  "typescript-type-alias": "declarations",
  "degradation-malformed": "degradation",
  "degradation-missing-config": "degradation",
  "degradation-unresolved-import": "degradation",
  "degradation-cycle": "degradation",
  "identity-formatting": "evolution",
  "identity-rename": "evolution",
  "identity-import-retarget": "evolution",
  "identity-multiple-root": "evolution",
  "identity-move": "evolution",
  "identity-deletion": "evolution",
  "identity-generic": "evolution",
  "classifier-missing-context": "rule-controls",
  "classifier-diff-sufficient-control": "rule-controls",
  zod: "zod",
  "zod-opaque-operations": "zod",
  "zod-shadow-identity": "zod",
  "effect-schema": "effect",
  "cross-framework-context": "effect",
  "fault-timeout-cancellation": "faults",
  "fault-server-crash": "faults",
  "fault-stale-document": "faults",
  "cap-declarations": "budgets",
  "cap-depth": "budgets",
  "cap-source-characters": "budgets",
  "cap-files": "budgets",
  "cap-external-packages": "budgets",
  "profile-depth-1": "budgets",
  "profile-source-500": "budgets",
};

const fixtureGroup = (fixtureCase: string) => fixtureGroupByCase[fixtureCase] ?? "other";

const summarize = (record: JsonRecord, fixtureName: string, fixtureCase: string, requestedCaps?: JsonRecord) => {
  const fixtureClass = fixtureGroup(fixtureCase);
  if (record.status !== "ok") {
    return {
      schemaVersion: 2,
      recordType: "synthetic-extraction-observation",
      fixture: fixtureName,
      fixtureClass,
      fixtureCase,
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
    fixtureCase,
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
      phaseTimingsMs: timingSummary(record.timingsMs as JsonRecord),
      bucketBoundariesMs: timingBucketBoundariesMs,
      scalarValues: "omitted-from-checked-in-summary",
    },
    positionalRequestCounts: positional,
    positionalRequestSummary: positionalSummary(positional),
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

const timingByFixtureClass = Object.fromEntries(
  [...new Set(records.map((record) => record.fixtureClass))].sort().map((fixtureClass) => {
    const classRecords = records.filter((record) => record.fixtureClass === fixtureClass && record.status === "ok");
    const phaseTimingsMs = Object.fromEntries(timingPhases.map((phase) => {
      const values = classRecords.flatMap((record) => {
        const summary = record.latency?.phaseTimingsMs?.[phase];
        return summary?.distributionMs
          ? Object.entries(summary.distributionMs).flatMap(([bucket, count]) => Array(Number(count)).fill(Number(bucket)))
          : [];
      });
      return [phase, numericDistribution(values, phase)];
    }));
    const positionalByTemperature = Object.fromEntries(["cold", "warm"].map((temperature) => {
      const values = classRecords.flatMap((record) => {
        const summary = record.positionalRequestSummary?.[temperature];
        return summary ? [summary.total] : [];
      });
      return [temperature, integerDistribution(values)];
    }));
    return [fixtureClass, {
      sampleCount: classRecords.length,
      fixtureCases: classRecords.map((record) => record.fixtureCase).sort(),
      phaseTimingsMs,
      positionalRequestTotals: positionalByTemperature,
    }];
  }),
);

mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, `${records.map((record) => JSON.stringify(record)).join("\n")}\n`, "utf8");
writeFileSync(timingOutput, `${JSON.stringify({
  schemaVersion: 1,
  recordType: "synthetic-extraction-timing-distributions",
  bucketBoundariesMs: timingBucketBoundariesMs,
  byFixtureClass: timingByFixtureClass,
  sanitized: true,
}, null, 2)}\n`, "utf8");
process.stdout.write(`${output}\n`);
