import { describe, expect, it } from "vitest";
import * as Effect from "effect/Effect";
import { join } from "node:path";
import { writeFileSync } from "node:fs";
import { adaptClaudeDirectEvent } from "../direct-event/adapter.ts";
import type { DirectAdvicee } from "../direct-event/model.ts";
import { makeGitFixture, put } from "../direct-event/test-fixtures.ts";
import { configuredRules } from "../policy/rules.ts";
import { residentPaths } from "./paths.ts";
import { ResidentServer } from "./server.ts";
import { residentRequest } from "./client.ts";
import { MAX_COMBINED_RESPONSE_BYTES } from "./collection.ts";
import { monotonicNow } from "./hook-clock.ts";
import type { ResidentDispatchContext } from "./protocol.ts";

describe("Claude advicee scoped resident delivery", () => {
  it("keeps an earlier admission's failure out of the next composed edit output", async () => {
    const root = await makeGitFixture();
    const statePath = join(root, "consent");
    const dispatch: ResidentDispatchContext = { statePath, userConfigPath: null, credential: null,
      controlled: { answers: Object.fromEntries(configuredRules.map((rule) => [
        rule.id, { _tag: "Probability", probability: 0 },
      ])) } };
    const failed: ResidentDispatchContext = { ...dispatch, controlled: { failure: "controlled backend failure" } };
    const server = new ResidentServer(residentPaths(join(root, "runtime")));
    let latest: { ticket: { nonce: string; lifetime: string }; advicee: DirectAdvicee } | undefined;
    for (const name of ["first", "second"] as const) {
      const path = await put(root, `${name}.ts`, `type ${name}Count = number\n`);
      const observation = await Effect.runPromise(adaptClaudeDirectEvent({
        hook_event_name: "PostToolUse", tool_name: "Write", cwd: root,
        session_id: "shared-notice", tool_use_id: name,
        tool_input: { file_path: path, content: `type ${name}Count = number\n` },
        tool_response: { filePath: path, content: `type ${name}Count = number\n`, originalFile: null, userModified: false },
      }));
      if (observation === undefined) throw new Error("expected Claude observation");
      expect((await server.handle({ requestRoute: "shared", operation: "register-edit", lifetime: server.lifetime,
        root, advicee: observation.advicee, startedAt: monotonicNow() - 1 })).status).toBe("advanced");
      const accepted = await server.handle({ requestRoute: "ticketed", operation: "admit", lifetime: server.lifetime,
        observation, controlledWriter: true, dispatch: name === "first" ? failed : dispatch,
        composed: true });
      if (accepted.status !== "accepted" || !("ticket" in accepted)) throw new Error("expected admission");
      latest = { ticket: accepted.ticket, advicee: observation.advicee };
    }
    await server.whenIdle();
    if (latest === undefined) throw new Error("expected second admission");
    const result = await server.handle({ requestRoute: "ticketed", operation: "collect", lifetime: server.lifetime,
      ticket: latest.ticket, root, advicee: latest.advicee, dispatch, composed: true });
    expect(result).toMatchObject({ requestRoute: "ticketed", status: "empty" });
  });

  it("batches eligible findings from two composed admissions in one Claude edit response", async () => {
    const root = await makeGitFixture();
    const statePath = join(root, "consent");
    const dispatch: ResidentDispatchContext = { statePath, userConfigPath: null, credential: null,
      controlled: { answers: Object.fromEntries(configuredRules.map((rule) => [
        rule.id, { _tag: "Probability", probability: rule.id === "r6_bare_domain_value" ? 0.9 : 0 },
      ])) } };
    const server = new ResidentServer(residentPaths(join(root, "runtime")));
    const admitted: Array<{ readonly ticket: { readonly nonce: string; readonly lifetime: string };
      readonly advicee: DirectAdvicee }> = [];
    for (const [name, toolUseId] of [["FirstCount", "first"], ["SecondCount", "second"]] as const) {
      const path = await put(root, `${toolUseId}.ts`, `type ${name} = number\n`);
      const observation = await Effect.runPromise(adaptClaudeDirectEvent({
        hook_event_name: "PostToolUse", tool_name: "Write", cwd: root,
        session_id: "shared-session", tool_use_id: toolUseId,
        tool_input: { file_path: path, content: `type ${name} = number\n` },
        tool_response: { filePath: path, content: `type ${name} = number\n`, originalFile: null, userModified: false },
      }));
      if (observation === undefined) throw new Error("expected Claude observation");
      const permit = await server.handle({ requestRoute: "shared", operation: "register-edit",
        lifetime: server.lifetime, root, advicee: observation.advicee, startedAt: monotonicNow() - 1 });
      expect(permit.status).toBe("advanced");
      const accepted = await server.handle({ requestRoute: "ticketed", operation: "admit", lifetime: server.lifetime,
        observation, controlledWriter: true, dispatch, composed: true });
      if (accepted.status !== "accepted" || !("requestRoute" in accepted) || accepted.requestRoute !== "ticketed") {
        throw new Error("expected composed admission");
      }
      admitted.push({ ticket: accepted.ticket, advicee: observation.advicee });
    }
    await server.whenIdle();
    const latest = admitted[1]!;
    const result = await server.handle({ requestRoute: "ticketed", operation: "collect", lifetime: server.lifetime,
      ticket: latest.ticket, root, advicee: latest.advicee, dispatch, composed: true });
    expect(result).toMatchObject({ requestRoute: "ticketed", status: "advice", findingCount: 2 });
    if (result.status === "advice" && "requestRoute" in result && result.requestRoute === "ticketed" &&
        "hookSpecificOutput" in result.output) {
      expect(result.output.hookSpecificOutput.additionalContext).toContain("FirstCount");
      expect(result.output.hookSpecificOutput.additionalContext).toContain("SecondCount");
    }
  });

  it("lets composed Stop collect session advice without crossing child or session identity", async () => {
    const root = await makeGitFixture();
    const path = await put(root, "type.ts", "type OrderCount = number\n");
    const statePath = join(root, "consent");
    const observation = await Effect.runPromise(adaptClaudeDirectEvent({
      hook_event_name: "PostToolUse", tool_name: "Write", cwd: root,
      session_id: "session", tool_use_id: "tool-one",
      tool_input: { file_path: path, content: "type OrderCount = number\n" },
      tool_response: { filePath: path, content: "type OrderCount = number\n", originalFile: null, userModified: false },
    }));
    expect(observation).toBeDefined();
    if (observation === undefined) return;
    const dispatch: ResidentDispatchContext = { statePath, userConfigPath: null, credential: null,
      controlled: { answers: Object.fromEntries(configuredRules.map((rule) => [
        rule.id, { _tag: "Probability", probability: rule.id === "r6_bare_domain_value" ? 0.9 : 0 },
      ])) } };
    const server = new ResidentServer(residentPaths(join(root, "runtime")));
    expect(server.admit(observation, dispatch, false, true)).toEqual({ status: "accepted" });
    await server.whenIdle();
    expect(server.stats().pendingFindingBatches).toBe(1);
    const collect = (advicee: typeof observation.advicee, composed: true) => server.handle({
      requestRoute: "shared", operation: "collect", lifetime: server.lifetime,
      root, advicee, dispatch, mode: "turn-end", composed,
    });
    const stopAdvicee = { ...observation.advicee, toolUseId: "stop" };
    expect((await collect(stopAdvicee, true)).status).toBe("advice");
    expect((await collect({ ...stopAdvicee, subagentId: "child" }, true)).status).toBe("empty");
    expect((await collect({ ...stopAdvicee, sessionId: "other" }, true)).status).toBe("empty");
  });

  it("delivers only to the initiating tool call and drops stale content", async () => {
    const root = await makeGitFixture();
    const path = await put(root, "type.ts", "type OrderCount = number\n");
    const statePath = join(root, "consent");
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
    expect(await server.collect(root, { ...observation.advicee, toolUseId: "tool-two" }, dispatch)).toMatchObject({ status: "empty" });
    const delivered = await server.collect(root, observation.advicee, dispatch);
    expect(delivered.status).toBe("advice");
    if (delivered.status === "advice") expect(delivered.output.hookSpecificOutput.additionalContext).toContain("OrderCount");
    await put(root, "type.ts", "type OrderCount = string\n");
    expect(await server.collect(root, observation.advicee, dispatch)).toMatchObject({ status: "empty" });
  });

  it("returns a bounded production block only for an opted-in ticket and its original advicee", async () => {
    const root = await makeGitFixture();
    const path = await put(root, "type.ts", "type OrderCount = number\n");
    const statePath = join(root, "consent");
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
    const accepted = await server.handle({ requestRoute: "ticketed", operation: "admit", lifetime: server.lifetime,
      observation, controlledWriter: true, dispatch });
    expect(accepted.status).toBe("accepted");
    if (accepted.status !== "accepted" || !("requestRoute" in accepted) || accepted.requestRoute !== "ticketed") return;
    await server.whenIdle();
    const wrong = await server.handle({ requestRoute: "ticketed", operation: "collect", lifetime: server.lifetime,
      ticket: accepted.ticket, root, advicee: { ...observation.advicee, toolUseId: "other" }, dispatch });
    expect(wrong).toMatchObject({ requestRoute: "ticketed", status: "unavailable", reason: "lost" });
    const delivered = await server.handle({ requestRoute: "ticketed", operation: "collect", lifetime: server.lifetime,
      ticket: accepted.ticket, root, advicee: observation.advicee, dispatch });
    expect(delivered).toMatchObject({ requestRoute: "ticketed", status: "advice", findingCount: 1,
      output: { decision: "block" } });
    if (delivered.status !== "advice" || !("requestRoute" in delivered) || delivered.requestRoute !== "ticketed") return;
    expect(Buffer.byteLength(`${JSON.stringify(delivered.output)}\n`, "utf8")).toBeLessThanOrEqual(MAX_COMBINED_RESPONSE_BYTES);
    expect(delivered.output).not.toHaveProperty("hookSpecificOutput");
    expect(JSON.stringify(delivered.output)).not.toContain(accepted.ticket.nonce);
    server.releaseDelivery(delivered.token);
    writeFileSync(userConfigPath, '{"version":1,"claudeFeedbackMode":"advisory"}');
    const laterObservation = { ...observation, advicee: { ...observation.advicee, toolUseId: "tool-two" } };
    const later = await server.handle({ requestRoute: "ticketed", operation: "admit", lifetime: server.lifetime,
      observation: laterObservation, controlledWriter: true, dispatch });
    if (later.status !== "accepted" || !("requestRoute" in later) || later.requestRoute !== "ticketed") throw new Error("expected later ticket");
    await server.whenIdle();
    writeFileSync(userConfigPath, '{"version":1,"claudeFeedbackMode":"block-current-findings"}');
    const laterOutput = await server.handle({ requestRoute: "ticketed", operation: "collect", lifetime: server.lifetime,
      ticket: later.ticket, root, advicee: laterObservation.advicee, dispatch });
    expect(laterOutput).toMatchObject({ requestRoute: "ticketed", status: "advice",
      output: { hookSpecificOutput: { hookEventName: "PostToolUse" } } });
    if (laterOutput.status === "advice") expect(laterOutput.output).not.toHaveProperty("decision");
  });

  it("retires selected Claude advice when its source changes at the final IPC handoff", async () => {
    const root = await makeGitFixture();
    const path = await put(root, "type.ts", "type OrderCount = number\n");
    const statePath = join(root, "consent");
    const observation = await Effect.runPromise(adaptClaudeDirectEvent({
      hook_event_name: "PostToolUse", tool_name: "Write", cwd: root,
      session_id: "source-handoff", tool_use_id: "source-edit",
      tool_input: { file_path: path, content: "type OrderCount = number\n" },
      tool_response: { filePath: path, content: "type OrderCount = number\n", originalFile: null, userModified: false },
    }));
    if (observation === undefined) throw new Error("expected observation");
    const dispatch: ResidentDispatchContext = {
      statePath, userConfigPath: null, credential: null,
      controlled: { answers: Object.fromEntries(configuredRules.map((rule) => [
        rule.id, { _tag: "Probability", probability: rule.id === "r6_bare_domain_value" ? 0.9 : 0 },
      ])) },
    };
    let changeAtHandoff = false;
    const paths = residentPaths(join(root, "runtime"));
    const server = new ResidentServer(paths, undefined, { beforeResponseHandoff: async () => {
      if (changeAtHandoff) writeFileSync(path, "type OrderCount = string\n");
    } });
    await server.listen();
    try {
      const accepted = await residentRequest(paths, { requestRoute: "ticketed", operation: "admit", lifetime: server.lifetime,
        observation, controlledWriter: true, dispatch });
      if (accepted.status !== "accepted" || !("requestRoute" in accepted) || accepted.requestRoute !== "ticketed") throw new Error("expected ticket");
      await server.whenIdle();
      changeAtHandoff = true;
      const response = await residentRequest(paths, { requestRoute: "ticketed", operation: "collect", lifetime: server.lifetime,
        ticket: accepted.ticket, root, advicee: observation.advicee, dispatch });
      expect(response.status).not.toBe("advice");
      expect(server.stats().pendingAdvice).toBe(0);
    } finally {
      await server.close();
    }
  });

  it("suppresses a leased block when the user revokes opt-in at the final handoff barrier", async () => {
    const root = await makeGitFixture();
    const path = await put(root, "type.ts", "type OrderCount = number\n");
    const statePath = join(root, "consent");
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
      const accepted = await residentRequest(paths, { requestRoute: "ticketed", operation: "admit", lifetime: server.lifetime,
        observation, controlledWriter: true, dispatch });
      if (accepted.status !== "accepted" || !("requestRoute" in accepted) || accepted.requestRoute !== "ticketed") throw new Error("expected ticket");
      await server.whenIdle();
      revoke = true;
      const response = await residentRequest(paths, { requestRoute: "ticketed", operation: "collect", lifetime: server.lifetime,
        ticket: accepted.ticket, root, advicee: observation.advicee, dispatch });
      expect(response).toMatchObject({ requestRoute: "ticketed", status: "pending" });
      expect(server.stats().pendingAdvice).toBe(1);
    } finally {
      await server.close();
    }
  });
});
