import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { Live } from "../../src/jev-decision.ts";
import { configuredRules } from "../../src/policy/rules.ts";
import { ReviewBackend } from "../../src/ports/review-backend.ts";
import { validateAssessment } from "../../src/runtime/assessment.ts";
import { bandContains, digest, sha256, stableJson, INPUT_CONTRACTS } from "./protocol.ts";
import { inputComparisonFixtures } from "./fixtures.ts";
import { prepareInput } from "./evaluate.ts";

type CaptureRow = { readonly fixtureId: string; readonly path: string; readonly verdict: string; readonly command?: string };
const capturePath = resolve(import.meta.dirname, "../../evidence/codex/0.155.1/native-patch-corpus-2026-09-20.json");
const capture = JSON.parse(readFileSync(capturePath, "utf8")) as { readonly verdict: string; readonly rows: readonly CaptureRow[] };
if (capture.verdict !== "runtime-tested" || capture.rows.length !== inputComparisonFixtures.length) throw new Error("Codex patch corpus is incomplete");
if (typeof process.env.TYPESAFE_API_KEY !== "string" || process.env.TYPESAFE_API_KEY.length === 0) throw new Error("TYPESAFE_API_KEY is required");

const captureFor = new Map(capture.rows.map((row) => [row.fixtureId, row]));
const requestBytes = (fixture: (typeof inputComparisonFixtures)[number], source: string, contract: unknown, rendererDigest: string, completeness: unknown, ruleDefinitionDigest: string, extractionProfile: unknown) => Buffer.byteLength(stableJson({
  artifact: { domain: fixture.domain, path: fixture.path, source },
  inputContract: contract,
  rendererDigest,
  ruleDefinitionDigest,
  extractionProfile,
  completeness,
}), "utf8");

const evaluate = (fixture: (typeof inputComparisonFixtures)[number], arm: "codex-patch" | "semantic-object-tree", source: string, contract: unknown, rendererDigest: string, completeness: unknown, ruleDefinitionDigest: string, extractionProfile: unknown) => Effect.gen(function* () {
  const backend = yield* ReviewBackend.Service;
  const response = yield* backend.evaluate({ path: fixture.path, source, rules: configuredRules });
  const assessment = yield* validateAssessment(configuredRules, response.answers);
  const probabilities = Object.fromEntries(Object.entries(assessment).sort(([left], [right]) => left.localeCompare(right)));
  const rule2 = probabilities.r2_meaningless_combinations;
  if (typeof rule2 !== "number") throw new Error(`${fixture.id}/${arm} omitted r2_meaningless_combinations`);
  const expectation = fixture.expectations[0];
  return {
    fixtureId: fixture.id,
    arm,
    request: {
      model: "jev-latest",
      artifact: { domain: fixture.path, sourceSha256: sha256(source), sourceCharacters: source.length },
      contract,
      requestBytes: requestBytes(fixture, source, contract, rendererDigest, completeness, ruleDefinitionDigest, extractionProfile),
      questionCount: configuredRules.length,
      ruleDefinitionDigest,
    },
    result: {
      status: "reviewed",
      semantic: expectation?.band === undefined ? "unchecked" : bandContains(expectation.band, rule2) ? "passed" : "failed",
      probabilities,
      returnedDecisionKeys: Object.keys(probabilities),
    },
    backend: { durationMs: response.backend.durationMs, retries: response.backend.retries },
  };
});

const rows = await Effect.runPromise(
  Effect.gen(function* () {
    const result = [];
    for (const fixture of inputComparisonFixtures) {
      const codex = captureFor.get(fixture.id);
      if (codex?.command === undefined) throw new Error(`missing Codex command for ${fixture.id}`);
      result.push(yield* evaluate(fixture, "codex-patch", codex.command, INPUT_CONTRACTS.diff, "runtime-codex-callback-v1", { status: "complete" }, "runtime-codex-callback", { maxDeclarations: 0, maxDepth: 0, maxSourceCharacters: 0 }));
      const semantic = prepareInput(fixture, "declaration-context").rendered;
      if (semantic.completeness.status !== "complete") throw new Error(`${fixture.id} semantic tree is ${semantic.completeness.status}`);
      result.push(yield* evaluate(fixture, "semantic-object-tree", semantic.source, semantic.contract, semantic.rendererDigest, semantic.completeness, semantic.ruleDefinitionDigest, semantic.extractionProfile));
    }
    return result;
  }).pipe(Effect.provide(ReviewBackend.layerWithOptions({ transientRetries: 0 }).pipe(Layer.provide(Live)))),
);

const reportWithoutDigest = {
  evidenceVersion: 1,
  status: "complete" as const,
  date: new Date().toISOString().slice(0, 10),
  runId: "input-contract-codex-semantic-corpus-comparison-2026-09-20",
  purpose: "User-authorized comparison of runtime-captured Codex apply_patch commands against semantic object-tree artifacts over the full authored corpus.",
  authorization: { previousProjectLedgerRemaining: 0, additionalCallsAuthorized: inputComparisonFixtures.length * 2, callsObserved: rows.length, remainingAdditionalCalls: inputComparisonFixtures.length * 2 - rows.length },
  fixtureCount: inputComparisonFixtures.length,
  codexCapture: "evidence/codex/0.155.1/native-patch-corpus-2026-09-20.json",
  backend: { id: "jev", provider: "@effect/ai-typesafe", model: "jev-latest", destination: "https://api.typesafe.ai/v1/systemone", requestMethod: "POST" },
  rows,
  retention: {
    retained: ["numeric per-rule probabilities returned by Jev", "sanitized request metadata and source digests", "runtime-tested Codex patch corpus"],
    notRetained: ["credentials", "raw provider responses", "provider usage details"],
    authorizationNote: "Explicit user-requested two-arm corpus comparison; this is not the historical issue-16 gate rerun.",
  },
};
const report = { ...reportWithoutDigest, runDigest: digest(reportWithoutDigest) };
const outputPath = resolve(import.meta.dirname, "../../evidence/input-contract-comparison/live-codex-semantic-corpus-comparison-2026-09-20.json");
writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
console.log(JSON.stringify({ runId: report.runId, calls: rows.length, outputPath, runDigest: report.runDigest }));
