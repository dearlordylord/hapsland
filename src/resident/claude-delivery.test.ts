import { describe, expect, it } from "vitest";
import * as Effect from "effect/Effect";
import { join } from "node:path";
import { writeFileSync } from "node:fs";
import { adaptClaudeDirectEvent } from "../direct-event/adapter.ts";
import { makeGitFixture, put } from "../direct-event/test-fixtures.ts";
import { configuredRules } from "../policy/rules.ts";
import { Consent } from "../runtime/consent.ts";
import { residentPaths } from "./paths.ts";
import { ResidentServer } from "./server.ts";
import { residentRequest } from "./client.ts";
import type { ResidentDispatchContext } from "./protocol.ts";

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

  it("returns a bounded production block only for an opted-in ticket and its original recipient", async () => {
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
    if (observation === undefined) throw new Error("expected observation");
    const userConfigPath = join(root, "user.jsonc");
    writeFileSync(userConfigPath, '{"version":1,"claudeFeedbackMode":"block-current-findings"}');
    const dispatch: ResidentDispatchContext = {
      statePath, userConfigPath, credential: null,
      controlled: { answers: Object.fromEntries(configuredRules.map((rule) => [
        rule.id, { _tag: "Probability", probability: rule.id === "r6_bare_domain_value" ? 0.9 : 0 },
      ])) },
    };
    const server = new ResidentServer(residentPaths(join(root, "runtime")));
    const accepted = await server.handle({ version: 2, operation: "admit", lifetime: server.lifetime,
      observation, controlledWriter: true, dispatch });
    expect(accepted.status).toBe("accepted");
    if (accepted.status !== "accepted" || !("version" in accepted) || accepted.version !== 2) return;
    await server.whenIdle();
    const wrong = await server.handle({ version: 2, operation: "collect", lifetime: server.lifetime,
      ticket: accepted.ticket, root, recipient: { ...observation.recipient, toolUseId: "other" }, dispatch });
    expect(wrong).toMatchObject({ version: 2, status: "unavailable", reason: "lost" });
    const delivered = await server.handle({ version: 2, operation: "collect", lifetime: server.lifetime,
      ticket: accepted.ticket, root, recipient: observation.recipient, dispatch });
    expect(delivered).toMatchObject({ version: 2, status: "advice", findingCount: 1,
      output: { decision: "block" } });
    if (delivered.status !== "advice" || !("version" in delivered) || delivered.version !== 2) return;
    expect(Buffer.byteLength(`${JSON.stringify(delivered.output)}\n`, "utf8")).toBeLessThanOrEqual(2_048);
    expect(delivered.output).not.toHaveProperty("hookSpecificOutput");
    expect(JSON.stringify(delivered.output)).not.toContain(accepted.ticket.nonce);
    server.releaseDelivery(delivered.token);
    writeFileSync(userConfigPath, '{"version":1,"claudeFeedbackMode":"advisory"}');
    const laterObservation = { ...observation, recipient: { ...observation.recipient, toolUseId: "tool-two" } };
    const later = await server.handle({ version: 2, operation: "admit", lifetime: server.lifetime,
      observation: laterObservation, controlledWriter: true, dispatch });
    if (later.status !== "accepted" || !("version" in later) || later.version !== 2) throw new Error("expected later ticket");
    await server.whenIdle();
    writeFileSync(userConfigPath, '{"version":1,"claudeFeedbackMode":"block-current-findings"}');
    const laterOutput = await server.handle({ version: 2, operation: "collect", lifetime: server.lifetime,
      ticket: later.ticket, root, recipient: laterObservation.recipient, dispatch });
    expect(laterOutput).toMatchObject({ version: 2, status: "advice",
      output: { hookSpecificOutput: { hookEventName: "PostToolUse" } } });
    if (laterOutput.status === "advice") expect(laterOutput.output).not.toHaveProperty("decision");
  });

  it("suppresses a leased block when the user revokes opt-in at the final handoff barrier", async () => {
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
    if (observation === undefined) throw new Error("expected observation");
    const userConfigPath = join(root, "user.jsonc");
    writeFileSync(userConfigPath, '{"version":1,"claudeFeedbackMode":"block-current-findings"}');
    const dispatch: ResidentDispatchContext = {
      statePath, userConfigPath, credential: null,
      controlled: { answers: Object.fromEntries(configuredRules.map((rule) => [
        rule.id, { _tag: "Probability", probability: rule.id === "r6_bare_domain_value" ? 0.9 : 0 },
      ])) },
    };
    let revoke = false;
    const paths = residentPaths(join(root, "runtime"));
    const server = new ResidentServer(paths, () => performance.now(), {
      beforeResponseHandoff: async () => {
        if (revoke) writeFileSync(userConfigPath, '{"version":1,"claudeFeedbackMode":"advisory"}');
      },
    });
    await server.listen();
    try {
      const accepted = await residentRequest(paths, { version: 2, operation: "admit", lifetime: server.lifetime,
        observation, controlledWriter: true, dispatch });
      if (accepted.status !== "accepted" || !("version" in accepted) || accepted.version !== 2) throw new Error("expected ticket");
      await server.whenIdle();
      revoke = true;
      const response = await residentRequest(paths, { version: 2, operation: "collect", lifetime: server.lifetime,
        ticket: accepted.ticket, root, recipient: observation.recipient, dispatch });
      expect(response).toMatchObject({ version: 2, status: "pending" });
      expect(server.stats().pendingAdvice).toBe(1);
    } finally {
      await server.close();
    }
  });
});
