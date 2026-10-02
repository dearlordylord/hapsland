import { expect, it } from "vitest";
import { ConfigProvider, Effect } from "effect";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { dispatchActivePackage, dispatchSelectedPackage, formatProposal, parseClientArguments } from "./client-lifecycle.ts";

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

it("honors caller configuration for the active dispatch recursion guard", async () => {
  const result = await Effect.runPromise(dispatchActivePackage(["doctor"]).pipe(
    Effect.provide(ConfigProvider.layer(ConfigProvider.fromUnknown({ HAPSLAND_ACTIVE_DISPATCH: "1" }))),
  ));
  expect(result).toBeUndefined();
  const empty = await Effect.runPromise(dispatchActivePackage(["doctor"]).pipe(
    Effect.result,
    Effect.provide(ConfigProvider.layer(ConfigProvider.fromUnknown({ HAPSLAND_ACTIVE_DISPATCH: "" }, { preserveEmptyStrings: true }))),
  ));
  expect(empty).toMatchObject({ _tag: "Failure", failure: { message: "Active package dispatch configuration is invalid." } });
});

it("dispatches the selected package with exact client flags and child exit code", async () => {
  const root = mkdtempSync(join(tmpdir(), "selected-package-"));
  try {
    const executable = join(root, "package");
    const receipt = join(root, "receipt.json");
    writeFileSync(executable, `#!${process.execPath}\nrequire('node:fs').writeFileSync(${JSON.stringify(receipt)},JSON.stringify({args:process.argv.slice(2),guard:process.env.HAPSLAND_ACTIVE_DISPATCH,runtimeCleared:process.env.REVIEW_INSTALL_RUNTIME===undefined,entrypointCleared:process.env.REVIEW_INSTALL_ENTRYPOINT===undefined}));process.exitCode=7;\n`, { mode: 0o700 });
    const code = await Effect.runPromise(dispatchSelectedPackage(executable, "doctor", "codex", new Map([
      ["--target", executable], ["--host", "codex"], ["--codex-home", root],
    ])));
    expect(code).toBe(7);
    expect(JSON.parse(readFileSync(receipt, "utf8"))).toEqual({
      args: ["doctor", "codex", `--codex-home=${root}`], guard: "1", runtimeCleared: true, entrypointCleared: true,
    });
  } finally { rmSync(root, { recursive: true, force: true }); }
});
