import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"
import { loadConfiguration, type LoadConfigurationOptions } from "../configuration/load.ts"
import type { ConfigurationError } from "../configuration/errors.ts"
import { resolveConfiguration, effectiveReviewBackend } from "../configuration/resolve.ts"
import type { ConfigurationCapture } from "../configuration/types.ts"
import { DEFAULT_CREDENTIAL_ENV_VAR } from "../configuration/types.ts"
import { compileRules, type CompiledRule } from "../rules/compiler.ts"
import { loadRules } from "../rules/loader.ts"
import { JEV_API_BASE, JEV_BACKEND, JEV_DESTINATION, type BackendId, type Destination } from "./backend.ts"

import { providerIdentity, providerApiBase, type ProviderIdentity } from "../review-providers/catalog.ts"

export const DEFAULT_BACKEND = JEV_BACKEND
export const DEFAULT_API_BASE = JEV_API_BASE
export const DEFAULT_DESTINATION = JEV_DESTINATION
export { DEFAULT_CREDENTIAL_ENV_VAR }

/** Compatibility error for callers of the pre-#10 runtime configuration API. */
export class ReviewConfigError extends Schema.TaggedError<ReviewConfigError>()("ReviewConfigError", {
  source: Schema.String,
  field: Schema.String,
  reason: Schema.String
}) {}

export interface ReviewSettings {
  readonly backend: BackendId
  readonly apiBase: string
  readonly providerIdentity: ProviderIdentity
  readonly destination: Destination
  readonly credentialEnvVar: string
  /** Captured once for the event and shared by explanation and runtime selection. */
  readonly configuration: ConfigurationCapture
  /** Fully validated, captured rule set. Callers may supply rules separately. */
  readonly ruleDigests?: ReadonlyArray<string>
  readonly rules?: ReadonlyArray<CompiledRule>
}

const defaultCapture = (root: string): ConfigurationCapture => {
  const policy = resolveConfiguration([], root)
  return { policy }
}

const settingsFrom = (capture: ConfigurationCapture, rules: ReadonlyArray<CompiledRule> = []): ReviewSettings => {
  const policy = capture.policy
  const identity = providerIdentity(effectiveReviewBackend(policy))
  return {
    backend: identity.provider,
    providerIdentity: identity,
    apiBase: providerApiBase(identity),
    destination: identity.destination,
    credentialEnvVar: policy.credentialEnvVar.value,
    configuration: capture,
    rules
  }
}

const compilationErrorField = (error: unknown, field: string, fallback: string): string =>
  typeof error === "object" && error !== null && field in error ? String(Reflect.get(error, field)) : fallback

export const loadReviewSettings = Effect.fn("ReviewConfig.load")(function* (
  root: string,
  options: LoadConfigurationOptions = {}
) {
  const capture = yield* loadConfiguration(root, options).pipe(
    Effect.mapError(
      (error: ConfigurationError) =>
        new ReviewConfigError({ source: error.source, field: error.field, reason: error.reason })
    )
  )
  const loadedRules = yield* loadRules({ root, layers: capture.policy.layers }).pipe(
    Effect.mapError(
      (error) => new ReviewConfigError({ source: error.source, field: error.field, reason: error.reason })
    )
  )
  const rules = yield* Effect.try({
    try: () => compileRules({ rules: loadedRules }),
    catch: (error) =>
      new ReviewConfigError({
        source: compilationErrorField(error, "source", root),
        field: compilationErrorField(error, "field", "rules"),
        reason: compilationErrorField(error, "reason", "rule compilation failed")
      })
  })
  return {
    ...settingsFrom(capture, rules),
    ruleDigests: loadedRules.map((rule) => `${rule.id}:${rule.definitionDigest}`)
  }
})

export const defaultReviewSettings = (root = "."): ReviewSettings => {
  const configuration = defaultCapture(root)
  return settingsFrom(configuration)
}

export const isEnvironmentVariableName = (value: string): boolean => /^[A-Z_][A-Z0-9_]*$/.test(value)
