import { Decision } from "effect/unstable/ai";
import { RuleId } from "../domain/contracts.ts";
import { ConfigurationError } from "../configuration/errors.ts";
import type { ConfigurationLayer } from "../configuration/resolve.ts";
import { matchesAnyGlob } from "../matcher/glob.ts";
import { BUNDLED_NOUL_PACK, isNoulRuleApplicable } from "./bundled.ts";
import { applicableRule, includeRule } from "./decision.ts";
import type { ReviewTargetV2, V2Capability } from "./v2-targets.ts";
import { decodeRulePackV2, V2_FUNCTION_CONTRACT, V2_TYPE_CONTRACT } from "./v2-targets.ts";
import { validateGlobPattern } from "../matcher/glob.ts";
import {
  DEFAULT_RULE_THRESHOLD,
  digestRuleDefinition,
  type RuleApplicability,
  type RuleDefinition,
} from "./schema.ts";
import type { LoadedRulePack } from "./loader.ts";

export type RuleOverride = {
  readonly enabled?: boolean;
  readonly includes?: ReadonlyArray<string>;
  readonly excludes?: ReadonlyArray<string>;
  readonly threshold?: number;
  readonly message?: string;
};

export type CompiledRule = {
  /** Runtime key retained bare for bundled Noul compatibility. */
  readonly id: RuleId;
  /** Stable configuration/evaluation identity. */
  readonly qualifiedId: string;
  readonly packId: string;
  readonly packVersion: string;
  readonly packDigest: string;
  readonly ruleId: string;
  readonly definitionDigest: string;
  readonly decision: Decision.Probability;
  readonly threshold: number;
  readonly message: string;
  readonly rank: number;
  readonly applicability?: RuleApplicability;
  readonly builtIn: boolean;
  readonly enabled: boolean;
  readonly source: string;
  /** Native semantic observation; canonical Bend owns the applicability gate. */
  readonly semanticMatches: (source: string) => boolean;
  readonly reviewTargets?: ReadonlyArray<ReviewTargetV2>;
};

export type RuleCompilationOptions = {
  readonly packs: ReadonlyArray<LoadedRulePack>;
  readonly layers?: ReadonlyArray<ConfigurationLayer>;
  readonly overrides?: Readonly<Record<string, RuleOverride>>;
};

export type RuleSelectionGates = {
  readonly consent: boolean;
  readonly globalIncluded: boolean;
  readonly globalExcluded: boolean;
  readonly packEnabled: boolean;
  readonly ruleEnabled: boolean;
  readonly ruleIncluded: boolean;
  readonly ruleExcluded: boolean;
};

export type RuleTargetContext = {
  readonly artifactKind: "typeShape" | "function";
  readonly inputContract: string;
  readonly complete: boolean;
  readonly capabilities?: ReadonlyArray<V2Capability>;
};

const currentTypeTarget: RuleTargetContext = {
  artifactKind: "typeShape",
  inputContract: V2_TYPE_CONTRACT,
  complete: true,
  capabilities: ["root-declaration", "resolved-outbound-types", "selected-source-type-closure"],
};

/** Independent Boolean gate used by conformance tests and future orchestration. */
export const shouldDispatchRule = (gates: RuleSelectionGates): boolean =>
  applicableRule({ ...gates, complete: true, target: "directTypeShape",
    semanticApplicable: true });

const qualified = (packId: string, ruleId: string): string => `${packId}/${ruleId}`;

export const qualifyRuleId = qualified;

export const parseQualifiedRuleId = (
  value: string,
): { readonly packId: string; readonly ruleId: string } | undefined => {
  const separator = value.indexOf("/") >= 0 ? "/" : value.indexOf(":") >= 0 ? ":" : undefined;
  if (separator === undefined) return undefined;
  const [packId, ruleId, ...rest] = value.split(separator);
  return packId !== undefined && packId.length > 0 && ruleId !== undefined && ruleId.length > 0 && rest.length === 0
    ? { packId, ruleId }
    : undefined;
};

const inheritedOverrides = (
  layers: ReadonlyArray<ConfigurationLayer>,
): Readonly<Record<string, RuleOverride>> => {
  const result: Record<string, RuleOverride> = {};
  for (const layer of layers) {
    for (const [id, override] of Object.entries(layer.document.ruleOverrides ?? {})) {
      result[id] = {
        ...result[id],
        ...override,
      };
    }
  }
  return result;
};

const overrideFor = (
  rule: RuleDefinition,
  pack: LoadedRulePack,
  overrides: Readonly<Record<string, RuleOverride>>,
): RuleOverride | undefined =>
  overrides[qualified(pack.id, rule.id)] ??
  overrides[`${pack.id}:${rule.id}`] ??
  (pack.id === BUNDLED_NOUL_PACK.id ? overrides[rule.id] : undefined);

const validatePatterns = (
  patterns: ReadonlyArray<string> | undefined,
  source: string,
  field: string,
): void => {
  if (patterns === undefined) return;
  // Configuration decoding already validates these. This guard is retained for
  // callers constructing compiler inputs directly in tests.
  for (const pattern of patterns) {
    if (typeof pattern !== "string" || pattern.length === 0) {
      throw new ConfigurationError({ source, field, reason: "rule filter must contain non-empty strings" });
    }
  }
};

const mergedApplicability = (
  rule: RuleDefinition,
  override: RuleOverride | undefined,
): RuleApplicability | undefined => {
  if (override?.includes === undefined && override?.excludes === undefined) return rule.applicability;
  return {
    ...(override?.includes === undefined
      ? rule.applicability?.includes === undefined ? {} : { includes: rule.applicability.includes }
      : { includes: override.includes }),
    ...(override?.excludes === undefined
      ? rule.applicability?.excludes === undefined ? {} : { excludes: rule.applicability.excludes }
      : { excludes: override.excludes }),
  };
};

const pathApplicabilityFacts = (
  applicability: RuleApplicability | undefined,
  path: string | undefined,
): { readonly ruleIncluded: boolean; readonly ruleExcluded: boolean } => ({
  ruleIncluded: applicability?.includes === undefined || path === undefined ||
    matchesAnyGlob(applicability.includes, path),
  ruleExcluded: applicability?.excludes !== undefined && path !== undefined &&
    matchesAnyGlob(applicability.excludes, path),
});

const unknownOverrideIds = (
  packs: ReadonlyArray<LoadedRulePack>,
  overrides: Readonly<Record<string, RuleOverride>>,
): ReadonlyArray<string> => {
  const known = new Set<string>();
  for (const pack of packs) {
    for (const rule of pack.rules) {
      known.add(qualified(pack.id, rule.id));
      known.add(`${pack.id}:${rule.id}`);
      if (pack.id === BUNDLED_NOUL_PACK.id) known.add(rule.id);
    }
    known.add(pack.id);
  }
  return Object.keys(overrides).filter((id) => !known.has(id));
};

/** Compile every enabled selected rule only after validating all overrides. */
export const compileRules = (
  options: RuleCompilationOptions,
): ReadonlyArray<CompiledRule> => {
  const overrides = {
    ...(options.layers === undefined ? {} : inheritedOverrides(options.layers)),
    ...(options.overrides ?? {}),
  };
  const unknown = unknownOverrideIds(options.packs, overrides);
  if (unknown.length > 0) {
    throw new ConfigurationError({
      source: "configuration",
      field: "ruleOverrides",
      reason: `unknown rule override '${unknown[0]}'`,
    });
  }
  const compiled: Array<CompiledRule> = [];
  let rank = 0;
  for (const pack of options.packs) {
    const explicitV2 = pack.v2Raw === undefined ? undefined : compileRulePackV2(pack.v2Raw, pack.source);
    const packOverride = overrides[pack.id];
    const packEnabled = includeRule(pack.enabled, packOverride?.enabled !== false);
    for (const rule of pack.rules) {
      const qualifiedId = qualified(pack.id, rule.id);
      const override = overrideFor(rule, pack, overrides);
      const enabled = includeRule(packEnabled, override?.enabled !== false);
      const applicability = mergedApplicability(rule, override);
      validatePatterns(applicability?.includes, pack.source, `${qualifiedId}.applicability.includes`);
      validatePatterns(applicability?.excludes, pack.source, `${qualifiedId}.applicability.excludes`);
      if (!enabled) {
        rank += 1;
        continue;
      }
      const threshold = override?.threshold ?? rule.threshold ?? DEFAULT_RULE_THRESHOLD;
      if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1) {
        throw new ConfigurationError({
          source: pack.source,
          field: `${qualifiedId}.threshold`,
          reason: "must be a finite number between 0 and 1",
        });
      }
      const message = override?.message ?? rule.message;
      if (message.length === 0) {
        throw new ConfigurationError({
          source: pack.source,
          field: `${qualifiedId}.message`,
          reason: "must be a non-empty string",
        });
      }
      const runtimeId = pack.id === BUNDLED_NOUL_PACK.id ? rule.id : qualifiedId;
      const builtIn = pack.id === BUNDLED_NOUL_PACK.id;
      const v2Rule = explicitV2?.find((candidate) => candidate.ruleId === rule.id);
      compiled.push({
        id: v2Rule?.id ?? RuleId.make(runtimeId),
        qualifiedId,
        packId: pack.id,
        packVersion: pack.contentVersion,
        packDigest: pack.contentDigest,
        ruleId: rule.id,
        definitionDigest: v2Rule?.definitionDigest ?? digestRuleDefinition(pack, rule),
        decision: Decision.probability({ instructions: rule.question, criteria: rule.criteria }),
        threshold,
        message,
        rank,
        ...(applicability === undefined ? {} : { applicability }),
        builtIn,
        enabled,
        source: pack.source,
        semanticMatches: (source) => !builtIn || isNoulRuleApplicable(rule.id, source),
        ...(v2Rule === undefined ? {} : { reviewTargets: v2Rule.reviewTargets }),
      });
      rank += 1;
    }
  }
  return compiled;
};

export const selectApplicableRules = (
  rules: ReadonlyArray<CompiledRule>,
  source: string,
  path?: string,
  target: RuleTargetContext = currentTypeTarget,
): ReadonlyArray<CompiledRule> => rules.filter((rule) => {
  const authoredTarget = rule.reviewTargets?.find((candidate) =>
    candidate.artifactKind === target.artifactKind && candidate.inputContract === target.inputContract &&
    candidate.capabilities.every((capability) => target.capabilities?.includes(capability) === true));
  if (rule.reviewTargets === undefined
    ? !(target.inputContract === V2_TYPE_CONTRACT && rule.builtIn) &&
      !(target.inputContract === V2_FUNCTION_CONTRACT && rule.builtIn && rule.ruleId === "r9_body_reaches_undeclared")
    : authoredTarget === undefined) return false;
  // Bundled rules predate authored evidence requirements. Keep them on full
  // projections until each rule has an explicit partial-evidence contract.
  if (rule.reviewTargets === undefined && rule.builtIn &&
    (target.inputContract === V2_TYPE_CONTRACT || target.inputContract === V2_FUNCTION_CONTRACT) &&
    !(target.inputContract === V2_TYPE_CONTRACT
      ? ["root-declaration", "resolved-outbound-types", "selected-source-type-closure"]
      : ["signature", "body", "resolved-local-calls", "resolved-outbound-types"]
    ).every((capability) => target.capabilities?.includes(capability as V2Capability) === true)) return false;
  return applicableRule({
  consent: true,
  complete: target.complete,
  target: target.inputContract === V2_FUNCTION_CONTRACT ? "directFunctionV1"
    : target.inputContract === V2_TYPE_CONTRACT ? "directTypeShapeV2"
    : target.artifactKind === "function" ? "functionTarget"
    : "otherTypeShape",
  globalIncluded: true,
  globalExcluded: false,
  packEnabled: true,
  ruleEnabled: rule.enabled,
  ...pathApplicabilityFacts(rule.applicability, path),
  semanticApplicable: rule.semanticMatches(source),
  });
});

/** Prototype compiler for strictly decoded, explicit-target rule-pack/v2 data. */
export const compileRulePackV2 = (raw: unknown, source: string): ReadonlyArray<CompiledRule> => {
  const facts = decodeRulePackV2(raw);
  const document = raw as { readonly rules: ReadonlyArray<{
    readonly id: string; readonly question: string;
    readonly criteria: { readonly false: string; readonly true: string };
    readonly threshold?: number; readonly message: string;
    readonly applicability?: RuleApplicability;
  }> };
  return Object.freeze(document.rules.map((rule, rank) => {
    for (const pattern of [...rule.applicability?.includes ?? [], ...rule.applicability?.excludes ?? []]) {
      validateGlobPattern(pattern);
    }
    const targetFacts = facts.rules[rank];
    if (targetFacts === undefined) throw new Error("v2 target facts missing");
    return Object.freeze({
      id: RuleId.make(`${facts.id}/${rule.id}`),
      qualifiedId: `${facts.id}/${rule.id}`,
      packId: facts.id,
      packVersion: facts.contentVersion,
      packDigest: facts.contentDigest,
      ruleId: rule.id,
      definitionDigest: targetFacts.definitionDigest,
      decision: Decision.probability({ instructions: rule.question, criteria: rule.criteria }),
      threshold: rule.threshold ?? DEFAULT_RULE_THRESHOLD,
      message: rule.message,
      rank,
      ...(rule.applicability === undefined ? {} : { applicability: rule.applicability }),
      builtIn: false,
      enabled: true,
      source,
      semanticMatches: (_source: string) => true,
      reviewTargets: targetFacts.reviewTargets,
    } satisfies CompiledRule);
  }));
};
