import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { Live } from "../../src/jev-decision.ts";
import { configuredRules } from "../../src/policy/rules.ts";
import { BUNDLED_NOUL_PACK } from "../../src/rules/bundled.ts";
import { ReviewBackend } from "../../src/ports/review-backend.ts";
import { digest, sha256, type InputMode, type Observation } from "./protocol.ts";
import { inputComparisonFixtures } from "./fixtures.ts";
import { modes } from "./render.ts";
import { observe } from "./evaluate.ts";

/**
 * Bounded paid diagnostic for the evidence dashboard. This is deliberately not
 * the issue-16 corpus gate: it uses four no-reference fixtures so every selected
 * fixture/mode arm is applicable, and it spends the final 64-call authorization
 * on four repetitions of that representative slice.
 */
const selectedIds = [
  "iface-range-diff",
  "alias-money",
  "zod-range",
  "effect-money",
] as const;
const repetitions = 4;
const maximumRetriesPerCall = 0;
const authorizedCallsBeforeRun = 64;
const expectedCalls = selectedIds.length * modes.length * repetitions;
if (expectedCalls !== authorizedCallsBeforeRun) {
  throw new Error(`diagnostic call count drifted: expected ${authorizedCallsBeforeRun}, got ${expectedCalls}`);
}
if (typeof process.env.TYPESAFE_API_KEY !== "string" || process.env.TYPESAFE_API_KEY.length === 0) {
  throw new Error("TYPESAFE_API_KEY is required for the paid diagnostic");
}

const selectedFixtures = selectedIds.map((id) => {
  const fixture = inputComparisonFixtures.find((candidate) => candidate.id === id);
  if (fixture === undefined) throw new Error(`missing diagnostic fixture ${id}`);
  if (fixture.evidence.requiredReferences.length > 0) {
    throw new Error(`diagnostic fixture ${id} unexpectedly requires references`);
  }
  return fixture;
});

const nearestRank = (values: readonly number[], percentile: number): number | undefined => {
  if (values.length === 0) return undefined;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.max(0, Math.ceil((percentile / 100) * sorted.length) - 1)];
};

const timingSummary = (values: readonly number[]) => ({
  count: values.length,
  ...(values.length === 0 ? {} : {
    minMs: Math.min(...values),
    p50Ms: nearestRank(values, 50),
    p95Ms: nearestRank(values, 95),
    maxMs: Math.max(...values),
  }),
});

const wireQuestions = BUNDLED_NOUL_PACK.rules.map((rule) => ({
  id: rule.id,
  type: "noul" as const,
  instructions: rule.question,
  criteria: rule.criteria,
}));

const sanitizeObservation = (observation: Observation) => ({
  id: observation.id,
  fixtureId: observation.fixtureId,
  mode: observation.mode,
  repetition: observation.repetition,
  request: {
    model: "jev-latest" as const,
    artifact: {
      // ReviewBackend intentionally uses the rendered path as Decision state.domain.
      domain: observation.rendered.path,
      sourceSha256: sha256(observation.rendered.source),
      sourceCharacters: observation.rendered.sourceCharacters,
    },
    contract: observation.rendered.contract,
    requestBytes: observation.rendered.requestBytes,
    questionCount: configuredRules.length,
    ruleDefinitionDigest: observation.rendered.ruleDefinitionDigest,
  },
  result: {
    status: observation.status,
    semantic: observation.semantic,
    assessmentKeys: observation.status === "reviewed"
      ? configuredRules.map((rule) => rule.id).sort()
      : [],
    errorCategory: observation.errorCategory,
  },
  attempts: observation.attempts,
  retries: observation.retries,
});

const run = Effect.gen(function* () {
  const observations: Observation[] = [];
  for (const fixture of selectedFixtures) {
    for (const mode of modes) {
      for (let repetition = 1; repetition <= repetitions; repetition += 1) {
        observations.push(yield* observe(fixture, mode, repetition));
      }
    }
  }
  return observations;
});

const backendLayer = ReviewBackend.layerWithOptions({ transientRetries: maximumRetriesPerCall }).pipe(
  Layer.provide(Live),
);
const observations = await Effect.runPromise(run.pipe(Effect.provide(backendLayer)));
const sanitized = observations.map(sanitizeObservation);
const semanticCounts = Object.fromEntries(
  ["passed", "failed", "ambiguous", "unchecked", "inconclusive", "not-applicable"].map((status) => [
    status,
    observations.filter((observation) => observation.semantic === status).length,
  ]),
);
const scenarioSummaries = selectedFixtures.flatMap((fixture) => modes.map((mode) => {
  const group = observations.filter((observation) => observation.fixtureId === fixture.id && observation.mode === mode);
  return {
    fixtureId: fixture.id,
    category: fixture.category,
    mode,
    calls: group.length,
    reviewed: group.filter((observation) => observation.status === "reviewed").length,
    semantic: Object.fromEntries(
      ["passed", "failed", "ambiguous", "unchecked", "inconclusive", "not-applicable"].map((status) => [
        status,
        group.filter((observation) => observation.semantic === status).length,
      ]),
    ),
    timing: {
      endToEnd: timingSummary(group.map((observation) => observation.durationMs)),
      backend: timingSummary(group.flatMap((observation) => observation.backendMs === undefined ? [] : [observation.backendMs])),
    },
  };
}));

const reportWithoutDigest = {
  evidenceVersion: 1,
  status: "complete" as const,
  date: new Date().toISOString().slice(0, 10),
  runId: "input-contract-dashboard-diagnostic-2026-09-20",
  purpose: "Expose sanitized production request/result evidence for dashboard review; not a full issue-16 gate rerun.",
  budget: {
    authorizedCallsBeforeRun,
    declaredCalls: expectedCalls,
    observedCalls: observations.length,
    maximumRetriesPerCall,
    authorizedCallsAfterRun: authorizedCallsBeforeRun - observations.length,
  },
  selection: {
    fullCorpusFixtures: inputComparisonFixtures.length,
    selectedFixtures: selectedFixtures.map((fixture) => ({
      id: fixture.id,
      category: fixture.category,
      expectation: fixture.expectations[0],
    })),
    modes,
    repetitions,
  },
  backend: {
    id: "jev",
    provider: "@effect/ai-typesafe",
    model: "jev-latest",
    decisionModel: "effect/unstable/ai/DecisionModel",
    destination: "https://api.typesafe.ai/v1/systemone",
    requestMethod: "POST",
    requestShape: ["model", "state", "questions"],
  },
  wireQuestions,
  counts: {
    total: observations.length,
    reviewed: observations.filter((observation) => observation.status === "reviewed").length,
    unavailable: observations.filter((observation) => observation.status === "unavailable").length,
    semantic: semanticCounts,
  },
  scenarioSummaries,
  observations: sanitized,
  retention: {
    retained: [
      "sanitized request envelope metadata",
      "source SHA-256 and source size for joining to the dashboard fixture",
      "decision key set and authored-band semantic outcome",
      "aggregate timing by fixture and input mode",
    ],
    notRetained: [
      "individual probabilities",
      "raw or source-bearing provider responses",
      "provider usage details",
      "credentials",
    ],
    limitation: "This is a representative 64-call diagnostic, not a replacement for the 24-fixture issue-16 gate run.",
  },
};
const report = { ...reportWithoutDigest, runDigest: digest(reportWithoutDigest) };
const outputPath = resolve(import.meta.dirname, "../../evidence/input-contract-comparison/live-diagnostic-2026-09-20.json");
writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
console.log(JSON.stringify({
  runId: report.runId,
  observedCalls: report.counts.total,
  reviewed: report.counts.reviewed,
  unavailable: report.counts.unavailable,
  outputPath,
  runDigest: report.runDigest,
}));
