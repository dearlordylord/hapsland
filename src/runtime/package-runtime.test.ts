import { expect, it } from "vitest"
import { join } from "node:path"
import { sourceRuntimeLayout, sourceRuntimeCommand, sourceRuntimeFromEntrypoint } from "./source-runtime-layout.ts"
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
  packageRoot,
  packageRootFromEntrypoint,
  runtimeProbeArguments,
  runtimeVersion,
  standaloneCommand,
  versionProbeArguments
} from "./package-runtime.ts"
it("keeps executable argv distinct for development sources and standalone retained packages", () => {
  const source = join(packageRoot, "src/cli.ts")
  const binary = join(packageRoot, "dist/bin/linux-arm64/hapsland")
  expect(commandFromEntrypoint(process.execPath, source)).toEqual({ executable: process.execPath, args: [source] })
  expect(commandFromEntrypoint(process.execPath, binary)).toEqual({ executable: binary, args: [] })
  expect(commandTokens(process.execPath, binary)).toEqual([binary])
  expect(commandEntrypoint({ executable: binary, args: [] })).toBe(binary)
  expect(commandEntrypoint({ executable: process.execPath, args: [source] })).toBe(source)
  expect(packageRootFromEntrypoint(source)).toBe(packageRoot)
  expect(packageRootFromEntrypoint(binary)).toBe(packageRoot)
  expect(currentCommand()).toEqual(packageCommand("cli"))
  expect(packageCommand("resident").args).toEqual([join(packageRoot, "src/resident/main.ts")])
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
