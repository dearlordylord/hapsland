import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { Live } from "../../src/jev-decision.ts";
import { configuredRules } from "../../src/policy/rules.ts";
import { ReviewBackend } from "../../src/ports/review-backend.ts";
import { validateAssessment } from "../../src/runtime/assessment.ts";
import { bandContains, digest, sha256, type InputMode } from "./protocol.ts";
import { inputComparisonFixtures } from "./fixtures.ts";
import { prepareInput } from "./evaluate.ts";

const fixture = inputComparisonFixtures.find((candidate) => candidate.id === "iface-delivery-flat");
if (fixture === undefined) throw new Error("missing iface-delivery-flat fixture");
const modes = ["whole-file", "declaration-context"] as const satisfies readonly InputMode[];
const additionalCallsAuthorized = modes.length;
if (typeof process.env.TYPESAFE_API_KEY !== "string" || process.env.TYPESAFE_API_KEY.length === 0) {
  throw new Error("TYPESAFE_API_KEY is required for the paid confidence probe");
}

const run = Effect.gen(function* () {
  const backend = yield* ReviewBackend.Service;
  const rows = [];
  for (const mode of modes) {
    const prepared = prepareInput(fixture, mode);
    if (prepared.rendered.completeness.status !== "complete") {
      throw new Error(`${mode} unexpectedly rendered as ${prepared.rendered.completeness.status}`);
    }
    const response = yield* backend.evaluate({
      path: prepared.rendered.path,
      source: prepared.rendered.source,
      rules: configuredRules,
    });
    const assessment = yield* validateAssessment(configuredRules, response.answers);
    const probabilities = Object.fromEntries(
      Object.entries(assessment).sort(([left], [right]) => left.localeCompare(right)),
    );
    const rule2 = Object.entries(assessment).find(([ruleId]) => ruleId === "r2_meaningless_combinations")?.[1];
    if (rule2 === undefined) throw new Error("Jev response omitted r2_meaningless_combinations");
    const expectation = fixture.expectations[0];
    const semantic = expectation?.band === undefined
      ? "unchecked"
      : bandContains(expectation.band, rule2) ? "passed" : "failed";
    rows.push({
      fixtureId: fixture.id,
      mode,
      request: {
        model: "jev-latest",
        artifact: {
          domain: prepared.rendered.path,
          sourceSha256: sha256(prepared.rendered.source),
          sourceCharacters: prepared.rendered.sourceCharacters,
        },
        contract: prepared.rendered.contract,
        requestBytes: prepared.rendered.requestBytes,
        questionCount: configuredRules.length,
        ruleDefinitionDigest: prepared.rendered.ruleDefinitionDigest,
      },
      result: {
        status: "reviewed",
        semantic,
        probabilities,
        returnedDecisionKeys: Object.keys(probabilities),
      },
      backend: {
        durationMs: response.backend.durationMs,
        retries: response.backend.retries,
      },
    });
  }
  return rows;
});

const rows = await Effect.runPromise(
  run.pipe(
    Effect.provide(ReviewBackend.layerWithOptions({ transientRetries: 0 }).pipe(Layer.provide(Live))),
  ),
);
const reportWithoutDigest = {
  evidenceVersion: 1,
  status: "complete" as const,
  date: new Date().toISOString().slice(0, 10),
  runId: "input-contract-confidence-probe-2026-09-20",
  purpose: "User-authorized confidence visibility probe for iface-delivery-flat; not a corpus gate rerun.",
  authorization: {
    previousProjectLedgerRemaining: 0,
    additionalCallsAuthorized,
    callsObserved: rows.length,
    remainingAdditionalCalls: additionalCallsAuthorized - rows.length,
  },
  fixture: {
    id: fixture.id,
    category: fixture.category,
    expectation: fixture.expectations[0],
    omittedModes: [
      { mode: "diff", reason: "not-applicable: required DeliveryChannel reference is omitted" },
      { mode: "declaration-only", reason: "not-applicable: required DeliveryChannel reference is omitted" },
    ],
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
    retained: [
      "numeric per-rule probabilities returned by Jev",
      "sanitized request metadata and source digest",
      "decision keys, Rule 2 semantic classification, and backend timing",
    ],
    notRetained: ["credentials", "raw provider responses", "source-bearing paid responses", "provider usage details"],
    authorizationNote: "This is a user-authorized narrow exception to the aggregate-only issue-16 evidence retention policy.",
  },
};
const report = { ...reportWithoutDigest, runDigest: digest(reportWithoutDigest) };
const outputPath = resolve(import.meta.dirname, "../../evidence/input-contract-comparison/live-confidence-probe-2026-09-20.json");
writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
console.log(JSON.stringify({ runId: report.runId, calls: rows.length, outputPath, runDigest: report.runDigest }));
