import assert from "node:assert/strict"
import { test } from "node:test"
import { spawnSync } from "node:child_process"
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { architectureWithFlowDiagram } from "./generate-architecture-diagram.mjs"
import { productionFlowMermaid } from "../packages/agent-flow-projection/src/production-flow-mermaid.ts"

test("exports admission, request authorization, collection and round paths without native evidence claims", () => {
  const diagram = productionFlowMermaid()
  assert.match(diagram, /admission\["Admission #38; capacity"\]/)
  assert.match(diagram, /authorization -->\|"request command or observed start"\| effect/)
  assert.match(diagram, /collection -->\|"Stop decision"\| round/)
  assert.match(diagram, /delivery -->\|"output fact changes round"\| round/)
  assert.match(diagram, /scheduling -->\|"job scheduling status changes"\| scheduling/)
})

test("repairs stale generated content while preserving surrounding documentation", () => {
  const input = "Introduction\n<!-- production-flow:start -->\nstale\n<!-- production-flow:end -->\nOther guidance\n"
  const updated = architectureWithFlowDiagram(input)
  assert.ok(updated.startsWith("Introduction\n"))
  assert.ok(updated.endsWith("\nOther guidance\n"))
  assert.ok(!updated.includes("\nstale\n"))
  assert.ok(updated.includes("```mermaid\nflowchart TB"))
  assert.equal(architectureWithFlowDiagram(updated), updated)
})

test("refuses incomplete, reversed or duplicate markers rather than overwriting prose", () => {
  for (const input of [
    "No generated section",
    "<!-- production-flow:start -->",
    "<!-- production-flow:end --><!-- production-flow:start -->",
    "<!-- production-flow:start --><!-- production-flow:start --><!-- production-flow:end -->",
    "<!-- production-flow:start --><!-- production-flow:end --><!-- production-flow:end -->"
  ]) {
    assert.throws(() => architectureWithFlowDiagram(input), /one ordered pair/)
  }
})

test("the documentation command rejects drift without writing, then repairs it", () => {
  const directory = mkdtempSync(join(tmpdir(), "hapsland-mermaid-"))
  try {
    mkdirSync(join(directory, "scripts"))
    mkdirSync(join(directory, "docs"))
    symlinkSync(resolve(import.meta.dirname, "../packages"), join(directory, "packages"), "dir")
    const script = join(directory, "scripts/generate-architecture-diagram.mjs")
    copyFileSync(resolve(import.meta.dirname, "generate-architecture-diagram.mjs"), script)
    const document = join(directory, "docs/architecture.md")
    const stale = "Intro\n<!-- production-flow:start -->\nstale\n<!-- production-flow:end -->\nConclusion\n"
    writeFileSync(document, stale)
    const invoke = (args) => spawnSync(process.execPath, [script, ...args], { encoding: "utf8", timeout: 10_000 })
    const rejected = invoke(["--check"])
    assert.equal(rejected.status, 1)
    assert.match(rejected.stderr, /diagram is stale/)
    assert.equal(readFileSync(document, "utf8"), stale)
    assert.equal(invoke([]).status, 0)
    assert.equal(readFileSync(document, "utf8"), architectureWithFlowDiagram(stale))
    assert.equal(invoke(["--check"]).status, 0)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})
