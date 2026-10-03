import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { loadConfiguration, type LoadConfigurationOptions } from "../configuration/load.ts";
import { ConfigurationError } from "../configuration/errors.ts";
import { resolveConfiguration } from "../configuration/resolve.ts";
import type { ConfigurationCapture } from "../configuration/types.ts";
import { DEFAULT_CREDENTIAL_ENV_VAR } from "../configuration/types.ts";
import { compileRules, type CompiledRule } from "../rules/compiler.ts";
import { loadRulePacks } from "../rules/loader.ts";
import { configuredRules } from "../policy/rules.ts";
import { JEV_API_BASE, JEV_BACKEND, JEV_DESTINATION, type BackendId, type Destination } from "./backend.ts";

export const DEFAULT_BACKEND = JEV_BACKEND;
export const DEFAULT_API_BASE = JEV_API_BASE;
export const DEFAULT_DESTINATION = JEV_DESTINATION;
export { DEFAULT_CREDENTIAL_ENV_VAR };

/** Compatibility error for callers of the pre-#10 runtime configuration API. */
export class ReviewConfigError extends Schema.TaggedError<ReviewConfigError>()("ReviewConfigError", {
  source: Schema.String,
  field: Schema.String,
  reason: Schema.String,
}) {}

export interface ReviewSettings {
  readonly backend: BackendId;
  readonly apiBase: typeof DEFAULT_API_BASE;
  readonly destination: Destination;
  readonly credentialEnvVar: string;
  /** Captured once for the event and shared by explanation and runtime selection. */
  readonly configuration: ConfigurationCapture;
  /** Fully validated, captured rule set. Callers may supply rules separately. */
  readonly rules?: ReadonlyArray<CompiledRule>;
}

const defaultCapture = (root: string): ConfigurationCapture => {
  const policy = resolveConfiguration([], root);
  return { policy };
};

const settingsFrom = (
  capture: ConfigurationCapture,
  rules: ReadonlyArray<CompiledRule> = configuredRules,
): ReviewSettings => {
  const policy = capture.policy;
  return {
    backend: DEFAULT_BACKEND,
    apiBase: DEFAULT_API_BASE,
    destination: DEFAULT_DESTINATION,
    credentialEnvVar: policy.credentialEnvVar.value,
    configuration: capture,
    rules,
  };
};

const compilationErrorField = (error: unknown, field: string, fallback: string): string => {
  if (typeof error !== "object" || error === null || !(field in error)) return fallback;
  return String(Reflect.get(error, field));
};

export const loadReviewSettings = Effect.fn("ReviewConfig.load")(function* (
  root: string,
  options: LoadConfigurationOptions = {},
) {
  const capture = yield* loadConfiguration(root, options).pipe(
    Effect.mapError(
      (error: ConfigurationError) =>
        new ReviewConfigError({
          source: error.source,
          field: error.field,
          reason: error.reason,
        }),
    ),
  );
  const packs = yield* loadRulePacks({
    root,
    layers: capture.policy.layers,
  }).pipe(
    Effect.mapError(
      (error) =>
        new ReviewConfigError({
          source: error.source,
          field: error.field,
          reason: error.reason,
        }),
    ),
  );
  const rules = yield* Effect.try({
    try: () => compileRules({ packs, layers: capture.policy.layers }),
    catch: (error) =>
      new ReviewConfigError({
        source: compilationErrorField(error, "source", root),
        field: compilationErrorField(error, "field", "ruleOverrides"),
        reason: compilationErrorField(error, "reason", "rule-pack compilation failed"),
      }),
  });
  return settingsFrom(capture, rules);
});

export const defaultReviewSettings = (root = "."): ReviewSettings => {
  const configuration = defaultCapture(root);
  return settingsFrom(configuration);
};

export const isEnvironmentVariableName = (value: string): boolean => /^[A-Z_][A-Z0-9_]*$/.test(value);
