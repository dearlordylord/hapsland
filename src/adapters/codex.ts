import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import type { ReviewRequest, ReviewResponse, ReviewResult } from "../domain/contracts.ts";
import type {
  DiagnosticNotification,
  DiagnosticObservation,
} from "../diagnostics/domain.ts";

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
  const request: ReviewRequest = {
    version: 1,
    event: {
      id: `${event.session_id}:${event.turn_id}:${event.tool_use_id}`,
      kind: "successful-edit",
      host: "codex-cli/0.155.1",
      cwd: event.cwd,
      paths,
    },
  };
  // Keep the version-1 request's historical enumerable shape stable while
  // carrying the native host session identity to the observational receipt.
  Object.defineProperty(request.event, "sessionId", {
    value: event.session_id,
    enumerable: false,
    writable: false,
    configurable: false,
  });
  return request;
};

const safeResultMessage = (
  code: Extract<ReviewResult, { status: "unavailable" | "skipped" }>["code"],
): string => {
  switch (code) {
    case "missing_consent":
      return "review skipped because repository consent is required; run the explicit enable operation";
    case "unsupported_repository":
      return "review skipped because the working tree is unsupported";
    case "invalid_configuration":
      return "review unavailable because configuration is invalid; correct it and retry";
    case "missing_credentials":
      return "review unavailable because credentials are missing; set the configured credential environment variable and retry";
    case "review_timeout":
      return "review unavailable because the review backend timed out; retry when it recovers";
    case "backend_unavailable":
      return "review unavailable because the review backend could not complete the request; retry when it recovers";
    case "excluded":
      return "review skipped because the path is excluded";
    case "no_applicable_rule":
      return "review skipped because no configured rule applies";
  }
  return "review outcome is unavailable";
};

const formatAdvice = (response: ReviewResponse) => {
  const findings = response.advice.map(
    (item) =>
      `${item.snapshot.path} [${item.ruleId}, p=${item.probability.toFixed(2)}, sha256=${item.snapshot.contentHash.slice(0, 12)}]: ${item.message}`,
  );
  const unavailable = response.results
    .filter((result) => result.status === "unavailable")
    .map((result) => `${result.path}: ${safeResultMessage(result.code)}`);
  const skipped = response.results
    .filter((result): result is Extract<ReviewResult, { status: "skipped" }> =>
        result.status === "skipped" &&
        (result.code === "missing_consent" || result.code === "unsupported_repository"),
    )
    .map((result) => `${result.path}: ${safeResultMessage(result.code)}`);
  return [...findings, ...unavailable, ...skipped].join("\n");
};

const diagnosticMessages: Record<DiagnosticNotification["code"], string> = {
  missing_consent:
    "Review is inactive: repository consent is required before source can be sent. Run the explicit enable operation.",
  invalid_configuration:
    "Review is unavailable: configuration is invalid, so no source was sent. Correct the configuration and retry.",
  missing_credentials:
    "Review is unavailable: credentials are missing, so no source was sent. Set the configured credential environment variable and retry.",
  backend_outage:
    "Review is unavailable: the review backend could not complete the request. The edit succeeded; retry when the service or network recovers.",
  recovery:
    "Review recovered: the review backend is available again; subsequent edits can be reviewed.",
};

/** Render only bounded, product-owned text; never render a provider reason. */
export const formatCodexDiagnostic = (
  notification: DiagnosticNotification,
): string => diagnosticMessages[notification.code];

const noticesFrom = (
  response: ReviewResponse,
): ReadonlyArray<DiagnosticNotification> =>
  (response.diagnostics ?? [])
    .map((observation: DiagnosticObservation) => observation.notification)
    .filter((notification): notification is DiagnosticNotification => notification !== undefined);

export const formatCodexSystemMessage = (
  response: ReviewResponse,
): string | undefined => {
  const notices = noticesFrom(response);
  if (notices.length === 0) return undefined;
  const messages = [...new Set(notices.map(formatCodexDiagnostic))];
  return messages.join("\n");
};

export const toCodexOutput = (response: ReviewResponse): unknown => {
  const additionalContext = formatAdvice(response);
  const systemMessage = formatCodexSystemMessage(response);
  return additionalContext.length === 0 && systemMessage === undefined
    ? {}
    : {
        ...(systemMessage === undefined ? {} : { systemMessage }),
        hookSpecificOutput: {
          hookEventName: "PostToolUse",
          ...(additionalContext.length === 0
            ? {}
            : {
                additionalContext: `Advisory post-write review (the edit already succeeded):\n${additionalContext}`,
              }),
        },
      };
};

export const decodeCodexJson = (input: string) =>
  Effect.try({
    try: () => JSON.parse(input) as unknown,
    catch: () => new Error("stdin is not valid JSON"),
  }).pipe(Effect.flatMap(decodeCodexPostToolUse));
