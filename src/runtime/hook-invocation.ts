/** Transport classification only: used when help/errors short-circuit declarative handlers. */
export const hookFlags = Object.freeze([
  "--codex-hook",
  "--claude-hook",
  "--pi-hook",
  "--opencode-hook",
  "--composed-edit-hook",
  "--composed-before-edit-hook",
  "--composed-background-hook",
  "--composed-stop-hook",
  "--composed-prompt-hook",
] as const);
const hookFlagSet = new Set<string>(hookFlags);
export const isHookInvocation = (args: ReadonlyArray<string>) =>
  args.some((argument) => hookFlagSet.has(argument.split("=")[0] ?? argument));
