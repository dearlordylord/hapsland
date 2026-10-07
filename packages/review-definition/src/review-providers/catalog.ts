import {
  REVIEW_PROVIDERS,
  type BackendId,
  type ReviewBackendSettings,
  type ReviewModel
} from "@hapsland/runtime-environment/runtime/backend"

export { type ProviderLimits, type ReviewModel } from "@hapsland/runtime-environment/runtime/backend"
export type ProviderIdentity = Readonly<{ provider: BackendId; model: ReviewModel; destination: string }>

export const providerIdentity = (selection: ReviewBackendSettings): ProviderIdentity => {
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

export const providerApiBase = (identity: ProviderIdentity): string => REVIEW_PROVIDERS[identity.provider].apiBase
