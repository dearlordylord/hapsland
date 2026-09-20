import { createHash } from "node:crypto";
import * as Schema from "effect/Schema";
import { configurationError, ConfigurationError } from "../configuration/errors.ts";
import { parseJsonc } from "../configuration/jsonc.ts";
import { validateGlobPattern } from "../matcher/glob.ts";

/** The first declarative pack wire schema.  A pack's content version is separate. */
export const RULE_PACK_SCHEMA_VERSION = 1 as const;
export const DEFAULT_RULE_THRESHOLD = 0.7;

const NonEmpty = Schema.String.check(Schema.isMinLength(1));
const UnitInterval = Schema.Finite.check(
  Schema.isBetween({ minimum: 0, maximum: 1 }),
);

export const RuleApplicability = Schema.Struct({
  includes: Schema.optionalKey(Schema.Array(NonEmpty)),
  excludes: Schema.optionalKey(Schema.Array(NonEmpty)),
});
export interface RuleApplicability
  extends Schema.Schema.Type<typeof RuleApplicability> {}

export const RuleCriteria = Schema.Struct({
  false: NonEmpty,
  true: NonEmpty,
});
export interface RuleCriteria extends Schema.Schema.Type<typeof RuleCriteria> {}

export const RuleDefinition = Schema.Struct({
  id: NonEmpty,
  question: NonEmpty,
  criteria: RuleCriteria,
  threshold: Schema.optionalKey(UnitInterval),
  message: NonEmpty,
  applicability: Schema.optionalKey(RuleApplicability),
});
export interface RuleDefinition
  extends Schema.Schema.Type<typeof RuleDefinition> {}

export const RulePack = Schema.Struct({
  schemaVersion: Schema.Literal(RULE_PACK_SCHEMA_VERSION),
  id: NonEmpty,
  contentVersion: NonEmpty,
  rules: Schema.Array(RuleDefinition),
});
export interface RulePack extends Schema.Schema.Type<typeof RulePack> {}

export type RulePackOrigin = {
  readonly layer: "built-in" | "user" | "project";
  readonly source: string;
  readonly field: string;
};

export type DecodedRulePack = RulePack & {
  readonly source: string;
  readonly origin?: RulePackOrigin;
  readonly contentDigest: string;
};

const ROOT_KEYS = new Set([
  "schemaVersion",
  "id",
  "packId",
  "packVersion",
  "version",
  "contentVersion",
  "rules",
]);
const RULE_KEYS = new Set([
  "id",
  "question",
  "criteria",
  "threshold",
  "defaultThreshold",
  "message",
  "defaultMessage",
  "applicability",
]);
const CRITERIA_KEYS = new Set(["false", "true"]);
const APPLICABILITY_KEYS = new Set(["includes", "excludes"]);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const own = (value: object, key: string): boolean =>
  Object.prototype.hasOwnProperty.call(value, key);

const boundedMessage = (message: string): string =>
  message.replaceAll(/\s+/g, " ").slice(0, 240);

const fail = (source: string, field: string, reason: string): never => {
  throw configurationError(source, field, boundedMessage(reason));
};

const known = (
  value: Record<string, unknown>,
  keys: ReadonlySet<string>,
  source: string,
  prefix: string,
): void => {
  for (const key of Object.keys(value)) {
    if (!keys.has(key)) fail(source, `${prefix}.${key}`, "unknown rule-pack field");
  }
};

const text = (
  value: unknown,
  source: string,
  field: string,
  required = true,
): string | undefined => {
  if (value === undefined && !required) return undefined;
  if (typeof value !== "string" || value.length === 0) {
    fail(source, field, "must be a non-empty string");
  }
  return value as string;
};

const identity = (value: unknown, source: string, field: string): string => {
  const result = text(value, source, field)!;
  if (/[/:\\\s]/.test(result)) {
    fail(source, field, "identity must not contain separators or whitespace");
  }
  return result;
};

const criteriaText = (
  value: unknown,
  source: string,
  field: string,
): string => {
  if (typeof value === "string") return text(value, source, field)!;
  if (!isRecord(value)) fail(source, field, "must be a string or criterion object");
  const object = value as Record<string, unknown>;
  known(object, new Set(["what", "examples"]), source, field);
  const what = text(object.what, source, `${field}.what`)!;
  if (object.examples === undefined) return what;
  if (!Array.isArray(object.examples) || object.examples.some((item) => typeof item !== "string")) {
    fail(source, `${field}.examples`, "must be an array of strings");
  }
  const examples = object.examples as ReadonlyArray<string>;
  return examples.length === 0 ? what : `${what}\n\nExamples:\n${examples.map((item) => `- ${item}`).join("\n")}`;
};

const patterns = (
  value: unknown,
  source: string,
  field: string,
): ReadonlyArray<string> => {
  if (!Array.isArray(value)) fail(source, field, "must be an array");
  const values = value as ReadonlyArray<unknown>;
  return values.map((item, index) => {
    const pattern = text(item, source, `${field}[${index}]`)!;
    try {
      validateGlobPattern(pattern);
    } catch (cause) {
      fail(
        source,
        `${field}[${index}]`,
        cause instanceof Error ? cause.message : "invalid glob pattern",
      );
    }
    return pattern;
  });
};

const normalizeCriteria = (
  value: unknown,
  source: string,
  field: string,
): RuleCriteria => {
  if (!isRecord(value)) fail(source, field, "must be an object");
  const object = value as Record<string, unknown>;
  known(object, CRITERIA_KEYS, source, field);
  return {
    false: criteriaText(object.false, source, `${field}.false`),
    true: criteriaText(object.true, source, `${field}.true`),
  };
};

const normalizeRule = (
  value: unknown,
  source: string,
  index: number,
): RuleDefinition => {
  const field = `rules[${index}]`;
  if (!isRecord(value)) fail(source, field, "must be an object");
  const object = value as Record<string, unknown>;
  known(object, RULE_KEYS, source, field);
  const applicability = object.applicability;
  let normalizedApplicability: RuleApplicability | undefined;
  if (applicability !== undefined) {
    if (!isRecord(applicability)) fail(source, `${field}.applicability`, "must be an object");
    const applicabilityObject = applicability as Record<string, unknown>;
    known(applicabilityObject, APPLICABILITY_KEYS, source, `${field}.applicability`);
    normalizedApplicability = {
      ...(applicabilityObject.includes === undefined
        ? {}
        : { includes: patterns(applicabilityObject.includes, source, `${field}.applicability.includes`) }),
      ...(applicabilityObject.excludes === undefined
        ? {}
        : { excludes: patterns(applicabilityObject.excludes, source, `${field}.applicability.excludes`) }),
    };
  }
  const threshold = object.threshold ?? object.defaultThreshold;
  if (
    object.threshold !== undefined &&
    object.defaultThreshold !== undefined &&
    object.threshold !== object.defaultThreshold
  ) {
    fail(source, `${field}.threshold`, "threshold and defaultThreshold must agree");
  }
  if (
    threshold !== undefined &&
    (typeof threshold !== "number" || !Number.isFinite(threshold) || threshold < 0 || threshold > 1)
  ) {
    fail(source, `${field}.threshold`, "must be a finite number between 0 and 1");
  }
  const thresholdValue = threshold === undefined ? undefined : threshold as number;
  if (
    object.message !== undefined &&
    object.defaultMessage !== undefined &&
    object.message !== object.defaultMessage
  ) {
    fail(source, `${field}.message`, "message and defaultMessage must agree");
  }
  return {
    id: identity(object.id, source, `${field}.id`),
    question: text(object.question, source, `${field}.question`)!,
    criteria: normalizeCriteria(object.criteria, source, `${field}.criteria`),
    ...(thresholdValue === undefined ? {} : { threshold: thresholdValue }),
    message: text(object.message ?? object.defaultMessage, source, `${field}.message`)!,
    ...(normalizedApplicability === undefined ? {} : { applicability: normalizedApplicability }),
  };
};

const canonicalStable = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(canonicalStable).join(",")}]`;
  if (typeof value === "object" && value !== null) {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${canonicalStable(object[key])}`).join(",")}}`;
  }
  const encoded = JSON.stringify(value);
  return encoded === undefined ? "null" : encoded;
};

export const stableRulePackValue = (pack: RulePack): string =>
  canonicalStable({
    schemaVersion: pack.schemaVersion,
    id: pack.id,
    contentVersion: pack.contentVersion,
    rules: pack.rules,
  });

export const digestRulePack = (pack: RulePack): string =>
  createHash("sha256").update(stableRulePackValue(pack), "utf8").digest("hex");

export const digestRuleDefinition = (
  pack: Pick<RulePack, "id" | "contentVersion">,
  rule: RuleDefinition,
): string =>
  createHash("sha256")
    .update(canonicalStable({ packId: pack.id, packVersion: pack.contentVersion, rule }), "utf8")
    .digest("hex");

/** Decode an already-parsed JSON/JSONC value with bounded source-labelled errors. */
export const decodeRulePackDocument = (
  unknown: unknown,
  source: string,
  origin?: RulePackOrigin,
): DecodedRulePack => {
  if (!isRecord(unknown)) fail(source, "$", "rule pack must be a JSON object");
  const raw = unknown as Record<string, unknown>;
  known(raw, ROOT_KEYS, source, "$" );
  const schemaVersion = raw.schemaVersion ?? (typeof raw.version === "number" ? raw.version : undefined);
  if (
    raw.schemaVersion !== undefined &&
    typeof raw.version === "number" &&
    raw.schemaVersion !== raw.version
  ) {
    fail(source, "schemaVersion", "schemaVersion and numeric version must agree");
  }
  if (schemaVersion !== RULE_PACK_SCHEMA_VERSION) {
    fail(source, "schemaVersion", "unsupported rule-pack schema version");
  }
  const id = identity(raw.id ?? raw.packId, source, "id");
  if (raw.id !== undefined && raw.packId !== undefined && raw.id !== raw.packId) {
    fail(source, "id", "id and packId must agree");
  }
  const contentVersion = text(
    raw.contentVersion ?? raw.packVersion ?? (typeof raw.version === "string" ? raw.version : undefined),
    source,
    "contentVersion",
  )!;
  if (
    raw.contentVersion !== undefined &&
    raw.packVersion !== undefined &&
    raw.contentVersion !== raw.packVersion
  ) {
    fail(source, "contentVersion", "contentVersion and packVersion must agree");
  }
  if (!Array.isArray(raw.rules)) fail(source, "rules", "must be an array");
  const rules = (raw.rules as ReadonlyArray<unknown>).map((rule, index) => normalizeRule(rule, source, index));
  const ids = new Set<string>();
  for (const [index, rule] of rules.entries()) {
    if (ids.has(rule.id)) fail(source, `rules[${index}].id`, `duplicate rule identity '${rule.id}'`);
    ids.add(rule.id);
  }
  const withoutDigest: RulePack = {
    schemaVersion: RULE_PACK_SCHEMA_VERSION,
    id,
    contentVersion,
    rules: rules.map((rule) => ({
      ...rule,
      threshold: rule.threshold ?? DEFAULT_RULE_THRESHOLD,
    })),
  };
  try {
    const value = Schema.decodeUnknownSync(RulePack, {
      onExcessProperty: "error",
      errors: "all",
    })(withoutDigest);
    return {
      ...value,
      source,
      ...(origin === undefined ? {} : { origin }),
      contentDigest: digestRulePack(value),
    };
  } catch (cause) {
    if (cause instanceof ConfigurationError) throw cause;
    return fail(source, "$", "rule pack contains an unknown or malformed field");
  }
};

export const decodeRulePackText = (
  textValue: string,
  source: string,
  origin?: RulePackOrigin,
): DecodedRulePack => {
  let parsed: unknown;
  try {
    parsed = parseJsonc(textValue);
  } catch (cause) {
    fail(source, "$", cause instanceof Error ? cause.message : "rule pack is not valid JSONC");
  }
  return decodeRulePackDocument(parsed, source, origin);
};
