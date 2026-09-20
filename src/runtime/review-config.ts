import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import {
  loadConfiguration,
  type LoadConfigurationOptions,
} from "../configuration/load.ts";
import { ConfigurationError } from "../configuration/errors.ts";
import {
  resolveConfiguration,
} from "../configuration/resolve.ts";
import type { ConfigurationCapture, ResolvedPolicy } from "../configuration/types.ts";
import {
  JEV_API_BASE,
  JEV_BACKEND,
  JEV_DESTINATION,
  type BackendId,
  type Destination,
} from "./backend.ts";

export const DEFAULT_BACKEND = JEV_BACKEND;
export const DEFAULT_API_BASE = JEV_API_BASE;
export const DEFAULT_DESTINATION = JEV_DESTINATION;
export const DEFAULT_CREDENTIAL_ENV_VAR = "TYPESAFE_API_KEY";

/** Compatibility error for callers of the pre-#10 runtime configuration API. */
export class ReviewConfigError extends Schema.TaggedError<ReviewConfigError>()(
  "ReviewConfigError",
  { source: Schema.String, field: Schema.String, reason: Schema.String },
) {}

export interface ReviewSettings {
  readonly backend: BackendId;
  readonly apiBase: typeof DEFAULT_API_BASE;
  readonly destination: Destination;
  readonly credentialEnvVar: string;
  readonly projectConfigPath?: string;
  readonly userConfigPath?: string;
  /** A project may request consent, but this value is never an authorization grant. */
  readonly projectRequestedConsent: boolean;
  /** Captured once for the event and shared by explanation and runtime selection. */
  readonly configuration?: ConfigurationCapture;
  readonly policy?: ResolvedPolicy;
}

const defaultCapture = (root: string): ConfigurationCapture => {
  const policy = resolveConfiguration([], root);
  return { root, policy };
};

const settingsFrom = (
  capture: ConfigurationCapture,
): ReviewSettings => {
  const project = capture.policy.layers.find((layer) => layer.name === "project");
  const user = capture.policy.layers.find((layer) => layer.name === "user");
  const projectRequestedConsent =
    Boolean(project?.document.consent) || Boolean(project?.document.enabled);
  return {
    backend: DEFAULT_BACKEND,
    apiBase: DEFAULT_API_BASE,
    destination: DEFAULT_DESTINATION,
    credentialEnvVar: capture.policy.credentialEnvVar.value,
    ...(project === undefined ? {} : { projectConfigPath: project.source }),
    ...(user === undefined ? {} : { userConfigPath: user.source }),
    projectRequestedConsent,
    configuration: capture,
    policy: capture.policy,
  };
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
  return settingsFrom(capture);
});

export const defaultReviewSettings = (root = "."): ReviewSettings => {
  const configuration = defaultCapture(root);
  return settingsFrom(configuration);
};

export const isEnvironmentVariableName = (value: string): boolean =>
  /^[A-Z_][A-Z0-9_]*$/.test(value);
