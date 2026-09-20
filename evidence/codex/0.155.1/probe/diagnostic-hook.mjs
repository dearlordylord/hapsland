import { readFileSync } from "node:fs";

// Synthetic host-channel probe. It never reads source or emits provider errors.
readFileSync(0, "utf8");
process.stdout.write(
  JSON.stringify({
    systemMessage:
      "Review is unavailable: synthetic backend outage. The edit succeeded; retry when the service recovers.",
    hookSpecificOutput: {
      hookEventName: "PostToolUse",
      additionalContext:
        "agent-facing synthetic outcome: backend_outage; no source or secret values",
    },
  }),
);
