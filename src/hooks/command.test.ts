import { expect, it, vi } from "vitest"
import { parseHookArguments } from "@hapsland/hook-runtime/hooks/command"

it.each(["codex", "claude", "pi", "opencode"])("parses the %s native channel", async (host) => {
  expect(await parseHookArguments([`--${host}-hook`])).toMatchObject({ [`${host}-hook`]: true })
})
it.each(["before-edit", "background", "stop", "prompt"])(
  "parses composed %s with retained registration metadata",
  async (kind) => {
    expect(
      await parseHookArguments([
        `--composed-${kind}-hook`,
        "--composed-host=codex-cli",
        "--codex-version=0.156.0",
        "--review-tool-composed-owned=codex-v1"
      ])
    ).toMatchObject({
      [`composed-${kind}-hook`]: true,
      "composed-host": "codex-cli",
      "codex-version": "0.156.0",
      "review-tool-composed-owned": "codex-v1"
    })
  }
)
it("retains the direct controlled writer edit combination", async () => {
  expect(await parseHookArguments(["--codex-hook", "--composed-edit-hook", "--controlled-writer"])).toMatchObject({
    "codex-hook": true,
    "composed-edit-hook": true,
    "controlled-writer": true
  })
})
it.each(
  [
    [],
    ["--login"],
    ["--codex-hook=false"],
    ["--composed-stop-hook=false"],
    ["--codex-hook=false", "--controlled-writer"],
    ["--composed-edit-hook"],
    ["--codex-hook", "--status"],
    ["--codex-hook", "--claude-hook"],
    ["--composed-stop-hook", "--composed-prompt-hook"],
    ["--codex-hook", "--codex-hook"],
    ["--codex-hook", "--codex-version="],
    ["--composed-stop-hook", "--composed-host=unknown"]
  ].map((args) => ({ args }))
)("rejects unsupported arguments quietly: $args", async ({ args }) => {
  const stdout = vi.spyOn(process.stdout, "write")
  const stderr = vi.spyOn(process.stderr, "write")
  try {
    await expect(parseHookArguments(args)).rejects.toThrow("Invalid hook arguments")
    expect(stdout).not.toHaveBeenCalled()
    expect(stderr).not.toHaveBeenCalled()
  } finally {
    stdout.mockRestore()
    stderr.mockRestore()
  }
})
it("keeps hook help quiet without dispatching", async () => {
  const stdout = vi.spyOn(process.stdout, "write")
  const stderr = vi.spyOn(process.stderr, "write")
  try {
    expect(await parseHookArguments(["--codex-hook", "--help"])).toBeUndefined()
    expect(stdout).not.toHaveBeenCalled()
    expect(stderr).not.toHaveBeenCalled()
  } finally {
    stdout.mockRestore()
    stderr.mockRestore()
  }
})
