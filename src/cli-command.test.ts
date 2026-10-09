import { Effect } from "effect"
import { parseHookArguments } from "@hapsland/hook-runtime/hooks/command"
import { BUN_VERSION, bunExecutable } from "@hapsland/runtime-environment/runtime/bun-runtime"
import { SUPPORTED_CLIENTS, CLIENT_NAMES } from "@hapsland/runtime-environment/runtime/agent-clients"
import { packageBuildIdentity, packageCommand } from "@hapsland/runtime-environment/runtime/package-runtime"
import { DEFAULT_CHILD_TIMEOUT_MS } from "../scripts/test-harness/policy.mjs"
import { describe, expect, it, vi } from "vitest"
import { cliCommandReference, parseInvocation as parseInvocationEffect } from "@hapsland/administration/cli-command"
import { PACKAGE_VERSION } from "@hapsland/runtime-environment/runtime/cli-information"
import { ruleCommandReference } from "@hapsland/administration/rules/cli-definition"
import { spawnSync } from "../scripts/test-harness/process.mjs"
import { mkdtempSync, readdirSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { prepareTestSourceRuntime } from "@hapsland/build-tooling/test-support/source-runtime"

const cli = (args: ReadonlyArray<string>, input = "", hook = false) => {
  const runtime = hook ? prepareTestSourceRuntime() : undefined
  const home = mkdtempSync(join(tmpdir(), "hapsland-cli-arguments-"))
  try {
    const result = spawnSync(
      bunExecutable(),
      [...(runtime?.commands.hook.args ?? ["packages/cli-entry/src/cli.ts"]), ...args],
      {
        input,
        encoding: "utf8",
        timeout: DEFAULT_CHILD_TIMEOUT_MS,
        env: {
          ...process.env,
          ...runtime?.environment,
          HOME: home,
          HAPSLAND_ACTIVE_DISPATCH: "1",
          REVIEW_USER_CONFIG_PATH: join(home, "user.json"),
          REVIEW_STATE_PATH: join(home, "state"),
          REVIEW_ACTIVITY_PATH: join(home, "activity"),
          TYPESAFE_API_KEY: "",
          REVIEW_CONTROL_JSON: "not JSON"
        }
      }
    )
    return { ...result, files: readdirSync(home) }
  } finally {
    rmSync(home, { recursive: true, force: true })
  }
}

// Argument matrices exercise the parser directly; representative subprocesses
// below retain stdin, exit-code and filesystem boundaries.
const parse = async (args: ReadonlyArray<string>) => {
  let output = ""
  const write = vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
    output += String(chunk)
    return true
  })
  try {
    return { invocation: await parseInvocation(args), output }
  } finally {
    write.mockRestore()
  }
}

describe("declarative CLI subprocess contracts", () => {
  it("discovers all human commands and accepts their generated examples", async () => {
    const reference = cliCommandReference()
    const root = await parse(["--help"])
    for (const command of reference.commands) {
      expect(root.output).toContain(command.name)
      expect(root.output).toContain(command.summary)
      const help = await parse([command.name, "--help"])
      expect(help.invocation).toBeUndefined()
      expect(help.output).toContain("EXAMPLES")
      for (const example of command.examples) {
        const result = await parse(example.command.split(" ").slice(1))
        expect(result.invocation).toBeDefined()
      }
    }
  })

  it("reports the invoked package version before reading invalid stdin or creating state", () => {
    const result = cli(["--version"], "not JSON")
    expect(result.status).toBe(0)
    expect(result.stdout).toBe(PACKAGE_VERSION + "\n")
    expect(result.stderr).toBe("")
    expect(result.files).toEqual([])
  })

  it("preserves update release selection independently of root information", async () => {
    const result = await parse(["update", "codex", "--version", "0.2.0"])
    expect(result.invocation).toMatchObject({ kind: "lifecycle", command: "update" })
    if (result.invocation?.kind === "lifecycle") expect(result.invocation.client.flags.get("--version")).toBe("0.2.0")
  })

  it("discovers rule commands and validates every documented example through the parser", async () => {
    const help = await parse(["rules", "--help"])
    expect(help.invocation).toBeUndefined()
    expect(help.output).toContain("SUBCOMMANDS")
    expect(help.output).toContain("Defaults to list")
    for (const command of ruleCommandReference()) {
      expect(help.output).toContain(command.name)
      expect(help.output).toContain(command.description)
      for (const example of command.examples) {
        const result = await parse(example.command.split(" ").slice(1))
        expect(result.invocation).toMatchObject({ kind: "rules", options: { action: command.name } })
      }
    }
    expect((await parse(["rules", "--json"])).invocation).toMatchObject({
      kind: "rules",
      options: { action: "list", json: true }
    })
    for (const args of [
      ["rules", "--json", "show", "--id", "team"],
      ["rules", "show", "--id", "team", "--json"]
    ]) {
      expect((await parse(args)).invocation).toMatchObject({ kind: "rules", options: { action: "show", json: true } })
    }
  })

  it("discovers live rule checks and rejects invalid coordinates before dispatch", async () => {
    const help = await parse(["rules", "check", "--help"])
    expect(help.invocation).toBeUndefined()
    expect(help.output).toContain("related code")
    expect(help.output).toContain("external classifier")
    expect(help.output).toContain("--line")
    expect(help.output).not.toContain("--scope")
    expect((await parse(["rules", "check", "--path", "src/example.ts", "--line", "12"])).invocation).toMatchObject({
      kind: "rules",
      options: { action: "check", path: "src/example.ts", line: 12, id: undefined }
    })
    for (const args of [
      ["--path", "src/example.ts"],
      ["--line", "12"],
      ["--path", "src/example.ts", "--line", "0"],
      ["--path", "src/example.ts", "--line", "-1"],
      ["--path", "src/example.ts", "--line", "1.5"],
      ["--path", "src/example.ts", "--line", "1", "--line", "2"],
      ["--path", "src/example.ts", "--line", "1", "--scope", "project"]
    ])
      await expect(parse(["rules", "check", ...args])).rejects.toThrow()
    const invalid = cli(["rules", "check", "--path", "src/example.ts", "--line", "0"], "not JSON")
    expect(invalid.status).not.toBe(0)
    expect(invalid.stdout).toBe("")
    expect(invalid.files).toEqual([])
  })

  it("provides focused rule help and rejects missing or irrelevant flags before dispatch", async () => {
    const show = await parse(["rules", "show", "--help"])
    expect(show.output).toContain("--id")
    expect(show.output).toContain("EXAMPLES")
    expect(show.output).not.toContain("--scope")
    expect(show.output).not.toContain("--path")
    const connect = await parse(["rules", "connect", "--help"])
    expect(connect.output).toContain("--path")
    expect(connect.output).toContain("--scope")
    expect(connect.output).not.toContain("--id")
    const create = await parse(["rules", "create", "--help"])
    expect(create.output).toContain("New rule identity (required)")
    for (const args of [
      ["show"],
      ["connect"],
      ["create"],
      ["show", "--id", "first", "--id", "second"],
      ["list", "--id", "team"],
      ["show", "--id", "team", "--scope", "project"]
    ]) {
      await expect(parse(["rules", ...args])).rejects.toThrow()
    }
    const result = cli(["rules", "show"])
    expect(result.status).not.toBe(0)
    expect(result.stdout).toBe("")
    expect(result.stderr).toContain("--id")
    expect(result.files).toEqual([])
  })

  it("lists every supported client in public help and accepts it for setup", async () => {
    const help = await parse(["--help"])
    for (const client of SUPPORTED_CLIENTS) {
      expect(help.output).toContain(CLIENT_NAMES[client])
      const result = await parse(["setup", client])
      if (result.invocation?.kind !== "lifecycle") throw new Error("Expected setup lifecycle invocation")
      expect(result.invocation.client.host).toBe(client)
    }
  })

  it("previews agent feedback without stdin, credentials, or persisted activity", () => {
    const result = cli(["--feedback-preview"], "not JSON")
    expect(result.status).toBe(0)
    expect(result.stderr).toBe("")
    expect(result.stdout).toContain("Synthetic example; no review was run.")
    expect(result.stdout).toContain("Hapsland")
    expect(result.stdout).toContain("example.ts :: ExampleState:")
    expect(result.files).toEqual([])
  })

  it.each([
    ["doctor", "--new-key"],
    ["update", "--new-key"],
    ["--new-key"],
    ["unknown"],
    ["--unknown"],
    ["update", "--chanel=next"],
    ["setup", "--claude-home="],
    ["setup", "--claude-home", ""],
    ["setup", "--host"],
    ["update", "--host", "--channel=next"],
    ["update", "claude", "--host=codex"],
    ["update", "codex", "claude"],
    ["update", "--host=claude", "--host", "codex"],
    ["update", "--channel=next", "--channel", "latest"],
    ["update", "--target=/tmp/x", "--version=0.1.0"],
    ["update", "--tarball=/tmp/x", "--channel=next"],
    ["update", "--channel=other"],
    ["doctor", "--tarball=/tmp/x"],
    ["uninstall", "--target=/tmp/x"],
    ["--pilot", "--json"],
    ["--login", "--logout"],
    ["--login", "--login"],
    ["--status", "--explain"],
    ["--feedback-preview", "--status"],
    ["--credential-stdin"],
    ["--login", "doctor"],
    ["--target=/tmp/x", "setup"]
  ])("rejects invalid argument combinations in the parser: %j", async (...args) => {
    await expect(parse(args)).rejects.toThrow()
  })
  it("rejects invalid arguments before stdin or filesystem effects", () => {
    const result = cli(["update", "--chanel=next"], "not JSON")
    expect(result.status).toBe(6)
    expect(result.stdout).toBe("")
    expect(result.stderr).not.toBe("")
    expect(result.files).toEqual([])
  })
  it.each(["x".repeat(10_000), "--" + "x".repeat(10_000)])(
    "bounds long invalid command or option errors",
    (argument) => {
      const result = cli([argument], "not JSON")
      expect(result.status).toBe(6)
      expect(result.stdout).toBe("")
      expect(result.stderr.length).toBeGreaterThan(0)
      expect(result.stderr.length).toBeLessThanOrEqual(1401)
      expect(result.files).toEqual([])
    }
  )
  it.each(["setup", "update", "doctor", "repair", "reinstall", "uninstall"])(
    "generates command-specific %s help",
    async (command) => {
      const result = await parse([command, "--help"])
      expect(result.invocation).toBeUndefined()
      expect(result.output).toContain(`hapsland ${command}`)
      expect(result.output).toContain("--host")
    }
  )
  it.each(["--claude-hook", "--codex-hook", "--pi-hook", "--composed-stop-hook"])(
    "rejects native routing through the administration CLI: %s",
    (flag) => {
      const result = cli([flag], "not JSON")
      expect(result.status).toBe(6)
      expect(result.stdout).toBe("")
      expect(result.stderr).toContain(flag)
      expect(result.files).toEqual([])
    }
  )
  it.each([
    ["--claude-hook", "--help"],
    ["--claude-hook=true", "--help"],
    ["--composed-edit-hook", "--help"],
    ["--codex-hook", "--help"],
    ["--opencode-hook", "--help"],
    ["--composed-stop-hook", "--help"],
    ["--claude-hook", "--unknown"],
    ["--composed-background-hook", "--codex-version="],
    ["--claude-hook", "--codex-hook"],
    ["--codex-hook", "--login"]
  ])("keeps hook parser output quiet for help or errors: %j", async (...args) => {
    let output = ""
    const write = vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
      output += String(chunk)
      return true
    })
    try {
      await parseHookArguments(args).catch(() => undefined)
    } finally {
      write.mockRestore()
    }
    expect(output).toBe("")
  })
  it.each([
    ["--claude-hook", "--help"],
    ["--claude-hook", "--unknown"]
  ])("keeps the native hook subprocess quiet: %j", (...args) => {
    const result = cli(args, "not JSON", true)
    expect(result.status).toBe(0)
    expect(result.stdout).toBe("")
    expect(result.stderr).toBe("")
    expect(result.files).toEqual([])
  })
  it.each([
    ["--composed-host=codex-cli", "--codex-version=0.156.0", "--review-tool-owned=codex-v1"],
    ["--composed-host", "codex-cli", "--codex-version", "0.156.0", "--review-tool-owned", "codex-v1"]
  ])("accepts both hook flag-value spellings: %j", async (...args) => {
    const result = await parseHookArguments(["--codex-hook", ...args])
    expect(result).toMatchObject({
      "codex-hook": true,
      "composed-host": "codex-cli",
      "codex-version": "0.156.0",
      "review-tool-owned": "codex-v1"
    })
  })
  it.each([
    ["--host=codex", "--codex-home=/tmp/hapsland-missing-profile"],
    ["--host", "codex", "--codex-home", "/tmp/hapsland-missing-profile"]
  ])("accepts both lifecycle flag-value spellings: %j", async (...args) => {
    const result = await parse(["setup", ...args])
    expect(result.invocation).toMatchObject({
      kind: "lifecycle",
      command: "setup",
      client: {
        host: "codex",
        flags: new Map([
          ["--host", "codex"],
          ["--codex-home", "/tmp/hapsland-missing-profile"]
        ])
      }
    })
  })
  it("preserves positional client selection for the guided --pilot entry point", () => {
    const result = cli(["--pilot", "claude"])
    expect(result.status).toBe(6)
    expect(result.stdout).toBe("")
    expect(result.stderr).toContain("Guided setup needs a terminal")
    expect(result.files).toEqual([])
  })
  it.each([
    ["--channel=next", "--version=0.1.0"],
    ["--channel", "next", "--version", "0.1.0"]
  ])("preserves release version as a lifecycle value rather than a CLI action: %j", async (...args) => {
    const result = await parse(["update", "codex", ...args])
    expect(result.invocation).toMatchObject({
      kind: "lifecycle",
      command: "update",
      client: {
        host: "codex",
        flags: new Map([
          ["--channel", "next"],
          ["--version", "0.1.0"]
        ])
      }
    })
  })
  it("accepts an installed composed hook ownership marker before quieting unsupported input", () => {
    const result = cli(
      ["--composed-stop-hook", "--composed-host=claude-code", "--review-tool-composed-owned=claude-v1"],
      "not JSON",
      true
    )
    expect(result.status).toBe(0)
    expect(result.stdout.trim()).toBe("{}")
    expect(result.stderr).toBe("")
  })
  it("allows JSON automation to select evaluation operation independently of the live opt-in", () => {
    const result = cli(["--evaluation-live"], JSON.stringify({ version: 1, operation: "run" }))
    expect(JSON.parse(result.stdout)).toMatchObject({ version: 1, operation: "run", status: "complete" })
    expect(result.stderr).toBe("")
    expect(result.files).toEqual([])
  })
  it("keeps machine-readable package identity stdout stable", () => {
    const result = cli(["--package-identity"])
    expect(result.status).toBe(0)
    expect(JSON.parse(result.stdout)).toEqual({
      name: "@hapsland/hapsland",
      executable: bunExecutable(),
      args: [join(process.cwd(), "packages/cli-entry/dist/cli.js")],
      resident: { version: 1, build: packageBuildIdentity, command: packageCommand("resident") }
    })
    expect(result.stderr).toBe("")
    expect(result.files).toEqual([])
  })
  it("reports the selected runtime without reading stdin or creating state", () => {
    const result = cli(["--runtime-identity"])
    expect(result.status).toBe(0)
    expect(JSON.parse(result.stdout)).toEqual({
      version: BUN_VERSION,
      platform: process.platform,
      architecture: process.arch
    })
    expect(result.stderr).toBe("")
    expect(result.files).toEqual([])
  })
})

it.each(["repair", "reinstall", "uninstall"])("rejects interactive %s without a terminal", (command) => {
  const result = cli([command, "codex"])
  expect(result.status).toBe(6)
  expect(result.stderr).toContain(`${command} needs a terminal`)
  expect(result.files).toEqual([])
})

it.each([
  { host: "claude", homeField: "claudeHome", executableField: "claudeExecutable" },
  { host: "opencode", homeField: "opencodeConfigHome", executableField: "opencodeExecutable" }
])(
  "routes the version-one $host installation preview to the selected profile",
  ({ host, homeField, executableField }) => {
    const profile = mkdtempSync(join(tmpdir(), "hapsland-preview-profile-"))
    try {
      const result = cli(
        ["--install-preview"],
        JSON.stringify({
          version: 1,
          operation: "install-preview",
          host,
          [homeField]: profile,
          [executableField]: join(profile, "missing-client")
        })
      )
      const output = JSON.parse(result.stdout)
      expect(output.operation).toBe("install-preview")
      expect(output.error?.code).not.toBe("invalid_request")
      if (host === "opencode") {
        expect(output.status).toBe("unsupported")
        expect(output.host.adapter).toBe("opencode")
      } else {
        expect(JSON.stringify(output)).toContain(profile)
      }
      expect(readdirSync(profile)).toEqual([])
    } finally {
      rmSync(profile, { recursive: true, force: true })
    }
  }
)

it.each([
  ["setup", "codex", "--new-key"],
  ["setup", "codex", "--new-key=true"],
  ["--pilot", "--host=codex", "--new-key"]
])("preserves forced key entry across CLI dispatch: %j", async (...args) => {
  const result = await parse(args)
  if (!result.invocation || result.invocation.kind === "dashboard" || result.invocation.kind === "rules")
    throw new Error("missing client invocation")
  expect(result.invocation.client.flags.get("--new-key")).toBe("true")
})

it("parses the foreground loopback dashboard without client or review options", async () => {
  expect(await parseInvocation(["dashboard", "--host", "localhost", "--port", "8090"])).toEqual({
    kind: "dashboard",
    host: "localhost",
    port: 8090
  })
  await expect(parseInvocation(["dashboard", "--host", "0.0.0.0"])).rejects.toThrow("loopback")
  await expect(parseInvocation(["dashboard", "--daemon"])).rejects.toThrow()
})

const parseInvocation = (args: ReadonlyArray<string>) => Effect.runPromise(parseInvocationEffect(args))

it.each([
  { flag: "--status", request: { version: 1, operation: "credentials", cwd: process.cwd() } },
  { flag: "--install-preview", request: { version: 1, operation: "uninstall" } },
  { flag: "--evaluation-plan", request: { version: 1, operation: "run" } }
])("rejects JSON operation mismatches after Effect parsing: $flag", ({ flag, request }) => {
  const result = cli([flag], JSON.stringify(request))
  expect(result.status).toBe(2)
  expect(JSON.parse(result.stdout)).toMatchObject({
    error: {
      code: "invalid_request",
      message:
        flag === "--evaluation-plan"
          ? expect.stringContaining("flag does not match")
          : "input does not satisfy a supported command contract"
    }
  })
  expect(result.stderr).toBe("")
  expect(result.files).toEqual([])
})

it("honors controlled-reviewer configuration after Effect argument parsing", () => {
  // cli() supplies deliberately invalid REVIEW_CONTROL_JSON. Selecting the
  // controlled reviewer must reject it before running an evaluation owner.
  const result = cli(["--evaluation-run", "--controlled-reviewer"], JSON.stringify({ version: 1, operation: "run" }))
  expect(result.status).toBe(2)
  expect(JSON.parse(result.stdout)).toMatchObject({
    error: { code: "invalid_request", message: "input does not satisfy a supported command contract" }
  })
  expect(result.stderr).toBe("")
  expect(result.files).toEqual([])
})
