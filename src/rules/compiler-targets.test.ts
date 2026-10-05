import { expect, it } from "vitest"
import { compileRule, selectApplicableRules } from "./compiler.ts"
import { FUNCTION_INPUT_CONTRACT } from "./targets.ts"
it("requires declared capabilities and complete evidence for functions", () => {
  const rule = compileRule(
    {
      version: 1,
      id: "body",
      question: "Hidden resource?",
      criteria: { false: "no", true: "yes" },
      message: "Declare resource",
      inputs: [{ languages: ["typescript"], kind: "function", requires: ["signature", "body"] }]
    },
    "body.json"
  )
  const target = {
    language: "typescript",
    artifactKind: "function",
    inputContract: FUNCTION_INPUT_CONTRACT,
    complete: true,
    capabilities: ["signature", "body"]
  } as const
  expect(selectApplicableRules([rule], "", "a.ts", target)).toHaveLength(1)
  expect(selectApplicableRules([rule], "", "a.ts", { ...target, capabilities: ["signature"] })).toHaveLength(0)
  expect(selectApplicableRules([rule], "", "a.ts", { ...target, complete: false })).toHaveLength(0)
})
