import { formatReviewFeedback } from "../feedback/message.ts";

export type Finding = {
  readonly path: string;
  readonly declaration: string;
  readonly ruleId: string;
  readonly probability: number;
  readonly message: string;
  readonly semanticIdentity: string;
};

export type CodexDirectEventOutput = {
  readonly hookSpecificOutput: {
    readonly hookEventName: "PostToolUse";
    readonly additionalContext: string;
  };
};

export const toCodexDirectEventOutput = (findings: ReadonlyArray<Finding>): CodexDirectEventOutput => ({
  hookSpecificOutput: {
    hookEventName: "PostToolUse",
    additionalContext: formatReviewFeedback(findings),
  },
});

