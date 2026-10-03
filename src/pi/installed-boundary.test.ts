import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { configuredRules } from "../policy/rules.ts";
import { createPiExtension } from "./extension.ts";

type Handler = (event: any, context: any) => Promise<any>;
const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) {
    try {
      const owner = JSON.parse(readFileSync(join(root, "runtime", "owner.json"), "utf8")) as { pid: number };
      process.kill(owner.pid, "SIGTERM");
    } catch { /* A refused event need not start the resident. */ }
    rmSync(root, { recursive: true, force: true });
  }
});

const fixture = (gated = false) => {
  const root = mkdtempSync(join(tmpdir(), "hapsland-pi-boundary-"));
  roots.push(root);
  execFileSync("git", ["init", "--quiet", root]);
  const capturePath = join(root, "backend-calls");
  const handlers = new Map<string, Handler>();
  createPiExtension({
    command: [process.execPath, "--experimental-strip-types", join(process.cwd(), "src/cli.ts")],
    env: {
      ...process.env,
      REVIEW_RESIDENT_DIR: join(root, "runtime"),
      REVIEW_STATE_PATH: join(root, "state"),
      REVIEW_USER_CONFIG_PATH: join(root, "user.json"),
      ...(gated ? { REVIEW_RESIDENT_BACKEND_GATE_PATH: join(root, "backend.gate"), REVIEW_RESIDENT_CONTROLLED: "1" } : {}),
      REVIEW_CONTROL_JSON: JSON.stringify({ capturePath, answers: Object.fromEntries(configuredRules.map((rule) => [rule.id, { _tag: "Probability", probability: 0.9 }])) }),
    },
  })({ on: (name: string, handler: Handler) => { handlers.set(name, handler); } });
  const context = { cwd: root, sessionManager: { getSessionId: () => "pi-boundary-session" } };
  const call = async (name: string, event: unknown, ctx = context) => {
    const handler = handlers.get(name);
    expect(handler, `registered ${name} handler`).toBeDefined();
    return handler!(event, ctx);
  };
  return { root, capturePath, call, context };
};

const input = { path: "type.ts", edits: [{ oldText: "type Count = string", newText: "type OrderCount = number" }] };
const before = { toolName: "edit", toolCallId: "native-edit-1", input };
const result = {
  ...before, isError: false,
  content: [{ type: "text", text: "Successfully replaced text in type.ts." }],
  structuredContent: { nativeEditCount: 1 },
  details: { patch: "--- type.ts\n+++ type.ts\n@@ -1 +1 @@\n-type Count = string\n+type OrderCount = number\n" },
};

describe("Pi extension through the production command and resident", { timeout: 30_000 }, () => {
  it.each(["replaced", "final-refusal", "aborted"])("closes offered advice after %s composition and permits a fresh edit", async (composition) => {
    const { root, capturePath, call } = fixture(true);
    await call("tool_call", before);
    writeFileSync(join(root, "type.ts"), "type OrderCount = number\n");
    expect(await call("tool_result", result)).toBeUndefined();
    writeFileSync(join(root, "backend.gate"), "release\n");
    const offer = await call("agent_before_settle", { entries: [], continue: false, context: { canContinue: true }, outcome: "completed" });
    expect(offer).toMatchObject({ continue: true });
    expect(offer.entries[0].content).toContain("type.ts :: OrderCount");
    // A later native extension controls the final aggregate; the Hapsland ack
    // establishes an offer, and these mutations must never be called visibility.
    const final = { ...offer, entries: composition === "replaced" ? [] : offer.entries, continue: false, context: { canContinue: composition !== "final-refusal" }, outcome: composition === "aborted" ? "aborted" : "completed" };
    if (composition === "aborted") await call("agent_before_settle", final);
    expect(await call("agent_before_settle", { ...final, outcome: "completed" })).toBeUndefined();
    await call("agent_settled", final);
    const oldRequests = readFileSync(capturePath, "utf8");
    expect(await call("tool_result", result)).toBeUndefined();
    expect(readFileSync(capturePath, "utf8")).toBe(oldRequests);
    const fresh = { ...before, toolCallId: "fresh-after-composition" };
    await call("tool_call", fresh);
    const native = await call("tool_result", { ...result, ...fresh });
    const settled = await call("agent_before_settle", { entries: [], continue: false, context: { canContinue: true }, outcome: "completed" });
    expect(native ?? settled).toBeDefined();
  });

  it("rejects a patch for an unrelated current declaration rather than the native arguments", async () => {
    const { root, capturePath, call } = fixture();
    await call("tool_call", before);
    writeFileSync(join(root, "type.ts"), "type OtherCount = number\n");
    expect(await call("tool_result", { ...result, details: { patch: result.details.patch.replace("OrderCount", "OtherCount") } })).toBeUndefined();
    expect(existsSync(capturePath)).toBe(false);
  });
  it.each([true, false])("awaits a delayed review at finish with canContinue=%s", async (canContinue) => {
    const { root, capturePath, call } = fixture(true);
    await call("tool_call", before);
    writeFileSync(join(root, "type.ts"), "type OrderCount = number\n");
    expect(await call("tool_result", result)).toBeUndefined();
    const finishing = call("agent_before_settle", { entries: [{ type: "existing" }], continue: false, context: { canContinue }, outcome: "completed" });
    const timer = setTimeout(() => writeFileSync(join(root, "backend.gate"), "release\n"), 600);
    try {
      const settled = await finishing;
      expect(settled).toMatchObject({ continue: canContinue });
      expect(settled.entries[0]).toEqual({ type: "existing" });
      expect(settled.entries[1].content).toContain("type.ts :: OrderCount");
      expect(existsSync(capturePath)).toBe(true);
    } finally { clearTimeout(timer); }
  });
  it("reviews the post-edit source and preserves native content, consuming a permit once", async () => {
    const { root, capturePath, call } = fixture();
    // No source exists at before-tool time; only the native tool creates the post-image.
    await call("tool_call", before);
    expect(existsSync(capturePath)).toBe(false);
    writeFileSync(join(root, "type.ts"), "type OrderCount = number\n");
    const output = await call("tool_result", result);
    const settled = await call("agent_before_settle", { entries: [], continue: false, context: { canContinue: true }, outcome: "completed" });
    expect(existsSync(capturePath)).toBe(true);
    if (output !== undefined) {
      expect(output.content[0]).toEqual(result.content[0]);
      expect(output.structuredContent).toEqual(result.structuredContent);
      expect(output.content[1]).toMatchObject({ type: "text" });
      expect(output.content[1].text).toContain("type.ts :: OrderCount");
    } else {
      expect(settled).toMatchObject({ continue: true });
      expect(settled.entries[0].content).toContain("type.ts :: OrderCount");
    }
    const requests = readFileSync(capturePath, "utf8");
    expect(await call("tool_result", result)).toBeUndefined();
    expect(readFileSync(capturePath, "utf8")).toBe(requests);
  });
  it.each(["write", "bash"])("does not infer edit evidence for unsupported %s", async (toolName) => {
    const { root, capturePath, call } = fixture();
    const event = { ...before, toolName };
    await call("tool_call", event);
    writeFileSync(join(root, "type.ts"), "type OrderCount = number\n");
    expect(await call("tool_result", { ...result, ...event })).toBeUndefined();
    expect(existsSync(capturePath)).toBe(false);
  });

  it("refuses a successful result without a before-tool permit", async () => {
    const { root, capturePath, call } = fixture();
    writeFileSync(join(root, "type.ts"), "type OrderCount = number\n");
    expect(await call("tool_result", result)).toBeUndefined();
    expect(existsSync(capturePath)).toBe(false);
    const child = spawnSync(process.execPath, [join(process.cwd(), "src/cli.ts"), "--pi-hook", "--controlled-reviewer"], {
      encoding: "utf8",
      env: { ...process.env, REVIEW_STATE_PATH: join(root, "state"), REVIEW_RESIDENT_DIR: join(root, "runtime"), REVIEW_CONTROL_JSON: JSON.stringify({ capturePath, answers: Object.fromEntries(configuredRules.map(rule => [rule.id, { _tag: "Probability", probability: 0.9 }])) }) },
      input: JSON.stringify({ host_version: "1.0.0", operation: "edit", cwd: root, session_id: "pi-boundary-session", tool_use_id: before.toolCallId, tool_name: "edit", input, details: result.details, isError: false }),
    });
    expect(child.status).toBe(0);
    expect(existsSync(capturePath)).toBe(false);
  });

  it.each(["identity", "arguments", "source", "failed", "unicode"])("does not review %s mismatches", async (variant) => {
    const { root, capturePath, call } = fixture();
    await call("tool_call", before);
    writeFileSync(join(root, "type.ts"), variant === "source" ? "type Other = boolean\n" : "type OrderCount = number\n");
    const event = {
      ...result,
      ...(variant === "identity" ? { toolCallId: "another-edit" } : {}),
      ...(variant === "arguments" ? { input: { ...input, path: "another.ts" } } : {}),
      ...(variant === "failed" ? { isError: true } : {}),
      ...(variant === "unicode" ? { details: { patch: result.details.patch.replace("OrderCount", "OrdérCount") } } : {}),
    };
    expect(await call("tool_result", event)).toBeUndefined();
    expect(existsSync(capturePath)).toBe(false);
  });

  it.each([
    { name: "session_before_switch", event: {} },
    { name: "session_shutdown", event: {} },
    { name: "agent_end", event: { outcome: "aborted" } },
    { name: "agent_end", event: { outcome: "error" } },
  ])("retires pending permits on $name $event.outcome", async ({ name, event }) => {
    const { root, capturePath, call } = fixture();
    await call("tool_call", before);
    await call(name, event);
    writeFileSync(join(root, "type.ts"), "type OrderCount = number\n");
    expect(await call("tool_result", result)).toBeUndefined();
    expect(existsSync(capturePath)).toBe(false);
    const fresh = { ...before, toolCallId: "fresh-after-cleanup" };
    await call("tool_call", fresh);
    const native = await call("tool_result", { ...result, ...fresh });
    const settled = await call("agent_before_settle", { entries: [], continue: false, context: { canContinue: true }, outcome: "completed" });
    expect(native ?? settled).toBeDefined();
    expect(existsSync(capturePath)).toBe(true);
  });
});
