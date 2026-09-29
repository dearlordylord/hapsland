import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const source = (path) => readFileSync(resolve(root, path), "utf8");
if (existsSync(resolve(root, "src/policy/eligibility.ts"))) {
  throw new Error("unused legacy eligibility owner returned");
}
const filePolicy = source("src/policy/file-policy.ts");
const direct = source("src/direct-event/selection.ts");
const decision = source("src/configuration/decision.ts");
if (!filePolicy.includes("pathFacts(path)") ||
    !filePolicy.includes("classifyFileProtection({ kind:") ||
    !direct.includes("protectedPathReason(path)") ||
    !direct.includes("admitCandidateFile({ gitAdmin") ||
    !direct.includes("admitCandidateFile({ gitAdmin: false") ||
    !decision.includes('kind: "fileProtectionCheck"') ||
    !decision.includes('kind: "candidateFileCheck"')) {
  throw new Error("canonical file eligibility boundary is missing");
}
if (/\bhardExcluded\s*\(/.test(direct) || /\bineligibleReason\s*\(/.test(filePolicy)) {
  throw new Error("superseded TypeScript eligibility decision returned");
}
