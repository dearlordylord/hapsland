import { expect, it } from "vitest"
import { hookFlags, isHookInvocation } from "./hook-invocation.ts"

const expectedFlags = [
  "--codex-hook",
  "--claude-hook",
  "--pi-hook",
  "--opencode-hook",
  "--composed-edit-hook",
  "--composed-before-edit-hook",
  "--composed-background-hook",
  "--composed-stop-hook",
  "--composed-prompt-hook"
]

it("classifies every supported hook transport consistently including equals arguments", () => {
  expect(hookFlags).toEqual(expectedFlags)
  for (const flag of expectedFlags) {
    expect(isHookInvocation(["--json", flag])).toBe(true)
    expect(isHookInvocation([`${flag}=true`])).toBe(true)
  }
})

it.each(
  [[], ["setup", "pi"], ["--doctor"], ["runtime"], ["--pi-hook-extra"], ["prefix--claude-hook"]].map((args) => ({
    args
  }))
)("allows non-hook invocation $args", ({ args }) => {
  expect(isHookInvocation(args)).toBe(false)
})
