import { mkdtempSync, mkdirSync, rmSync, writeFileSync, symlinkSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, expect, it } from "vitest"
import { inventoryTestHarness } from "./inventory.mjs"
import { timeoutForKind } from "./policy.mjs"

const roots: string[] = []
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

it("finds actual imports through cyclic fixtures without treating strings or types as subprocesses", () => {
  const root = mkdtempSync(join(tmpdir(), "haps-harness-inventory-"))
  roots.push(root)
  for (const folder of ["src/resident", "scripts", "packages/monkey-business/src"])
    mkdirSync(join(root, folder), { recursive: true })
  const put = (file: string, source: string) => writeFileSync(join(root, file), source)
  put(
    "src/unit.test.ts",
    'import type { ChildProcess } from "node:child_process"; const text = "import {spawn} from node:child_process";'
  )
  put("src/named-type.test.ts", 'import {type ChildProcess} from "node:child_process";')
  put("src/export-type.test.ts", 'export {type ChildProcess} from "node:child_process";')
  put("src/fixture.test.ts", 'import {makeFixture} from "./fixture";')
  put("src/fixture.ts", 'export {makeFixture} from "./cycle.ts";')
  put("src/cycle.ts", 'import "./fixture.ts"; import {spawn} from "node:child_process";')
  put("src/dynamic.test.ts", 'const fixture = import("./fixture.ts");')
  put("src/mixed.test.ts", 'import defaultRuntime, {type ChildProcess} from "node:child_process";')
  put("scripts/hook-import-boundary.test.mjs", "const finiteImportClosure = true;")
  put("src/resident/capacity.test.ts", "const boundedMetadata = true;")
  put("packages/monkey-business/src/outcomes.test.ts", "const seededReplay = true;")
  put("packages/monkey-business/src/cache-scenarios.test.ts", "const seededCacheReplay = true;")
  put("src/resident/server.test.ts", "const boundedSaturation = true;")
  const defaultEntries = inventoryTestHarness(root)
  expect(defaultEntries.some((entry) => entry.path.startsWith("packages/monkey-business/"))).toBe(false)
  const entries = Object.fromEntries(
    [
      ...defaultEntries,
      ...inventoryTestHarness(root, [
        "scripts/hook-import-boundary.test.mjs",
        "packages/monkey-business/src/outcomes.test.ts",
        "packages/monkey-business/src/cache-scenarios.test.ts"
      ])
    ].map((entry) => [entry.path, entry])
  )
  expect(entries["src/unit.test.ts"].kind).toBe("unit")
  expect(entries["src/named-type.test.ts"].kind).toBe("unit")
  expect(entries["src/export-type.test.ts"].kind).toBe("unit")
  expect(entries["src/fixture.test.ts"]).toMatchObject({
    kind: "process",
    processImportIn: "src/cycle.ts",
    timeoutMs: 60_000
  })
  expect(entries["src/dynamic.test.ts"].kind).toBe("process")
  expect(entries["src/mixed.test.ts"].kind).toBe("process")
  expect(entries["src/resident/server.test.ts"].kind).toBe("bounded-scenario")
  for (const path of [
    "scripts/hook-import-boundary.test.mjs",
    "src/resident/capacity.test.ts",
    "packages/monkey-business/src/outcomes.test.ts",
    "packages/monkey-business/src/cache-scenarios.test.ts"
  ]) {
    expect(entries[path]).toMatchObject({ kind: "bounded-scenario", timeoutMs: 60_000 })
  }
  expect(entries["packages/monkey-business/src/cache-scenarios.test.ts"].scenario).toBe(
    "bounded seeded cache-pressure simulation and replay"
  )
  expect(timeoutForKind("unit")).toBe(5_000)
})

it("inventories only focused owners while preserving their transitive process classification", () => {
  const root = mkdtempSync(join(tmpdir(), "haps-harness-focused-inventory-"))
  roots.push(root)
  for (const folder of ["src", "scripts", "packages/monkey-business/src"])
    mkdirSync(join(root, folder), { recursive: true })
  writeFileSync(join(root, "src/selected.test.ts"), 'import "./helper.ts";')
  writeFileSync(join(root, "src/helper.ts"), 'import { spawn } from "node:child_process";')
  symlinkSync(join(root, "missing-source.ts"), join(root, "src/unrelated.test.ts"))
  expect(inventoryTestHarness(root, ["src/selected.test.ts"])).toEqual([
    { path: "src/selected.test.ts", kind: "process", processImportIn: "src/helper.ts", timeoutMs: 60_000 }
  ])
  expect(() => inventoryTestHarness(root)).toThrow()
  expect(() => inventoryTestHarness(root, ["../outside.test.ts"])).toThrow(/Invalid focused inventory file/)
})

it("keeps unavailable optional game and generator modules out of production inventory", () => {
  const root = mkdtempSync(join(tmpdir(), "haps-harness-optional-inventory-"))
  roots.push(root)
  for (const folder of ["src", "scripts"]) mkdirSync(join(root, folder), { recursive: true })
  writeFileSync(join(root, "src/required.test.ts"), "const required = true;")
  writeFileSync(join(root, "scripts/required.test.mts"), "const requiredTool = true;")
  symlinkSync(join(root, "unavailable.ts"), join(root, "scripts/game-future.test.mts"))
  expect(inventoryTestHarness(root).map((entry) => entry.path)).toEqual([
    "scripts/required.test.mts",
    "src/required.test.ts"
  ])
  expect(() => inventoryTestHarness(root, ["scripts/game-future.test.mts"])).toThrow()
  expect(() => inventoryTestHarness(root, ["packages/monkey-business/src/generator.test.ts"])).toThrow()
})

it("follows declared tooling source exports when classifying verification process imports", () => {
  const root = mkdtempSync(join(tmpdir(), "haps-harness-workspace-inventory-"))
  roots.push(root)
  for (const folder of ["src", "scripts/test-support"]) mkdirSync(join(root, folder), { recursive: true })
  writeFileSync(join(root, "package.json"), JSON.stringify({ workspaces: ["scripts", "src"] }))
  writeFileSync(
    join(root, "scripts/package.json"),
    JSON.stringify({
      name: "@hapsland/build-tooling",
      private: true,
      type: "module",
      hapsland: { workspaceRole: "tooling" },
      exports: { "./test-support/helper": { types: "./test-support/helper.ts", default: "./test-support/helper.ts" } }
    })
  )
  writeFileSync(
    join(root, "src/package.json"),
    JSON.stringify({
      name: "@hapsland/verification",
      private: true,
      type: "module",
      hapsland: { workspaceRole: "verification" },
      dependencies: { "@hapsland/build-tooling": "workspace:*" }
    })
  )
  writeFileSync(join(root, "scripts/test-support/helper.ts"), 'import { spawn } from "node:child_process";')
  writeFileSync(join(root, "src/selected.test.ts"), 'import "@hapsland/build-tooling/test-support/helper";')
  expect(inventoryTestHarness(root, ["src/selected.test.ts"])).toEqual([
    {
      path: "src/selected.test.ts",
      kind: "process",
      processImportIn: "scripts/test-support/helper.ts",
      timeoutMs: 60_000
    }
  ])
  writeFileSync(join(root, "src/selected.test.ts"), 'import "@hapsland/build-tooling/test-support/undeclared";')
  expect(() => inventoryTestHarness(root, ["src/selected.test.ts"])).toThrow(/undeclared workspace export/)
})
