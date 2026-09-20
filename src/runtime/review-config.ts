import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { access, readFile } from "node:fs/promises";
import { join } from "node:path";

export const DEFAULT_BACKEND = "jev";
export const DEFAULT_DESTINATION = "https://api.typesafe.ai/v1";
export const DEFAULT_CREDENTIAL_ENV_VAR = "TYPESAFE_API_KEY";

const CONFIG_FILES = [
  ".review.jsonc",
  ".realtime-review.jsonc",
] as const;

export class ReviewConfigError extends Schema.TaggedError<ReviewConfigError>()(
  "ReviewConfigError",
  { reason: Schema.String },
) {}

export interface ReviewSettings {
  readonly backend: string;
  readonly destination: string;
  readonly credentialEnvVar: string;
  readonly projectConfigPath?: string;
  /** A project may request consent, but this value is never an authorization grant. */
  readonly projectRequestedConsent: boolean;
}

const defaultSettings = (): ReviewSettings => ({
  backend: DEFAULT_BACKEND,
  destination: DEFAULT_DESTINATION,
  credentialEnvVar: DEFAULT_CREDENTIAL_ENV_VAR,
  projectRequestedConsent: false,
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Remove JSONC comments and trailing commas without changing string contents. */
const parseJsonc = (text: string): unknown => {
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

  return JSON.parse(output.replace(/,\s*([}\]])/g, "$1")) as unknown;
};

const boundedString = (value: unknown, field: string): string => {
  if (typeof value !== "string" || value.length === 0 || value.length > 512) {
    throw new Error(`${field} must be a non-empty string`);
  }
  return value;
};

const environmentVariable = (value: unknown): string => {
  const name = boundedString(value, "credentialEnvVar");
  if (!/^[A-Z_][A-Z0-9_]*$/.test(name)) {
    throw new Error("credentialEnvVar must be an environment-variable name");
  }
  return name;
};

const destination = (value: unknown): string => {
  const encoded = boundedString(value, "destination");
  let parsed: URL;
  try {
    parsed = new URL(encoded);
  } catch {
    throw new Error("destination must be an absolute HTTP URL");
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error("destination must use HTTP or HTTPS");
  }
  if (parsed.username !== "" || parsed.password !== "") {
    throw new Error("destination must not contain credentials");
  }
  // The provider appends /systemone. Keep the identity stable for a harmless
  // trailing-slash spelling change while preserving the configured path.
  return parsed.toString().replace(/\/$/, "");
};

const checkKeys = (value: Record<string, unknown>, allowed: ReadonlySet<string>) => {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new Error(`unknown configuration field ${key}`);
  }
};

const nestedSettings = (value: unknown): {
  readonly backend?: string;
  readonly destination?: string;
  readonly credentialEnvVar?: string;
  readonly projectRequestedConsent?: boolean;
} => {
  if (!isRecord(value)) throw new Error("review configuration must be an object");
  checkKeys(
    value,
    new Set([
      "version",
      "backend",
      "destination",
      "credentialEnvVar",
      "credentials",
      "consent",
      "enabled",
    ]),
  );
  const backendValue = value.backend;
  const credentials = value.credentials;
  let credentialEnvVar: string | undefined;
  if (credentials !== undefined) {
    if (!isRecord(credentials)) throw new Error("credentials must be an object");
    checkKeys(credentials, new Set(["envVar", "credentialEnvVar"]));
    const candidate = credentials.envVar ?? credentials.credentialEnvVar;
    if (candidate !== undefined) credentialEnvVar = environmentVariable(candidate);
  }
  if (value.credentialEnvVar !== undefined) {
    credentialEnvVar = environmentVariable(value.credentialEnvVar);
  }
  let projectRequestedConsent = false;
  for (const key of ["consent", "enabled"] as const) {
    const candidate = value[key];
    if (candidate !== undefined) {
      if (typeof candidate !== "boolean") throw new Error(`${key} must be boolean`);
      projectRequestedConsent ||= candidate;
    }
  }
  return {
    ...(backendValue === undefined ? {} : { backend: boundedString(backendValue, "backend") }),
    ...(value.destination === undefined
      ? {}
      : { destination: destination(value.destination) }),
    ...(credentialEnvVar === undefined ? {} : { credentialEnvVar }),
    ...(projectRequestedConsent ? { projectRequestedConsent: true } : {}),
  };
};

const parseSettings = (value: unknown): Omit<ReviewSettings, "projectConfigPath"> => {
  if (!isRecord(value)) throw new Error("review configuration must be an object");
  checkKeys(
    value,
    new Set([
      "version",
      "backend",
      "destination",
      "credentialEnvVar",
      "credentials",
      "consent",
      "enabled",
      "review",
    ]),
  );
  if (value.version !== undefined && value.version !== 1) {
    throw new Error("unsupported review configuration version");
  }
  const base = nestedSettings(value);
  const review = value.review === undefined ? {} : nestedSettings(value.review);
  const backend = review.backend ?? base.backend ?? DEFAULT_BACKEND;
  const selectedDestination = review.destination ?? base.destination ?? DEFAULT_DESTINATION;
  const credentialEnvVar =
    review.credentialEnvVar ?? base.credentialEnvVar ?? DEFAULT_CREDENTIAL_ENV_VAR;
  if (backend !== DEFAULT_BACKEND) {
    throw new Error(`unsupported review backend ${backend}`);
  }
  return {
    backend,
    destination: destination(selectedDestination),
    credentialEnvVar: environmentVariable(credentialEnvVar),
    projectRequestedConsent:
      Boolean(base.projectRequestedConsent) || Boolean(review.projectRequestedConsent),
  };
};

const readConfigFile = (path: string) =>
  Effect.tryPromise({
    try: () => readFile(path, "utf8"),
    catch: () => new ReviewConfigError({ reason: "could not read review configuration" }),
  });

/**
 * Load the one project configuration at the canonical working-tree root.
 * Absence is a valid configuration and returns built-in defaults.
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
    const text = yield* readConfigFile(path);
    let parsed: unknown;
    try {
      parsed = parseJsonc(text);
    } catch {
      return yield* new ReviewConfigError({ reason: "review configuration is not valid JSONC" });
    }
    try {
      return { ...parseSettings(parsed), projectConfigPath: path };
    } catch (cause) {
      return yield* new ReviewConfigError({
        reason: cause instanceof Error ? cause.message.slice(0, 300) : "invalid review configuration",
      });
    }
  },
);

export const normalizeDestination = destination;
