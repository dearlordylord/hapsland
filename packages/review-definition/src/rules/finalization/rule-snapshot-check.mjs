import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import { compileRule, selectApplicableRules } from "@hapsland/review-definition/rules/compiler"
import { freezeRules } from "@hapsland/review-definition/direct-event/model"
import { applicableRule } from "@hapsland/review-definition/rules/decision"
import { TYPE_INPUT_CONTRACT, FUNCTION_INPUT_CONTRACT } from "@hapsland/review-definition/rules/targets"
import {
  productValue,
  fromProductValue,
  list,
  unlist
} from "../../../../source-analysis/src/direct-event/graph-resolution/service-session.mjs"

const prefix = "../../../../source-analysis/src/direct-event/graph-resolution/Types."
const tags = (value, outward) => {
  if (Array.isArray(value)) return value.map((item) => tags(item, outward))
  if (value !== null && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        key === "$" && typeof item === "string"
          ? outward
            ? item.replace(/^Types\./, prefix)
            : item.replace(prefix, "Types.")
          : tags(item, outward)
      ])
    )
  return value
}
const wire = (value) => tags(productValue(value), true)
const languages = ["typescript", "rust", "bend", "python", "go"]
const rules = []
for (const language of languages) {
  const kinds = language === "typescript" ? ["type", "function"] : ["type"]
  for (const kind of kinds) {
    const strong = kind === "type" ? "resolved-outbound-types" : "resolved-local-calls"
    const minimal = kind === "type" ? "root-declaration" : "body"
    for (const inputs of [
      [{ languages: [language], kind, requires: [] }],
      [{ languages: [language], kind, requires: [minimal] }],
      [{ languages: [language], kind, requires: [strong] }],
      [{ languages: [language], kind, requires: [strong, minimal] }]
    ]) {
      const rule = compileRule(
        {
          version: 1,
          id: "rule-" + rules.length,
          question: "Does the unit match?",
          criteria: { false: "No", true: "Yes" },
          message: "Matching unit",
          inputs
        },
        "rule-source-" + rules.length
      )
      rules.push(rule)
    }
  }
}
const snapshots = [
  rules,
  [...rules].reverse(),
  rules.map((rule, index) => ({ ...rule, enabled: index % 2 === 0 })),
  rules.map((rule) => ({ ...rule, languages: ["go"] })),
  rules.map((rule) => ({ ...rule, languages: [] }))
]
// The authored compiler rejects duplicate language/kind pairs. This additional
// raw compiled-shape fixture checks the helpers' distinct any/first semantics;
// it is not evidence that such an authored rule is accepted by configuration.
snapshots.push(
  rules.map((rule) => ({
    ...rule,
    inputs: [
      {
        ...rule.inputs[0],
        requires: [rule.inputs[0].kind === "type" ? "resolved-outbound-types" : "resolved-local-calls"]
      },
      { ...rule.inputs[0], requires: [] }
    ]
  }))
)
const temporary = mkdtempSync(join(tmpdir(), "hapsland-rule-finalization-"))
try {
  const output = join(temporary, "rules.mjs")
  execFileSync(
    "timeout",
    ["5s", "taskset", "-c", "10", "bend", join(import.meta.dirname, "RuleSnapshot.bend"), "-o", output],
    { timeout: 6000 }
  )
  const stage = (await import(pathToFileURL(output))).default
  let cases = 0
  let comparedRules = 0
  for (const snapshot of snapshots)
    for (const language of languages)
      for (const kind of ["type", "function"])
        for (const contract of [TYPE_INPUT_CONTRACT, FUNCTION_INPUT_CONTRACT, "unsupported"])
          for (const partial of [false, true]) {
            const encoded = snapshot.map(wire)
            const capabilities = unlist(stage.contract_capabilities(contract, partial)).map((value) =>
              fromProductValue(tags(value, false))
            )
            const target = {
              language,
              artifactKind: kind === "type" ? "typeShape" : "function",
              inputContract: contract
            }
            const expected = selectApplicableRules(snapshot, "ignored source", "root.ts", {
              ...target,
              complete: true,
              capabilities
            })
            const selected = encoded.filter((rule, index) =>
              applicableRule({
                consent: true,
                complete: true,
                target:
                  contract === TYPE_INPUT_CONTRACT
                    ? "typeShape"
                    : contract === FUNCTION_INPUT_CONTRACT
                      ? "functionTarget"
                      : "unsupportedTarget",
                globalIncluded: true,
                globalExcluded: false,
                ruleEnabled: snapshot[index].enabled,
                ruleIncluded: true,
                ruleExcluded: false,
                targetDeclared: stage.target_declared(rule, language, kind),
                capabilitiesAvailable: stage.capabilities_available(
                  rule,
                  language,
                  kind,
                  tags(list(capabilities.map(productValue)), true)
                )
              })
            )
            assert.deepEqual(
              selected.map((value) => fromProductValue(tags(value, false)).id),
              expected.map(({ id }) => id)
            )
            const actual = unlist(stage.freeze_rules(list(selected), language, kind, contract)).map((value) =>
              fromProductValue(tags(value, false))
            )
            assert.deepEqual(actual, freezeRules(expected, target))
            // Freeze the full snapshot too: disabled/unselected rules still have
            // native first-input targets when freezeRules is called directly.
            assert.deepEqual(
              unlist(stage.freeze_rules(list(encoded), language, kind, contract)).map((value) =>
                fromProductValue(tags(value, false))
              ),
              freezeRules(snapshot, target)
            )
            comparedRules += snapshot.length
            cases++
          }
  console.log(
    JSON.stringify({
      passed: true,
      cases,
      comparedRules,
      scope:
        "Compiled snapshot target/capability facts plus ordered frozen rules with the existing Canonical gate; path/glob and whole finalization remain unqualified"
    })
  )
} finally {
  rmSync(temporary, { recursive: true, force: true })
}
