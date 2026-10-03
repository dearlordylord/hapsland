import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { configuredRules } from "../policy/rules.ts";
import { setupInstalledPi, cleanupInstalledPi, cleanupPiFixtures, fixture, before, result } from "../test-support/pi-installed.ts";

afterEach(() => { vi.restoreAllMocks(); cleanupPiFixtures(); });
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
const waitFile = async (path: string) => {
  const deadline = Date.now() + 10_000;
  while (!existsSync(path) && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 20));
  expect(existsSync(path), `observed source-free fault marker ${path}`).toBe(true);
};

// Only the source-free command envelope is intercepted. All nonfaulted calls
// forward the installed CLI unchanged into its production resident.
const faultWrapper = (cli: string, root: string) => {
  const path = join(root, "command-fault.cjs");
  writeFileSync(path, `const fs=require('node:fs');const cp=require('node:child_process');const path=require('node:path');let input='';process.stdin.on('data',b=>input+=b);process.stdin.on('end',()=>{const event=JSON.parse(input);const fault=path.join(${JSON.stringify(root)},'fault.json');const config=fs.existsSync(fault)?JSON.parse(fs.readFileSync(fault,'utf8')):{};const hit=event.operation===config.operation;if(hit){fs.writeFileSync(path.join(${JSON.stringify(root)},'fault-hit'),'observed');if(config.mode==='crash')process.exit(9);if(config.mode==='timeout'){setTimeout(()=>{},20000);return;}}const child=cp.spawn(process.execPath,['--experimental-strip-types',${JSON.stringify(cli)},...process.argv.slice(2)],{env:process.env,stdio:['pipe','pipe','inherit']});let output='';child.stdout.on('data',b=>output+=b);child.on('close',code=>{if(hit&&config.mode==='delay-ack'){fs.writeFileSync(path.join(${JSON.stringify(root)},'ack-ready'),'observed');const poll=setInterval(()=>{if(fs.existsSync(path.join(${JSON.stringify(root)},'ack-release'))){clearInterval(poll);process.stdout.write(output);process.exit(code??1);}},20);}else{process.stdout.write(output);process.exit(code??1);}});child.stdin.end(input);});`);
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
    await freshAdvice(f);
  });

  it("resident loss retires the old admission without replay and permits fresh work", async () => {
    const f = fixture();
    await f.call("tool_call", before);
    const owner = JSON.parse(readFileSync(join(f.root, "runtime/owner.json"), "utf8"));
    process.kill(owner.pid, "SIGKILL");
    await new Promise(resolve => setTimeout(resolve, 100));
    writeFileSync(join(f.root, "type.ts"), source);
    expect(await f.call("tool_result", result)).toBeUndefined();
    expect(existsSync(f.capturePath)).toBe(false);
    await freshAdvice(f);
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
    await f.call("agent_start", {});
    await f.call("tool_call", before);
    writeFileSync(join(f.root, "type.ts"), source);
    expect(await f.call("tool_result", result)).toBeUndefined();
    await f.call("agent_settled", { outcome: "aborted" });
    writeFileSync(join(f.root, "backend.gate"), "release");
    expect(await f.call("agent_before_settle", settle)).toBeUndefined();
    await freshAdvice(f);
  });

  it("reload preserves the closed old partition and requires fresh native admission", async () => {
    const f = fixture();
    await f.call("tool_call", before);
    await f.call("session_shutdown", {});
    f.reload();
    writeFileSync(join(f.root, "type.ts"), source);
    expect(await f.call("tool_result", result)).toBeUndefined();
    expect(existsSync(f.capturePath)).toBe(false);
    await freshAdvice(f);
  });

  it.each(["arguments", "patch"])("later %s mutation cannot redirect an admitted edit", async variant => {
    const f = fixture();
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
