import { inspect } from "node:util";

// Keep the normal final summary, but expose each failure when its case finishes.
export default class ImmediateErrors {
  onTestCaseResult(test) {
    const result = test.result();
    if (result.state !== "failed") return;
    process.stderr.write(`\nFAIL ${test.module.moduleId} > ${test.fullName}\n`);
    for (const error of result.errors) this.writeError(error);
  }
  onTestModuleEnd(module) {
    for (const error of module.errors()) {
      process.stderr.write(`\nFAIL ${module.moduleId} (collection or suite hook)\n`);
      this.writeError(error);
    }
  }
  writeError(error) {
    process.stderr.write(`${error.stack || error.message}\n`);
    if ("actual" in error) process.stderr.write(`Actual: ${inspect(error.actual)}\n`);
    if ("expected" in error) process.stderr.write(`Expected: ${inspect(error.expected)}\n`);
  }
}
