import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import {
  decodeCodexPostToolUse,
  toCodexOutput,
  toReviewRequest,
} from "./codex.ts";

const event = {
  session_id: "session-1",
  turn_id: "turn-1",
  transcript_path: null,
  cwd: "/repo",
  hook_event_name: "PostToolUse",
  model: "gpt-test",
  permission_mode: "default",
  tool_name: "apply_patch",
  tool_input: {
    command:
      "*** Begin Patch\n*** Update File: src/a.ts\n*** Add File: src/b.ts\n*** Delete File: src/old.ts\n*** End Patch",
  },
  tool_response: "Success. Updated files.",
  tool_use_id: "call-1",
} as const;

describe("Codex adapter", () => {
  it.effect("decodes the pinned envelope and extracts every native patch path", () =>
    Effect.gen(function* () {
      const decoded = yield* decodeCodexPostToolUse(event);
      expect(toReviewRequest(decoded)).toEqual({
        version: 1,
        event: {
          id: "session-1:turn-1:call-1",
          kind: "successful-edit",
          host: "codex-cli/0.155.1",
          cwd: "/repo",
          paths: ["src/a.ts", "src/b.ts", "src/old.ts"],
        },
      });
    }),
  );

  it.effect("rejects unknown envelope fields", () =>
    Effect.gen(function* () {
      const result = yield* Effect.result(
        decodeCodexPostToolUse({ ...event, future_field: true }),
      );
      expect(result._tag).toBe("Failure");
    }),
  );

  it("declares shell-mediated writes unsupported", () => {
    expect(toReviewRequest({ ...event, tool_name: "Bash" })).toBeUndefined();
  });

  it("returns model-visible advisory context without a block decision", () => {
    expect(
      toCodexOutput({
        version: 1,
        eventId: "event-1",
        results: [
          {
            status: "unavailable",
            path: "src/a.ts",
            reason: "backend timed out",
            retryable: true,
          },
        ],
        advice: [],
      }),
    ).toEqual({
      hookSpecificOutput: {
        hookEventName: "PostToolUse",
        additionalContext:
          "Advisory post-write review (the edit already succeeded):\nsrc/a.ts: review unavailable (backend timed out)",
      },
    });
  });
});
