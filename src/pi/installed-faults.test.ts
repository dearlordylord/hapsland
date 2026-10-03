import { existsSync, readFileSync, writeFileSync, symlinkSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { configuredRules } from "../policy/rules.ts";
import { setupInstalledPi, cleanupInstalledPi, cleanupPiFixtures, fixture, before, result, installedCommand } from "../test-support/pi-installed.ts";

afterEach(async () => { vi.restoreAllMocks(); await cleanupPiFixtures(); });
const settle = { entries: [], continue: false, context: { canContinue: true }, outcome: "completed" };
const source = "type OrderCount = number\n";
const freshAdvice = async (f: ReturnType<typeof fixture>, id = "fresh-after-fault") => {
  const edit = { ...before, toolCallId: id };
  await f.call("tool_call", edit);
  writeFileSync(join(f.root, "type.ts"), source);
  const native = await f.call("tool_result", { ...result, ...edit });
  const finish = await f.call("agent_before_settle", settle);
  expect(native ?? finish).toBeDefined();
  expect(JSON.stringify(native ?? finish)).toContain("type.ts :: OrderCount");
};
const recoveryEdit = async (f: ReturnType<typeof fixture>, id: string, oldText: string, newText: string) => {
  const edit = { ...before, toolCallId: id, input: { path: "type.ts", edits: [{ oldText, newText }] } };
  await f.call("tool_call", edit);
  writeFileSync(join(f.root, "type.ts"), `${newText}\n`);
  const patch = `--- type.ts\n+++ type.ts\n@@ -1 +1 @@\n-${oldText}\n+${newText}\n`;
  const native = await f.call("tool_result", { ...result, ...edit, details: { patch } });
  const finish = await f.call("agent_before_settle", settle);
  return native ?? finish;
};
const recoverAfterLoss = async (f: ReturnType<typeof fixture>) => {
  // A real edit triggers automatic startup; its event may be lost during recovery.
  const first = await recoveryEdit(f, "recovery-start", "type OrderCount = number", "type RecoveryCount = number");
  if (first !== undefined) expect(JSON.stringify(first)).toContain("type.ts :: RecoveryCount");
  // This only observes the automatically started resident through owner + IPC stats.
  await f.waitForWork(0);
  const second = await recoveryEdit(f, "recovery-after-ready", "type RecoveryCount = number", "type RecoveryFinalCount = number");
  expect(second).toBeDefined();
  expect(JSON.stringify(second)).toContain("type.ts :: RecoveryFinalCount");
};
const waitFile = async (path: string) => {
  const deadline = Date.now() + 10_000;
  while (!existsSync(path) && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 20));
  expect(existsSync(path), `observed source-free fault marker ${path}`).toBe(true);
};

// Only the source-free command envelope is intercepted. All nonfaulted calls
// forward the installed CLI unchanged into its production resident.
const faultWrapper = (_cli: string, root: string) => {
  const path = join(root, "command-fault.cjs");
  writeFileSync(path, `const fs=require('node:fs');const cp=require('node:child_process');const path=require('node:path');let input='';process.stdin.on('data',b=>input+=b);process.stdin.on('end',()=>{const event=JSON.parse(input);const fault=path.join(${JSON.stringify(root)},'fault.json');const config=fs.existsSync(fault)?JSON.parse(fs.readFileSync(fault,'utf8')):{};const hit=event.operation===config.operation;if(hit){fs.writeFileSync(path.join(${JSON.stringify(root)},'fault-hit'),'observed');if(config.mode==='crash')process.exit(9);if(config.mode==='timeout'){setTimeout(()=>{},20000);return;}}const child=cp.spawn(${JSON.stringify(installedCommand[0])},[...${JSON.stringify(installedCommand.slice(1))},...process.argv.slice(2)],{env:process.env,stdio:['pipe','pipe','inherit']});let output='';child.stdout.on('data',b=>output+=b);child.on('close',code=>{if(hit&&config.mode.startsWith('admitted-')){fs.writeFileSync(path.join(${JSON.stringify(root)},'admitted-fault'),'observed');if(config.mode==='admitted-crash')process.exit(9);setTimeout(()=>{},20000);return;}if(hit&&config.mode==='delay-ack'){fs.writeFileSync(path.join(${JSON.stringify(root)},'ack-ready'),'observed');const poll=setInterval(()=>{if(fs.existsSync(path.join(${JSON.stringify(root)},'ack-release'))){clearInterval(poll);process.stdout.write(output);process.exit(code??1);}},20);}else{process.stdout.write(output);process.exit(code??1);}});child.stdin.end(input);});`);
  return [process.execPath, path];
};

describe.each(["source", "installed"] as const)("%s Pi lifecycle and concurrent fault isolation", { timeout: 45_000 }, mode => {
  beforeAll(() => setupInstalledPi(mode), 240_000);
  afterAll(cleanupInstalledPi);
  it.each(["crash", "timeout"])("registration command %s cannot invent admission and a fresh edit recovers", async mode => {
    const f = fixture(false, {}, { commandFactory: faultWrapper });
    writeFileSync(join(f.root, "fault.json"), JSON.stringify({ operation: "before", mode }));
    expect(await f.call("tool_call", before)).toBeUndefined();
    writeFileSync(join(f.root, "type.ts"), source);
    expect(await f.call("tool_result", result)).toBeUndefined();
    expect(existsSync(f.capturePath)).toBe(false);
    writeFileSync(join(f.root, "fault.json"), "{}");
    await recoverAfterLoss(f);
  });

  it.each(["crash", "timeout"])("an admitted hook worker %s closes incomplete work without advice replay", async fault => {
    const f = fixture(false, { delayMs: 1_000 }, { commandFactory: faultWrapper });
    await f.prepareResident();
    await f.call("agent_start", {});
    await f.call("tool_call", before);
    writeFileSync(join(f.root, "type.ts"), source);
    writeFileSync(join(f.root, "fault.json"), JSON.stringify({ operation: "edit", mode: `admitted-${fault}` }));
    const editing = f.call("tool_result", result);
    await waitFile(f.capturePath); // Actual production admission reached the controlled evaluator.
    await waitFile(join(f.root, "admitted-fault"));
    expect(await editing).toBeUndefined();
    await f.call("agent_settled", { outcome: "aborted" });
    expect(await f.call("agent_before_settle", settle)).toBeUndefined();
    expect(await f.call("tool_result", result)).toBeUndefined();
    writeFileSync(join(f.root, "fault.json"), "{}");
    await freshAdvice(f);
  });

  it.each(["session", "root"])("late admitted advice stays isolated after the current %s changes", async partition => {
    const f = fixture(false, { delayMs: 1_000 });
    const other = fixture();
    const current = {
      cwd: partition === "root" ? other.root : f.root,
      sessionManager: { getSessionId: () => partition === "session" ? "another-pi-session" : "pi-boundary-session" },
    };
    await f.prepareResident();
    await f.call("agent_start", {});
    await f.call("tool_call", before);
    writeFileSync(join(f.root, "type.ts"), source);
    const editing = f.call("tool_result", result);
    await waitFile(f.capturePath);
    await f.call("session_before_switch", {}, current);
    expect(await editing).toBeUndefined();
    expect(await f.call("agent_before_settle", settle, current)).toBeUndefined();
    expect(await f.call("tool_result", result, current)).toBeUndefined();
    const fresh = { ...before, toolCallId: "fresh-in-new-partition" };
    await f.call("agent_start", {}, current);
    await f.call("tool_call", fresh, current);
    writeFileSync(join(current.cwd, "type.ts"), source);
    const native = await f.call("tool_result", { ...result, ...fresh }, current);
    const finish = await f.call("agent_before_settle", settle, current);
    expect(JSON.stringify(native ?? finish)).toContain("type.ts :: OrderCount");
    await f.call("agent_settled", {}, current);
    expect(await f.call("agent_before_settle", settle, f.context)).toBeUndefined();
  });

  it("resident loss during admitted review withholds its finding and allows fresh recovery", async () => {
    const f = fixture(false, { delayMs: 2_000 });
    await f.prepareResident();
    await f.call("agent_start", {});
    await f.call("tool_call", before);
    writeFileSync(join(f.root, "type.ts"), source);
    const editing = f.call("tool_result", result);
    await waitFile(f.capturePath);
    const owner = JSON.parse(readFileSync(join(f.root, "runtime/owner.json"), "utf8"));
    process.kill(owner.pid, "SIGKILL");
    expect(await editing).toBeUndefined();
    await f.call("agent_settled", { outcome: "aborted" });
    expect(await f.call("agent_before_settle", settle)).toBeUndefined();
    await recoverAfterLoss(f);
  });

  it.each(["excluded", "symlink"])("%s current source never reaches review egress", async variant => {
    const f = fixture();
    if (variant === "excluded") writeFileSync(join(f.root, "user.json"), JSON.stringify({ version: 1, excludes: ["type.ts"] }));
    await f.call("tool_call", before);
    if (variant === "symlink") {
      writeFileSync(join(f.root, "target.ts"), source);
      symlinkSync(join(f.root, "target.ts"), join(f.root, "type.ts"));
    } else writeFileSync(join(f.root, "type.ts"), source);
    expect(await f.call("tool_result", result)).toBeUndefined();
    expect(await f.call("agent_before_settle", settle)).toBeUndefined();
    expect(existsSync(f.capturePath)).toBe(false);
    if (variant === "excluded") writeFileSync(join(f.root, "user.json"), JSON.stringify({ version: 1 }));
    else unlinkSync(join(f.root, "type.ts"));
    await freshAdvice(f);
  });

  it("resident loss retires the old admission without replay and permits fresh work", async () => {
    const f = fixture();
    await f.prepareResident();
    await f.call("tool_call", before);
    const owner = JSON.parse(readFileSync(join(f.root, "runtime/owner.json"), "utf8"));
    process.kill(owner.pid, "SIGKILL");
    await new Promise(resolve => setTimeout(resolve, 100));
    writeFileSync(join(f.root, "type.ts"), source);
    expect(await f.call("tool_result", result)).toBeUndefined();
    expect(existsSync(f.capturePath)).toBe(false);
    await recoverAfterLoss(f);
  });

  it("an expired native permit cannot review its late result", async () => {
    const f = fixture();
    await f.call("tool_call", before);
    writeFileSync(join(f.root, "type.ts"), source);
    const realNow = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(realNow + 30_001);
    expect(await f.call("tool_result", result)).toBeUndefined();
    vi.restoreAllMocks();
    expect(existsSync(f.capturePath)).toBe(false);
    await freshAdvice(f);
  });

  it("a delayed acknowledgment cannot cross a session-switch epoch", async () => {
    const f = fixture(true, {}, { commandFactory: faultWrapper });
    await f.prepareResident();
    await f.call("tool_call", before);
    writeFileSync(join(f.root, "type.ts"), source);
    expect(await f.call("tool_result", result)).toBeUndefined();
    writeFileSync(join(f.root, "backend.gate"), "release");
    writeFileSync(join(f.root, "fault.json"), JSON.stringify({ operation: "ack", mode: "delay-ack" }));
    const finishing = f.call("agent_before_settle", settle);
    await waitFile(join(f.root, "ack-ready"));
    await f.call("session_before_switch", {});
    writeFileSync(join(f.root, "ack-release"), "release");
    expect(await finishing).toBeUndefined();
    writeFileSync(join(f.root, "fault.json"), "{}");
    await freshAdvice(f);
  });

  it("native abort settlement closes admitted work without a pre-settle callback", async () => {
    const f = fixture(true);
    await f.prepareResident();
    await f.call("agent_start", {});
    await f.call("tool_call", before);
    writeFileSync(join(f.root, "type.ts"), source);
    expect(await f.call("tool_result", result)).toBeUndefined();
    await f.waitForWork(1);
    await f.call("agent_settled", { outcome: "aborted" });
    writeFileSync(join(f.root, "backend.gate"), "release");
    expect(await f.call("agent_before_settle", settle)).toBeUndefined();
    await freshAdvice(f);
  });

  it("reload preserves the closed old partition and requires fresh native admission", async () => {
    const f = fixture();
    await f.prepareResident();
    await f.call("tool_call", before);
    await f.call("session_shutdown", {});
    f.reload();
    writeFileSync(join(f.root, "type.ts"), source);
    expect(await f.call("tool_result", result)).toBeUndefined();
    expect(existsSync(f.capturePath)).toBe(false);
    await freshAdvice(f);
  });

  // Competing handlers can mutate these API objects after Pi produces a valid
  // native edit shape. These values are refusal cases, not supported profiles.
  const invalidSerializable = (variant: string, base: object = {}): unknown => {
    if (variant === "undefined") return undefined;
    if (variant === "bigint") return { ...base, nativeMutation: 1n };
    const cyclic: Record<string, unknown> = { ...base };
    cyclic.nativeMutation = cyclic;
    return cyclic;
  };
  it.each(["undefined", "cyclic", "bigint"])("mutated %s before input stays quiet without registering a permit", async variant => {
    const f = fixture();
    expect(await f.call("tool_call", { ...before, input: invalidSerializable(variant, before.input) })).toBeUndefined();
    expect(existsSync(join(f.root, "runtime/owner.json"))).toBe(false);
    writeFileSync(join(f.root, "type.ts"), source);
    expect(await f.call("tool_result", result)).toBeUndefined();
    expect(existsSync(f.capturePath)).toBe(false);
    // Only the fresh positive control assumes readiness; the refused input
    // above must not create an owner or send source to the reviewer.
    await f.prepareResident();
    await freshAdvice(f);
  });

  it.each([
    ["input", "undefined"], ["input", "cyclic"], ["input", "bigint"],
    ["details", "cyclic"], ["details", "bigint"],
    ["content", "undefined"], ["content", "object"],
    ["content", "null-item"], ["content", "missing-text"], ["content", "bad-image"],
  ])("mutated result %s/%s retires admission without review or invented output", async (field, variant) => {
    const f = fixture();
    await f.prepareResident();
    await f.call("tool_call", before);
    writeFileSync(join(f.root, "type.ts"), source);
    const values: Record<string, unknown> = { object: { competingExtension: true }, "null-item": [null], "missing-text": [{ type: "text" }], "bad-image": [{ type: "image", data: 42, mimeType: "image/png" }] };
    const value = Object.hasOwn(values, variant) ? values[variant] : invalidSerializable(variant, field === "input" ? result.input : result.details);
    expect(await f.call("tool_result", { ...result, [field]: value })).toBeUndefined();
    expect(await f.call("tool_result", result)).toBeUndefined();
    expect(await f.call("agent_before_settle", settle)).toBeUndefined();
    expect(existsSync(f.capturePath)).toBe(false);
    await freshAdvice(f);
  });

  it("valid competing image content preserves native output while admitting review", async () => {
    const f = fixture();
    await f.prepareResident();
    const image = { type: "image", data: "aW1hZ2U=", mimeType: "image/png" };
    const content = [...result.content, image];
    await f.call("tool_call", before);
    writeFileSync(join(f.root, "type.ts"), source);
    const native = await f.call("tool_result", { ...result, content });
    const finish = await f.call("agent_before_settle", settle);
    expect(existsSync(f.capturePath)).toBe(true);
    expect(JSON.stringify(native ?? finish)).toContain("type.ts :: OrderCount");
    expect(content).toEqual([...result.content, image]);
    if (native !== undefined) expect(native.content.slice(0, content.length)).toEqual(content);
  });

  it.each(["arguments", "patch"])("later %s mutation cannot redirect an admitted edit", async variant => {
    const f = fixture();
    await f.prepareResident();
    const native = structuredClone(before);
    await f.call("tool_call", native);
    writeFileSync(join(f.root, "type.ts"), source);
    writeFileSync(join(f.root, "other.ts"), "type Other = number\n");
    const changed = structuredClone(result);
    if (variant === "arguments") changed.input.path = "other.ts";
    else changed.details.patch = "--- other.ts\n+++ other.ts\n@@ -1 +1 @@\n-type Other = string\n+type Other = number\n";
    expect(await f.call("tool_result", changed)).toBeUndefined();
    expect(existsSync(f.capturePath)).toBe(false);
    expect(await f.call("tool_result", result)).toBeUndefined();
    await freshAdvice(f);
  });

  it("a newer overlapping edit suppresses a delayed finding from the older source", async () => {
    const f = fixture(false, { delayMs: 650, findingOnSourceIncludes: "number", answers: Object.fromEntries(configuredRules.map(rule => [rule.id, { _tag: "Probability", probability: 0 }])) });
    await f.prepareResident();
    await f.call("tool_call", before);
    writeFileSync(join(f.root, "type.ts"), source);
    const older = f.call("tool_result", result);
    await waitFile(f.capturePath);
    const input = { path: "type.ts", edits: [{ oldText: "type OrderCount = number", newText: "type OrderCount = string" }] };
    const edit = { toolName: "edit", toolCallId: "overlap-newer", input };
    await f.call("tool_call", edit);
    writeFileSync(join(f.root, "type.ts"), "type OrderCount = string\n");
    const newer = f.call("tool_result", { ...result, ...edit, details: { patch: "--- type.ts\n+++ type.ts\n@@ -1 +1 @@\n-type OrderCount = number\n+type OrderCount = string\n" } });
    const outputs = [await older, await newer, await f.call("agent_before_settle", settle)];
    expect(JSON.stringify(outputs)).not.toContain("Check these findings. Fix valid issues and verify; otherwise explain why.");
    expect(outputs.every(output => output === undefined || output.continue !== true)).toBe(true);
    await f.call("agent_settled", {});
    await freshAdvice(f);
  });
});
