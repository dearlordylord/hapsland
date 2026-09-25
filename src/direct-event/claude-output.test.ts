import { describe, expect, it } from "vitest";
import { combinedReviewOutput, encodedHostOutputBytes } from "../resident/collection.ts";
import { DIRECT_EVENT_ADVISORY_HEADING } from "./pipeline.ts";
import { toClaudeFindingOutput } from "./claude-output.ts";

describe("Claude finding handoff", () => {
  it("requests repair only for finding replies and keeps bounded advice intact", () => {
    const output = combinedReviewOutput([{
      path: "type.ts", declaration: "OrderCount", ruleId: "r6_bare_domain_value",
      probability: 0.91, message: "Use a branded domain value.", semanticIdentity: "current",
    }], [{ kind: "backend", suppressedCount: 0 }]);
    const claude = toClaudeFindingOutput(output, 1);
    const context = claude.hookSpecificOutput.additionalContext;
    expect(context).toContain("Please repair each finding");
    expect(context).toContain("type.ts :: OrderCount [r6_bare_domain_value, p=0.91]: Use a branded domain value.");
    expect(context).toContain("Operational notice: Jev was unavailable");
    expect(claude).toEqual({ hookSpecificOutput: { hookEventName: "PostToolUse", additionalContext: context } });
    expect(encodedHostOutputBytes(claude)).toBeLessThanOrEqual(encodedHostOutputBytes(output));
  });

  it("keeps notice-only and quiet outputs free of repair instructions", () => {
    const notice = combinedReviewOutput([], [{ kind: "backend", suppressedCount: 0 }]);
    expect(toClaudeFindingOutput(notice, 0)).toBe(notice);
    expect(notice.hookSpecificOutput.additionalContext).toContain("Jev was unavailable");
    expect(notice.hookSpecificOutput.additionalContext).not.toContain("repair");
    const quiet = { hookSpecificOutput: { hookEventName: "PostToolUse" as const, additionalContext: "" } };
    expect(toClaudeFindingOutput(quiet, 0)).toBe(quiet);
  });

  it("does not turn an unexpected heading into a repair request", () => {
    const output = { hookSpecificOutput: { hookEventName: "PostToolUse" as const, additionalContext: "Operational notice: review unavailable" } };
    expect(toClaudeFindingOutput(output, 1)).toBe(output);
    expect(DIRECT_EVENT_ADVISORY_HEADING.length).toBeGreaterThan("Advisory: Edit succeeded. Please repair each finding.".length);
  });
});
