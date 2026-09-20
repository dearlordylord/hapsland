import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { Live } from "../../src/jev-decision.ts";
import { configuredRules } from "../../src/policy/rules.ts";
import { ReviewBackend } from "../../src/ports/review-backend.ts";
import { validateAssessment } from "../../src/runtime/assessment.ts";
import { bandContains, digest, sha256, stableJson } from "./protocol.ts";
import { inputComparisonFixtures } from "./fixtures.ts";
import { INPUT_CONTRACTS } from "./protocol.ts";
import { prepareInput } from "./evaluate.ts";

const fixture = inputComparisonFixtures.find((candidate) => candidate.id === "iface-delivery-flat");
if (fixture === undefined) throw new Error("missing iface-delivery-flat fixture");
const codexCapturePath = resolve(import.meta.dirname, "../../evidence/codex/0.155.1/native-fixture-emission-2026-09-20.json");
const codexCapture = JSON.parse(readFileSync(codexCapturePath, "utf8")) as {
  readonly verdict: string;
  readonly request?: { readonly command?: string };
};
const codexCommand = codexCapture.request?.command;
if (codexCapture.verdict !== "runtime-tested" || codexCommand === undefined) throw new Error("actual Codex fixture capture is missing");
if (typeof process.env.TYPESAFE_API_KEY !== "string" || process.env.TYPESAFE_API_KEY.length === 0) {
  throw new Error("TYPESAFE_API_KEY is required for the paid Codex/semantic comparison");
}

const semantic = prepareInput(fixture, "declaration-context").rendered;
if (semantic.completeness.status !== "complete") throw new Error(`semantic tree unexpectedly rendered as ${semantic.completeness.status}`);

const requestBytes = (source: string, contract: unknown, rendererDigest: string) => Buffer.byteLength(stableJson({
  artifact: { domain: fixture.path, path: fixture.path, source },
  inputContract: contract,
  rendererDigest,
  ruleDefinitionDigest: semantic.ruleDefinitionDigest,
  extractionProfile: semantic.extractionProfile,
  completeness: semantic.completeness,
}), "utf8");

const evaluate = (arm: "codex-patch" | "semantic-object-tree", source: string, contract: unknown, rendererDigest: string) => Effect.gen(function* () {
  const backend = yield* ReviewBackend.Service;
  const response = yield* backend.evaluate({ path: fixture.path, source, rules: configuredRules });
  const assessment = yield* validateAssessment(configuredRules, response.answers);
  const probabilities = Object.fromEntries(Object.entries(assessment).sort(([left], [right]) => left.localeCompare(right)));
  const rule2 = probabilities.r2_meaningless_combinations;
  if (typeof rule2 !== "number") throw new Error(`${arm} response omitted r2_meaningless_combinations`);
  const expectation = fixture.expectations[0];
  const semanticStatus = expectation?.band === undefined ? "unchecked" : bandContains(expectation.band, rule2) ? "passed" : "failed";
  return {
    fixtureId: fixture.id,
    arm,
    request: {
      model: "jev-latest",
      artifact: { domain: fixture.path, sourceSha256: sha256(source), sourceCharacters: source.length },
      contract,
      requestBytes: requestBytes(source, contract, rendererDigest),
      questionCount: configuredRules.length,
      ruleDefinitionDigest: semantic.ruleDefinitionDigest,
    },
    result: {
      status: "reviewed",
      semantic: semanticStatus,
      probabilities,
      returnedDecisionKeys: Object.keys(probabilities),
    },
    backend: { durationMs: response.backend.durationMs, retries: response.backend.retries },
  };
});

const rows = await Effect.runPromise(
  Effect.gen(function* () {
    const codex = yield* evaluate("codex-patch", codexCommand, INPUT_CONTRACTS.diff, "runtime-codex-callback");
    const tree = yield* evaluate("semantic-object-tree", semantic.source, semantic.contract, semantic.rendererDigest);
    return [codex, tree] as const;
  }).pipe(Effect.provide(ReviewBackend.layerWithOptions({ transientRetries: 0 }).pipe(Layer.provide(Live)))),
);

const reportWithoutDigest = {
  evidenceVersion: 1,
  status: "complete" as const,
  date: new Date().toISOString().slice(0, 10),
  runId: "input-contract-codex-semantic-comparison-2026-09-20",
  purpose: "User-authorized two-arm diagnostic: actual Codex callback patch versus extracted semantic object tree for the same fixture.",
  authorization: {
    previousProjectLedgerRemaining: 0,
    additionalCallsAuthorized: 2,
    callsObserved: rows.length,
    remainingAdditionalCalls: 2 - rows.length,
  },
  fixture: {
    id: fixture.id,
    path: fixture.path,
    expectation: fixture.expectations[0],
    codexCapture: "evidence/codex/0.155.1/native-fixture-emission-2026-09-20.json",
  },
  backend: {
    id: "jev",
    provider: "@effect/ai-typesafe",
    model: "jev-latest",
    destination: "https://api.typesafe.ai/v1/systemone",
    requestMethod: "POST",
  },
  rows,
  retention: {
    retained: ["numeric per-rule probabilities returned by Jev", "sanitized request metadata and source digests", "actual Codex patch capture separately retained"],
    notRetained: ["credentials", "raw provider responses", "provider usage details"],
    authorizationNote: "Explicit two-call comparison requested by the user; this is not a corpus gate rerun.",
  },
};
const report = { ...reportWithoutDigest, runDigest: digest(reportWithoutDigest) };
const outputPath = resolve(import.meta.dirname, "../../evidence/input-contract-comparison/live-codex-semantic-comparison-2026-09-20.json");
writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
console.log(JSON.stringify({ runId: report.runId, calls: rows.length, outputPath, runDigest: report.runDigest }));
