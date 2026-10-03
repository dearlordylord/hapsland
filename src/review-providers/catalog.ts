import type { ReviewBackendSettings } from "../configuration/types.ts";
import { JEV_API_BASE, JEV_DESTINATION, type BackendId } from "../runtime/backend.ts";

export type ReviewModel = "jev-latest" | "clef" | "clef-flash";
export type ProviderIdentity = Readonly<{
  provider: BackendId;
  model: ReviewModel;
  destination: string;
}>;

export type ProviderLimits = Readonly<{
  /** Undefined means unknown, never unlimited. Native UTF-8 / count limits are enforced. */
  questions?: number;
  httpBodyBytes?: number;
  /** Vendor-declared token budgets: recorded separately; no tokenizer is shipped. */
  requestTokens?: number;
  contextWindowTokens?: number;
  stateAndLongestQuestionTokens?: number;
  source: string;
  checkedOn: string;
}>;

const clefLimits: ProviderLimits = Object.freeze({
  questions: 64,
  httpBodyBytes: 13 * 1024 * 1024,
  contextWindowTokens: 65_536,
  source: "https://developers.cloudflare.com/workers-ai/models/clef/",
  checkedOn: "2026-10-02",
});

/** Model-specific provider declarations, distinct from Hapsland graph/capacity policy. */
export const PROVIDER_LIMITS: Readonly<Record<ReviewModel, ProviderLimits>> = Object.freeze({
  "jev-latest": Object.freeze({
    requestTokens: 64_000,
    stateAndLongestQuestionTokens: 32_000,
    source: "https://docs.typesafe.ai/models",
    checkedOn: "2026-10-02",
  }),
  clef: clefLimits,
  "clef-flash": Object.freeze({ ...clefLimits,
    source: "https://developers.cloudflare.com/workers-ai/models/clef-flash/" }),
});

export const providerIdentity = (selection: ReviewBackendSettings): ProviderIdentity =>
  selection.provider === "jev"
    ? { provider: "jev", model: "jev-latest", destination: JEV_DESTINATION }
    : { provider: "cloudflare", model: selection.model,
        destination: `https://api.cloudflare.com/client/v4/accounts/${selection.accountId}/ai/run/@cf/cloudflare/${selection.model}` };

export const providerApiBase = (identity: ProviderIdentity): string =>
  identity.provider === "jev" ? JEV_API_BASE : "https://api.cloudflare.com/client/v4";
