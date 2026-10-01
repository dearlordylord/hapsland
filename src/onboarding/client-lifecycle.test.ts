import { expect, it } from "vitest";
import { formatProposal, parseClientArguments } from "./client-lifecycle.ts";

it("accepts spaced and equals options without broadening client scope", () => {
  expect(parseClientArguments("update", ["--host", "claude", "--channel=next"]).host).toBe("claude");
  expect(parseClientArguments("update", ["codex", "--host=codex"]).host).toBe("codex");
});
it.each([["--chanel=next"], ["--claude-home="], ["--host"], ["--host", "--channel=next"], ["claude", "--host=codex"], ["--host=claude", "--host=codex"], ["--target=/tmp/x", "--version=0.1.0"]].map(args => ({ args })))("rejects ambiguous or invalid arguments $args", ({ args }) => {
  expect(() => parseClientArguments("update", args)).toThrow();
});
it("renders every handler including background commands, timeouts and configuration files", () => {
  const output = formatProposal({ changes: [{ file: "/profile/hooks.json", description: "restore hooks" }], ownedChanges: { hooks: { file: "/profile/hooks.json", groups: { PostToolUse: { hooks: [{ command: "main", timeout: 5 }, { command: "background", timeout: 25, async: true }] }, Stop: { hooks: [{ command: "stop", timeout: 4 }] } } } } }).join("\n");
  expect(output).toContain("/profile/hooks.json");
  expect(output).toContain("background, timeout 25s: background");
  expect(output).toContain("Stop");
  expect(output).not.toContain('"hooks"');
});
