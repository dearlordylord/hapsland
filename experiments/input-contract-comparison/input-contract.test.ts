import { describe, expect, it } from "vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { controlledDecisionModelLayer } from "../../src/test-support/controlled-decision-model.ts";
import { configuredRules } from "../../src/policy/rules.ts";
import { ReviewBackend } from "../../src/ports/review-backend.ts";
import { compareScenario, evaluateGates } from "./compare.ts";
import { inputComparisonFixtures, fixtureSummary } from "./fixtures.ts";
import { observe } from "./evaluate.ts";
import { CallBudget, planRun } from "./plan.ts";
import { runPlanned } from "./runner.ts";
import { modes, renderDiff, renderInput } from "./render.ts";
import { bandContains, type InputMode, type Observation, type ScenarioResult } from "./protocol.ts";
import { sharedExpectationRecord, sharedFixtureRecord } from "./shared-model.ts";

const fixture = inputComparisonFixtures[0]!;

const observation = (probability: number, repetition: number): Observation => ({
  id: `${fixture.id}:declaration-context:${repetition}`,
  fixtureId: fixture.id,
  mode: "declaration-context",
  repetition,
  rendered: renderInput(fixture, "declaration-context"),
  status: "reviewed",
  semantic: "passed",
  probability,
  durationMs: 1,
  extractionMs: 1,
  renderingMs: 1,
  attempts: 1,
  retries: 0,
});

describe("input-contract comparison corpus", () => {
  it("pre-registers the four balanced categories and matrix controls", () => {
    expect(fixtureSummary).toMatchObject({
      total: 24,
      categories: { interface: 6, "type-alias": 6, zod: 6, "effect-schema": 6 },
      contextRequired: 12,
      wholeFileDilution: 6,
    });
    expect(fixtureSummary.diffSufficient).toBeGreaterThanOrEqual(6);
    expect(fixtureSummary.negativeControls).toBeGreaterThanOrEqual(6);
    expect(inputComparisonFixtures.some((item) => item.expectations.some((expectation) => expectation.kind === "ambiguous"))).toBe(true);
    expect(inputComparisonFixtures.every((item) => item.expectations.some((expectation) => expectation.kind !== "unchecked"))).toBe(true);
  });

  it("validates fixture identity and authored expectations through the shared model", () => {
    for (const item of inputComparisonFixtures) {
      expect(sharedFixtureRecord(item).fixtureDigest).toBe(item.fixtureDigest);
      expect(sharedExpectationRecord(item).fixtureId).toBe(item.id);
    }
  });

  it("renders four versioned modes with stable shared identity", () => {
    const rendered = modes.map((mode) => renderInput(fixture, mode));
    expect(new Set(rendered.map((input) => input.rendererDigest)).size).toBe(4);
    expect(new Set(rendered.map((input) => input.fixtureDigest)).size).toBe(1);
    expect(new Set(rendered.map((input) => input.fixtureDigest))).toEqual(new Set([fixture.fixtureDigest]));
    expect(new Set(rendered.map((input) => input.contentHash)).size).toBe(1);
    expect(new Set(rendered.map((input) => input.path)).size).toBe(1);
    expect(new Set(rendered.map((input) => input.domain)).size).toBe(1);
    expect(rendered.find((input) => input.mode === "diff")?.before).toBe(fixture.before);
    expect(rendered.find((input) => input.mode === "whole-file")?.source).toBe(fixture.after);
    expect(rendered.find((input) => input.mode === "diff")?.completeness.status).toBe("not-applicable");
    expect(rendered.find((input) => input.mode === "whole-file")?.completeness.status).toBe("complete");
    expect(rendered.find((input) => input.mode === "declaration-only")?.declarationName).toBe(fixture.rootName);
    expect(rendered.find((input) => input.mode === "declaration-only")?.completeness.status).toBe("not-applicable");
    expect(rendered.find((input) => input.mode === "declaration-context")?.source).not.toContain("/* completeness:");
  });

  it("renders the Codex apply_patch hunk, not a standard unified diff", () => {
    const diff = renderDiff(fixture.path, fixture.before, fixture.after);
    expect(diff).toContain("*** Begin Patch");
    expect(diff).toContain("*** Update File: <WORKSPACE>/fixtures/input-contract/interface/iface-delivery-flat.ts");
    expect(diff).toContain("*** End Patch");
    expect(diff).toContain("+  phone?: string;");
    expect(diff).toContain("export interface Delivery");
    expect(diff).not.toContain("type DeliveryChannel =");
    expect(diff.split("\n").filter((line) => line.startsWith("+")).length).toBe(1);
  });

  it("classifies bounded required omissions explicitly", () => {
    const rendered = renderInput(fixture, "declaration-context", {
      maxDeclarations: 0,
      maxDepth: 3,
      maxSourceCharacters: 20_000,
    });
    expect(rendered.completeness.status).toBe("incomplete-required");
    expect(rendered.completeness.omissions).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "DeliveryChannel", required: true }),
    ]));
  });

  it("pre-registers material whole-file contrast and Rule 2-specific diff controls", () => {
    const contrastFixtures = inputComparisonFixtures.filter((item) => item.contextRequired || item.wholeFileDilution);
    for (const item of contrastFixtures) {
      const whole = renderInput(item, "whole-file");
      const context = renderInput(item, "declaration-context");
      expect(whole.sourceCharacters / context.sourceCharacters, item.id).toBeGreaterThanOrEqual(3);
    }
    const diffControls = inputComparisonFixtures.filter((item) => item.diffSufficient);
    expect(diffControls).toHaveLength(8);
    expect(diffControls.every((item) => item.evidence.requiredReferences.length === 0)).toBe(true);
    expect(diffControls.filter((item) => item.expectations[0]?.kind === "violation")).toHaveLength(4);
    expect(diffControls.filter((item) => item.expectations[0]?.kind === "clear")).toHaveLength(4);
  });

  it("records structurally unavailable renderer arms without treating them as semantic negatives", () => {
    const diff = renderInput(fixture, "diff");
    const declaration = renderInput(fixture, "declaration-only");
    expect(diff.completeness.status).toBe("not-applicable");
    expect(declaration.completeness.status).toBe("not-applicable");
    expect(diff.completeness.omissions).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "DeliveryChannel", required: true }),
    ]));
  });
});

describe("input-contract comparison math", () => {
  it("requires two of three repetitions in the authored band", () => {
    expect(compareScenario(fixture, "declaration-context", [observation(0.8, 1), observation(0.9, 2), observation(0.2, 3)]).status).toBe("passed");
    expect(compareScenario(fixture, "declaration-context", [observation(0.8, 1), observation(0.9, 2)]).status).toBe("inconclusive");
    expect(compareScenario(fixture, "declaration-context", [observation(0.2, 1), observation(0.1, 2), observation(0.4, 3)]).status).toBe("failed");
  });

  it("keeps clear and violation boundaries explicit", () => {
    const violationBand = fixture.expectations[0]!.band!;
    expect(bandContains({ minimum: 0, maximum: 0.3 }, 0.3)).toBe(false);
    expect(bandContains(violationBand, 0.7)).toBe(false);
    expect(bandContains(violationBand, 0.70001)).toBe(true);
  });

  it("never turns absent or ambiguous labels into clear results", () => {
    const unchecked = { ...fixture, expectations: [] };
    const authored = fixture.expectations[0]!;
    const { band: _band, ...withoutBand } = authored;
    const ambiguous = { ...fixture, expectations: [{ ...withoutBand, kind: "ambiguous" as const }] };
    expect(compareScenario(unchecked, "diff", []).status).toBe("unchecked");
    expect(compareScenario(ambiguous, "diff", []).status).toBe("ambiguous");
  });

  it("keeps not-applicable renderer arms out of semantic status", () => {
    const rendered = renderInput(fixture, "declaration-only");
    const result = compareScenario(fixture, "declaration-only", [{
      id: "not-applicable",
      fixtureId: fixture.id,
      mode: "declaration-only",
      repetition: 1,
      rendered,
      status: "not-applicable",
      semantic: "not-applicable",
      durationMs: 0,
      extractionMs: 0,
      renderingMs: 0,
      attempts: 0,
      retries: 0,
    }]);
    expect(result.status).toBe("not-applicable");
    expect(result.available).toBe(0);
  });

  it("scores diff-sufficient controls from the focused-diff arm", () => {
    const ids = inputComparisonFixtures.filter((item) => item.diffSufficient).map((item) => item.id);
    const modes: readonly InputMode[] = ["diff", "whole-file", "declaration-only", "declaration-context"];
    const byMode = new Map<InputMode, readonly ScenarioResult[]>(modes.map((mode) => [mode, ids.map((fixtureId) => ({
      fixtureId,
      mode,
      expectation: inputComparisonFixtures.find((item) => item.id === fixtureId)!.expectations[0]!,
      observations: [],
      available: 3,
      inBand: mode === "declaration-context" ? 0 : 3,
      status: mode === "declaration-context" ? "failed" as const : "passed" as const,
    }))]));
    const gate = evaluateGates({ byMode, contextRequired: [], diffSufficient: ids, wholeFileDilution: [], negativeControls: [] })
      .find((item) => item.name === "focused-diff sufficient controls");
    expect(gate).toMatchObject({ passed: true, numerator: 8, denominator: 8, required: 6 });
  });

  it("requires paired wins for context and dilution advantage", () => {
    const selected = inputComparisonFixtures.filter((item) => item.contextRequired).slice(0, 5);
    const makeScenarios = (mode: InputMode): readonly ScenarioResult[] => selected.map((item, index) => ({
      fixtureId: item.id,
      mode,
      expectation: item.expectations[0]!,
      observations: [],
      available: 3,
      inBand: mode === "whole-file" && index < 3 ? 0 : 3,
      status: mode === "whole-file" && index < 3 ? "failed" : "passed",
    }));
    const byMode = new Map<InputMode, readonly ScenarioResult[]>([
      ["diff", makeScenarios("diff")],
      ["whole-file", makeScenarios("whole-file")],
      ["declaration-only", makeScenarios("declaration-only")],
      ["declaration-context", makeScenarios("declaration-context")],
    ]);
    const gates = evaluateGates({
      byMode,
      contextRequired: selected.map((item) => item.id),
      diffSufficient: [],
      wholeFileDilution: selected.map((item) => item.id),
      negativeControls: [],
    });
    expect(gates.find((item) => item.name === "context-required paired advantage")).toMatchObject({ passed: true, numerator: 3 });
    expect(gates.find((item) => item.name === "whole-file dilution paired advantage")).toMatchObject({ passed: true, numerator: 3 });
  });
});

describe("input-contract call planning", () => {
  it("pre-registers the 288 logical and 864 maximum-attempt matrix", () => {
    const plan = planRun({ fixtureCount: 24, remainingAuthorizedCalls: 864, liveOptIn: true });
    expect(plan.logicalCalls).toBe(288);
    expect(plan.maximumTransportAttempts).toBe(864);
    expect(plan.permitted).toBe(true);
    expect(planRun({ fixtureCount: 24, remainingAuthorizedCalls: 863, liveOptIn: true }).permitted).toBe(false);
    expect(planRun({ fixtureCount: 24, remainingAuthorizedCalls: 0, liveOptIn: false, offline: true }).permitted).toBe(true);
  });

  it("budgets structurally not-applicable slots without pretending they are paid calls", () => {
    const plan = planRun({
      fixtureCount: 24,
      remainingAuthorizedCalls: 432,
      maximumRetriesPerRequest: 1,
      notApplicableLogicalCalls: 72,
      liveOptIn: true,
    });
    expect(plan.logicalCalls).toBe(288);
    expect(plan.applicableLogicalCalls).toBe(216);
    expect(plan.notApplicableLogicalCalls).toBe(72);
    expect(plan.maximumTransportAttempts).toBe(432);
    expect(plan.permitted).toBe(true);
  });

  it("enforces reserved and observed attempts without making a backend call", () => {
    const budget = new CallBudget(3);
    budget.reserve(3);
    budget.observe(1);
    expect(budget.observedAttempts).toBe(1);
    expect(() => budget.observe(3)).toThrow(/reserved/);
    expect(() => budget.reserve(1)).toThrow(/exceeded/);
  });
});

describe("offline DecisionModel seam", () => {
  it("uses the product ReviewBackend path with a controlled model", async () => {
    const answers = Object.fromEntries(configuredRules.map((rule) => [rule.id, { _tag: "Probability" as const, probability: 0.8 }]));
    const layer = ReviewBackend.layer.pipe(Layer.provide(controlledDecisionModelLayer({ answers })));
    const result = await Effect.runPromise(observe(fixture, "declaration-context", 1).pipe(Effect.provide(layer)));
    expect(result.status).toBe("reviewed");
    expect("probability" in result ? result.probability : undefined).toBe(0.8);
    expect(result.attempts).toBe(1);
    expect(result.rendered.completeness.status).toBe("complete");
  });

  it("does not reserve backend budget for not-applicable matrix arms", async () => {
    const answers = Object.fromEntries(configuredRules.map((rule) => [rule.id, { _tag: "Probability" as const, probability: 0.8 }]));
    const layer = ReviewBackend.layer.pipe(Layer.provide(controlledDecisionModelLayer({ answers })));
    const result = await Effect.runPromise(runPlanned({
      fixtureCount: 24,
      remainingAuthorizedCalls: 216,
      liveOptIn: false,
      offline: true,
      maximumRetriesPerRequest: 0,
      notApplicableLogicalCalls: 72,
    }).pipe(Effect.provide(layer)));
    expect(result.plan.maximumTransportAttempts).toBe(216);
    expect(result.report.counts.transport.available).toBe(216);
    expect(result.report.counts.semantic.notApplicable).toBe(22);
  });
});
