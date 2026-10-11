import { compileRules } from "@hapsland/review-definition/rules/compiler"

// Fixture construction stays with tooling; this boundary receives existing data.
const supplied = process.env.HAPSLAND_PREPARATION_FIXTURES
if (!supplied) throw new TypeError("Run this consumer through scripts/run-bend-capability-check.mjs")
const fixture = JSON.parse(supplied)
if (!Array.isArray(fixture.rules) || !fixture.advicee || typeof fixture.advicee !== "object")
  throw new TypeError("Missing preparation fixture rule facts or advicee")
export const configuredRules = compileRules({ rules: fixture.rules })
export const advicee = () => structuredClone(fixture.advicee)
