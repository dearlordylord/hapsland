import type { CodexDirectEventOutput } from "./output.ts"

export type ClaudeBlockOutput = { readonly decision: "block"; readonly reason: string }

/** The final JSON object selected and bounded by the resident for Claude. */
export type ClaudeHostOutput = CodexDirectEventOutput | ClaudeBlockOutput

/** Serialize the already selected host output exactly once, with its JSONL newline. */
export const encodeClaudeHostOutputLine = (output: ClaudeHostOutput): string => `${JSON.stringify(output)}\n`

/** Text carried by the selected host output, used only for delivery tracing. */
export const claudeHostOutputText = (output: ClaudeHostOutput): string =>
  "decision" in output ? output.reason : output.hookSpecificOutput.additionalContext
