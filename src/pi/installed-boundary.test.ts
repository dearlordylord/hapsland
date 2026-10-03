import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { configuredRules } from "../policy/rules.ts";
import { setupInstalledPi, cleanupInstalledPi, cleanupPiFixtures, installedCommand, fixture, input, before, result } from "../test-support/pi-installed.ts";

describe.each(["source", "installed"] as const)("Pi %s extension through the production command and resident", { timeout: 30_000 }, (mode) => {
  beforeAll(() => setupInstalledPi(mode), 240_000);
  afterAll(cleanupInstalledPi);
  afterEach(cleanupPiFixtures);
  it("waits for every unfinished review after the first finding is ready", async () => {
    const control = { delayMs: 500 };
    const { root, call, reload } = fixture(true, control);
    await call("tool_call", before);
    writeFileSync(join(root, "type.ts"), "type OrderCount = number\n");
    expect(await call("tool_result", result)).toBeUndefined();
    control.delayMs = 2_000;
    reload();
    const other = { ...before, toolCallId: "slow-second", input: { path: "other.ts", edits: [{ oldText: "type Before = string", newText: "type OtherCount = number" }] } };
    await call("tool_call", other);
    writeFileSync(join(root, "other.ts"), "type OtherCount = number\n");
    expect(await call("tool_result", { ...result, ...other, details: { patch: "--- other.ts\n+++ other.ts\n@@ -1 +1 @@\n-type Before = string\n+type OtherCount = number\n" } })).toBeUndefined();
    let completed = false;
    const finishing = call("agent_before_settle", { entries: [], continue: false, context: { canContinue: true }, outcome: "completed" }).then(value => { completed = true; return value; });
    writeFileSync(join(root, "backend.gate"), "release\n");
    await new Promise(resolve => setTimeout(resolve, 1_000));
    expect(completed).toBe(false);
    const settled = await finishing;
    expect(settled).toMatchObject({ continue: true });
    expect(JSON.stringify(settled.entries)).toContain("OrderCount");
    expect(JSON.stringify(settled.entries)).toContain("OtherCount");
  });
  it("exhausts the shared four-continuation allowance across distinct edits in one round", async () => {
    const { root, call } = fixture(false, { delayMs: 700 });
    let oldText = "type InitialCount = string";
    for (let index = 1; index <= 5; index++) {
      const newText = `type Count${index} = number`;
      const nativeInput = { path: "type.ts", edits: [{ oldText, newText }] };
      const nativeCall = { toolName: "edit", toolCallId: `budget-edit-${index}`, input: nativeInput };
      await call("tool_call", nativeCall);
      writeFileSync(join(root, "type.ts"), `${newText}\n`);
      expect(await call("tool_result", { ...result, ...nativeCall, details: { patch: `--- type.ts\n+++ type.ts\n@@ -1 +1 @@\n-${oldText}\n+${newText}\n` } })).toBeUndefined();
      const offer = await call("agent_before_settle", { entries: [], continue: false, context: { canContinue: true }, outcome: "completed" });
      if (index <= 4) expect(offer).toMatchObject({ continue: true });
      else expect(offer?.continue ?? false).toBe(false);
      oldText = newText;
    }
  }, 120_000);

  it.each(["clear", "unavailable"])("does not continue when review is %s", async (outcome) => {
    const control = outcome === "clear"
      ? { answers: Object.fromEntries(configuredRules.map(rule => [rule.id, { _tag: "Probability", probability: 0 }])) }
      : { failure: "offline reviewer unavailable" };
    const { root, call } = fixture(false, control);
    await call("tool_call", before);
    writeFileSync(join(root, "type.ts"), "type OrderCount = number\n");
    const native = await call("tool_result", result);
    const settled = await call("agent_before_settle", { entries: [], continue: false, context: { canContinue: true }, outcome: "completed" });
    expect(native?.content?.slice(result.content.length) ?? []).toEqual([]);
    expect(settled?.continue ?? false).toBe(false);
  });

  it("cuts off delayed work at finish and withholds its late finding from a fresh edit", async () => {
    const { root, call } = fixture(true);
    await call("tool_call", before);
    writeFileSync(join(root, "type.ts"), "type OrderCount = number\n");
    expect(await call("tool_result", result)).toBeUndefined();
    const other = { ...before, toolCallId: "second-unfinished", input: { path: "other.ts", edits: [{ oldText: "type Before = string", newText: "type OtherCount = number" }] } };
    await call("tool_call", other);
    writeFileSync(join(root, "other.ts"), "type OtherCount = number\n");
    expect(await call("tool_result", { ...result, ...other, details: { patch: "--- other.ts\n+++ other.ts\n@@ -1 +1 @@\n-type Before = string\n+type OtherCount = number\n" } })).toBeUndefined();
    const cutoff = await call("agent_before_settle", { entries: [], continue: false, context: { canContinue: true }, outcome: "completed" });
    expect(cutoff).toBeUndefined();
    await call("agent_settled", {});
    writeFileSync(join(root, "backend.gate"), "release\n");
    const newText = "type FreshCount = number";
    const fresh = { ...before, toolCallId: "after-cutoff", input: { path: "type.ts", edits: [{ oldText: "type OrderCount = number", newText }] } };
    await call("tool_call", fresh);
    writeFileSync(join(root, "type.ts"), `${newText}\n`);
    const output = await call("tool_result", { ...result, ...fresh, details: { patch: "--- type.ts\n+++ type.ts\n@@ -1 +1 @@\n-type OrderCount = number\n+type FreshCount = number\n" } });
    const settled = await call("agent_before_settle", { entries: [], continue: false, context: { canContinue: true }, outcome: "completed" });
    const offered = JSON.stringify(output ?? settled);
    expect(offered).toContain("FreshCount");
    expect(offered).not.toContain("OrderCount");
    expect(offered).not.toContain("OtherCount");
  });

  it("abandons admitted delayed work on session switch before reviewing a fresh edit", async () => {
    const { root, call } = fixture(true);
    await call("tool_call", before);
    writeFileSync(join(root, "type.ts"), "type OrderCount = number\n");
    expect(await call("tool_result", result)).toBeUndefined();
    await call("session_before_switch", {});
    writeFileSync(join(root, "backend.gate"), "release\n");
    expect(await call("tool_result", result)).toBeUndefined();
    const fresh = { ...before, toolCallId: "after-admitted-switch" };
    await call("tool_call", fresh);
    const output = await call("tool_result", { ...result, ...fresh });
    const settled = await call("agent_before_settle", { entries: [], continue: false, context: { canContinue: true }, outcome: "completed" });
    expect(output ?? settled).toBeDefined();
  });
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
      expect(settled).toMatchObject({ continue: true });
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
    const child = spawnSync(installedCommand[0]!, [...installedCommand.slice(1), "--pi-hook", "--controlled-reviewer"], {
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
    { name: "agent_settled", event: {} },
  ])("retires pending permits on $name", async ({ name, event }) => {
    const { root, capturePath, call } = fixture();
    await call("agent_start", {});
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
