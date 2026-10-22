import {
  REVIEW_PROVIDERS,
  type ReviewServiceId,
  type ReviewBackendSettings,
  type ReviewModel
} from "@hapsland/runtime-environment/runtime/backend"

export { type ProviderLimits, type ReviewModel } from "@hapsland/runtime-environment/runtime/backend"
/** The review service, model and destination selected for a prepared unit. */
export type ReviewServiceIdentity = Readonly<{ provider: ReviewServiceId; model: ReviewModel; destination: string }>

export const reviewServiceIdentity = (selection: ReviewBackendSettings): ReviewServiceIdentity => {
  const provider = REVIEW_PROVIDERS[selection.provider]
  const model = "model" in selection ? selection.model : provider.defaultModel
  if (model === undefined) throw new TypeError("Review provider has no model")
  const fields: Readonly<Record<string, string>> = { ...selection, model }
  const destination = provider.destination.replace(/\{([^}]+)\}/gu, (_, field: string) => {
    const value = fields[field]
    if (value === undefined) throw new TypeError("Missing review destination field")
    return encodeURIComponent(value)
  })
  return { provider: selection.provider, model, destination }
}

export const providerApiBase = (identity: ReviewServiceIdentity): string => REVIEW_PROVIDERS[identity.provider].apiBase
