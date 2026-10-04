import assert from "node:assert/strict"
import { test } from "node:test"
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import ImmediateErrors from "./immediate-errors.mjs"

test("retains case and collection failures independently of later console output", () => {
  const directory = mkdtempSync(join(tmpdir(), "hapsland-reporter-"))
  const previous = process.env.HAPSLAND_TEST_FAILURES_FILE
  process.env.HAPSLAND_TEST_FAILURES_FILE = join(directory, "failures.jsonl")
  try {
    const reporter = new ImmediateErrors()
    reporter.onTestCaseResult({
      module: { moduleId: "case.ts" },
      fullName: "rejects stale work",
      result: () => ({ state: "failed", errors: [{ message: "mismatch", actual: 1, expected: 2 }] })
    })
    reporter.onTestCaseResult({
      module: { moduleId: "case.ts" },
      fullName: "passing",
      result: () => ({ state: "passed", errors: [] })
    })
    reporter.onTestModuleEnd({ moduleId: "broken.ts", errors: () => [{ message: "import failed" }] })
    const errors = readFileSync(process.env.HAPSLAND_TEST_FAILURES_FILE, "utf8").trim().split("\n").map(JSON.parse)
    assert.equal(errors.length, 2)
    assert.deepEqual(
      errors.map(({ file, message }) => ({ file, message })),
      [
        { file: "case.ts", message: "mismatch" },
        { file: "broken.ts", message: "import failed" }
      ]
    )
    assert.equal(errors[0].actual, "1")
    assert.equal(errors[0].expected, "2")
  } finally {
    if (previous === undefined) delete process.env.HAPSLAND_TEST_FAILURES_FILE
    else process.env.HAPSLAND_TEST_FAILURES_FILE = previous
    rmSync(directory, { recursive: true, force: true })
  }
})
