import { createHash } from "node:crypto"
import * as Schema from "effect/Schema"
import { configurationError, schemaConfigurationError } from "@hapsland/runtime-inputs/configuration/errors"
import { parseJsonc } from "@hapsland/runtime-inputs/configuration/jsonc"
import { RuleIdentitySchema } from "@hapsland/runtime-inputs/domain/rule-identity"

export const RULE_SCHEMA_VERSION = 1 as const
export const DEFAULT_RULE_THRESHOLD = 0.7
const NonEmpty = Schema.String.check(Schema.isMinLength(1))
export const RuleLanguage = Schema.Literals(["typescript", "rust", "bend", "go"])
export type RuleLanguage = typeof RuleLanguage.Type
export const RuleInput = Schema.Union([
  Schema.Struct({
    languages: Schema.Array(RuleLanguage),
    kind: Schema.Literals(["type", "function"]),
    requires: Schema.Array(NonEmpty)
  }),
  Schema.Struct({
    languages: Schema.Array(RuleLanguage),
    kind: Schema.Literal("schema"),
    requires: Schema.Array(NonEmpty),
    dialect: Schema.optionalKey(NonEmpty)
  })
])
export type RuleInput = typeof RuleInput.Type
export const RuleCriteria = Schema.Struct({ false: NonEmpty, true: NonEmpty })
export interface RuleCriteria extends Schema.Schema.Type<typeof RuleCriteria> {}
export const RuleDefinition = Schema.Struct({
  version: Schema.Literal(RULE_SCHEMA_VERSION),
  id: RuleIdentitySchema,
  title: Schema.optionalKey(NonEmpty),
  question: NonEmpty,
  criteria: RuleCriteria,
  message: NonEmpty,
  threshold: Schema.optionalKey(Schema.Finite.check(Schema.isBetween({ minimum: 0, maximum: 1 }))),
  inputs: Schema.Array(RuleInput)
}).annotate({ identifier: "RuleDocument", title: "Rule v1" })
export interface RuleDefinition extends Schema.Schema.Type<typeof RuleDefinition> {}
export type RuleOrigin = {
  readonly layer: "built-in" | "user" | "project"
  readonly source: string
  readonly field: string
}
export type DecodedRule = RuleDefinition & {
  readonly source: string
  readonly origin?: RuleOrigin
  readonly definitionDigest: string
}
export type RuleApplicability = { readonly includes?: ReadonlyArray<string>; readonly excludes?: ReadonlyArray<string> }
const canonical = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`
  if (typeof value === "object" && value !== null) {
    const record = value as Record<string, unknown>
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`)
      .join(",")}}`
  }
  return JSON.stringify(value) ?? "null"
}
export const stableRuleValue = (rule: RuleDefinition): string =>
  canonical({
    version: rule.version,
    id: rule.id,
    ...(rule.title === undefined ? {} : { title: rule.title }),
    question: rule.question,
    criteria: rule.criteria,
    message: rule.message,
    threshold: rule.threshold ?? DEFAULT_RULE_THRESHOLD,
    inputs: rule.inputs
  })
export const digestRuleDefinition = (rule: RuleDefinition): string =>
  createHash("sha256").update(stableRuleValue(rule), "utf8").digest("hex")
const validateInputDeclarations = (input: RuleInput, index: number, source: string): void => {
  if (input.languages.length === 0 || new Set(input.languages).size !== input.languages.length)
    throw configurationError(source, `inputs[${index}].languages`, "declare distinct input languages")
  if (new Set(input.requires).size !== input.requires.length)
    throw configurationError(source, `inputs[${index}].requires`, "declare distinct required capabilities")
}
const validateRuleInputs = (rule: RuleDefinition, source: string): void => {
  if (rule.inputs.length === 0) throw configurationError(source, "inputs", "declare at least one input")
  const pairs = new Set<string>()
  for (const [index, input] of rule.inputs.entries()) {
    validateInputDeclarations(input, index, source)
    for (const language of input.languages) {
      const key = `${language}:${input.kind}`
      if (pairs.has(key)) throw configurationError(source, `inputs[${index}]`, `duplicate input '${key}'`)
      pairs.add(key)
    }
  }
}
export const decodeRuleDocument = (value: unknown, source: string, origin?: RuleOrigin): DecodedRule => {
  let rule: RuleDefinition
  try {
    rule = Schema.decodeUnknownSync(RuleDefinition, { onExcessProperty: "error", errors: "all" })(value)
  } catch (cause) {
    throw schemaConfigurationError(source, cause, "rule contains an unknown or malformed field")
  }
  validateRuleInputs(rule, source)
  return { ...rule, source, ...(origin === undefined ? {} : { origin }), definitionDigest: digestRuleDefinition(rule) }
}
export const decodeRuleText = (text: string, source: string, origin?: RuleOrigin): DecodedRule => {
  let parsed: unknown
  try {
    parsed = parseJsonc(text)
  } catch (cause) {
    throw configurationError(source, "$", cause instanceof Error ? cause.message : "rule is not valid JSONC")
  }
  return decodeRuleDocument(parsed, source, origin)
}
