import { expect, it } from "vitest";
import { ConfigProvider, Effect } from "effect";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { dispatchActivePackage, dispatchSelectedPackage, formatProposal, formatDoctor } from "./client-lifecycle.ts";

it("renders every handler including background commands, timeouts and configuration files", () => {
  const output = formatProposal({
    changes: [{ file: "/profile/hooks.json", description: "restore hooks" }],
    ownedChanges: {
      hooks: {
        file: "/profile/hooks.json",
        groups: {
          PostToolUse: {
            hooks: [
              { command: "main", timeout: 5 },
              { command: "background", timeout: 25, async: true },
            ],
          },
          Stop: { hooks: [{ command: "stop", timeout: 4 }] },
        },
      },
    },
  }).join("\n");
  expect(output).toContain("/profile/hooks.json");
  expect(output).toContain("background, timeout 25s: background");
  expect(output).toContain("Stop");
  expect(output).not.toContain('"hooks"');
});

it("honors caller configuration for the active dispatch recursion guard", async () => {
  const result = await Effect.runPromise(
    dispatchActivePackage(["doctor"]).pipe(
      Effect.provide(ConfigProvider.layer(ConfigProvider.fromUnknown({ HAPSLAND_ACTIVE_DISPATCH: "1" }))),
    ),
  );
  expect(result).toBeUndefined();
  const empty = await Effect.runPromise(
    dispatchActivePackage(["doctor"]).pipe(
      Effect.result,
      Effect.provide(
        ConfigProvider.layer(
          ConfigProvider.fromUnknown({ HAPSLAND_ACTIVE_DISPATCH: "" }, { preserveEmptyStrings: true }),
        ),
      ),
    ),
  );
  expect(empty).toMatchObject({
    _tag: "Failure",
    failure: { message: "Active package dispatch configuration is invalid." },
  });
});

it("dispatches the selected package with exact client flags and child exit code", async () => {
  const root = mkdtempSync(join(tmpdir(), "selected-package-"));
  try {
    const executable = join(root, "package");
    const receipt = join(root, "receipt.json");
    writeFileSync(
      executable,
      `#!${process.execPath}\nrequire('node:fs').writeFileSync(${JSON.stringify(receipt)},JSON.stringify({args:process.argv.slice(2),guard:process.env.HAPSLAND_ACTIVE_DISPATCH,runtimeCleared:process.env.REVIEW_INSTALL_RUNTIME===undefined,entrypointCleared:process.env.REVIEW_INSTALL_ENTRYPOINT===undefined}));process.exitCode=7;\n`,
      { mode: 0o700 },
    );
    const code = await Effect.runPromise(
      dispatchSelectedPackage(
        executable,
        "doctor",
        "codex",
        new Map([
          ["--target", executable],
          ["--host", "codex"],
          ["--codex-home", root],
        ]),
      ),
    );
    expect(code).toBe(7);
    expect(JSON.parse(readFileSync(receipt, "utf8"))).toEqual({
      args: ["doctor", "codex", `--codex-home=${root}`],
      guard: "1",
      runtimeCleared: true,
      entrypointCleared: true,
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

it("formats doctor failures, compatibility and repair instructions without dumping records", () => {
  const lines = formatDoctor(
    {
      status: "not-ready",
      checks: [
        { stage: "host", status: "ready", observed: "ignored ready detail" },
        {
          stage: "configuration-ownership",
          status: "conflict",
          observed: { error: { message: "owned hook changed" } },
          action: "inspect settings",
        },
        { stage: "runtime", status: "unsupported", observed: { observed: "v20", required: "v24" } },
        { stage: "file-selection", status: "unknown", observed: "inspect exclusions" },
        { stage: "configuration-ownership", status: "ready" },
      ],
    },
    "claude",
  );
  expect(lines).toEqual([
    "claude: not-ready.",
    "  host: ready.",
    "  configuration-ownership: installation damaged.",
    "    owned hook changed",
    "    Next: inspect settings",
    "    Run hapsland repair claude; for changed Hapsland entries, use hapsland reinstall claude.",
    "  runtime: unsupported.",
    "    Compatibility: detected v20; required v24.",
    "  file-selection: unknown.",
    "    inspect exclusions",
    "  configuration-ownership: ready.",
    "Native trust and actual agent execution must be checked in the client.",
  ]);
  expect(formatDoctor(null, "codex")).toEqual([
    "codex: check failed.",
    "Native trust and actual agent execution must be checked in the client.",
  ]);
});
it("formats version, journal and optional proposal details in order", () => {
  expect(
    formatProposal({
      target: { packageVersion: "0.2.0", hook: { groups: { Stop: { matcher: "Task", hooks: [] } } } },
      changes: [{}, { path: "/settings", description: "replace" }],
      journalReplacement: { file: "/journal" },
    }),
  ).toEqual([
    "Version: unrecorded → 0.2.0.",
    "Owned configuration change.",
    "replace: /settings.",
    "Back up interrupted journal /journal and rebuild using current settings.",
    "Stop (Task):",
  ]);
  expect(formatProposal(null)).toEqual([]);
});
