import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import type { ReviewRequest, ReviewResponse, ReviewResult } from "../domain/contracts.ts";

const PermissionMode = Schema.Literals([
  "default",
  "acceptEdits",
  "plan",
  "dontAsk",
  "bypassPermissions",
]);

export const CodexPostToolUse = Schema.Struct({
  session_id: Schema.String,
  turn_id: Schema.String,
  agent_id: Schema.optionalKey(Schema.String),
  agent_type: Schema.optionalKey(Schema.String),
  transcript_path: Schema.NullOr(Schema.String),
  cwd: Schema.String,
  hook_event_name: Schema.Literal("PostToolUse"),
  model: Schema.String,
  permission_mode: PermissionMode,
  tool_name: Schema.String,
  tool_input: Schema.Json,
  tool_response: Schema.Json,
  tool_use_id: Schema.String,
});
export type CodexPostToolUse = typeof CodexPostToolUse.Type;

export const decodeCodexPostToolUse = Schema.decodeUnknownEffect(
  CodexPostToolUse,
  { onExcessProperty: "error", errors: "all" },
);

const patchPaths = (command: string): ReadonlyArray<string> => {
  const paths: Array<string> = [];
  for (const line of command.split("\n")) {
    const match = /^\*\*\* (?:Add|Update|Delete) File: (.+)$/.exec(line);
    const path = match?.[1]?.trim();
    if (path !== undefined && path.length > 0) paths.push(path);
  }
  return [...new Set(paths)];
};

const commandFrom = (input: unknown): string | undefined => {
  if (typeof input !== "object" || input === null || !("command" in input)) {
    return undefined;
  }
  return typeof input.command === "string" ? input.command : undefined;
};

export const toReviewRequest = (
  event: CodexPostToolUse,
): ReviewRequest | undefined => {
  if (event.tool_name !== "apply_patch") return undefined;
  const command = commandFrom(event.tool_input);
  if (command === undefined) return undefined;
  const paths = patchPaths(command);
  if (paths.length === 0) return undefined;
  return {
    version: 1,
    event: {
      id: `${event.session_id}:${event.turn_id}:${event.tool_use_id}`,
      kind: "successful-edit",
      host: "codex-cli/0.155.1",
      cwd: event.cwd,
      paths,
    },
  };
};

const formatAdvice = (response: ReviewResponse) => {
  const findings = response.advice.map(
    (item) =>
      `${item.snapshot.path} [${item.ruleId}, p=${item.probability.toFixed(2)}, sha256=${item.snapshot.contentHash.slice(0, 12)}]: ${item.message}`,
  );
  const unavailable = response.results
    .filter((result) => result.status === "unavailable")
    .map((result) => `${result.path}: review unavailable (${result.reason})`);
  const skipped = response.results
    .filter((result): result is Extract<ReviewResult, { status: "skipped" }> =>
        result.status === "skipped" &&
        (result.code === "missing_consent" || result.code === "unsupported_repository"),
    )
    .map((result) => `${result.path}: review skipped (${result.reason})`);
  return [...findings, ...unavailable, ...skipped].join("\n");
};

export const toCodexOutput = (response: ReviewResponse): unknown => {
  const additionalContext = formatAdvice(response);
  return additionalContext.length === 0
    ? {}
    : {
        hookSpecificOutput: {
          hookEventName: "PostToolUse",
          additionalContext: `Advisory post-write review (the edit already succeeded):\n${additionalContext}`,
        },
      };
};

export const decodeCodexJson = (input: string) =>
  Effect.try({
    try: () => JSON.parse(input) as unknown,
    catch: () => new Error("stdin is not valid JSON"),
  }).pipe(Effect.flatMap(decodeCodexPostToolUse));
