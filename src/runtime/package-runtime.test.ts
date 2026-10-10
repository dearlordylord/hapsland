import { expect, it } from "vitest"
import { join } from "node:path"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import {
  sourceRuntimeLayout,
  sourceRuntimeCommand,
  sourceRuntimeFromEntrypoint
} from "@hapsland/runtime-environment/runtime/source-runtime-layout"
import {
  BUN_VERSION,
  commandEntrypoint,
  commandFromEntrypoint,
  commandTokens,
  currentCommand,
  expectedRuntimeVersion,
  observedRuntimeVersion,
  packageAssetPath,
  packageCommand,
  emittedReleaseEntrypoints,
  packageRoot,
  packageRootFromEntrypoint,
  runtimeProbeArguments,
  runtimeVersion,
  readResidentTarget,
  selectResidentCommand,
  selectedResidentCommand,
  residentTargetPath,
  standaloneCommand,
  versionProbeArguments
} from "@hapsland/runtime-environment/runtime/package-runtime"
it("keeps executable argv distinct for development sources and standalone retained packages", () => {
  const source = join(packageRoot, "packages/cli-entry/src/cli.ts")
  const binary = join(packageRoot, "dist/bin/linux-arm64/hapsland")
  expect(commandFromEntrypoint(process.execPath, source)).toEqual({ executable: process.execPath, args: [source] })
  expect(commandFromEntrypoint(process.execPath, binary)).toEqual({ executable: binary, args: [] })
  expect(commandTokens(process.execPath, binary)).toEqual([binary])
  expect(commandEntrypoint({ executable: binary, args: [] })).toBe(binary)
  expect(commandEntrypoint({ executable: process.execPath, args: [source] })).toBe(source)
  expect(packageRootFromEntrypoint(source)).toBe(packageRoot)
  expect(packageRootFromEntrypoint(binary)).toBe(packageRoot)
  expect(currentCommand()).toEqual(packageCommand("cli"))
  expect(packageCommand("resident").args).toEqual([join(packageRoot, emittedReleaseEntrypoints.resident)])
  expect(standaloneCommand(packageRoot, "doctor")).toEqual({
    executable: join(packageRoot, "dist/bin", `${process.platform}-${process.arch}`, "hapsland-doctor"),
    args: []
  })
  expect(packageAssetPath("native", "prebuilt")).toBe(join(packageRoot, "native/prebuilt"))
})
it("probes standalone identity without passing JavaScript to the embedded runtime", () => {
  expect(runtimeProbeArguments("/package/hapsland")).toEqual(["--runtime-identity"])
  expect(runtimeProbeArguments(process.execPath)[0]).toBe("-e")
  expect(versionProbeArguments(process.execPath, "/package/hapsland")).toEqual(["--runtime-identity"])
  expect(versionProbeArguments(process.execPath, "/package/cli.js")[0]).toBe("-e")
  expect(expectedRuntimeVersion("/package/hapsland")).toBe(BUN_VERSION)
  expect(expectedRuntimeVersion("/package/cli.ts")).toBe(BUN_VERSION)
  expect(observedRuntimeVersion('{"version":"1.3.14"}')).toBe("1.3.14")
  expect(observedRuntimeVersion("v24.20.0\n")).toBe("v24.20.0")
  expect(observedRuntimeVersion("{malformed")).toBe("unavailable")
  expect(runtimeVersion()).toBe("unavailable")
})
it("keeps every prepared source role in one immutable runtime identity", () => {
  const layout = sourceRuntimeLayout(packageRoot, "a".repeat(64))
  for (const role of ["cli", "doctor", "parser", "resident"] as const) {
    const command = sourceRuntimeCommand(layout, process.execPath, role)
    expect(sourceRuntimeFromEntrypoint(command.args[0]!)).toEqual(layout)
    expect(packageRootFromEntrypoint(command.args[0]!)).toBe(packageRoot)
    expect(command.args).toEqual([join(layout.directory, `${role}.mjs`)])
  }
  expect(sourceRuntimeFromEntrypoint(join(packageRoot, ".test-runs/source-runtime/latest/cli.mjs"))).toBeUndefined()
  expect(sourceRuntimeFromEntrypoint(join(layout.directory, "unknown.mjs"))).toBeUndefined()
  expect(() => sourceRuntimeLayout(packageRoot, "../other")).toThrow("Invalid source runtime identity")
})

it("keeps source resident commands ephemeral and honors an existing published selection", () => {
  const root = mkdtempSync(join(tmpdir(), "resident-selection-"))
  const previousHome = process.env.HOME
  try {
    process.env.HOME = root
    const source = { executable: "/runtime/bun", args: ["/source/resident.mjs"] }
    const sourceTarget = residentTargetPath()
    expect(selectedResidentCommand()).toEqual(packageCommand("resident"))
    expect(selectResidentCommand(() => source, sourceTarget, "source-build")).toEqual(source)
    expect(existsSync(sourceTarget)).toBe(false)

    const targetPath = join(root, "published-target.json")
    const existing = {
      version: 1,
      build: "published-build-one",
      command: { executable: "/published/resident-one", args: ["--resident"] }
    }
    const original = `${JSON.stringify(existing)}\n`
    writeFileSync(targetPath, original)
    expect(
      selectResidentCommand(
        () => {
          throw new Error("an existing selection must not resolve a fallback")
        },
        targetPath,
        "published-build-two"
      )
    ).toEqual(existing.command)
    expect(readFileSync(targetPath, "utf8")).toBe(original)
    expect(readResidentTarget(targetPath)).toEqual(existing)
  } finally {
    if (previousHome === undefined) delete process.env.HOME
    else process.env.HOME = previousHome
    rmSync(root, { recursive: true, force: true })
  }
})

it("publishes the first embedded resident choice as a private atomic target", () => {
  const root = mkdtempSync(join(tmpdir(), "resident-publication-"))
  try {
    const targetPath = join(root, "state", "resident-target.json")
    const command = { executable: "/published/hapsland-resident", args: [] }
    expect(selectResidentCommand(() => command, targetPath, "published-build")).toEqual(command)
    expect(readResidentTarget(targetPath)).toEqual({ version: 1, build: "published-build", command })
    expect(readFileSync(targetPath, "utf8")).toBe(
      `${JSON.stringify({ version: 1, build: "published-build", command })}\n`
    )
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

it("uses a concurrently published resident target and removes its losing temporary file", () => {
  const root = mkdtempSync(join(tmpdir(), "resident-publication-race-"))
  try {
    const targetPath = join(root, "state", "resident-target.json")
    const winner = {
      version: 1,
      build: "concurrent-winner",
      command: { executable: "/published/winning-resident", args: ["--shared"] }
    }
    const selected = selectResidentCommand(
      () => {
        mkdirSync(join(root, "state"), { recursive: true })
        writeFileSync(targetPath, `${JSON.stringify(winner)}\n`, { flag: "wx" })
        return { executable: "/published/losing-resident", args: [] }
      },
      targetPath,
      "losing-build"
    )
    expect(selected).toEqual(winner.command)
    expect(readResidentTarget(targetPath)).toEqual(winner)
    expect(readdirSync(join(root, "state"))).toEqual(["resident-target.json"])
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
