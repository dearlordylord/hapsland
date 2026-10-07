import { CLI_NAME } from "@hapsland/runtime-environment/runtime/cli-names"
import {
  CUSTOM_RULE_EXAMPLE_ID,
  CUSTOM_RULE_EXAMPLE_PATH,
  ruleCommandReference,
  type RuleAction
} from "@hapsland/administration/rules/cli-definition"
import {
  RULE_SCHEMA_VERSION,
  DEFAULT_RULE_THRESHOLD,
  decodeRuleDocument
} from "@hapsland/review-definition/rules/schema"
import { TYPE_CAPABILITIES } from "@hapsland/review-definition/rules/targets"

/** One executable authoring example; generated Markdown is its presentation. */
export const authoringRuleExample = {
  version: RULE_SCHEMA_VERSION,
  id: CUSTOM_RULE_EXAMPLE_ID,
  title: "No primitive obsession",
  question:
    "Does the supplied domain type use bare primitives or primitive type codes where a small domain-specific type should express identity, units, allowed values or constraints?",
  criteria: {
    false:
      "Distinct domain concepts have distinct types. Free text and primitives in storage or wire formats alone are not violations.",
    true: "A domain identity, quantity, constrained value or category uses an unconstrained primitive or opaque type code, losing a meaningful domain distinction."
  },
  message: "Give distinct domain concepts distinct types so their values cannot be accidentally interchanged.",
  threshold: DEFAULT_RULE_THRESHOLD,
  inputs: [{ languages: ["typescript"], kind: "type", requires: [...TYPE_CAPABILITIES] }]
}

export const authoringSourcePath = "src/primitive-obsession-examples.ts"
export const authoringSourceExample = `export type LooseOrder = {
  customerId: string
  orderId: string
}

export type CustomerId = { readonly kind: "customer-id"; readonly value: string }
export type OrderId = { readonly kind: "order-id"; readonly value: string }

export type Order = {
  customerId: CustomerId
  orderId: OrderId
}`

const commands = ruleCommandReference()
export const ruleExampleCommand = (action: RuleAction, argumentsText = ""): string => {
  const command = commands.find((command) => command.name === action)
  if (command === undefined) throw new Error(`missing rule example command: ${action}`)
  return `${CLI_NAME} rules ${command.name}${argumentsText === "" ? "" : ` ${argumentsText}`}`
}
const lineContaining = (text: string): number => {
  const matches = authoringSourceExample.split("\n").flatMap((line, index) => (line === text ? [index + 1] : []))
  if (matches.length !== 1) throw new Error("expected one authoring example selection line")
  return matches[0]!
}
export const authoringSelections = [
  { declaration: "LooseOrder", line: lineContaining("  customerId: string") },
  { declaration: "Order", line: lineContaining("  customerId: CustomerId") }
] as const
const fenced = (language: string, text: string): string => `\`\`\`${language}\n${text}\n\`\`\``
export const authoringCheckCommands = authoringSelections.map(({ line }) =>
  ruleExampleCommand("check", `--path ${authoringSourcePath} --line ${line} --id ${CUSTOM_RULE_EXAMPLE_ID}`)
)
const authoringCommands = {
  create: ruleExampleCommand("create", `--id ${CUSTOM_RULE_EXAMPLE_ID} --scope project`),
  disable: ruleExampleCommand("disable", `--id ${CUSTOM_RULE_EXAMPLE_ID} --scope project`),
  show: ruleExampleCommand("show", `--id ${CUSTOM_RULE_EXAMPLE_ID}`),
  connect: ruleExampleCommand("connect", `--path ${CUSTOM_RULE_EXAMPLE_PATH} --scope project`),
  enable: ruleExampleCommand("enable", `--id ${CUSTOM_RULE_EXAMPLE_ID} --scope project`),
  explain: ruleExampleCommand("explain", `--id ${CUSTOM_RULE_EXAMPLE_ID} --path ${authoringSourcePath}`)
}
export const authoringCommandExamples = [...Object.values(authoringCommands), ...authoringCheckCommands]

export const authoringExampleFacts = () => {
  decodeRuleDocument(authoringRuleExample, "generated authoring example")
  return [
    {
      name: "authoring-create",
      text: fenced("sh", [authoringCommands.create, authoringCommands.disable, authoringCommands.show].join("\n"))
    },
    { name: "authoring-rule", text: fenced("json", JSON.stringify(authoringRuleExample, null, 2)) },
    { name: "authoring-connect", text: fenced("sh", authoringCommands.connect) },
    {
      name: "authoring-enable",
      text: fenced("sh", [authoringCommands.enable, authoringCommands.show, authoringCommands.explain].join("\n"))
    },
    {
      name: "authoring-source",
      text: `**5. Test a violation and an acceptable case.** Create \`${authoringSourcePath}\` with a loose domain type and a version using distinct ID types:\n\n${fenced("ts", authoringSourceExample)}`
    },
    { name: "authoring-check", text: fenced("sh", authoringCheckCommands.join("\n")) }
  ].map((fact) => ({ ...fact, path: "docs/configuration.md" }))
}
