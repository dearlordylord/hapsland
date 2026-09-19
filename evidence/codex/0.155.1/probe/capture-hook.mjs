import { appendFileSync, readFileSync } from "node:fs";

const role = process.argv[2] ?? "review";
const capturePath = process.env.REVIEW_PROBE_CAPTURE;
const event = JSON.parse(readFileSync(0, "utf8"));
const sanitized = {
  ...event,
  session_id: "<SESSION>",
  turn_id: "<TURN>",
  tool_use_id: "<TOOL_USE>",
  cwd: "<WORKSPACE>",
  transcript_path: event.transcript_path === null ? null : "<TRANSCRIPT>",
  model: "<MODEL>",
  tool_response: "<TOOL_RESPONSE>",
  probe_role: role,
};

if (capturePath !== undefined) {
  appendFileSync(capturePath, `${JSON.stringify(sanitized)}\n`, { mode: 0o600 });
}

if (role === "malformed") {
  process.stdout.write("{");
  process.exit(0);
}
if (role === "crash") process.exit(7);
if (role === "timeout") await new Promise((resolve) => setTimeout(resolve, 5_000));

process.stdout.write(
  JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "PostToolUse",
      additionalContext: `probe-${role}-visible-before-next-action`,
    },
  }),
);
