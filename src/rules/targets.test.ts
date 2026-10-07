import { describe, expect, it } from "vitest"
import { decodeRuleDocument } from "@hapsland/review-definition/rules/schema"
const rule = {
  version: 1,
  id: "rule",
  question: "Q",
  criteria: { false: "N", true: "Y" },
  message: "M",
  inputs: [{ languages: ["typescript"], kind: "type", requires: ["root-declaration"] }]
}
const decode = (value: unknown) => decodeRuleDocument(value, "fixture.json")
describe("authored input declarations", () => {
  it("includes paired input capabilities in semantic identity", () => {
    const original = decode(rule)
    const extended = decode({
      ...rule,
      inputs: [...rule.inputs, { languages: ["typescript"], kind: "function", requires: ["signature", "body"] }]
    })
    expect(extended.inputs).toHaveLength(2)
    expect(extended.definitionDigest).not.toBe(original.definitionDigest)
  })
  it("rejects malformed versions, kinds, duplicates and dialects outside schemas", () => {
    for (const value of [
      { ...rule, version: 2 },
      { ...rule, inputs: [] },
      { ...rule, inputs: [{ languages: [], kind: "type", requires: [] }] },
      { ...rule, inputs: [{ languages: ["typescript", "typescript"], kind: "type", requires: [] }] },
      { ...rule, inputs: [{ languages: ["typescript"], kind: "value", requires: [] }] },
      { ...rule, inputs: [{ ...rule.inputs[0], dialect: "effect" }] },
      { ...rule, inputs: [{ ...rule.inputs[0], requires: ["body", "body"] }] }
    ])
      expect(() => decode(value)).toThrow()
  })
})
