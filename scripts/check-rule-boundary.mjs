import { readResidentRuntimeSource } from "./resident-runtime-source.mjs"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

const root = resolve(import.meta.dirname, "..")
const source = (path) => readFileSync(resolve(root, path), "utf8")
const compiler = source("packages/review-definition/src/rules/compiler.ts")
const policy = source("packages/review-execution/src/policy/rules.ts")
const direct = source("packages/review-execution/src/direct-event/pipeline.ts")
const resident = readResidentRuntimeSource(root)
const adapter = source("packages/review-definition/src/rules/decision.ts")

if (
  compiler.includes("isApplicable:") ||
  /packEnabled|minimumRung|sourceRung/.test(compiler) ||
  compiler.includes("if (authoredTarget === undefined) return false") ||
  /levelOf\(source\)\s*>=/.test(compiler) ||
  /probability\s*>\s*rule\.threshold/.test(direct + policy) ||
  /rule\.threshold\s*<\s*1\b/.test(resident)
) {
  throw new Error("superseded TypeScript rule decision returned")
}
if (
  !compiler.includes("applicableRule({") ||
  !compiler.includes("targetDeclared: inputs.length > 0") ||
  !policy.includes("findingFromProbability(") ||
  !policy.includes("compareRuleRank(") ||
  !policy.includes("withinAdviceBudget(") ||
  !direct.includes("findingFromProbability(") ||
  !direct.includes("compareRuleRank(") ||
  !resident.includes("findingFromProbability(1,") ||
  !adapter.includes('kind: "ruleFindingCheck"') ||
  !adapter.includes('kind: "ruleApplicabilityCheck"')
) {
  throw new Error("canonical rule boundary is missing")
}
