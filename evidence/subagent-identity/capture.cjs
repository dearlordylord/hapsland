// Record only source-free hook identity facts for the bounded native probe.
const { appendFileSync } = require("node:fs");
const { createHash } = require("node:crypto");
const hash = (value) => typeof value === "string" && value.length > 0
  ? createHash("sha256").update(value).digest("hex").slice(0, 12) : null;
let raw = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => { raw += chunk; });
process.stdin.on("end", () => {
  try {
    const event = JSON.parse(raw);
    const keys = ["agent_id", "agent_type", "agent_transcript_path", "session_id", "turn_id", "tool_use_id"];
    const fields = Object.fromEntries(keys.map((key) => [key, Object.hasOwn(event, key)]));
    appendFileSync(process.env.HAP_IDENTITY_TRACE, JSON.stringify({
      event: event.hook_event_name,
      tool: typeof event.tool_name === "string" ? event.tool_name : null,
      fields,
      session: hash(event.session_id),
      turn: hash(event.turn_id),
      agent: hash(event.agent_id),
      agentType: typeof event.agent_type === "string" ? event.agent_type : null,
      toolUse: hash(event.tool_use_id),
    }) + "\n");
  } catch { /* A malformed host payload cannot affect the host run. */ }
});
