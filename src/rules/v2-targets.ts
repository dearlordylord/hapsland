import { createHash } from "node:crypto";

/** Proposed rule-pack/v2 target facts; no loader or egress path consumes these yet. */
export const V2_TYPE_CONTRACT = "direct-event/type-shape/v2" as const;
export const V2_FUNCTION_CONTRACT = "direct-event/function/v1" as const;
export type V2Capability = "root-declaration" | "resolved-outbound-types" | "selected-source-type-closure" |
  "signature" | "body" | "resolved-local-calls";
export type ReviewTargetV2 = {
  readonly artifactKind: "typeShape" | "function";
  readonly inputContract: typeof V2_TYPE_CONTRACT | typeof V2_FUNCTION_CONTRACT;
  readonly capabilities: ReadonlyArray<V2Capability>;
};
export type RuleTargetFactsV2 = { readonly id: string; readonly reviewTargets: ReadonlyArray<ReviewTargetV2>; readonly definitionDigest: string };
export type RulePackTargetFactsV2 = {
  readonly schemaVersion: 2;
  readonly id: string;
  readonly contentVersion: string;
  readonly rules: ReadonlyArray<RuleTargetFactsV2>;
  readonly contentDigest: string;
};
const typeCapabilities = new Set<V2Capability>(["root-declaration", "resolved-outbound-types", "selected-source-type-closure"]);
const functionCapabilities = new Set<V2Capability>(["signature", "body", "resolved-local-calls", "resolved-outbound-types"]);
const record = (value: unknown): Record<string, unknown> | undefined =>
  typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
const identity = (value: unknown): value is string => typeof value === "string" && /^[^/:\\\s]+$/u.test(value);
const nonEmpty = (value: unknown): value is string => typeof value === "string" && value.length > 0;
const fields = (value: Record<string, unknown>, allowed: ReadonlyArray<string>, required: ReadonlyArray<string>): boolean =>
  Object.keys(value).every((key) => allowed.includes(key)) && required.every((key) => Object.hasOwn(value, key));
function fail(field: string): never { throw new Error(`invalid rule-pack/v2 ${field}`); }
const canonical = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${canonical(object[key])}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
};
const digest = (value: unknown): string => createHash("sha256").update(canonical(value), "utf8").digest("hex");

/** Strict preflight of authored v2 rules; returns frozen, source-free target facts. */
export const decodeRulePackV2 = (raw: unknown): RulePackTargetFactsV2 => {
  const pack = record(raw);
  if (pack === undefined || !fields(pack, ["schemaVersion", "id", "contentVersion", "rules"], ["schemaVersion", "id", "contentVersion", "rules"]) ||
    pack.schemaVersion !== 2 || !identity(pack.id) || !nonEmpty(pack.contentVersion) || !Array.isArray(pack.rules)) fail("pack");
  const ruleIds = new Set<string>();
  const rules: RuleTargetFactsV2[] = [];
  for (const [index, item] of pack.rules.entries()) {
    const rule = record(item);
    if (rule === undefined || !fields(rule, ["id", "question", "criteria", "threshold", "message", "applicability", "reviewTargets"],
      ["id", "question", "criteria", "message", "reviewTargets"]) || !identity(rule.id) || ruleIds.has(rule.id) ||
      !nonEmpty(rule.question) || !nonEmpty(rule.message) || !Array.isArray(rule.reviewTargets) || rule.reviewTargets.length === 0) fail(`rules[${index}]`);
    ruleIds.add(rule.id);
    const criteria = record(rule.criteria);
    if (criteria === undefined || !fields(criteria, ["false", "true"], ["false", "true"]) || !nonEmpty(criteria.false) || !nonEmpty(criteria.true)) fail(`rules[${index}].criteria`);
    if (rule.threshold !== undefined && (typeof rule.threshold !== "number" || !Number.isFinite(rule.threshold) || rule.threshold < 0 || rule.threshold > 1)) fail(`rules[${index}].threshold`);
    if (rule.applicability !== undefined) {
      const applicability = record(rule.applicability);
      if (applicability === undefined || !fields(applicability, ["includes", "excludes"], [])) fail(`rules[${index}].applicability`);
      for (const key of ["includes", "excludes"] as const) if (applicability[key] !== undefined &&
        (!Array.isArray(applicability[key]) || !applicability[key].every(nonEmpty))) fail(`rules[${index}].applicability.${key}`);
    }
    const targets: ReviewTargetV2[] = [];
    const seen = new Set<string>();
    for (const [targetIndex, itemTarget] of rule.reviewTargets.entries()) {
      const target = record(itemTarget);
      if (target === undefined || !fields(target, ["artifactKind", "inputContract", "capabilities"], ["artifactKind", "inputContract", "capabilities"]) ||
        !Array.isArray(target.capabilities) || target.capabilities.length === 0) fail(`rules[${index}].reviewTargets[${targetIndex}]`);
      const allowed = target.artifactKind === "typeShape" && target.inputContract === V2_TYPE_CONTRACT ? typeCapabilities :
        target.artifactKind === "function" && target.inputContract === V2_FUNCTION_CONTRACT ? functionCapabilities : undefined;
      if (allowed === undefined || !target.capabilities.every((capability: unknown) => allowed.has(capability as V2Capability)) ||
        new Set(target.capabilities).size !== target.capabilities.length || seen.has(String(target.artifactKind))) fail(`rules[${index}].reviewTargets[${targetIndex}]`);
      seen.add(String(target.artifactKind));
      targets.push(Object.freeze({ artifactKind: target.artifactKind as ReviewTargetV2["artifactKind"],
        inputContract: target.inputContract as ReviewTargetV2["inputContract"], capabilities: Object.freeze([...target.capabilities]) as ReadonlyArray<V2Capability> }));
    }
    rules.push(Object.freeze({ id: rule.id, reviewTargets: Object.freeze(targets),
      definitionDigest: digest({ packId: pack.id, packVersion: pack.contentVersion, rule }) }));
  }
  return Object.freeze({ schemaVersion: 2, id: pack.id, contentVersion: pack.contentVersion,
    rules: Object.freeze(rules), contentDigest: digest(pack) });
};
