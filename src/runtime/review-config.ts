import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { access, readFile } from "node:fs/promises";
import { join } from "node:path";
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

const CONFIG_FILES = [".review.jsonc", ".realtime-review.jsonc"] as const;

export class ReviewConfigError extends Schema.TaggedError<ReviewConfigError>()(
  "ReviewConfigError",
  { reason: Schema.String },
) {}

const EnvironmentVariableName = Schema.String.check(
  Schema.isPattern(/^[A-Z_][A-Z0-9_]*$/),
).pipe(Schema.brand("EnvironmentVariableName"));
type EnvironmentVariableName = typeof EnvironmentVariableName.Type;

const ProjectConfig = Schema.Struct({
  version: Schema.Literal(1),
  backend: Schema.optionalKey(Schema.Literal(JEV_BACKEND)),
  credentialEnvVar: Schema.optionalKey(EnvironmentVariableName),
  credentials: Schema.optionalKey(
    Schema.Struct({ envVar: EnvironmentVariableName }),
  ),
  // These fields are deliberately accepted as project requests but never grant consent.
  consent: Schema.optionalKey(Schema.Boolean),
  enabled: Schema.optionalKey(Schema.Boolean),
});
type ProjectConfig = typeof ProjectConfig.Type;

export interface ReviewSettings {
  readonly backend: BackendId;
  readonly apiBase: typeof DEFAULT_API_BASE;
  readonly destination: Destination;
  readonly credentialEnvVar: string;
  readonly projectConfigPath?: string;
  /** A project may request consent, but this value is never an authorization grant. */
  readonly projectRequestedConsent: boolean;
}

const defaultSettings = (): ReviewSettings => ({
  backend: DEFAULT_BACKEND,
  apiBase: DEFAULT_API_BASE,
  destination: DEFAULT_DESTINATION,
  credentialEnvVar: DEFAULT_CREDENTIAL_ENV_VAR,
  projectRequestedConsent: false,
});

/** Remove JSONC comments and trailing commas without changing string contents. */
const stripJsonc = (text: string): string => {
  let output = "";
  let inString = false;
  let escaped = false;
  let inLineComment = false;
  let inBlockComment = false;

  for (let index = 0; index < text.length; index += 1) {
    const current = text[index];
    const next = text[index + 1];
    if (inLineComment) {
      if (current === "\n" || current === "\r") {
        inLineComment = false;
        output += current;
      } else {
        output += " ";
      }
      continue;
    }
    if (inBlockComment) {
      if (current === "*" && next === "/") {
        inBlockComment = false;
        output += "  ";
        index += 1;
      } else {
        output += current === "\n" || current === "\r" ? current : " ";
      }
      continue;
    }
    if (inString) {
      output += current;
      if (escaped) {
        escaped = false;
      } else if (current === "\\") {
        escaped = true;
      } else if (current === '"') {
        inString = false;
      }
      continue;
    }
    if (current === '"') {
      inString = true;
      output += current;
    } else if (current === "/" && next === "/") {
      inLineComment = true;
      output += "  ";
      index += 1;
    } else if (current === "/" && next === "*") {
      inBlockComment = true;
      output += "  ";
      index += 1;
    } else {
      output += current;
    }
  }

  return output.replace(/,\s*([}\]])/g, "$1");
};

const decodeProjectConfig = (text: string) =>
  Effect.try({
    try: () => JSON.parse(stripJsonc(text)) as unknown,
    catch: () => new ReviewConfigError({ reason: "review configuration is not valid JSONC" }),
  }).pipe(
    Effect.flatMap((unknown) =>
      Schema.decodeUnknownEffect(ProjectConfig, {
        onExcessProperty: "error",
        errors: "all",
      })(unknown).pipe(
        Effect.mapError(
          () => new ReviewConfigError({ reason: "review configuration has invalid fields" }),
        ),
      ),
    ),
  );

const readConfigFile = (path: string) =>
  Effect.tryPromise({
    try: () => readFile(path, "utf8"),
    catch: () => new ReviewConfigError({ reason: "could not read review configuration" }),
  });

const settingsFrom = (config: ProjectConfig): Omit<ReviewSettings, "projectConfigPath"> => ({
  backend: config.backend ?? DEFAULT_BACKEND,
  apiBase: DEFAULT_API_BASE,
  destination: DEFAULT_DESTINATION,
  credentialEnvVar:
    config.credentialEnvVar ?? config.credentials?.envVar ?? DEFAULT_CREDENTIAL_ENV_VAR,
  projectRequestedConsent: Boolean(config.consent) || Boolean(config.enabled),
});

/**
 * Load the one project configuration at the canonical working-tree root.
 * Absence is valid and returns built-in defaults. The project cannot select an endpoint.
 */
export const loadReviewSettings = Effect.fn("ReviewConfig.load")(
  function* (root: string) {
    const found: Array<string> = [];
    for (const name of CONFIG_FILES) {
      const path = join(root, name);
      const exists = yield* Effect.tryPromise({
        try: async () => {
          try {
            await access(path);
            return true;
          } catch {
            return false;
          }
        },
        catch: () => new ReviewConfigError({ reason: "could not inspect review configuration" }),
      });
      if (exists) found.push(path);
    }
    if (found.length > 1) {
      return yield* new ReviewConfigError({
        reason: "multiple project review configuration files were found",
      });
    }
    const path = found[0];
    if (path === undefined) return defaultSettings();
    const config = yield* readConfigFile(path).pipe(Effect.flatMap(decodeProjectConfig));
    return { ...settingsFrom(config), projectConfigPath: path };
  },
);

export const isEnvironmentVariableName = (value: string): value is EnvironmentVariableName =>
  /^[A-Z_][A-Z0-9_]*$/.test(value);
