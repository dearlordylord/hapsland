import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { inputComparisonFixtures } from "./fixtures.ts";
import { modes, renderInput } from "./render.ts";

const root = resolve(import.meta.dirname, "../..");
const reportPath = resolve(root, "evidence/input-contract-comparison/live-report-2026-09-20-followup.json");
const diagnosticPath = resolve(root, "evidence/input-contract-comparison/live-diagnostic-2026-09-20.json");
const confidenceProbePath = resolve(root, "evidence/input-contract-comparison/live-confidence-probe-2026-09-20.json");
const codexEmissionPath = resolve(root, "evidence/codex/0.155.1/native-patch-emission-2026-09-20.json");
const outputPath = resolve(root, "evidence/input-contract-comparison/dashboard-data.js");
const report = JSON.parse(readFileSync(reportPath, "utf8")) as unknown;
type WireQuestion = { readonly id: string; readonly type: "noul"; readonly instructions: string; readonly criteria: { readonly false: string; readonly true: string } };
type Diagnostic = { readonly backend: Record<string, unknown>; readonly wireQuestions: readonly WireQuestion[] } & Record<string, unknown>;
const diagnostic = JSON.parse(readFileSync(diagnosticPath, "utf8")) as Diagnostic;
const confidenceProbe = JSON.parse(readFileSync(confidenceProbePath, "utf8")) as unknown;
const codexEmission = JSON.parse(readFileSync(codexEmissionPath, "utf8")) as unknown;

const fixtures = inputComparisonFixtures.map((fixture) => ({
  id: fixture.id,
  name: fixture.name,
  category: fixture.category,
  path: fixture.path,
  rootName: fixture.rootName,
  rootKind: fixture.rootKind,
  contentHash: fixture.contentHash,
  fixtureDigest: fixture.fixtureDigest,
  flags: {
    contextRequired: fixture.contextRequired === true,
    diffSufficient: fixture.diffSufficient === true,
    wholeFileDilution: fixture.wholeFileDilution === true,
    negativeControl: fixture.negativeControl === true,
  },
  expectation: fixture.expectations[0],
  evidence: fixture.evidence,
  before: fixture.before,
  after: fixture.after,
  rendered: Object.fromEntries(modes.map((mode) => {
    const rendered = renderInput(fixture, mode);
    return [mode, {
      contract: rendered.contract,
      path: rendered.path,
      domain: rendered.domain,
      source: rendered.source,
      sourceCharacters: rendered.sourceCharacters,
      requestBytes: rendered.requestBytes,
      declarationName: rendered.declarationName,
      contextNames: rendered.contextNames,
      completeness: rendered.completeness,
      rendererDigest: rendered.rendererDigest,
      ruleDefinitionDigest: rendered.ruleDefinitionDigest,
      extractionProfile: rendered.extractionProfile,
    }];
  })),
}));

const data = {
  schemaVersion: 1,
  source: {
    fixtures: "experiments/input-contract-comparison/fixtures.ts",
    renderer: "experiments/input-contract-comparison/render.ts",
    report: "evidence/input-contract-comparison/live-report-2026-09-20-followup.json",
    diagnostic: "evidence/input-contract-comparison/live-diagnostic-2026-09-20.json",
    confidenceProbe: "evidence/input-contract-comparison/live-confidence-probe-2026-09-20.json",
    codexEmission: "evidence/codex/0.155.1/native-patch-emission-2026-09-20.json",
    currentDiffRenderer: "experiments/input-contract-comparison/render.ts:renderCodexPatch",
  },
  rendererRevision: {
    current: "codex-apply-patch@1",
    historicalPaidReport: "textual-diff@2",
    status: "current-focused-diff-needs-new-paid-matrix",
  },
  retention: {
    retained: [
      "authored fixture metadata, expectations, and rationales",
      "before and after source for all 24 fixtures",
      "deterministically regenerated inputs for all four modes",
      "aggregate run counts, gates, timing, and request-size summaries",
      "sanitized 64-call production request/result diagnostic for four representative fixtures",
      "user-authorized two-call numeric confidence probe for iface-delivery-flat",
      "runtime-probed native Codex apply_patch emission shape",
    ],
    notRetained: [
      "individual backend probabilities for the full gate and 64-call diagnostic",
      "full-corpus per-repetition and per-fixture live semantic outcomes",
      "raw or source-bearing provider responses",
      "provider usage details",
    ],
    consequence: "The retained paid aggregate report used historical textual-diff@2. Current rendered diff inputs use codex-apply-patch@1, so focused-diff measurements need a new paid matrix; whole-file/context evidence remains separately inspectable.",
  },
  providerContract: {
    source: [
      "src/ports/review-backend.ts",
      "node_modules/@effect/ai-typesafe/dist/TypeSafeDecisionModel.js",
      "node_modules/@effect/ai-typesafe/dist/TypeSafeClient.js",
    ],
    backend: diagnostic.backend,
    requestTemplate: {
      model: "jev-latest",
      state: { artifact: { domain: "<rendered path>", source: "<rendered input source>" } },
      questions: diagnostic.wireQuestions,
    },
    note: "The provider receives one POST /systemone request with model, state, and the nine Noul questions. The dashboard fills the two artifact placeholders from the selected fixture and mode.",
  },
  codexEmission,
  diagnostic,
  confidenceProbe,
  report,
  fixtures,
};

writeFileSync(outputPath, `/* Generated by experiments/input-contract-comparison/generate-dashboard-data.ts. */\nwindow.INPUT_CONTRACT_DASHBOARD_DATA = ${JSON.stringify(data, null, 2)};\n`);
console.log(`wrote ${outputPath} (${fixtures.length} fixtures)`);
