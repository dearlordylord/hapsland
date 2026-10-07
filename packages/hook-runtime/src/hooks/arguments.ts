import * as Flag from "effect/cli/Flag"
import type * as Command from "effect/cli/Command"
import { switchFlag, valueFlag } from "@hapsland/runtime-environment/runtime/argument-flags"

export const hookArgumentFlags = {
  "codex-hook": switchFlag("codex-hook"),
  "claude-hook": switchFlag("claude-hook"),
  "pi-hook": switchFlag("pi-hook"),
  "opencode-hook": switchFlag("opencode-hook"),
  "composed-edit-hook": switchFlag("composed-edit-hook"),
  "composed-before-edit-hook": switchFlag("composed-before-edit-hook"),
  "composed-background-hook": switchFlag("composed-background-hook"),
  "composed-stop-hook": switchFlag("composed-stop-hook"),
  "composed-prompt-hook": switchFlag("composed-prompt-hook"),
  "controlled-reviewer": switchFlag("controlled-reviewer"),
  "controlled-writer": switchFlag("controlled-writer"),
  "review-tool-owned": valueFlag("review-tool-owned").pipe(Flag.withHidden),
  "review-tool-composed-owned": valueFlag("review-tool-composed-owned").pipe(Flag.withHidden),
  "codex-version": valueFlag("codex-version").pipe(Flag.withHidden),
  "composed-host": Flag.Literals("composed-host", ["claude-code", "codex-cli"]).pipe(
    Flag.atMost(1),
    Flag.map((values) => values[0]),
    Flag.withHidden
  )
}
export type HookArguments = Command.Command.Config.Infer<typeof hookArgumentFlags>

const validateHookChannels = (
  hooks: ReadonlyArray<string>,
  composed: ReadonlyArray<string>,
  operations: ReadonlyArray<string>
): void => {
  if (hooks.length > 1 || composed.length > 1) throw new Error("Hook and operation options cannot be combined.")
  if (hooks.length + composed.length > 0 && operations.length > 0)
    throw new Error("Hook and operation options cannot be combined.")
}
export const validateHookArguments = (values: HookArguments, operations: ReadonlyArray<string> = []): void => {
  const hooks = ["codex-hook", "claude-hook", "opencode-hook", "pi-hook"].filter(
    (key) => values[key as keyof HookArguments] === true
  )
  const composed = [
    "composed-before-edit-hook",
    "composed-background-hook",
    "composed-stop-hook",
    "composed-prompt-hook",
    "composed-edit-hook"
  ].filter((key) => values[key as keyof HookArguments] === true)
  validateHookChannels(hooks, composed, operations)
}
