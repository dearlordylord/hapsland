import { inspect } from "node:util"
import { appendFileSync } from "node:fs"

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
