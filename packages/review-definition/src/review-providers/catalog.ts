import { REVIEW_PROVIDERS } from "@hapsland/runtime-environment/runtime/backend"
import type { ProviderIdentity } from "./provider-identity-contract.ts"

export { type ProviderLimits, type ReviewModel } from "@hapsland/runtime-environment/runtime/backend"
export type { ProviderIdentity } from "./provider-identity-contract.ts"

export { resolveProviderIdentity as providerIdentity } from "./provider-identity.ts"

export const providerApiBase = (identity: ProviderIdentity): string => REVIEW_PROVIDERS[identity.provider].apiBase
