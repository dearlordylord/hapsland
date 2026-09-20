import { digest, type EvaluationPlan } from "./protocol.ts";
import { DEFAULT_EXTRACTION_CAPS, modes, RULE_DEFINITION_DIGEST } from "./render.ts";
import { INPUT_CONTRACTS } from "./protocol.ts";

export const DEFAULT_REPETITIONS = 3;
export const DEFAULT_MAX_RETRIES = 2;
export const PROJECT_CALL_BUDGET = 1_000;

export type PlanOptions = {
  readonly runId?: string;
  readonly fixtureCount: number;
  readonly modeCount?: number;
  readonly repetitions?: number;
  readonly maximumRetriesPerRequest?: number;
  readonly remainingAuthorizedCalls: number;
  readonly liveOptIn: boolean;
  readonly offline?: boolean;
  readonly extractionProfile?: {
    readonly maxDeclarations: number;
    readonly maxDepth: number;
    readonly maxSourceCharacters: number;
  };
};

export const planRun = (options: PlanOptions): EvaluationPlan => {
  const modeCount = options.modeCount ?? 4;
  const repetitions = options.repetitions ?? DEFAULT_REPETITIONS;
  const maximumRetriesPerRequest = options.maximumRetriesPerRequest ?? DEFAULT_MAX_RETRIES;
  const logicalCalls = options.fixtureCount * modeCount * repetitions;
  const maximumTransportAttempts = logicalCalls * (maximumRetriesPerRequest + 1);
  const permitted = options.offline === true || (options.liveOptIn && options.remainingAuthorizedCalls >= maximumTransportAttempts);
  const rejectionReason = permitted
    ? undefined
    : options.liveOptIn ? "budget-exceeded" as const : "live-opt-in-required" as const;
  return {
    runId: options.runId ?? "input-contract-comparison-2026-09-20",
    fixtureCount: options.fixtureCount,
    modeCount,
    repetitions,
    logicalCalls,
    maximumRetriesPerCall: maximumRetriesPerRequest,
    maximumTransportAttempts,
    remainingAuthorizedCalls: options.remainingAuthorizedCalls,
    backend: {
      id: "jev",
      provider: "@effect/ai-typesafe",
      model: "jev-latest",
      decisionModel: "effect/unstable/ai/DecisionModel",
    },
    ruleDefinitionDigest: RULE_DEFINITION_DIGEST,
    inputContracts: modes.map((mode) => ({ mode, ...INPUT_CONTRACTS[mode] })),
    extractionProfile: options.extractionProfile ?? DEFAULT_EXTRACTION_CAPS,
    environment: {
      node: process.version,
      typescript: "7.0.2",
      effect: "4.0.0-rc.116",
    },
    permitted,
    ...(rejectionReason === undefined ? {} : { rejectionReason }),
  };
};

export const planDigest = (plan: EvaluationPlan) => digest(plan);

export class CallBudget {
  private reserved = 0;
  private observed = 0;

  readonly maximumAttempts: number;

  constructor(maximumAttempts: number) {
    this.maximumAttempts = maximumAttempts;
  }

  reserve(maxAttempts: number) {
    if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || this.reserved + maxAttempts > this.maximumAttempts) {
      throw new Error(`call budget exceeded: requested ${maxAttempts}, remaining ${this.maximumAttempts - this.reserved}`);
    }
    this.reserved += maxAttempts;
  }

  observe(attempts: number) {
    if (!Number.isInteger(attempts) || attempts < 1 || this.observed + attempts > this.reserved) {
      throw new Error("observed transport attempts exceed reserved call budget");
    }
    this.observed += attempts;
  }

  get reservedAttempts() { return this.reserved; }
  get observedAttempts() { return this.observed; }
  get remainingReservedAttempts() { return this.maximumAttempts - this.reserved; }
}
