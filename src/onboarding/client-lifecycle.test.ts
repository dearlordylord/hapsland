import { expect, it, vi } from "vitest"
import { ConfigProvider, Effect } from "effect"
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  registeredClients,
  dispatchActivePackage,
  dispatchSelectedPackage,
  formatProposal,
  formatDoctor,
  formatInstallationRequirements
} from "@hapsland/administration/onboarding/client-lifecycle"

it("explains missing agent hooks and damaged packaged components without blaming the user's runtime", () => {
  const output = formatInstallationRequirements({
    codex: { supported: false, version: "0.200.0", hooksAvailable: false },
    runtime: {
      checks: {
        parser: { ready: false, observed: "missing", path: "/package/hapsland-parser" },
        engine: { ready: true }
      }
    }
  }).join("\n")
  expect(output).toContain("did not expose lifecycle hooks in codex features list")
  expect(output).toContain("package parser check failed: missing at /package/hapsland-parser")
  expect(output).not.toContain("compatible")
  expect(output).not.toContain("engine")
})

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
              { command: "background", timeout: 25, async: true }
            ]
          },
          Stop: { hooks: [{ command: "stop", timeout: 4 }] }
        }
      }
    }
  }).join("\n")
  expect(output).toContain("/profile/hooks.json")
  expect(output).toContain("background, timeout 25s: background")
  expect(output).toContain("Stop")
  expect(output).not.toContain('"hooks"')
})

it("honors caller configuration for the active dispatch recursion guard", async () => {
  const result = await Effect.runPromise(
    dispatchActivePackage(["doctor"]).pipe(
      Effect.provide(ConfigProvider.layer(ConfigProvider.fromUnknown({ HAPSLAND_ACTIVE_DISPATCH: "1" })))
    )
  )
  expect(result).toBeUndefined()
  const empty = await Effect.runPromise(
    dispatchActivePackage(["doctor"]).pipe(
      Effect.result,
      Effect.provide(
        ConfigProvider.layer(
          ConfigProvider.fromUnknown({ HAPSLAND_ACTIVE_DISPATCH: "" }, { preserveEmptyStrings: true })
        )
      )
    )
  )
  expect(empty).toMatchObject({
    _tag: "Failure",
    failure: { message: "Active package dispatch configuration is invalid." }
  })
})

it("dispatches the selected package with exact client flags and child exit code", async () => {
  const root = mkdtempSync(join(tmpdir(), "selected-package-"))
  try {
    const executable = join(root, "package")
    const receipt = join(root, "receipt.json")
    writeFileSync(
      executable,
      `#!${process.execPath}\nrequire('node:fs').writeFileSync(${JSON.stringify(receipt)},JSON.stringify({args:process.argv.slice(2),guard:process.env.HAPSLAND_ACTIVE_DISPATCH,runtimeCleared:process.env.REVIEW_INSTALL_RUNTIME===undefined,entrypointCleared:process.env.REVIEW_INSTALL_ENTRYPOINT===undefined}));process.exitCode=7;\n`,
      { mode: 0o700 }
    )
    const code = await Effect.runPromise(
      dispatchSelectedPackage(
        executable,
        "doctor",
        "codex",
        new Map([
          ["--target", executable],
          ["--host", "codex"],
          ["--codex-home", root]
        ])
      )
    )
    expect(code).toBe(7)
    expect(JSON.parse(readFileSync(receipt, "utf8"))).toEqual({
      args: ["doctor", "codex", `--codex-home=${root}`],
      guard: "1",
      runtimeCleared: true,
      entrypointCleared: true
    })
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

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
          action: "inspect settings"
        },
        { stage: "runtime", status: "unsupported", observed: { observed: "v20", required: "v24" } },
        { stage: "file-selection", status: "unknown", observed: "inspect exclusions" },
        { stage: "configuration-ownership", status: "ready" }
      ]
    },
    "claude"
  )
  expect(lines).toEqual([
    "[FAIL] claude doctor: local checks not-ready.",
    "  [OK] host: ready.",
    "  [FAIL] configuration-ownership: installation damaged.",
    "    owned hook changed",
    "    Next: inspect settings",
    "    Run hapsland repair claude; for changed Hapsland entries, use hapsland reinstall claude.",
    "  [FAIL] runtime: unsupported.",
    "    Compatibility: detected v20; required v24.",
    "  [WARN] file-selection: unknown.",
    "    inspect exclusions",
    "  [OK] configuration-ownership: ready.",
    "[INFO] Native trust and actual agent execution must be checked in the client; a real review was not verified."
  ])
  expect(formatDoctor(null, "codex")).toEqual([
    "[FAIL] codex doctor: local checks failed.",
    "[INFO] Native trust and actual agent execution must be checked in the client; a real review was not verified."
  ])
})
it("formats version, journal and optional proposal details in order", () => {
  expect(
    formatProposal({
      target: { packageVersion: "0.2.0", hook: { groups: { Stop: { matcher: "Task", hooks: [] } } } },
      changes: [{}, { path: "/settings", description: "replace" }],
      journalReplacement: { file: "/journal" }
    })
  ).toEqual([
    "Version: unrecorded → 0.2.0.",
    "Owned configuration change.",
    "replace: /settings.",
    "Back up interrupted journal /journal and rebuild using current settings.",
    "Stop (Task):"
  ])
  expect(formatProposal(null)).toEqual([])
})

it.each([
  ["ready", "[OK]"],
  ["unknown", "[WARN]"],
  ["not-ready", "[FAIL]"]
])("makes %s local doctor readiness visible without claiming a real review", (status, marker) => {
  const lines = formatDoctor({ status, checks: [] }, "codex")
  expect(lines[0]).toBe(`${marker} codex doctor: local checks ${status}.`)
  expect(lines.at(-1)).toContain("a real review was not verified")
})

it("handles absent, damaged and unavailable active-package records in an isolated home", async () => {
  const root = mkdtempSync(join(tmpdir(), "active-package-"))
  vi.stubEnv("HOME", root)
  const directory = join(root, ".local", "share", "hapsland")
  const path = join(directory, "active.json")
  const dispatch = (args: string[]) =>
    Effect.runPromise(
      dispatchActivePackage(args).pipe(
        Effect.result,
        Effect.provide(ConfigProvider.layer(ConfigProvider.fromUnknown({ HAPSLAND_ACTIVE_DISPATCH: "0" })))
      )
    )
  try {
    expect(await dispatch(["doctor"])).toMatchObject({ _tag: "Success", success: undefined })
    mkdirSync(directory, { recursive: true })
    for (const text of ["{", JSON.stringify({ version: 1, executable: "relative", args: [] })]) {
      writeFileSync(path, text)
      expect(await dispatch(["doctor"])).toMatchObject({
        _tag: "Failure",
        failure: {
          message:
            "Hapsland active-package record is damaged. Run hapsland reinstall to rebuild it from the package in PATH."
        }
      })
      const warning = vi.spyOn(process.stderr, "write").mockImplementation(() => true)
      try {
        expect(await dispatch(["reinstall"])).toMatchObject({ _tag: "Success", success: undefined })
        expect(warning).toHaveBeenCalledWith("Active-package record is damaged; reinstalling from PATH.\n")
      } finally {
        warning.mockRestore()
      }
    }
    writeFileSync(path, JSON.stringify({ version: 1, executable: join(root, "missing"), args: [] }))
    expect(await dispatch(["doctor"])).toMatchObject({ _tag: "Failure" })
  } finally {
    vi.unstubAllEnvs()
    rmSync(root, { recursive: true, force: true })
  }
})

it("discovers owned registrations including interrupted and damaged installations", () => {
  const root = mkdtempSync(join(tmpdir(), "registered-clients-"))
  const flags = new Map(["claude", "codex", "pi"].map((client) => [`--${client}-home`, join(root, client)]))
  try {
    expect(registeredClients(flags)).toEqual([])
    for (const client of ["claude", "codex", "pi"]) mkdirSync(join(root, client, ".hapsland"), { recursive: true })
    writeFileSync(join(root, "pi", ".hapsland", "pi-installation-v1.json"), "damaged")
    writeFileSync(join(root, "codex", ".hapsland", "installation-v1.json"), "damaged")
    expect(registeredClients(flags)).toEqual(["codex", "pi"])
    rmSync(join(root, "codex", ".hapsland", "installation-v1.json"))
    writeFileSync(join(root, "codex", ".hapsland", "journal-v1.json"), "interrupted")
    expect(registeredClients(flags)).toEqual(["codex", "pi"])
    rmSync(join(root, "codex", ".hapsland", "journal-v1.json"))
    writeFileSync(join(root, "codex", "hooks.json"), "--review-tool-owned=codex-v1")
    expect(registeredClients(flags)).toEqual(["codex", "pi"])
    writeFileSync(join(root, "codex", "hooks.json"), "--review-tool-composed-owned=codex-v1")
    expect(registeredClients(flags)).toEqual(["codex", "pi"])
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
