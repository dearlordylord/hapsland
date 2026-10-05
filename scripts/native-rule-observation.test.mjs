import { test } from "node:test"
import assert from "node:assert/strict"
import { findingRuleIds } from "./native-rule-observation.mjs"
const messages = { rule_a: "Constrain meaningless combinations.", rule_b: "Avoid duplicate encoding." }
test("recognizes actual delivered feedback without IDs or probability", () => {
  assert.deepEqual(findingRuleIds("Hapsland\nfile.ts :: PaymentState: Constrain meaningless combinations.", messages), [
    "rule_a"
  ])
})
test("metadata, a heading and operational notices do not establish finding delivery", () => {
  for (const text of ["[rule_a, p=1]", "Hapsland", "Review unavailable."])
    assert.deepEqual(findingRuleIds(text, messages), [])
})
