import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs"
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
  put("scripts/cli-import-boundary.test.mts", "const finiteImportClosure = true;")
  put("src/resident/capacity.test.ts", "const boundedMetadata = true;")
  put("packages/monkey-business/src/outcomes.test.ts", "const seededReplay = true;")
  put("src/resident/server.test.ts", "const boundedSaturation = true;")
  const entries = Object.fromEntries(inventoryTestHarness(root).map((entry) => [entry.path, entry]))
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
    "scripts/cli-import-boundary.test.mts",
    "src/resident/capacity.test.ts",
    "packages/monkey-business/src/outcomes.test.ts"
  ]) {
    expect(entries[path]).toMatchObject({ kind: "bounded-scenario", timeoutMs: 60_000 })
  }
  expect(timeoutForKind("unit")).toBe(5_000)
})
