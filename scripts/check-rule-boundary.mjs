import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const source = (path) => readFileSync(resolve(root, path), "utf8");
const compiler = source("src/rules/compiler.ts");
const policy = source("src/policy/rules.ts");
const direct = source("src/direct-event/pipeline.ts");
const legacy = source("src/runtime/review.ts");
const resident = source("src/resident/server.ts");
const adapter = source("src/rules/decision.ts");

if (compiler.includes("isApplicable:") ||
    /probability\s*>\s*rule\.threshold/.test(direct + policy) ||
    /rule\.threshold\s*<\s*1\b/.test(resident)) {
  throw new Error("superseded TypeScript rule decision returned");
}
if (!compiler.includes("includeRule(packEnabled") ||
    !compiler.includes("applicableRule({") ||
    !policy.includes("findingFromProbability(") ||
    !policy.includes("compareRuleRank(") ||
    !policy.includes("withinAdviceBudget(") ||
    !direct.includes("findingFromProbability(") ||
    !direct.includes("compareRuleRank(") ||
    !direct.includes("compareAdviceOrder(") ||
    !direct.includes("withinAdviceBudget(") ||
    !legacy.includes("compareAdviceOrder(") ||
    !legacy.includes("withinAdviceBudget(") ||
    !resident.includes("findingFromProbability(1,") ||
    !adapter.includes('kind: "ruleFindingCheck"') ||
    !adapter.includes('kind: "ruleApplicabilityCheck"')) {
  throw new Error("canonical rule boundary is missing");
}
