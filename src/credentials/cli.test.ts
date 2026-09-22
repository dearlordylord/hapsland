import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

describe("public credential CLI", () => {
  it("logs in from explicit stdin without exposing the value and reports the surviving environment override on logout", () => {
    const root = mkdtempSync(join(tmpdir(), "credential-cli-"));
    const helper = join(root, "helper.mjs");
    const vault = join(root, "vault");
    const state = join(root, "state.json");
    const marker = "synthetic-cli-secret-marker";
    const entrypoint = join(process.cwd(), "src", "cli.ts");
    spawnSync("git", ["init", "--quiet"], { cwd: root });
    writeFileSync(join(root, ".review.jsonc"), '{"version":1,"credentialEnvVar":"ALT_KEY"}\n');
    writeFileSync(helper, `#!/usr/bin/env node
import { existsSync, rmSync, writeFileSync } from "node:fs";
const operation = process.argv[2]; const vault = process.env.TEST_SECRET_VAULT;
if (operation === "probe") console.log('{"version":1,"status":"available"}');
else if (operation === "set") { const chunks=[]; for await (const chunk of process.stdin) chunks.push(chunk); writeFileSync(vault, Buffer.concat(chunks), {mode:0o600}); console.log('{"version":1,"status":"stored"}'); }
else if (operation === "delete") { const found=existsSync(vault); rmSync(vault,{force:true}); console.log(JSON.stringify({version:1,status:found?"deleted":"missing"})); }
`);
    chmodSync(helper, 0o700);
    const environment: Record<string, string | undefined> = {
      ...process.env,
      REVIEW_CREDENTIAL_HELPER: helper,
      REVIEW_CREDENTIAL_STATE_PATH: state,
      TEST_SECRET_VAULT: vault,
    };
    delete environment.TYPESAFE_API_KEY;
    const login = spawnSync(process.execPath, [entrypoint, "--login", "--credential-stdin"], {
      cwd: root, env: environment, input: `${marker}\n`, encoding: "utf8",
    });
    expect(login.status).toBe(0);
    expect(JSON.parse(login.stdout)).toMatchObject({
      operation: "login", status: "stored", stored: true, paidVerificationPerformed: false,
    });
    expect(`${login.stdout}${login.stderr}`).not.toContain(marker);

    const logout = spawnSync(process.execPath, [entrypoint, "--logout"], {
      cwd: root, env: { ...environment, ALT_KEY: "surviving-environment-marker" }, encoding: "utf8",
    });
    expect(logout.status).toBe(0);
    expect(JSON.parse(logout.stdout)).toMatchObject({
      operation: "logout",
      status: "logged-out",
      grantsPreserved: true,
      sentRequestsRecalled: false,
      environmentOverride: { envVar: "ALT_KEY", active: true },
    });
    expect(`${logout.stdout}${logout.stderr}`).not.toContain("surviving-environment-marker");
  });

  it.skipIf(process.platform !== "linux")("restores the exact terminal mode after SIGINT during masked input", async () => {
    const root = mkdtempSync(join(tmpdir(), "credential-pty-"));
    const helper = join(root, "helper.mjs");
    const entrypoint = join(process.cwd(), "src", "cli.ts");
    writeFileSync(helper, `#!/usr/bin/env node
if (process.argv[2] === "probe") console.log('{"version":1,"status":"available"}');
`);
    chmodSync(helper, 0o700);
    const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;
    const command = `before=$(stty -g); ${quote(process.execPath)} ${quote(entrypoint)} --login; code=$?; after=$(stty -g); printf '\\nMODEBEFORE:%s\\nMODEAFTER:%s\\nEXIT:%s\\n' "$before" "$after" "$code"`;
    const child = spawn("script", ["-qfec", command, "/dev/null"], {
      cwd: root,
      env: {
        ...process.env,
        REVIEW_CREDENTIAL_HELPER: helper,
        REVIEW_CREDENTIAL_STATE_PATH: join(root, "state.json"),
      },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let output = "";
    let interrupted = false;
    child.stdout.on("data", (chunk: Buffer) => {
      output += chunk.toString("utf8");
      if (!interrupted && output.includes("Jev API key:")) {
        const processes = spawnSync("ps", ["-eo", "pid=,args="], { encoding: "utf8" }).stdout;
        const line = processes.split("\n").find((candidate) =>
          /^\s*\d+\s+\S*node\s+/.test(candidate) && candidate.includes(entrypoint) && candidate.includes("--login"));
        const pid = line?.trim().split(/\s+/, 1)[0];
        if (pid !== undefined) {
          interrupted = true;
          process.kill(Number(pid), "SIGINT");
        }
      }
    });
    child.stderr.on("data", (chunk: Buffer) => { output += chunk.toString("utf8"); });
    await new Promise<void>((resolveExit, rejectExit) => {
      const timeout = setTimeout(() => { child.kill("SIGKILL"); rejectExit(new Error(`PTY cancellation timed out: ${output}`)); }, 3_000);
      child.once("exit", () => { clearTimeout(timeout); resolveExit(); });
      child.once("error", rejectExit);
    });
    const modes = /MODEBEFORE:([^\r\n]+)\r?\nMODEAFTER:([^\r\n]+)\r?\nEXIT:(\d+)/.exec(output);
    expect(modes, output).not.toBeNull();
    expect(modes?.[2]).toBe(modes?.[1]);
    expect(Number(modes?.[3])).not.toBe(0);
  }, 10_000);

  it.skipIf(process.platform !== "linux")("does not disable echo when the original terminal mode cannot be captured", () => {
    const root = mkdtempSync(join(tmpdir(), "credential-pty-capture-"));
    const helper = join(root, "helper.mjs");
    const stty = join(root, "stty");
    const log = join(root, "stty.log");
    const entrypoint = join(process.cwd(), "src", "cli.ts");
    writeFileSync(helper, `#!/usr/bin/env node
if (process.argv[2] === "probe") console.log('{"version":1,"status":"available"}');
`);
    writeFileSync(stty, `#!/bin/sh
printf '%s\n' "$*" >> "$STTY_LOG"
exit 1
`);
    chmodSync(helper, 0o700);
    chmodSync(stty, 0o700);
    const child = spawnSync("script", ["-qfec", `${JSON.stringify(process.execPath)} ${JSON.stringify(entrypoint)} --login`, "/dev/null"], {
      cwd: root,
      env: {
        ...process.env,
        PATH: `${root}:${process.env.PATH ?? ""}`,
        STTY_LOG: log,
        REVIEW_CREDENTIAL_HELPER: helper,
        REVIEW_CREDENTIAL_STATE_PATH: join(root, "state.json"),
      },
      encoding: "utf8",
      timeout: 3_000,
    });
    expect(child.status).not.toBe(0);
    expect(readFileSync(log, "utf8")).toContain("-F /dev/tty -g");
    expect(readFileSync(log, "utf8")).not.toContain("-echo");
  });
});
