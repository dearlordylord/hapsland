import { describe, expect, it } from "vitest";
import * as Effect from "effect/Effect";
import { join } from "node:path";
import { adaptClaudeDirectEvent } from "../direct-event/adapter.ts";
import { makeGitFixture, put } from "../direct-event/test-fixtures.ts";
import { configuredRules } from "../policy/rules.ts";
import { Consent } from "../runtime/consent.ts";
import { residentPaths } from "./paths.ts";
import { ResidentServer } from "./server.ts";

const enable = (root: string, statePath: string) => Effect.runPromise(Effect.gen(function* () {
  const consent = yield* Consent.Service;
  const proposal = yield* consent.preview(root, "jev", "https://api.typesafe.ai/v1/systemone");
  yield* consent.enable(proposal);
}).pipe(Effect.provide(Consent.layer({ statePath }))));

describe("Claude recipient scoped resident delivery", () => {
  it("delivers only to the initiating tool call and drops stale content", async () => {
    const root = await makeGitFixture();
    const path = await put(root, "type.ts", "type OrderCount = number\n");
    const statePath = join(root, "consent");
    await enable(root, statePath);
    const observation = await Effect.runPromise(adaptClaudeDirectEvent({
      hook_event_name: "PostToolUse", tool_name: "Write", cwd: root,
      session_id: "session", tool_use_id: "tool-one",
      tool_input: { file_path: path, content: "type OrderCount = number\n" },
      tool_response: { filePath: path, content: "type OrderCount = number\n", originalFile: null, userModified: false },
    }));
    expect(observation).toBeDefined();
    if (observation === undefined) return;
    const server = new ResidentServer(residentPaths(join(root, "runtime")));
    const dispatch = {
      statePath, userConfigPath: null, credential: null,
      controlled: { answers: Object.fromEntries(configuredRules.map((rule) => [
        rule.id, { _tag: "Probability", probability: rule.id === "r6_bare_domain_value" ? 0.9 : 0 },
      ])) },
    };
    expect(server.admit(observation, dispatch).status).toBe("accepted");
    await server.whenIdle();
    expect(server.stats().pendingAdvice).toBe(1);
    expect(await server.collect(root, { ...observation.recipient, toolUseId: "tool-two" }, dispatch)).toMatchObject({ status: "empty" });
    const delivered = await server.collect(root, observation.recipient, dispatch);
    expect(delivered.status).toBe("advice");
    if (delivered.status === "advice") expect(delivered.output.hookSpecificOutput.additionalContext).toContain("OrderCount");
    await put(root, "type.ts", "type OrderCount = string\n");
    expect(await server.collect(root, observation.recipient, dispatch)).toMatchObject({ status: "empty" });
  });
});
