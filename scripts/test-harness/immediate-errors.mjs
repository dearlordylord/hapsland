import { dirname, join } from "node:path"
import { inspect } from "node:util"
import { appendFileSync, writeFileSync } from "node:fs"

// Keep the normal final summary, but expose each failure when its case finishes.
export default class ImmediateErrors {
  onTestCaseResult(test) {
    const result = test.result()
    if (result.state !== "failed") return
    process.stderr.write(`\nFAIL ${test.module.moduleId} > ${test.fullName}\n`)
    for (const error of result.errors) this.writeError(error, test.module.moduleId, test.fullName)
  }
  onTestModuleEnd(module) {
    for (const error of module.errors()) {
      process.stderr.write(`\nFAIL ${module.moduleId} (collection or suite hook)\n`)
      this.writeError(error, module.moduleId, "collection or suite hook")
    }
  }
  onTestRunEnd(modules) {
    const selection = process.env.HAPSLAND_FOCUSED_TEST_SELECTION
    if (!selection) return
    const counts = { passed: 0, failed: 0, skipped: 0, pending: 0 }
    for (const module of modules) {
      for (const test of module.children.allTests()) counts[test.result().state]++
    }
    const executed = counts.passed + counts.failed
    const failuresFile = process.env.HAPSLAND_TEST_FAILURES_FILE
    if (failuresFile)
      writeFileSync(
        join(dirname(failuresFile), `focused-selection-${process.pid}.json`),
        `${JSON.stringify({ selection: JSON.parse(selection), counts, executed }, null, 2)}\n`
      )
    if (executed === 0) {
      this.writeError(
        new Error(
          `Focused selection executed zero tests (${counts.skipped} skipped, ${counts.pending} pending); check selected files and testNamePattern: ${selection}`
        ),
        "focused selection",
        "zero executed tests"
      )
    }
  }
  writeError(error, file, test) {
    const failuresFile = process.env.HAPSLAND_TEST_FAILURES_FILE
    if (failuresFile)
      appendFileSync(
        failuresFile,
        JSON.stringify({
          timestamp: new Date().toISOString(),
          file,
          test,
          message: error.message,
          stack: error.stack,
          ...("actual" in error ? { actual: inspect(error.actual) } : {}),
          ...("expected" in error ? { expected: inspect(error.expected) } : {})
        }) + "\n"
      )
    process.stderr.write(`${error.stack || error.message}\n`)
    if ("actual" in error) process.stderr.write(`Actual: ${inspect(error.actual)}\n`)
    if ("expected" in error) process.stderr.write(`Expected: ${inspect(error.expected)}\n`)
  }
}
