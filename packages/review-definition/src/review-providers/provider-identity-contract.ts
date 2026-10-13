import type { BackendId, ReviewModel } from "@hapsland/runtime-environment/runtime/backend"

// Identity is shared by the capability, catalog API and independent verification.
export type ProviderIdentity = Readonly<{ provider: BackendId; model: ReviewModel; destination: string }>
