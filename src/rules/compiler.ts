import * as Decision from "effect/ai/Decision";
import { APPLIES_FROM, levelOf, type Level } from "../questions.ts";
import { RuleId } from "../domain/contracts.ts";
import { ConfigurationError } from "../configuration/errors.ts";
import type { ConfigurationLayer } from "../configuration/resolve.ts";
import { matchesAnyGlob } from "../matcher/glob.ts";
import { BUNDLED_NOUL_PACK } from "./bundled.ts";
import { applicableRule, includeRule } from "./decision.ts";
import { FUNCTION_INPUT_CONTRACT, TYPE_INPUT_CONTRACT, type Capability, type ReviewTarget } from "./targets.ts";
import { validateGlobPattern } from "../matcher/glob.ts";
import {
  DEFAULT_RULE_THRESHOLD,
  decodeRulePackDocument,
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
  readonly decision: Decision.Probability & { readonly criteria: { readonly false: string; readonly true: string } };
  readonly threshold: number;
  readonly message: string;
  readonly rank: number;
  readonly applicability?: RuleApplicability;
  readonly builtIn: boolean;
  readonly enabled: boolean;
  readonly source: string;
  /** Rule data; Bend compares it with the native source-rung observation. */
  readonly minimumRung: Level;
  readonly reviewTargets: ReadonlyArray<ReviewTarget>;
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
  readonly capabilities?: ReadonlyArray<Capability>;
};

const currentTypeTarget: RuleTargetContext = {
  artifactKind: "typeShape",
  inputContract: TYPE_INPUT_CONTRACT,
  complete: true,
  capabilities: ["root-declaration", "resolved-outbound-types", "selected-source-type-closure"],
};

/** Independent Boolean gate used by conformance tests and future orchestration. */
export const shouldDispatchRule = (gates: RuleSelectionGates): boolean =>
  applicableRule({
    ...gates,
    complete: true,
    target: "typeShape",
    targetDeclared: true,
    capabilitiesAvailable: true,
    sourceRung: 1,
    minimumRung: 1,
  });

const qualified = (packId: string, ruleId: string): string => `${packId}/${ruleId}`;

export const qualifyRuleId = qualified;

export const parseQualifiedRuleId = (
  value: string,
): { readonly packId: string; readonly ruleId: string } | undefined => {
  const separator = value.indexOf("/") >= 0 ? "/" : value.indexOf(":") >= 0 ? ":" : undefined;
  if (separator === undefined) return undefined;
  const parts = value.split(separator);
  if (parts.length !== 2) return undefined;
  const [packId, ruleId] = parts;
  if (!packId || !ruleId) return undefined;
  return { packId, ruleId };
};

const inheritedOverrides = (layers: ReadonlyArray<ConfigurationLayer>): Readonly<Record<string, RuleOverride>> => {
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

const validatePatterns = (patterns: ReadonlyArray<string> | undefined, source: string, field: string): void => {
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
      ? rule.applicability?.includes === undefined
        ? {}
        : { includes: rule.applicability.includes }
      : { includes: override.includes }),
    ...(override?.excludes === undefined
      ? rule.applicability?.excludes === undefined
        ? {}
        : { excludes: rule.applicability.excludes }
      : { excludes: override.excludes }),
  };
};

const pathApplicabilityFacts = (
  applicability: RuleApplicability | undefined,
  path: string | undefined,
): { readonly ruleIncluded: boolean; readonly ruleExcluded: boolean } => ({
  ruleIncluded:
    applicability?.includes === undefined || path === undefined || matchesAnyGlob(applicability.includes, path),
  ruleExcluded:
    applicability?.excludes !== undefined && path !== undefined && matchesAnyGlob(applicability.excludes, path),
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

const compilationOverrides = (options: RuleCompilationOptions): Readonly<Record<string, RuleOverride>> => ({
  ...(options.layers === undefined ? {} : inheritedOverrides(options.layers)),
  ...(options.overrides ?? {}),
});
const overridePermitsRule = (override: RuleOverride | undefined): boolean => override?.enabled !== false;
const overrideThreshold = (override: RuleOverride | undefined): number | undefined => override?.threshold;
const defaultedRuleThreshold = (rule: RuleDefinition): number => rule.threshold ?? DEFAULT_RULE_THRESHOLD;
const validRuleThreshold = (threshold: number): boolean =>
  Number.isFinite(threshold) && threshold >= 0 && threshold <= 1;
const compiledThreshold = (
  rule: RuleDefinition,
  override: RuleOverride | undefined,
  source: string,
  qualifiedId: string,
): number => {
  const threshold = overrideThreshold(override) ?? defaultedRuleThreshold(rule);
  if (!validRuleThreshold(threshold))
    throw new ConfigurationError({
      source,
      field: `${qualifiedId}.threshold`,
      reason: "must be a finite number between 0 and 1",
    });
  return threshold;
};
const compiledMessage = (
  rule: RuleDefinition,
  override: RuleOverride | undefined,
  source: string,
  qualifiedId: string,
): string => {
  const message = override?.message ?? rule.message;
  if (message.length === 0)
    throw new ConfigurationError({ source, field: `${qualifiedId}.message`, reason: "must be a non-empty string" });
  return message;
};
const compiledIdentity = (pack: LoadedRulePack, rule: RuleDefinition, qualifiedId: string) => {
  const builtIn = pack.id === BUNDLED_NOUL_PACK.id;
  const runtimeId = builtIn ? rule.id : qualifiedId;
  const minimumRung = builtIn ? APPLIES_FROM[rule.id] : 1;
  if (minimumRung === undefined) throw new Error(`missing bundled Noul rung for ${rule.id}`);
  return { runtimeId, builtIn, minimumRung };
};
const validateRuleApplicability = (
  applicability: RuleApplicability | undefined,
  source: string,
  qualifiedId: string,
): void => {
  validatePatterns(applicability?.includes, source, `${qualifiedId}.applicability.includes`);
  validatePatterns(applicability?.excludes, source, `${qualifiedId}.applicability.excludes`);
};
const applicabilityFields = (applicability: RuleApplicability | undefined) =>
  applicability === undefined ? {} : { applicability };
const compileEnabledRule = (
  pack: LoadedRulePack,
  rule: RuleDefinition,
  qualifiedId: string,
  override: RuleOverride | undefined,
  enabled: boolean,
  applicability: RuleApplicability | undefined,
  rank: number,
): CompiledRule => {
  const threshold = compiledThreshold(rule, override, pack.source, qualifiedId);
  const message = compiledMessage(rule, override, pack.source, qualifiedId);
  const { runtimeId, builtIn, minimumRung } = compiledIdentity(pack, rule, qualifiedId);
  return {
    id: RuleId.make(runtimeId),
    qualifiedId,
    packId: pack.id,
    packVersion: pack.contentVersion,
    packDigest: pack.contentDigest,
    ruleId: rule.id,
    definitionDigest: digestRuleDefinition(pack, rule),
    decision: {
      ...Decision.probability({ instructions: rule.question, criteria: rule.criteria }),
      criteria: rule.criteria,
    },
    threshold,
    message,
    rank,
    ...applicabilityFields(applicability),
    builtIn,
    enabled,
    source: pack.source,
    minimumRung,
    reviewTargets: rule.reviewTargets,
  };
};
/** Compile every enabled selected rule only after validating all overrides. */
export const compileRules = (options: RuleCompilationOptions): ReadonlyArray<CompiledRule> => {
  const overrides = compilationOverrides(options);
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
    const packOverride = overrides[pack.id];
    const packEnabled = includeRule(pack.enabled, overridePermitsRule(packOverride));
    for (const rule of pack.rules) {
      const qualifiedId = qualified(pack.id, rule.id);
      const override = overrideFor(rule, pack, overrides);
      const enabled = includeRule(packEnabled, overridePermitsRule(override));
      const applicability = mergedApplicability(rule, override);
      validateRuleApplicability(applicability, pack.source, qualifiedId);
      if (!enabled) {
        rank += 1;
        continue;
      }
      compiled.push(compileEnabledRule(pack, rule, qualifiedId, override, enabled, applicability, rank));
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
): ReadonlyArray<CompiledRule> => {
  const sourceRung = levelOf(source);
  return rules.filter((rule) => {
    const declaredTargets = rule.reviewTargets.filter(
      (candidate) => candidate.artifactKind === target.artifactKind && candidate.inputContract === target.inputContract,
    );
    const capabilitiesAvailable = declaredTargets.some((candidate) =>
      candidate.capabilities.every((capability) => target.capabilities?.includes(capability) === true),
    );
    return applicableRule({
      consent: true,
      complete: target.complete,
      target:
        target.inputContract === FUNCTION_INPUT_CONTRACT
          ? "functionTarget"
          : target.inputContract === TYPE_INPUT_CONTRACT
            ? "typeShape"
            : "unsupportedTarget",
      globalIncluded: true,
      globalExcluded: false,
      packEnabled: true,
      ruleEnabled: rule.enabled,
      ...pathApplicabilityFacts(rule.applicability, path),
      targetDeclared: declaredTargets.length > 0,
      capabilitiesAvailable,
      sourceRung,
      minimumRung: rule.minimumRung,
    });
  });
};

/** Compile one strict current rule pack for source-free fixtures and tooling. */
export const compileRulePack = (raw: unknown, source: string): ReadonlyArray<CompiledRule> => {
  const pack = decodeRulePackDocument(raw, source);
  return compileRules({
    packs: [{ ...pack, origin: { layer: "project", source, field: "packs" }, path: source, enabled: true }],
  });
};
