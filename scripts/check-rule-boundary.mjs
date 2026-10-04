import { readFileSync } from "node:fs"
import { resolve } from "node:path"

const root = resolve(import.meta.dirname, "..")
const source = (path) => readFileSync(resolve(root, path), "utf8")
const compiler = source("src/rules/compiler.ts")
const policy = source("src/policy/rules.ts")
const direct = source("src/direct-event/pipeline.ts")
const resident = source("src/resident/server.ts")
const adapter = source("src/rules/decision.ts")

if (
  compiler.includes("isApplicable:") ||
  compiler.includes("if (authoredTarget === undefined) return false") ||
  /levelOf\(source\)\s*>=/.test(compiler) ||
  /probability\s*>\s*rule\.threshold/.test(direct + policy) ||
  /rule\.threshold\s*<\s*1\b/.test(resident)
) {
  throw new Error("superseded TypeScript rule decision returned")
}
if (
  !compiler.includes("includeRule(packEnabled") ||
  !compiler.includes("applicableRule({") ||
  !compiler.includes("targetDeclared: declaredTargets.length > 0") ||
  !compiler.includes("minimumRung: rule.minimumRung") ||
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
