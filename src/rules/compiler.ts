import * as Decision from "effect/ai/Decision"
import { RuleId } from "../domain/contracts.ts"
import { configurationError } from "../configuration/errors.ts"
import { matchesAnyGlob } from "../matcher/glob.ts"
import { applicableRule } from "./decision.ts"
import {
  FUNCTION_INPUT_CONTRACT,
  TYPE_INPUT_CONTRACT,
  TYPE_CAPABILITIES,
  FUNCTION_CAPABILITIES,
  type Capability,
  type ReviewTarget
} from "./targets.ts"
import {
  DEFAULT_RULE_THRESHOLD,
  decodeRuleDocument,
  type RuleDefinition,
  type RuleInput,
  type RuleLanguage,
  type RuleApplicability
} from "./schema.ts"
import type { LoadedRule } from "./loader.ts"
export type CompiledRule = {
  readonly id: RuleId
  readonly ruleId: string
  readonly definitionDigest: string
  readonly decision: Decision.Probability & { readonly criteria: { readonly false: string; readonly true: string } }
  readonly threshold: number
  readonly message: string
  readonly rank: number
  readonly applicability?: RuleApplicability
  readonly languages?: ReadonlyArray<RuleLanguage>
  readonly enabled: boolean
  readonly source: string
  readonly inputs: ReadonlyArray<RuleInput>
  readonly reviewTargets: ReadonlyArray<ReviewTarget>
}
export type RuleCompilationOptions = { readonly rules: ReadonlyArray<LoadedRule>; readonly includeDisabled?: boolean }
export type RuleSelectionGates = {
  readonly consent: boolean
  readonly globalIncluded: boolean
  readonly globalExcluded: boolean
  readonly ruleEnabled: boolean
  readonly ruleIncluded: boolean
  readonly ruleExcluded: boolean
}
export type RuleTargetContext = {
  readonly language: RuleLanguage
  readonly artifactKind: "typeShape" | "function"
  readonly inputContract: string
  readonly complete: boolean
  readonly capabilities?: ReadonlyArray<Capability>
}
const currentTypeTarget: RuleTargetContext = {
  language: "typescript",
  artifactKind: "typeShape",
  inputContract: TYPE_INPUT_CONTRACT,
  complete: true,
  capabilities: TYPE_CAPABILITIES
}
export const shouldDispatchRule = (gates: RuleSelectionGates): boolean =>
  applicableRule({ ...gates, complete: true, target: "typeShape", targetDeclared: true, capabilitiesAvailable: true })
const targetsFor = (rule: RuleDefinition): ReadonlyArray<ReviewTarget> =>
  rule.inputs.flatMap(
    (input): Array<ReviewTarget> =>
      input.kind === "type"
        ? [
            {
              artifactKind: "typeShape",
              inputContract: TYPE_INPUT_CONTRACT,
              capabilities: TYPE_CAPABILITIES.filter((capability) => input.requires.includes(capability))
            }
          ]
        : input.kind === "function"
          ? [
              {
                artifactKind: "function",
                inputContract: FUNCTION_INPUT_CONTRACT,
                capabilities: FUNCTION_CAPABILITIES.filter((capability) => input.requires.includes(capability))
              }
            ]
          : []
  )
const validateSupport = (rule: LoadedRule): void => {
  for (const language of rule.reference.languages ?? [])
    if (!rule.inputs.some((input) => input.languages.includes(language)))
      throw configurationError(
        rule.source,
        "languages",
        `language restriction '${language}' cannot extend authored inputs`
      )
  if (!rule.enabled) return
  for (const input of rule.inputs)
    for (const language of input.languages) {
      if (rule.reference.languages !== undefined && !rule.reference.languages.includes(language)) continue
      if (input.kind === "schema" || (input.kind === "function" && language !== "typescript"))
        throw configurationError(
          rule.source,
          "inputs",
          `unsupported selected input '${language}:${input.kind}'; select supported languages or disable this rule until an analyzer is available`
        )
      const capabilities: ReadonlyArray<string> = input.kind === "type" ? TYPE_CAPABILITIES : FUNCTION_CAPABILITIES
      for (const required of input.requires)
        if (!capabilities.includes(required))
          throw configurationError(
            rule.source,
            "inputs.requires",
            `unsupported capability '${required}' for '${language}:${input.kind}'`
          )
    }
}
export const compileRules = (options: RuleCompilationOptions): ReadonlyArray<CompiledRule> =>
  options.rules.flatMap((rule, rank) => {
    validateSupport(rule)
    if (!rule.enabled && !options.includeDisabled) return []
    const settings = rule.reference
    return [
      {
        id: RuleId.make(rule.id),
        ruleId: rule.id,
        definitionDigest: rule.definitionDigest,
        decision: {
          ...Decision.probability({ instructions: rule.question, criteria: rule.criteria }),
          criteria: rule.criteria
        },
        threshold: settings.threshold ?? rule.threshold ?? DEFAULT_RULE_THRESHOLD,
        message: settings.message ?? rule.message,
        rank,
        source: rule.source,
        enabled: rule.enabled,
        inputs: rule.inputs,
        reviewTargets: targetsFor(rule),
        ...(settings.languages === undefined ? {} : { languages: settings.languages }),
        ...(settings.includes === undefined && settings.excludes === undefined
          ? {}
          : {
              applicability: {
                ...(settings.includes === undefined ? {} : { includes: settings.includes }),
                ...(settings.excludes === undefined ? {} : { excludes: settings.excludes })
              }
            })
      }
    ]
  })
export const compileRule = (raw: unknown, source: string): CompiledRule => {
  const rule = decodeRuleDocument(raw, source)
  const origin = { layer: "project", source, field: "rules" } as const
  const compiled = compileRules({
    rules: [{ ...rule, origin, path: source, enabled: true, reference: { path: source, origin } }]
  })[0]
  if (compiled === undefined) throw configurationError(source, "rules", "rule could not be compiled")
  return compiled
}
export const selectApplicableRules = (
  rules: ReadonlyArray<CompiledRule>,
  _source: string,
  path?: string,
  target: RuleTargetContext = currentTypeTarget
): ReadonlyArray<CompiledRule> =>
  rules.filter((rule) => {
    const kind = target.artifactKind === "typeShape" ? "type" : "function"
    const inputs = rule.inputs.filter(
      (input) =>
        input.kind === kind &&
        input.languages.includes(target.language) &&
        (rule.languages === undefined || rule.languages.includes(target.language))
    )
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
      ruleEnabled: rule.enabled,
      ruleIncluded:
        path === undefined
          ? rule.applicability?.includes === undefined && (rule.applicability?.excludes?.length ?? 0) === 0
          : rule.applicability?.includes === undefined || matchesAnyGlob(rule.applicability.includes, path),
      ruleExcluded:
        rule.applicability?.excludes !== undefined &&
        path !== undefined &&
        matchesAnyGlob(rule.applicability.excludes, path),
      targetDeclared: inputs.length > 0,
      capabilitiesAvailable: inputs.some((input) =>
        input.requires.every((capability) => target.capabilities?.some((available) => available === capability))
      )
    })
  })
