import { REVIEW_FEEDBACK_HEADING, REVIEW_FEEDBACK_INSTRUCTIONS } from "../feedback/message.ts";
import { describe, expect, it } from "vitest";
import { classifyHookOutput, classifyLiveOutcome } from "./live-evidence-outcome.ts";
const stats = (overrides = {}) => ({ status: "stats" as const, queued: 0, running: 0, pendingAdvice: 0, pendingFindingBatches: 0, pendingOperationalNotices: 0, pendingEvaluations: 0, successfulCacheEntries: 1, ...overrides });
const output = (...lines: ReadonlyArray<string>) => ({ hookSpecificOutput: { hookEventName: "PostToolUse", additionalContext: [REVIEW_FEEDBACK_HEADING, ...lines].join("\n") } });
describe("sanitized live milestone classification", () => {
  it("distinguishes findings, operational notices, combined output, and no output", () => {
    expect(classifyHookOutput({})).toBe("none"); expect(classifyHookOutput(output("finding"))).toBe("findings"); expect(classifyHookOutput(output("Operational notice: unavailable"))).toBe("operational-notice"); expect(classifyHookOutput(output("finding", "Operational notice: unavailable"))).toBe("findings-and-operational-notice"); expect(classifyHookOutput(output())).toBe("invalid"); expect(classifyHookOutput(output(REVIEW_FEEDBACK_INSTRUCTIONS))).toBe("invalid"); expect(classifyHookOutput(output(REVIEW_FEEDBACK_INSTRUCTIONS, "Operational notice: unavailable"))).toBe("operational-notice");
  });
  it("requires source-free successful-evaluation evidence for clear and findings", () => {
    expect(classifyLiveOutcome({ admissionExitCode: 0, hostOutputKind: "none", stats: stats() })).toEqual({ contractOutcome: "completed-clear-no-advice", successfulEvaluation: true }); expect(classifyLiveOutcome({ admissionExitCode: 0, hostOutputKind: "findings", stats: stats() }).successfulEvaluation).toBe(true); expect(classifyLiveOutcome({ admissionExitCode: 0, hostOutputKind: "none", stats: stats({ successfulCacheEntries: 0 }) }).successfulEvaluation).toBe(false);
  });
  it("distinguishes pending findings, operational failure, and delayed completion", () => {
    expect(classifyLiveOutcome({ admissionExitCode: 0, hostOutputKind: "none", stats: stats({ pendingAdvice: 1, pendingFindingBatches: 1 }) }).contractOutcome).toBe("completed-findings-pending"); expect(classifyLiveOutcome({ admissionExitCode: 0, hostOutputKind: "none", stats: stats({ successfulCacheEntries: 0, pendingAdvice: 1, pendingOperationalNotices: 1 }) }).contractOutcome).toBe("operational-failure-notice-pending"); expect(classifyLiveOutcome({ admissionExitCode: 0, hostOutputKind: "operational-notice", stats: stats({ successfulCacheEntries: 0 }) }).contractOutcome).toBe("operational-failure-notice-attempted-unacknowledged"); expect(classifyLiveOutcome({ admissionExitCode: 0, hostOutputKind: "none", stats: stats({ successfulCacheEntries: 0, running: 1 }) }).contractOutcome).toBe("delayed-completion-unobserved");
  });
});
