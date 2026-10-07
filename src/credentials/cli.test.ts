import { terminalAvailable, terminalArguments, terminalCommand } from "@hapsland/build-tooling/test-harness/terminal"
import { bunExecutable } from "@hapsland/runtime-environment/runtime/bun-runtime"
import { terminalModesEquivalent } from "@hapsland/administration/credentials/terminal"
import { DEFAULT_CHILD_TIMEOUT_MS } from "../../scripts/test-harness/policy.mjs"
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { hostname, tmpdir } from "node:os"
import { join } from "node:path"
import { spawn } from "node:child_process"
import { spawnSync } from "../../scripts/test-harness/process.mjs"
import { describe, expect, it } from "vitest"

describe("public credential CLI", () => {
  it("rejects explicitly empty credential paths without invoking the helper or writing default state", () => {
    const root = mkdtempSync(join(tmpdir(), "credential-cli-empty-"))
    const helper = join(root, "helper.cjs")
    const invoked = join(root, "invoked")
    const entrypoint = join(process.cwd(), "packages", "cli-entry", "src", "cli.ts")
    writeFileSync(
      helper,
      `#!${bunExecutable()}\nrequire("node:fs").writeFileSync(${JSON.stringify(invoked)},"invoked");console.log(JSON.stringify({status:"available"}));\n`,
      { mode: 0o700 }
    )
    const environment = { ...process.env, HOME: root }
    const login = spawnSync(bunExecutable(), [entrypoint, "--login", "--credential-stdin"], {
      cwd: root,
      env: { ...environment, REVIEW_CREDENTIAL_HELPER: "", REVIEW_CREDENTIAL_STATE_PATH: join(root, "state") },
      input: "synthetic-key\n",
      encoding: "utf8",
      timeout: DEFAULT_CHILD_TIMEOUT_MS
    })
    expect(login.status).toBe(6)
    expect(JSON.parse(login.stdout)).toMatchObject({ operation: "login", status: "unavailable" })
    const logout = spawnSync(bunExecutable(), [entrypoint, "--logout"], {
      cwd: root,
      env: { ...environment, REVIEW_CREDENTIAL_HELPER: helper, REVIEW_CREDENTIAL_STATE_PATH: "" },
      encoding: "utf8",
      timeout: DEFAULT_CHILD_TIMEOUT_MS
    })
    expect(logout.status).toBe(6)
    expect(JSON.parse(logout.stdout)).toMatchObject({
      operation: "logout",
      stateLock: "unavailable",
      savedCredentialUse: "suspended"
    })
    expect(existsSync(invoked)).toBe(false)
    expect(existsSync(join(root, ".local/state/realtime-review-tool/credential-state.json"))).toBe(false)
    expect(`${login.stdout}${login.stderr}${logout.stdout}${logout.stderr}`).not.toContain("synthetic-key")
  })

  it("logs in from explicit stdin without exposing the value and reports the surviving environment override on logout", () => {
    const root = mkdtempSync(join(tmpdir(), "credential-cli-"))
    const helper = join(root, "helper.mjs")
    const vault = join(root, "vault")
    const state = join(root, "state.json")
    const marker = "synthetic-cli-secret-marker"
    const entrypoint = join(process.cwd(), "packages", "cli-entry", "src", "cli.ts")
    spawnSync("git", ["init", "--quiet"], { cwd: root })
    writeFileSync(join(root, ".hapsland.jsonc"), '{"version":1,"credentialEnvVar":"ALT_KEY"}\n')
    writeFileSync(
      helper,
      `#!/usr/bin/env node
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
const operation = process.argv[2]; const vault = process.env.TEST_SECRET_VAULT;
if (operation === "probe") console.log('{"version":1,"status":"available"}');
else if (operation === "set") { const chunks=[]; for await (const chunk of process.stdin) chunks.push(chunk); writeFileSync(vault, Buffer.concat(chunks), {mode:0o600}); console.log('{"version":1,"status":"stored"}'); }
else if (operation === "delete") { const found=existsSync(vault); rmSync(vault,{force:true}); if (process.env.TEST_BREAK_STATE_AFTER_DELETE === "1") { rmSync(process.env.REVIEW_CREDENTIAL_STATE_PATH,{force:true}); mkdirSync(process.env.REVIEW_CREDENTIAL_STATE_PATH); } console.log(JSON.stringify({version:1,status:found?"deleted":"missing"})); }
`
    )
    chmodSync(helper, 0o700)
    const environment: Record<string, string | undefined> = {
      ...process.env,
      REVIEW_CREDENTIAL_HELPER: helper,
      REVIEW_CREDENTIAL_STATE_PATH: state,
      TEST_SECRET_VAULT: vault
    }
    delete environment.TYPESAFE_API_KEY
    const login = spawnSync(bunExecutable(), [entrypoint, "--login", "--credential-stdin"], {
      cwd: root,
      env: environment,
      input: `${marker}\n`,
      encoding: "utf8"
    })
    expect(login.status).toBe(0)
    expect(JSON.parse(login.stdout)).toMatchObject({
      operation: "login",
      status: "stored",
      stored: true,
      paidVerificationPerformed: false
    })
    expect(`${login.stdout}${login.stderr}`).not.toContain(marker)

    const logout = spawnSync(bunExecutable(), [entrypoint, "--logout"], {
      cwd: root,
      env: { ...environment, ALT_KEY: "surviving-environment-marker" },
      encoding: "utf8"
    })
    expect(logout.status).toBe(0)
    expect(JSON.parse(logout.stdout)).toMatchObject({
      operation: "logout",
      status: "logged-out",
      grantsPreserved: true,
      sentRequestsRecalled: false,
      environmentOverride: { envVar: "ALT_KEY", active: true }
    })
    expect(`${logout.stdout}${logout.stderr}`).not.toContain("surviving-environment-marker")

    const secondLogin = spawnSync(bunExecutable(), [entrypoint, "--login", "--credential-stdin"], {
      cwd: root,
      env: environment,
      input: `${marker}\n`,
      encoding: "utf8"
    })
    expect(secondLogin.status).toBe(0)
    const indeterminateLogout = spawnSync(bunExecutable(), [entrypoint, "--logout"], {
      cwd: root,
      env: { ...environment, TEST_BREAK_STATE_AFTER_DELETE: "1" },
      encoding: "utf8"
    })
    expect(indeterminateLogout.status).toBe(6)
    expect(JSON.parse(indeterminateLogout.stdout)).toMatchObject({
      version: 1,
      operation: "logout",
      status: "indeterminate",
      savedCredentialUse: "suspended",
      action: expect.stringContaining("retry logout")
    })
    expect(`${indeterminateLogout.stdout}${indeterminateLogout.stderr}`).not.toContain(marker)
  })

  it("returns a versioned busy result while a live process owns the credential lock", () => {
    const root = mkdtempSync(join(tmpdir(), "credential-cli-busy-"))
    const helper = join(root, "helper.mjs")
    const state = join(root, "state.json")
    const marker = "busy-cli-secret-marker"
    const entrypoint = join(process.cwd(), "packages", "cli-entry", "src", "cli.ts")
    writeFileSync(
      helper,
      `#!/usr/bin/env node
if (process.argv[2] === "probe") console.log('{"version":1,"status":"available"}');
`
    )
    chmodSync(helper, 0o700)
    mkdirSync(`${state}.lock`, { mode: 0o700 })
    writeFileSync(
      join(`${state}.lock`, "owner.json"),
      JSON.stringify({
        version: 1,
        pid: process.pid,
        host: hostname(),
        token: "live-test-owner",
        createdAt: Date.now()
      }),
      { mode: 0o600 }
    )
    const child = spawnSync(bunExecutable(), [entrypoint, "--login", "--credential-stdin"], {
      cwd: root,
      env: { ...process.env, REVIEW_CREDENTIAL_HELPER: helper, REVIEW_CREDENTIAL_STATE_PATH: state },
      input: `${marker}\n`,
      encoding: "utf8"
    })
    expect(child.status).toBe(6)
    expect(JSON.parse(child.stdout)).toMatchObject({
      version: 1,
      operation: "login",
      status: "busy",
      stored: false,
      stateLock: "busy",
      action: expect.stringContaining("retry")
    })
    expect(`${child.stdout}${child.stderr}`).not.toContain(marker)
  })

  it.skipIf(!terminalAvailable)(
    "warns in a terminal that logout leaves the configured environment credential active",
    () => {
      const root = mkdtempSync(join(tmpdir(), "credential-logout-pty-"))
      const helper = join(root, "helper.mjs")
      const entrypoint = join(process.cwd(), "packages", "cli-entry", "src", "cli.ts")
      spawnSync("git", ["init", "--quiet"], { cwd: root })
      writeFileSync(join(root, ".hapsland.jsonc"), '{"version":1,"credentialEnvVar":"ALT_KEY"}\n')
      writeFileSync(
        helper,
        `#!/usr/bin/env node
console.log('{"version":1,"status":"missing"}');
`,
        { mode: 0o700 }
      )
      const quote = (value: string) => "'" + value.replaceAll("'", "'\\''") + "'"
      const child = spawnSync(
        terminalCommand,
        terminalArguments(`${quote(bunExecutable())} ${quote(entrypoint)} --logout`),
        {
          cwd: root,
          encoding: "utf8",
          timeout: DEFAULT_CHILD_TIMEOUT_MS,
          env: {
            ...process.env,
            ALT_KEY: "synthetic-terminal-logout-marker",
            REVIEW_CREDENTIAL_HELPER: helper,
            REVIEW_CREDENTIAL_STATE_PATH: join(root, "state.json")
          }
        }
      )
      expect(child.status, child.stderr).toBe(0)
      expect(child.stdout).toContain("Logout: logged-out.")
      expect(child.stdout).toContain("ALT_KEY remains active; set user excludes")
      expect(`${child.stdout}${child.stderr}`).not.toContain("synthetic-terminal-logout-marker")
    }
  )

  it.skipIf(!terminalAvailable).each([
    { label: "Ctrl+C", key: "\x03" },
    { label: "Escape", key: "\x1b" },
    { label: "Ctrl+D", key: "\x04" }
  ])("restores terminal settings after $label during hidden input without a storage mutation", async ({ key }) => {
    const root = mkdtempSync(join(tmpdir(), "credential-pty-"))
    const helper = join(root, "helper.mjs")
    const operations = join(root, "operations")
    const entrypoint = join(process.cwd(), "packages", "cli-entry", "src", "cli.ts")
    writeFileSync(
      helper,
      `#!/usr/bin/env node
import { appendFileSync } from "node:fs";
appendFileSync(${JSON.stringify(operations)}, process.argv[2] + "\\n");
if (process.argv[2] === "probe") console.log('{"version":1,"status":"available"}');
`
    )
    chmodSync(helper, 0o700)
    const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`
    const command = `trap 'true' INT; before=$(stty -g); ${quote(bunExecutable())} ${quote(entrypoint)} --login; code=$?; after=$(stty -g); printf '\\nMODEBEFORE:%s\\nMODEAFTER:%s\\nEXIT:%s\\n' "$before" "$after" "$code"`
    const child = spawn(terminalCommand, terminalArguments(command), {
      cwd: root,
      env: {
        ...process.env,
        HOME: root,
        XDG_CONFIG_HOME: join(root, "config"),
        TYPESAFE_API_KEY: undefined,
        REVIEW_CREDENTIAL_HELPER: helper,
        REVIEW_CREDENTIAL_STATE_PATH: join(root, "state.json")
      },
      stdio: ["pipe", "pipe", "pipe"]
    })
    let output = ""
    let interrupted = false
    let selected = false
    child.stdout.on("data", (chunk: Buffer) => {
      output += chunk.toString("utf8")
      if (!selected && output.includes("Where should Hapsland save your Jev key?")) {
        selected = true
        child.stdin.write("\n")
      }
      if (!interrupted && output.includes("Jev API key:")) {
        interrupted = true
        child.stdin.write(key)
      }
    })
    child.stderr.on("data", (chunk: Buffer) => {
      output += chunk.toString("utf8")
    })
    await new Promise<void>((resolveExit, rejectExit) => {
      const timeout = setTimeout(() => {
        child.kill("SIGKILL")
        rejectExit(new Error(`PTY cancellation timed out: ${output}`))
      }, DEFAULT_CHILD_TIMEOUT_MS)
      child.once("exit", () => {
        clearTimeout(timeout)
        resolveExit()
      })
      child.once("error", rejectExit)
    })
    const modes = /MODEBEFORE:([^\r\n]+)\r?\nMODEAFTER:([^\r\n]+)\r?\nEXIT:(\d+)/.exec(output)
    expect(modes, output).not.toBeNull()
    expect(interrupted, output).toBe(true)
    expect(terminalModesEquivalent(process.platform, modes?.[1] ?? "", modes?.[2] ?? ""), output).toBe(true)
    expect(existsSync(operations)).toBe(false)
    expect(Number(modes?.[3])).not.toBe(0)
  })

  it.skipIf(!terminalAvailable)("does not disable echo when the original terminal mode cannot be captured", () => {
    const root = mkdtempSync(join(tmpdir(), "credential-pty-capture-"))
    const helper = join(root, "helper.mjs")
    const stty = join(root, "stty")
    const log = join(root, "stty.log")
    const entrypoint = join(process.cwd(), "packages", "cli-entry", "src", "cli.ts")
    writeFileSync(
      helper,
      `#!/usr/bin/env node
if (process.argv[2] === "probe") console.log('{"version":1,"status":"available"}');
`
    )
    writeFileSync(
      stty,
      `#!/bin/sh
printf '%s\n' "$*" >> "$STTY_LOG"
exit 1
`
    )
    chmodSync(helper, 0o700)
    chmodSync(stty, 0o700)
    const child = spawnSync(
      terminalCommand,
      terminalArguments(`${JSON.stringify(bunExecutable())} ${JSON.stringify(entrypoint)} --login`),
      {
        cwd: root,
        env: {
          ...process.env,
          PATH: `${root}:${process.env.PATH ?? ""}`,
          STTY_LOG: log,
          REVIEW_CREDENTIAL_HELPER: helper,
          REVIEW_CREDENTIAL_STATE_PATH: join(root, "state.json")
        },
        encoding: "utf8",
        timeout: DEFAULT_CHILD_TIMEOUT_MS
      }
    )
    expect(child.status).not.toBe(0)
    expect(readFileSync(log, "utf8")).toContain(`${process.platform === "darwin" ? "-f" : "-F"} /dev/tty -g`)
    expect(readFileSync(log, "utf8")).not.toContain("-echo")
  })
})
