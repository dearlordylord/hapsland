import { createHash } from "node:crypto";
import * as Schema from "effect/Schema";
import {
  configurationError,
  ConfigurationError,
  schemaConfigurationError,
} from "../configuration/errors.ts";
import { parseJsonc } from "../configuration/jsonc.ts";
import { validateGlobPattern } from "../matcher/glob.ts";
import { RuleIdentitySchema } from "../domain/rule-identity.ts";
import { FUNCTION_CAPABILITIES, FUNCTION_INPUT_CONTRACT, TYPE_CAPABILITIES, TYPE_INPUT_CONTRACT } from "./targets.ts";

/** The first declarative pack wire schema. A pack's content version is separate. */
export const RULE_PACK_SCHEMA_VERSION = 1 as const;
export const DEFAULT_RULE_THRESHOLD = 0.7;

const NonEmpty = Schema.String.check(Schema.isMinLength(1)).annotate({
  description: "A non-empty string.",
});
const GlobPattern = NonEmpty.annotate({
  description: "A non-empty repository-relative glob pattern using forward slashes.",
});
const UnitInterval = Schema.Finite.check(
  Schema.isBetween({ minimum: 0, maximum: 1 }),
);

export const RuleApplicability = Schema.Struct({
  includes: Schema.optionalKey(Schema.Array(GlobPattern).annotate({
    description: "Optional repository-relative patterns a path must match for this rule to apply.",
  })),
  excludes: Schema.optionalKey(Schema.Array(GlobPattern).annotate({
    description: "Optional repository-relative patterns that prevent this rule from applying.",
  })),
}).annotate({
  identifier: "RuleApplicability",
  description: "Rule-level path filters, intersected with global file selection.",
});
export interface RuleApplicability
  extends Schema.Schema.Type<typeof RuleApplicability> {}

export const RuleCriteria = Schema.Struct({
  false: NonEmpty.annotate({
    description: "Text rendered when the evaluated criterion is false.",
  }),
  true: NonEmpty.annotate({
    description: "Text rendered when the evaluated criterion is true.",
  }),
}).annotate({
  identifier: "RuleCriteria",
  description: "String-valued evidence criteria for both probability outcomes.",
});
export interface RuleCriteria extends Schema.Schema.Type<typeof RuleCriteria> {}

export const TypeShapeReviewTarget = Schema.Struct({
  artifactKind: Schema.Literal("typeShape"),
  inputContract: Schema.Literal(TYPE_INPUT_CONTRACT),
  capabilities: Schema.Array(Schema.Literals(TYPE_CAPABILITIES)),
}).annotate({ identifier: "TypeShapeReviewTarget" });

export const FunctionReviewTarget = Schema.Struct({
  artifactKind: Schema.Literal("function"),
  inputContract: Schema.Literal(FUNCTION_INPUT_CONTRACT),
  capabilities: Schema.Array(Schema.Literals(FUNCTION_CAPABILITIES)),
}).annotate({ identifier: "FunctionReviewTarget" });

export const ReviewTarget = Schema.Union([TypeShapeReviewTarget, FunctionReviewTarget]);

export const RuleDefinition = Schema.Struct({
  id: RuleIdentitySchema.annotate({
    description: "Stable rule identity within this pack; it cannot contain separators or whitespace.",
  }),
  question: NonEmpty.annotate({
    description: "Question evaluated against the available review input.",
  }),
  criteria: RuleCriteria,
  threshold: Schema.optionalKey(UnitInterval.annotate({
    description: "Probability threshold from 0 through 1. Omission uses the built-in rule threshold.",
    default: DEFAULT_RULE_THRESHOLD,
  })),
  message: NonEmpty.annotate({
    description: "Authored advice text attached to a qualifying result.",
  }),
  applicability: Schema.optionalKey(RuleApplicability),
  reviewTargets: Schema.Array(ReviewTarget).annotate({
    description: "Exact input contracts and evidence required by this rule.",
  }),
}).annotate({
  identifier: "RuleDefinition",
  description: "One declarative rule in a rule pack.",
});
export interface RuleDefinition
  extends Schema.Schema.Type<typeof RuleDefinition> {}

export const RulePack = Schema.Struct({
  schemaVersion: Schema.Literal(RULE_PACK_SCHEMA_VERSION).annotate({
    description: "Rule-pack wire-format version.",
  }),
  id: RuleIdentitySchema.annotate({
    description: "Stable pack identity; it cannot contain separators or whitespace.",
  }),
  contentVersion: NonEmpty.annotate({
    description: "Authored content version, independent of the wire schema version.",
  }),
  rules: Schema.Array(RuleDefinition).annotate({
    description: "Rules declared by this pack. Rule identities must be unique within the pack.",
  }),
}).annotate({
  title: "Rule pack v1",
  identifier: "RulePackDocument",
  description: "Canonical JSONC wire format for a declarative rule pack.",
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

const strict = {
  onExcessProperty: "error",
  errors: "all",
} as const;

const checkVersion = (value: unknown, source: string): void => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return;
  const document = value as Record<string, unknown>;
  if (document.schemaVersion !== undefined && document.schemaVersion !== RULE_PACK_SCHEMA_VERSION) {
    throw configurationError(source, "schemaVersion", `unsupported rule-pack schema version; supported version is ${RULE_PACK_SCHEMA_VERSION}`);
  }
};

const validatePatterns = (
  patterns: ReadonlyArray<string> | undefined,
  source: string,
  field: string,
): void => {
  patterns?.forEach((pattern, index) => {
    try {
      validateGlobPattern(pattern);
    } catch (cause) {
      throw configurationError(
        source,
        `${field}[${index}]`,
        cause instanceof Error ? cause.message : "invalid glob pattern",
      );
    }
  });
};

const validateRulePackSemantics = (pack: RulePack, source: string): void => {
  const ids = new Set<string>();
  for (const [index, rule] of pack.rules.entries()) {
    if (ids.has(rule.id)) {
      throw configurationError(source, `rules[${index}].id`, `duplicate rule identity '${rule.id}'`);
    }
    ids.add(rule.id);
    if (rule.reviewTargets.length < 1 || rule.reviewTargets.length > 2) {
      throw configurationError(source, `rules[${index}].reviewTargets`, "declare one or two review targets");
    }
    const kinds = new Set<string>();
    for (const [targetIndex, target] of rule.reviewTargets.entries()) {
      if (kinds.has(target.artifactKind)) {
        throw configurationError(source, `rules[${index}].reviewTargets[${targetIndex}]`, "duplicate artifact kind");
      }
      kinds.add(target.artifactKind);
      if (target.capabilities.length === 0 || new Set(target.capabilities).size !== target.capabilities.length) {
        throw configurationError(source, `rules[${index}].reviewTargets[${targetIndex}].capabilities`, "declare distinct required capabilities");
      }
    }
    validatePatterns(rule.applicability?.includes, source, `rules[${index}].applicability.includes`);
    validatePatterns(rule.applicability?.excludes, source, `rules[${index}].applicability.excludes`);
  }
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

/** Decode canonical wire data, then apply semantic checks and runtime defaults. */
export const decodeRulePackDocument = (
  unknown: unknown,
  source: string,
  origin?: RulePackOrigin,
): DecodedRulePack => {
  checkVersion(unknown, source);
  let decoded: RulePack;
  try {
    decoded = Schema.decodeUnknownSync(RulePack, strict)(unknown);
  } catch (cause) {
    if (cause instanceof ConfigurationError) throw cause;
    throw schemaConfigurationError(source, cause, "rule pack contains an unknown or malformed field");
  }
  validateRulePackSemantics(decoded, source);
  const pack: RulePack = {
    ...decoded,
    rules: decoded.rules.map((rule) => ({
      ...rule,
      threshold: rule.threshold ?? DEFAULT_RULE_THRESHOLD,
    })),
  };
  return {
    ...pack,
    source,
    ...(origin === undefined ? {} : { origin }),
    contentDigest: digestRulePack(pack),
  };
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
    throw configurationError(
      source,
      "$",
      cause instanceof Error ? cause.message : "rule pack is not valid JSONC",
    );
  }
  return decodeRulePackDocument(parsed, source, origin);
};
