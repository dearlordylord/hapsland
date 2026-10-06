import { expect, it } from "vitest"
import { compileRule } from "@hapsland/review-definition/rules/compiler"
import { TYPE_INPUT_CONTRACT } from "@hapsland/review-definition/rules/targets"
import { freezeRules } from "@hapsland/review-definition/direct-event/model"
it("freezes requirements from the selected language/kind pair", () => {
  const rule = compileRule(
    {
      version: 1,
      id: "paired",
      question: "Invalid state?",
      criteria: { false: "no", true: "yes" },
      message: "Fix state",
      inputs: [
        { languages: ["typescript"], kind: "type", requires: ["root-declaration"] },
        { languages: ["rust"], kind: "type", requires: ["resolved-outbound-types"] }
      ]
    },
    "paired.json"
  )
  const target = { artifactKind: "typeShape", inputContract: TYPE_INPUT_CONTRACT } as const
  const typescript = freezeRules([rule], { ...target, language: "typescript" })
  const rust = freezeRules([rule], { ...target, language: "rust" })
  expect(typescript[0]?.target?.capabilities).toEqual(["root-declaration"])
  expect(rust[0]?.target?.capabilities).toEqual(["resolved-outbound-types"])
  expect(Object.isFrozen(rust[0]?.target?.capabilities)).toBe(true)
})
