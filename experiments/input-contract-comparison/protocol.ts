import { createHash } from "node:crypto";

/** Versioned renderer contracts used by the input-comparison milestone. */
export const INPUT_CONTRACTS = {
  diff: { id: "codex-apply-patch", version: "1", renderer: "renderer.codex-patch", rendererVersion: "1" },
  "whole-file": { id: "whole-post-edit-file", version: "2", renderer: "renderer.whole-file", rendererVersion: "2" },
  "declaration-only": { id: "edited-declaration", version: "2", renderer: "renderer.declaration", rendererVersion: "2" },
  "declaration-context": { id: "edited-declaration-bounded-context", version: "2", renderer: "renderer.declaration-context", rendererVersion: "2" },
} as const;

export type InputMode = keyof typeof INPUT_CONTRACTS;
export type FixtureCategory = "interface" | "type-alias" | "zod" | "effect-schema";
export type ExpectedKind = "clear" | "violation" | "ambiguous" | "unchecked";
export type Completeness =
  | "complete"
  | "incomplete-irrelevant"
  | "incomplete-required"
  | "not-applicable"
  | "unknown";

export type ExpectedBand = {
  readonly minimum: number;
  readonly maximum: number;
  readonly minimumInclusive?: boolean;
  readonly maximumInclusive?: boolean;
};

export type Expectation = {
  readonly ruleId: string;
  readonly kind: ExpectedKind;
  readonly band?: ExpectedBand;
  readonly rationale: string;
};

export type FixtureEvidence = {
  /** Names that must be present for the checked expectation to be complete. */
  readonly requiredReferences: readonly string[];
  /** Names that may be omitted without changing the checked expectation. */
  readonly optionalReferences?: readonly string[];
};

export type Fixture = {
  readonly id: string;
  readonly name: string;
  readonly category: FixtureCategory;
  readonly path: string;
  readonly domain: string;
  readonly before: string;
  readonly after: string;
  readonly contentHash: string;
  readonly fixtureDigest: string;
  readonly rootName: string;
  readonly rootKind: "interface" | "type-alias" | "schema";
  readonly expectations: readonly Expectation[];
  readonly evidence: FixtureEvidence;
  readonly contextRequired?: boolean;
  readonly diffSufficient?: boolean;
  readonly wholeFileDilution?: boolean;
  readonly negativeControl?: boolean;
};

export type Omission = {
  readonly name: string;
  readonly reason:
    | "not-found"
    | "depth"
    | "declarations"
    | "source-characters"
    | "unsupported";
  readonly required: boolean;
};

export type CompletenessEvidence = {
  readonly status: Completeness;
  readonly required: readonly string[];
  readonly included: readonly string[];
  readonly omissions: readonly Omission[];
};

export type RenderedInput = {
  readonly mode: InputMode;
  readonly contract: (typeof INPUT_CONTRACTS)[InputMode];
  readonly rendererDigest: string;
  readonly ruleDefinitionDigest: string;
  readonly extractionProfile: {
    readonly maxDeclarations: number;
    readonly maxDepth: number;
    readonly maxSourceCharacters: number;
  };
  readonly fixtureId: string;
  readonly fixtureDigest: string;
  readonly contentHash: string;
  readonly path: string;
  readonly domain: string;
  readonly source: string;
  readonly before?: string;
  readonly after?: string;
  readonly declarationName?: string;
  readonly contextNames: readonly string[];
  readonly completeness: CompletenessEvidence;
  readonly extractionMs: number;
  readonly renderingMs: number;
  readonly sourceCharacters: number;
  readonly requestBytes: number;
};

export type ObservationStatus = "reviewed" | "incomplete" | "not-applicable" | "unavailable";
export type SemanticStatus = "passed" | "failed" | "ambiguous" | "unchecked" | "inconclusive" | "not-applicable";

export type Observation = {
  readonly id: string;
  readonly fixtureId: string;
  readonly mode: InputMode;
  readonly repetition: number;
  readonly rendered: RenderedInput;
  readonly status: ObservationStatus;
  readonly semantic: SemanticStatus;
  readonly probability?: number;
  readonly durationMs: number;
  readonly extractionMs: number;
  readonly renderingMs: number;
  readonly backendMs?: number;
  readonly attempts: number;
  readonly retries: number;
  readonly usage?: { readonly inputTokens?: number; readonly outputTokens?: number };
  readonly errorCategory?: string;
};

export type ScenarioResult = {
  readonly fixtureId: string;
  readonly mode: InputMode;
  readonly expectation: Expectation;
  readonly observations: readonly Observation[];
  readonly available: number;
  readonly inBand: number;
  readonly status: SemanticStatus;
};

export type ComparisonCounts = {
  readonly total: number;
  readonly passed: number;
  readonly failed: number;
  readonly inconclusive: number;
  readonly notApplicable: number;
  readonly unchecked: number;
  readonly ambiguous: number;
};

export type ComparisonGate = {
  readonly name: string;
  readonly passed: boolean;
  readonly numerator: number;
  readonly denominator: number;
  readonly required: number;
  readonly reason?: string;
};

export type EvaluationPlan = {
  readonly runId: string;
  readonly fixtureCount: number;
  readonly modeCount: number;
  readonly repetitions: number;
  readonly logicalCalls: number;
  readonly applicableLogicalCalls: number;
  readonly notApplicableLogicalCalls: number;
  readonly maximumRetriesPerCall: number;
  readonly maximumTransportAttempts: number;
  readonly remainingAuthorizedCalls: number;
  readonly backend: {
    readonly id: "jev";
    readonly provider: "@effect/ai-typesafe";
    readonly model: "jev-latest";
    readonly decisionModel: "effect/unstable/ai/DecisionModel";
  };
  readonly ruleDefinitionDigest: string;
  readonly inputContracts: readonly {
    readonly mode: InputMode;
    readonly id: string;
    readonly version: string;
    readonly renderer: string;
    readonly rendererVersion: string;
  }[];
  readonly extractionProfile: {
    readonly maxDeclarations: number;
    readonly maxDepth: number;
    readonly maxSourceCharacters: number;
  };
  readonly environment: {
    readonly node: string;
    readonly typescript: "7.0.2";
    readonly effect: "4.0.0-rc.116";
  };
  readonly permitted: boolean;
  readonly rejectionReason?: "live-opt-in-required" | "budget-exceeded";
};

export type EvaluationReport = {
  readonly outcome: "advance-to-production-architecture" | "reject-or-narrow" | "inconclusive";
  readonly plan: EvaluationPlan;
  readonly ruleDefinitionDigest: string;
  readonly inputContracts: EvaluationPlan["inputContracts"];
  readonly extractionProfile: EvaluationPlan["extractionProfile"];
  readonly counts: {
    readonly observations: ComparisonCounts;
    readonly semantic: ComparisonCounts;
    readonly transport: { readonly available: number; readonly unavailable: number };
  };
  readonly gates: readonly ComparisonGate[];
  readonly coverage: {
    readonly fixtures: number;
    readonly contextRequired: number;
    readonly diffSufficient: number;
    readonly wholeFileDilution: number;
    readonly negativeControls: number;
  };
  readonly timing: {
    readonly extraction: { readonly coldP95Ms?: number; readonly warmP95Ms?: number };
    readonly endToEndP95Ms?: number;
  };
  readonly requestBytes: { readonly wholeFileMedian?: number; readonly declarationContextMedian?: number };
};

export const sha256 = (value: string) => createHash("sha256").update(value, "utf8").digest("hex");

const canonical = (value: unknown): string => {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`).join(",")}}`;
};

export const stableJson = (value: unknown) => canonical(value);
export const digest = (value: unknown) => sha256(typeof value === "string" ? value : canonical(value));

export const bandContains = (band: ExpectedBand, probability: number) => {
  const minimum = band.minimumInclusive === false ? probability > band.minimum : probability >= band.minimum;
  const maximum = band.maximumInclusive === true ? probability <= band.maximum : probability < band.maximum;
  return minimum && maximum;
};

export const emptyCounts = (): ComparisonCounts => ({
  total: 0,
  passed: 0,
  failed: 0,
  inconclusive: 0,
  notApplicable: 0,
  unchecked: 0,
  ambiguous: 0,
});
