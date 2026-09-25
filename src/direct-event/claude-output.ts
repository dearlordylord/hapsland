import { DIRECT_EVENT_ADVISORY_HEADING, type CodexDirectEventOutput } from "./pipeline.ts";

// Replaces the shared heading only for Claude finding replies. Keeping this
// shorter than the shared heading preserves the resident's 2 KiB selection.
const CLAUDE_FINDING_HEADING = "Advisory: Edit succeeded. Please repair each finding.";

export const toClaudeFindingOutput = (
  output: CodexDirectEventOutput,
  findingCount: number,
): CodexDirectEventOutput => {
  const context = output.hookSpecificOutput.additionalContext;
  if (findingCount <= 0 || !context.startsWith(DIRECT_EVENT_ADVISORY_HEADING)) return output;
  return {
    hookSpecificOutput: {
      hookEventName: "PostToolUse",
      additionalContext: CLAUDE_FINDING_HEADING + context.slice(DIRECT_EVENT_ADVISORY_HEADING.length),
    },
  };
};
