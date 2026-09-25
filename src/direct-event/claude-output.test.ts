import { describe, expect, it } from "vitest";
import {
  claudeHostOutputText,
  encodeClaudeHostOutputLine,
  type ClaudeBlockOutput,
  type ClaudeHostOutput,
} from "./claude-output.ts";

describe("Claude selected host output", () => {
  it("serializes a selected block object as one exact JSONL line", () => {
    const output: ClaudeBlockOutput = {
      decision: "block",
      reason: "Hapsland found a current rule finding.\n[r6_bare_domain_value, p=0.91]: Repair it.",
    };
    expect(encodeClaudeHostOutputLine(output)).toBe(
      '{"decision":"block","reason":"Hapsland found a current rule finding.\\n[r6_bare_domain_value, p=0.91]: Repair it."}\n',
    );
    expect(claudeHostOutputText(output)).toBe(output.reason);
  });

  it("preserves the resident-selected advisory object without reformatting", () => {
    const output: ClaudeHostOutput = {
      hookSpecificOutput: {
        hookEventName: "PostToolUse",
        additionalContext: "Advisory: Edit succeeded. Please repair each finding.\nOperational notice: Review unavailable.",
      },
    };
    expect(encodeClaudeHostOutputLine(output)).toBe(
      '{"hookSpecificOutput":{"hookEventName":"PostToolUse","additionalContext":"Advisory: Edit succeeded. Please repair each finding.\\nOperational notice: Review unavailable."}}\n',
    );
    expect(claudeHostOutputText(output)).toBe(output.hookSpecificOutput.additionalContext);
  });
});
