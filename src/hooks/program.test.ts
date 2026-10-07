import * as Effect from "effect/Effect"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { runHookProgram } from "../../packages/hook-runtime/src/hooks/program.ts"
import { parseHookArguments } from "@hapsland/hook-runtime/hooks/command"

const ports = vi.hoisted(() => ({
  input: vi.fn(),
  composed: vi.fn(),
  pi: vi.fn(),
  adaptClaude: vi.fn(),
  claude: vi.fn(),
  codex: vi.fn(),
  ready: vi.fn(),
  write: vi.fn(),
  submit: vi.fn()
}))
vi.mock("node:fs", async (original) => ({ ...(await original<typeof import("node:fs")>()), readFileSync: ports.input }))
vi.mock("../../packages/hook-runtime/src/pi/transport.ts", () => ({ runPiHook: ports.pi }))
vi.mock("@hapsland/native-observation/direct-event/adapter", () => ({ adaptClaudeDirectEvent: ports.adaptClaude }))
vi.mock("@hapsland/resident-transport/resident/client", async () => ({
  residentStartupLayer: (await import("effect/Layer")).empty
}))
vi.mock("../../packages/hook-runtime/src/hooks/direct.ts", () => ({
  makeDirectHookDispatch: () => ({
    runDirectCodexHook: ports.codex,
    runDirectBoundedHook: ports.claude,
    isDirectEventReady: ports.ready
  })
}))
vi.mock("../../packages/hook-runtime/src/resident/composed-hook.ts", async () => ({
  composedHookRuntimeLayer: (await import("effect/Layer")).empty,
  runComposedHookEffect: ports.composed
}))
vi.mock("../../packages/hook-runtime/src/resident/direct-hook-output.ts", async () => ({
  directHookSubmissionLayer: (await import("effect/Layer")).empty,
  submitDirectHookOutput: ports.submit
}))
vi.mock("../../packages/hook-runtime/src/resident/hook-output.ts", async (original) => {
  const actual = await original<typeof import("../../packages/hook-runtime/src/resident/hook-output.ts")>()
  return {
    ...actual,
    hookOutputLayer: (await import("effect/Layer")).succeed(actual.HookOutput, {
      writeEncoded: ports.write,
      write: ports.write
    })
  }
})

beforeEach(() => {
  vi.clearAllMocks()
  ports.input.mockReturnValue('{"fixture":true}')
  ports.composed.mockReturnValue(Effect.void)
  ports.pi.mockReturnValue(Effect.succeed({ status: "empty" }))
  ports.adaptClaude.mockReturnValue(Effect.succeed(undefined))
  ports.claude.mockReturnValue(Effect.succeed({ channel: "claude" }))
  ports.codex.mockReturnValue(Effect.succeed({ handled: true, output: { channel: "codex" } }))
  ports.ready.mockReturnValue(false)
  ports.write.mockReturnValue(Effect.succeed("written"))
  ports.submit.mockReturnValue(Effect.succeed("written"))
  vi.stubEnv("REVIEW_STATE_PATH", "/tmp/fixture-state")
  vi.stubEnv("REVIEW_ACTIVITY_PATH", "/tmp/fixture-activity")
  vi.stubEnv("REVIEW_USER_CONFIG_PATH", "/tmp/fixture-user.json")
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})
const run = async (flags: string[]) => {
  const options = await parseHookArguments(flags)
  expect(options).toBeDefined()
  await runHookProgram(options!, performance.now())
}

it.each([{ flags: ["--opencode-hook"] }, { flags: ["--codex-hook"] }])(
  "retires $flags before reading input",
  async ({ flags }) => {
    await run(flags)
    expect(ports.input).not.toHaveBeenCalled()
    expect(ports.codex).not.toHaveBeenCalled()
    expect(ports.composed).not.toHaveBeenCalled()
    if (flags[0] === "--codex-hook") expect(ports.write).toHaveBeenCalledWith("{}\n", expect.any(Number))
    else expect(ports.write).not.toHaveBeenCalled()
  }
)
it("refuses an unsupported explicit composed Codex version before reading or writing", async () => {
  await run(["--codex-hook", "--composed-edit-hook", "--codex-version=unsupported"])
  expect(ports.input).not.toHaveBeenCalled()
  expect(ports.write).not.toHaveBeenCalled()
})
it.each(["before-edit", "background", "stop", "prompt"])(
  "routes composed %s with permissive invalid JSON",
  async (kind) => {
    ports.input.mockReturnValue("invalid JSON")
    await run([`--composed-${kind}-hook`, "--composed-host=claude-code"])
    expect(ports.composed).toHaveBeenCalledWith({
      kind,
      host: "claude-code",
      event: undefined,
      codexVersion: "0.155.1",
      statePath: "/tmp/fixture-state",
      activityPath: "/tmp/fixture-activity",
      userConfigPath: "/tmp/fixture-user.json"
    })
    expect(ports.write).not.toHaveBeenCalled()
  }
)
it("routes direct Claude with its checked observation", async () => {
  await run(["--claude-hook", "--composed-edit-hook"])
  expect(ports.adaptClaude).toHaveBeenCalledWith({ fixture: true }, { userConfigPath: "/tmp/fixture-user.json" })
  expect(ports.write).toHaveBeenCalledWith('{"channel":"claude"}\n', expect.any(Number))
})
it("routes direct Codex with its explicit supported version", async () => {
  await run(["--codex-hook", "--composed-edit-hook", "--codex-version=0.156.0"])
  expect(ports.codex).toHaveBeenCalledWith(
    { fixture: true },
    "0.156.0",
    undefined,
    "/tmp/fixture-state",
    "/tmp/fixture-activity",
    "/tmp/fixture-user.json"
  )
  expect(ports.write).toHaveBeenCalledWith('{"channel":"codex"}\n', expect.any(Number))
})
it("submits a ready direct result through the delivery boundary", async () => {
  ports.ready.mockReturnValue(true)
  await run(["--codex-hook", "--composed-edit-hook"])
  expect(ports.submit).toHaveBeenCalledWith(
    { channel: "codex" },
    { composed: true, claude: false, deadlineAt: expect.any(Number) }
  )
  expect(ports.write).not.toHaveBeenCalled()
})
it("keeps an unhandled Codex event empty", async () => {
  ports.codex.mockReturnValue(Effect.succeed({ handled: false }))
  await run(["--codex-hook", "--composed-edit-hook"])
  expect(ports.write).toHaveBeenCalledWith("{}\n", expect.any(Number))
})
it("returns the Pi unavailable response when its transport fails", async () => {
  ports.pi.mockReturnValue(Effect.fail(new Error("fixture transport failure")))
  const stdout = vi.spyOn(process.stdout, "write").mockReturnValue(true)
  await run(["--pi-hook"])
  expect(stdout).toHaveBeenCalledWith('{"status":"unavailable"}\n')
  expect(ports.write).not.toHaveBeenCalled()
})
it("omits absent optional runtime configuration", async () => {
  vi.stubEnv("REVIEW_USER_CONFIG_PATH", undefined)
  const stdout = vi.spyOn(process.stdout, "write").mockReturnValue(true)
  await run(["--pi-hook"])
  expect(ports.pi).toHaveBeenCalledWith(
    { fixture: true },
    { statePath: "/tmp/fixture-state", activityPath: "/tmp/fixture-activity" }
  )
  expect(stdout).toHaveBeenCalledWith('{"status":"empty"}\n')
})
it("preserves quiet composed failure output", async () => {
  ports.composed.mockReturnValue(Effect.fail(new Error("fixture composed failure")))
  await run(["--composed-stop-hook"])
  expect(ports.write).not.toHaveBeenCalled()
})
it("interrupts the scoped Claude watchdog after successful writing", async () => {
  const exit = vi.spyOn(process, "exit").mockImplementation(() => undefined as never)
  await run(["--claude-hook", "--composed-edit-hook"])
  expect(exit).not.toHaveBeenCalled()
})
it("joins the Claude watchdog when writing times out", async () => {
  const exit = vi.spyOn(process, "exit").mockImplementation(() => undefined as never)
  ports.write.mockReturnValue(Effect.succeed("timed-out"))
  const options = await parseHookArguments(["--claude-hook", "--composed-edit-hook"])
  expect(options).toBeDefined()
  await runHookProgram(options!, -10_000)
  expect(exit).toHaveBeenCalledWith(0)
})
it.each(["claude", "codex", "pi"])("preserves the %s malformed input response", async (host) => {
  ports.input.mockReturnValue("invalid JSON")
  const stdout = vi.spyOn(process.stdout, "write").mockReturnValue(true)
  await run([`--${host}-hook`, ...(host === "pi" ? [] : ["--composed-edit-hook"])])
  if (host === "claude") expect(ports.write).toHaveBeenCalledWith("{}\n", expect.any(Number))
  if (host === "codex")
    expect(ports.write).toHaveBeenCalledWith(
      '{"systemMessage":"Review unavailable: invalid or unsupported Codex PostToolUse input."}\n',
      expect.any(Number)
    )
  if (host === "pi")
    expect(stdout).toHaveBeenCalledWith(
      '{"version":1,"error":{"code":"invalid_request","message":"input does not satisfy a supported command contract"}}\n'
    )
})
