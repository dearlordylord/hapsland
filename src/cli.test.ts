import { BUN_VERSION, bunExecutable } from "@hapsland/runtime-environment/runtime/bun-runtime"
import { createInstallationPackageFixture } from "@hapsland/build-tooling/test-support/installation-package"
import { DEFAULT_CHILD_TIMEOUT_MS } from "../scripts/test-harness/policy.mjs"
import { chmodSync, existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { execFileSync, spawnSync } from "../scripts/test-harness/process.mjs"
import { afterEach, describe, expect, it } from "vitest"
import { configuredRules, connectDefaultRuleFixture } from "@hapsland/build-tooling/test-support/default-rules"

const roots: Array<string> = []
const makeTemporaryDirectory = (prefix: string): string => realpathSync(mkdtempSync(join(tmpdir(), prefix)))
afterEach(() => {
  for (const root of roots.splice(0)) {
    try {
      const owner = JSON.parse(readFileSync(join(root, "runtime", "owner.json"), "utf8")) as { pid: number }
      process.kill(owner.pid, "SIGTERM")
    } catch {
      // Most tests do not start a resident.
    }
    rmSync(root, { recursive: true, force: true })
  }
})

const initializeRepository = (root: string, requestedStatePath?: string) => {
  execFileSync("git", ["init", "--quiet", root])
  connectDefaultRuleFixture(root)
  return requestedStatePath ?? join(root, ".consent-state.json")
}

describe("JSON subprocess contract", () => {
  it("explains a repository path through the deferred command without reviewing source", () => {
    const root = makeTemporaryDirectory("review-cli-explain-")
    roots.push(root)
    const statePath = initializeRepository(root)
    const capturePath = join(root, "backend-calls")
    const child = spawnSync(bunExecutable(), ["packages/cli-entry/src/cli.ts", "--explain"], {
      cwd: process.cwd(),
      encoding: "utf8",
      timeout: DEFAULT_CHILD_TIMEOUT_MS,
      input: JSON.stringify({ version: 1, operation: "explain", cwd: root, path: "example.ts" }),
      env: {
        ...process.env,
        REVIEW_STATE_PATH: statePath,
        REVIEW_USER_CONFIG_PATH: join(root, "user.jsonc"),
        REVIEW_CONTROL_JSON: JSON.stringify({ capturePath })
      }
    })
    expect(child.status).toBe(0)
    expect(JSON.parse(child.stdout)).toMatchObject({
      version: 1,
      operation: "explain",
      repository: { canonicalRoot: root },
      explanation: { path: "example.ts", normalizedPath: "example.ts" },
      text: expect.stringContaining("example.ts:")
    })
    expect(existsSync(capturePath)).toBe(false)
    expect(existsSync(join(root, "runtime"))).toBe(false)
  })

  it.each([false, true])("keeps Claude input quiet without valid dispatch metadata, composed=%s", (composed) => {
    const root = makeTemporaryDirectory("review-cli-claude-dispatch-")
    roots.push(root)
    const statePath = initializeRepository(root)
    const path = join(root, "type.ts")
    const content = "type OrderCount = number\n"
    writeFileSync(path, content)
    const capturePath = join(root, "backend-calls")
    const child = spawnSync(
      bunExecutable(),
      [
        "packages/hook-entry/src/hook-main.ts",
        "--claude-hook",
        "--controlled-reviewer",
        ...(composed ? ["--composed-edit-hook"] : [])
      ],
      {
        cwd: process.cwd(),
        encoding: "utf8",
        timeout: DEFAULT_CHILD_TIMEOUT_MS,
        input: JSON.stringify({
          hook_event_name: "PostToolUse",
          tool_name: "Write",
          cwd: root,
          session_id: "source-dispatch",
          tool_use_id: "source-dispatch-tool",
          tool_input: { file_path: path, content },
          tool_response: { filePath: path, content, originalFile: null, userModified: false }
        }),
        env: {
          ...process.env,
          REVIEW_STATE_PATH: statePath,
          REVIEW_RESIDENT_DIR: join(root, "runtime"),
          REVIEW_USER_CONFIG_PATH: join(root, "user.jsonc"),
          REVIEW_CREDENTIAL_STATE_PATH: "",
          REVIEW_CONTROL_JSON: JSON.stringify({ capturePath })
        }
      }
    )
    expect(child.status).toBe(0)
    expect(child.stdout).toBe("{}\n")
    expect(child.stderr).toBe("")
    expect(existsSync(capturePath)).toBe(false)
    expect(existsSync(join(root, "runtime"))).toBe(false)
    expect(readFileSync(path, "utf8")).toBe(content)
  })

  it.each(["REVIEW_STATE_PATH", "REVIEW_CONSENT_FILE", "REVIEW_ACTIVITY_PATH", "REVIEW_USER_CONFIG_PATH"])(
    "rejects empty %s instead of falling back to another path",
    (key) => {
      const root = makeTemporaryDirectory("review-empty-path-")
      roots.push(root)
      const env: NodeJS.ProcessEnv = {
        ...process.env,
        REVIEW_ACTIVITY_PATH: join(root, "activity"),
        REVIEW_USER_CONFIG_PATH: join(root, "user.jsonc"),
        REVIEW_CONSENT_FILE: join(root, "consent")
      }
      delete env.REVIEW_STATE_PATH
      env[key] = ""
      const result = spawnSync(
        bunExecutable(),
        [join(process.cwd(), "packages/cli-entry/src/cli.ts"), "--install-preview"],
        {
          cwd: root,
          env,
          encoding: "utf8",
          timeout: DEFAULT_CHILD_TIMEOUT_MS,
          input: JSON.stringify({ version: 1, operation: "install-preview", codexHome: join(root, "codex") })
        }
      )
      expect(result.status).toBe(2)
      expect(JSON.parse(result.stdout)).toMatchObject({ error: { code: "invalid_request" } })
      expect(existsSync(join(root, "codex"))).toBe(false)
      expect(existsSync(join(root, "consent"))).toBe(false)
    }
  )

  it("rejects mixed installation host fields and accepts the host-omitted Codex v1 form", () => {
    const root = makeTemporaryDirectory("review-install-schema-")
    roots.push(root)
    const invoke = (request: unknown) =>
      spawnSync(bunExecutable(), ["packages/cli-entry/src/cli.ts", "--install-preview"], {
        cwd: process.cwd(),
        input: JSON.stringify(request),
        encoding: "utf8",
        timeout: DEFAULT_CHILD_TIMEOUT_MS
      })
    for (const mixed of [
      { version: 1, operation: "install-preview", host: "claude", claudeHome: root, codexHome: root },
      { version: 1, operation: "install-preview", host: "opencode", opencodeConfigHome: root, claudeHome: root },
      { version: 1, operation: "install-preview", claudeHome: root }
    ]) {
      const result = invoke(mixed)
      expect(result.status).toBe(2)
      expect(JSON.parse(result.stdout)).toMatchObject({ error: { code: "invalid_request" } })
    }
    const codex = invoke({ version: 1, operation: "install-preview", codexHome: root })
    expect(JSON.parse(codex.stdout).operation).toBe("install-preview")
    expect(JSON.parse(codex.stdout).error).toBeUndefined()
  })

  it("routes Codex update preview through the lifecycle command and refuses an unowned home", () => {
    const root = makeTemporaryDirectory("review-codex-update-preview-")
    roots.push(root)
    const codexHome = join(root, "codex-home")
    const codexExecutable = join(root, "codex")
    writeFileSync(
      codexExecutable,
      "#!/bin/sh\nif [ \"$1\" = features ]; then printf 'hooks stable true\\n'; else printf 'codex-cli 0.155.1\\n'; fi\n",
      { mode: 0o700 }
    )
    chmodSync(codexExecutable, 0o700)
    const entrypoint = createInstallationPackageFixture(root)
    const packageRuntimePath = join(root, "installation-package/package-runtime.json")
    const packageRuntime = JSON.parse(readFileSync(packageRuntimePath, "utf8")) as {
      runtime: { name: string; version: string }
    }
    packageRuntime.runtime = { name: "bun", version: BUN_VERSION }
    writeFileSync(packageRuntimePath, JSON.stringify(packageRuntime))
    const result = spawnSync(
      bunExecutable(),
      [join(process.cwd(), "packages/cli-entry/src/cli.ts"), "--update-preview"],
      {
        cwd: root,
        env: { ...process.env, REVIEW_INSTALL_ENTRYPOINT: entrypoint, REVIEW_INSTALL_RUNTIME: bunExecutable() },
        input: JSON.stringify({ version: 1, operation: "update-preview", codexHome, codexExecutable }),
        encoding: "utf8",
        timeout: DEFAULT_CHILD_TIMEOUT_MS
      }
    )
    expect(result.stderr).toBe("")
    expect(result.status).toBe(4)
    expect(JSON.parse(result.stdout)).toMatchObject({
      operation: "update-preview",
      status: "conflict",
      error: { message: "no owned Codex installation exists; run install first" }
    })
    expect(existsSync(codexHome)).toBe(false)
  })

  it("rejects the retired whole-file review request without invoking Jev", () => {
    const root = makeTemporaryDirectory("review-retired-")
    roots.push(root)
    initializeRepository(root)
    const capturePath = join(root, "backend-called.txt")
    const input = {
      version: 1,
      event: { id: "old", kind: "successful-edit", host: "test", cwd: root, paths: ["example.ts"] }
    }
    const child = spawnSync(bunExecutable(), ["packages/cli-entry/src/cli.ts", "--controlled-reviewer"], {
      cwd: process.cwd(),
      input: JSON.stringify(input),
      encoding: "utf8",
      env: { ...process.env, REVIEW_CONTROL_JSON: JSON.stringify({ capturePath }) }
    })
    expect(child.status).toBe(2)
    expect(JSON.parse(child.stdout)).toMatchObject({ error: { code: "invalid_request" } })
    expect(existsSync(capturePath)).toBe(false)
  })

  const checkNativeControlledWriterAdd = (hostVersion: "0.155.1" | "0.156.0") => {
    const root = makeTemporaryDirectory("r-")
    roots.push(root)
    const statePath = initializeRepository(root)
    const path = join(root, "pinned.ts")
    writeFileSync(path, "type OrderCount = number\n")
    const pinned = JSON.parse(
      readFileSync(
        join(process.cwd(), "src/test-support/fixtures/codex/0.155.1/post-tool-use-file-create.json"),
        "utf8"
      )
    ) as Record<string, unknown>
    const input = {
      ...pinned,
      cwd: root,
      session_id: "direct-session",
      turn_id: "direct-turn",
      tool_use_id: "direct-tool",
      tool_input: { command: "*** Begin Patch\n*** Add File: pinned.ts\n+type OrderCount = number\n*** End Patch" }
    }
    const capturePath = join(root, "resident-backend-calls.txt")
    const control = JSON.stringify({
      answers: Object.fromEntries(configuredRules.map((rule) => [rule.id, { _tag: "Probability", probability: 0.9 }])),
      capturePath
    })
    const residentDirectory = join(root, "runtime")
    const residentEnv = {
      ...process.env,
      REVIEW_CONTROL_JSON: control,
      REVIEW_STATE_PATH: statePath,
      REVIEW_RESIDENT_DIR: residentDirectory
    }
    const child = spawnSync(
      bunExecutable(),
      [
        "packages/hook-entry/src/hook-main.ts",
        "--codex-hook",
        "--controlled-writer",
        "--controlled-reviewer",
        `--codex-version=${hostVersion}`
      ],
      { cwd: process.cwd(), input: JSON.stringify(input), encoding: "utf8", env: residentEnv }
    )

    expect(child.status).toBe(0)
    expect(child.stderr).toBe("")
    expect(JSON.parse(child.stdout)).toEqual({})
    expect(existsSync(capturePath)).toBe(false)
    expect(existsSync(residentDirectory)).toBe(false)
    expect(readFileSync(path, "utf8")).toBe("type OrderCount = number\n")
  }

  it("keeps the retired Codex 0.155.1 entry point quiet", () => {
    checkNativeControlledWriterAdd("0.155.1")
  })

  it("keeps the retired Codex 0.156.0 entry point quiet", () => {
    checkNativeControlledWriterAdd("0.156.0")
  })

  it("quiets retired native hooks before decoding input or reviewer settings", () => {
    const root = makeTemporaryDirectory("review-retired-hook-")
    roots.push(root)
    for (const flags of [["--codex-hook"], ["--opencode-hook"], ["--opencode-hook", "--composed-edit-hook"]]) {
      const child = spawnSync(
        bunExecutable(),
        ["packages/hook-entry/src/hook-main.ts", ...flags, "--controlled-reviewer"],
        {
          cwd: process.cwd(),
          input: "malformed JSON",
          encoding: "utf8",
          env: { ...process.env, REVIEW_CONTROL_JSON: "malformed", REVIEW_RESIDENT_DIR: join(root, "runtime") }
        }
      )
      expect(child.status).toBe(0)
      expect(child.stderr).toBe("")
      expect(child.stdout.trim()).toBe(flags.includes("--codex-hook") ? "{}" : "")
      expect(existsSync(join(root, "runtime"))).toBe(false)
    }
  })

  it("keeps unsupported native apply_patch events quiet", () => {
    const root = makeTemporaryDirectory("r-")
    roots.push(root)
    const source = join(root, "existing.ts")
    writeFileSync(source, "type Existing = number\n")
    execFileSync("git", ["init", "--quiet", root])
    // Malformed configuration must not start review for unsupported events.
    writeFileSync(join(root, ".hapsland.jsonc"), "{ malformed")
    const capturePath = join(root, "backend-called.txt")
    const residentDirectory = join(root, "runtime")
    const base = {
      session_id: "unsupported-session",
      turn_id: "unsupported-turn",
      transcript_path: null,
      cwd: root,
      hook_event_name: "PostToolUse",
      model: "gpt-test",
      permission_mode: "default",
      tool_name: "apply_patch",
      tool_response: "Success",
      tool_use_id: "unsupported-tool"
    }
    const events = [
      { ...base, tool_input: { command: "not a native patch" } },
      {
        ...base,
        session_id: "",
        tool_input: { command: "*** Begin Patch\n*** Add File: missing-id.ts\n+x\n*** End Patch" }
      },
      { ...base, tool_input: { command: "*** Begin Patch\n*** Delete File: existing.ts\n*** End Patch" } },
      {
        ...base,
        tool_input: { command: "*** Begin Patch\n*** Add File: existing.ts\n*** Move to: moved.ts\n+x\n*** End Patch" }
      },
      {
        ...base,
        tool_input: { command: `*** Begin Patch\n*** Add File: huge.ts\n+${"x".repeat(65_536)}\n*** End Patch` }
      },
      { ...base, tool_input: { command: "*** Begin Patch\n*** Frobnicate File: odd.ts\n+x\n*** End Patch" } },
      { ...base, tool_input: { command: "*** Begin Patch\n*** Add File:\n+x\n*** End Patch" } },
      { ...base, tool_input: { command: "*** Begin Patch\n*** Add File: raw.ts\ntype Raw = number\n*** End Patch" } },
      { ...base, tool_input: { command: "*** Begin Patch\n*** Rename File: existing.ts\n+x\n*** End Patch" } }
    ]
    for (const event of events) {
      const child = spawnSync(
        bunExecutable(),
        ["packages/hook-entry/src/hook-main.ts", "--codex-hook", "--controlled-writer", "--controlled-reviewer"],
        {
          cwd: process.cwd(),
          input: JSON.stringify(event),
          encoding: "utf8",
          env: {
            ...process.env,
            REVIEW_CONTROL_JSON: JSON.stringify({ capturePath }),
            REVIEW_STATE_PATH: join(root, "consent"),
            REVIEW_RESIDENT_DIR: residentDirectory
          }
        }
      )
      expect(child.status).toBe(0)
      expect(child.stderr).toBe("")
      expect(JSON.parse(child.stdout)).toEqual({})
      expect(readFileSync(source, "utf8")).toBe("type Existing = number\n")
      expect(existsSync(capturePath)).toBe(false)
    }
  })

  it("returns a bounded protocol error for malformed input", () => {
    const child = spawnSync(bunExecutable(), ["packages/cli-entry/src/cli.ts", "--controlled-reviewer"], {
      cwd: process.cwd(),
      input: '{"version":null,"unexpected":true}',
      encoding: "utf8"
    })
    const output = JSON.parse(child.stdout) as { error: { code: string; message: string } }
    expect(output.error.code).toBe("invalid_request")
    expect(output.error.message.length).toBeLessThanOrEqual(300)
  })

  it("inspects credential presence without exposing the value", () => {
    const root = makeTemporaryDirectory("review-cli-credential-")
    roots.push(root)
    const statePath = initializeRepository(root)
    const secret = "CREDENTIAL-SENTINEL"
    const child = spawnSync(bunExecutable(), ["packages/cli-entry/src/cli.ts", "--inspect-credentials"], {
      cwd: process.cwd(),
      input: JSON.stringify({ version: 1, operation: "credentials", cwd: root }),
      encoding: "utf8",
      env: {
        ...process.env,
        REVIEW_STATE_PATH: statePath,
        REVIEW_USER_CONFIG_PATH: join(root, "user.jsonc"),
        TYPESAFE_API_KEY: secret
      }
    })
    expect(JSON.parse(child.stdout)).toEqual({
      version: 1,
      operation: "credentials",
      credentialEnvVar: "TYPESAFE_API_KEY",
      present: true,
      source: "environment",
      status: "present"
    })
    expect(child.stdout).not.toContain(secret)
  })
})

it("human doctor reports an empty registry without requiring a terminal", () => {
  const root = makeTemporaryDirectory("review-human-doctor-")
  roots.push(root)
  const environment: NodeJS.ProcessEnv = { ...process.env, HOME: root, NO_COLOR: "1" }
  delete environment.CODEX_HOME
  delete environment.HAPSLAND_ACTIVE_DISPATCH
  const result = spawnSync(bunExecutable(), [join(process.cwd(), "packages/cli-entry/src/cli.ts"), "doctor"], {
    cwd: root,
    env: environment,
    encoding: "utf8",
    timeout: DEFAULT_CHILD_TIMEOUT_MS
  })
  expect(result.status).toBe(0)
  expect(result.stderr).toContain("No Hapsland integrations found. Run hapsland setup first.")
})

it("human doctor runs an explicitly selected host and prints its local checks", () => {
  const root = makeTemporaryDirectory("review-human-doctor-host-")
  roots.push(root)
  execFileSync("git", ["init", "--quiet", root])
  const home = join(root, "codex-home")
  const executable = join(root, "codex")
  writeFileSync(
    executable,
    "#!/bin/sh\nif [ \"$1\" = features ]; then printf 'hooks stable true\\n'; else printf 'codex-cli 0.155.1\\n'; fi\n",
    { mode: 0o700 }
  )
  chmodSync(executable, 0o700)
  const secret = "human-doctor-secret-must-not-appear"
  const environment = {
    ...process.env,
    HOME: root,
    REVIEW_INSTALL_RUNTIME: bunExecutable(),
    REVIEW_INSTALL_ENTRYPOINT: createInstallationPackageFixture(root),
    REVIEW_RESIDENT_DIR: join(root, "resident"),
    REVIEW_USER_CONFIG_PATH: join(root, "user.jsonc"),
    TYPESAFE_API_KEY: secret
  }
  const result = spawnSync(
    bunExecutable(),
    [
      join(process.cwd(), "packages/cli-entry/src/cli.ts"),
      "doctor",
      "codex",
      `--codex-home=${home}`,
      `--codex-executable=${executable}`
    ],
    { cwd: root, env: environment, encoding: "utf8", timeout: DEFAULT_CHILD_TIMEOUT_MS }
  )
  expect([0, 6]).toContain(result.status)
  expect(result.stdout).toContain("codex doctor: local checks")
  expect(result.stdout).not.toContain(secret)
  expect(result.stderr).not.toContain("No Hapsland integrations found")
})

it("dispatches structured previews to the Claude, Pi, and OpenCode adapters", () => {
  const root = makeTemporaryDirectory("review-install-host-routing-")
  roots.push(root)
  const home = join(root, "host-home")
  const executable = join(root, "host")
  writeFileSync(
    executable,
    "#!/bin/sh\nif [ \"$1\" = --version ]; then printf 'Claude Code 2.1.218\\n'; else printf '1.0.0\\n'; fi\n",
    { mode: 0o700 }
  )
  chmodSync(executable, 0o700)
  const environment = {
    ...process.env,
    HOME: root,
    REVIEW_INSTALL_RUNTIME: bunExecutable(),
    REVIEW_INSTALL_ENTRYPOINT: createInstallationPackageFixture(root)
  }
  const invoke = (request: Record<string, string>) => {
    const result = spawnSync(
      bunExecutable(),
      [join(process.cwd(), "packages/cli-entry/src/cli.ts"), "--install-preview"],
      {
        cwd: root,
        env: environment,
        input: JSON.stringify({ version: 1, operation: "install-preview", ...request }),
        encoding: "utf8",
        timeout: DEFAULT_CHILD_TIMEOUT_MS
      }
    )
    const output = JSON.parse(result.stdout) as { operation: string; status: string; host?: { adapter?: string } }
    const expectedExit = output.status === "unsupported" ? 3 : output.status === "conflict" ? 4 : 0
    expect(result.status, result.stderr || result.stdout).toBe(expectedExit)
    return output
  }
  expect(invoke({ host: "claude", claudeHome: join(home, "claude"), claudeExecutable: executable })).toMatchObject({
    operation: "install-preview",
    host: { adapter: "claude" }
  })
  expect(invoke({ host: "pi", piHome: join(home, "pi"), piExecutable: executable })).toMatchObject({
    operation: "install",
    host: { adapter: "pi" }
  })
  expect(invoke({ host: "opencode", opencodeConfigHome: join(home, "opencode") })).toMatchObject({
    operation: "install-preview",
    status: "unsupported",
    host: { adapter: "opencode" }
  })
})
