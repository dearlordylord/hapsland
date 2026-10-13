import { REVIEW_PROVIDERS, type ReviewBackendSettings } from "@hapsland/runtime-environment/runtime/backend"
import type { ProviderIdentity } from "../provider-identity-contract.ts"

// Independent original algorithm, verification only; delete with whole migration acceptance.
export const nativeProviderIdentity = (selection: ReviewBackendSettings): ProviderIdentity => {
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
