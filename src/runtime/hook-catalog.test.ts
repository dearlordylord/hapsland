import { expect, it } from "vitest"
import { commandHooks, commandHookGroup, piHooks } from "./hook-catalog.ts"
import { createPiExtension } from "../pi/extension.ts"

it("generates installed command groups with ownership, bounded async delivery and no Codex prompt", () => {
  const options = {
    command: "hapsland",
    editMarker: "owned-edit",
    composedMarker: "owned-composed",
    controlledReviewer: true,
    versionFlag: "--codex-version=0.160.0"
  }
  const post = commandHookGroup("codex", "PostToolUse", options)
  expect(post.hooks).toEqual([
    {
      type: "command",
      command:
        "hapsland --codex-hook --controlled-reviewer --controlled-writer --composed-edit-hook owned-edit --codex-version=0.160.0",
      timeout: 10
    },
    {
      type: "command",
      command:
        "hapsland --composed-background-hook --composed-host=codex-cli --controlled-reviewer owned-composed --codex-version=0.160.0",
      timeout: 25,
      async: true
    }
  ])
  expect(() => commandHookGroup("codex", "UserPromptSubmit", options)).toThrow("No installed codex hook")
  expect(commandHookGroup("claude", "UserPromptSubmit", options).hooks[0]?.command).toContain("--composed-prompt-hook")
  expect(commandHookGroup("codex", "PreToolUse", options).hooks[0]?.command).toMatch(/^exec /)
})

it("Pi registers every catalog callback once", () => {
  const registered: string[] = []
  createPiExtension()({
    on: (event) => {
      registered.push(event)
    }
  })
  expect(registered.sort()).toEqual(
    Object.values(piHooks)
      .map((hook) => hook.event)
      .sort()
  )
  expect(new Set(registered).size).toBe(registered.length)
  expect(Object.values(commandHooks.codex).some((hook) => String(hook.event) === "UserPromptSubmit")).toBe(false)
})
