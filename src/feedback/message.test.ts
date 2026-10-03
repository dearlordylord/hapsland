import { describe, expect, it } from "vitest";
import { formatReviewFeedback, REVIEW_FEEDBACK_HEADING, REVIEW_FEEDBACK_INSTRUCTIONS } from "./message.ts";
import { toCodexDirectEventOutput, type Finding } from "../direct-event/pipeline.ts";
import { combinedClaudeOutput, combinedReviewOutput, claudeStopHostOutput } from "../resident/collection.ts";

const finding = { path: "example.ts", declaration: "Example", ruleId: "example_rule", probability: 0.923, message: "Example issue." } as Finding;
describe("runtime-neutral feedback", () => {
  it("uses one actionable protocol and formatted finding for every host envelope", () => {
    const expected = `${REVIEW_FEEDBACK_HEADING}\n${REVIEW_FEEDBACK_INSTRUCTIONS}\nexample.ts :: Example: Example issue.`;
    expect(formatReviewFeedback([finding])).toBe(expected);
    expect(expected).not.toContain("example_rule");
    expect(expected).not.toContain("0.923");
    expect(toCodexDirectEventOutput([finding]).hookSpecificOutput.additionalContext).toBe(expected);
    expect(combinedClaudeOutput([finding], [], "advisory")).toEqual(toCodexDirectEventOutput([finding]));
    expect(combinedClaudeOutput([finding], [], "block-current-findings")).toEqual({ decision: "block", reason: expected });
    expect(claudeStopHostOutput(toCodexDirectEventOutput([finding]), 1)).toEqual({ decision: "block", reason: expected });
  });
  it("preserves operational notices consistently without ordering a repair or blocking", () => {
    const notices = [{ kind: "backend" as const, suppressedCount: 0 }];
    const codex = combinedReviewOutput([], notices);
    const text = codex.hookSpecificOutput.additionalContext;
    expect(text).toBe(`${REVIEW_FEEDBACK_HEADING}\nOperational notice: Jev was unavailable; some eligible edits were not reviewed.`);
    expect(text).not.toContain(REVIEW_FEEDBACK_INSTRUCTIONS);
    expect(combinedClaudeOutput([], notices, "block-current-findings")).toEqual(codex);
    expect(claudeStopHostOutput(codex, 0)).toEqual({ systemMessage: text });
    expect(combinedClaudeOutput([finding], notices, "block-current-findings")).toEqual({ decision: "block", reason: combinedReviewOutput([finding], notices).hookSpecificOutput.additionalContext });
  });
});
