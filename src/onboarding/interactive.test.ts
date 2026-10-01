import { spawn, execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, expect, it } from "vitest";
const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
const fixture = () => {
  const root = mkdtempSync(join(tmpdir(), "hapsland-interactive-")); roots.push(root);
  const repository = join(root, "repo"); mkdirSync(repository); execFileSync("git", ["init", "--quiet", repository]);
  const environment = { ...process.env, TYPESAFE_API_KEY: "interactive-test-key", REVIEW_USER_CONFIG_PATH: join(root, "user.jsonc"), REVIEW_STATE_PATH: join(root, "state") };
  return { root, repository, environment };
};
const terminal = async (test: ReturnType<typeof fixture>, args: string[], answer: "y" | "n") => {
  const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;
  const command = [process.execPath, join(process.cwd(), "src/cli.ts"), ...args].map(quote).join(" ");
  const child = spawn("script", ["-qfec", command, "/dev/null"], { cwd: test.repository, env: test.environment, stdio: ["pipe", "pipe", "pipe"] });
  let output = ""; let answered = false;
  child.stdout.on("data", (chunk: Buffer) => {
    output += chunk.toString();
    if (!answered && output.includes("[y/N]")) { answered = true; child.stdin.write(`${answer}\n`); }
  });
  child.stderr.on("data", (chunk: Buffer) => { output += chunk.toString(); });
  const code = await new Promise<number | null>((resolve, reject) => {
    const timer = setTimeout(() => { child.kill("SIGKILL"); reject(new Error("interactive command timed out")); }, 15_000);
    child.once("close", code => { clearTimeout(timer); resolve(code); });
    child.once("error", error => { clearTimeout(timer); reject(error); });
  });
  expect(output).not.toContain("interactive-test-key");
  return { code, output, answered };
};
it.skipIf(process.platform !== "linux")("guided Claude setup installs and reports native trust without requiring JSON", async () => {
  const test = fixture(); const home = join(test.root, "claude-home");
  const host = join(test.root, "claude"); writeFileSync(host, "#!/bin/sh\nprintf '2.1.218\\n'\n", { mode: 0o700 });
  const result = await terminal(test, ["setup", "claude", `--claude-home=${home}`, `--claude-executable=${host}`], "y");
  expect(result.code).toBe(0); expect(result.answered).toBe(true);
  expect(readFileSync(join(home, "settings.json"), "utf8")).toContain("--composed-host=claude-code");
  expect(result.output).toContain("native Claude Code");
});
it.skipIf(process.platform !== "linux")("declining guided setup leaves Claude settings absent", async () => {
  const test = fixture(); const home = join(test.root, "claude-home");
  const host = join(test.root, "claude"); writeFileSync(host, "#!/bin/sh\nprintf '2.1.218\\n'\n", { mode: 0o700 });
  const result = await terminal(test, ["setup", "claude", `--claude-home=${home}`, `--claude-executable=${host}`], "n");
  expect(result.code).toBe(0); expect(existsSync(join(home, "settings.json"))).toBe(false);
});
const updaterFixture = (test: ReturnType<typeof fixture>) => {
  const target = join(test.root, "target"); const requests = join(test.root, "requests.jsonl");
  writeFileSync(target, `#!/usr/bin/env node\nconst fs=require('node:fs');const r=JSON.parse(fs.readFileSync(0,'utf8'));fs.appendFileSync(${JSON.stringify(requests)},JSON.stringify(r)+'\\n');if(r.operation==='update-preview')console.log(JSON.stringify({status:'preview',proposal:{digest:'${"a".repeat(64)}',changes:[]}}));else console.log(JSON.stringify({status:'complete'}));\n`, { mode: 0o700 });
  return { target, requests };
};
it.skipIf(process.platform !== "linux")("interactive update carries the exact preview digest and selected home to the target", async () => {
  const test = fixture(); const target = updaterFixture(test); const home = join(test.root, "claude-home");
  const result = await terminal(test, ["update", "claude", `--target=${target.target}`, `--claude-home=${home}`], "y");
  expect(result.code).toBe(0);
  const requests = readFileSync(target.requests, "utf8").trim().split("\n").map(line => JSON.parse(line));
  expect(requests).toEqual([
    { version: 1, operation: "update-preview", host: "claude", claudeHome: home },
    { version: 1, operation: "update", host: "claude", claudeHome: home, proposalDigest: "a".repeat(64) },
  ]);
  expect(result.output).toContain("restart claude");
});
it.skipIf(process.platform !== "linux")("declining update performs only a read-only preview", async () => {
  const test = fixture(); const target = updaterFixture(test);
  const result = await terminal(test, ["update", "codex", `--target=${target.target}`], "n");
  expect(result.code).toBe(0);
  expect(readFileSync(target.requests, "utf8").trim().split("\n")).toHaveLength(1);
});
it.skipIf(process.platform !== "linux")("guided Codex setup installs through the named client command", async () => {
  const test = fixture(); const home = join(test.root, "codex-home");
  const host = join(test.root, "codex"); writeFileSync(host, "#!/bin/sh\nprintf 'codex-cli 0.155.1\\n'\n", { mode: 0o700 });
  const result = await terminal(test, ["setup", "codex", `--codex-home=${home}`, `--codex-executable=${host}`], "y");
  expect(result.code).toBe(0); expect(result.answered).toBe(true);
  expect(readFileSync(join(home, "hooks.json"), "utf8")).toContain("--composed-host=codex-cli");
  expect(result.output).toContain("native Codex");
});
