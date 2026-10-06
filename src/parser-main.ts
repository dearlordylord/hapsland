#!/usr/bin/env node
import { readFileSync } from "node:fs"
import { analyzeTypeFile } from "./direct-event/analyzer.ts"
import { handleWorkerInformation } from "./runtime/cli-information.ts"

if (handleWorkerInformation("parser", process.argv.slice(2))) process.exit(0)

type ParserInput = { readonly path?: unknown; readonly source?: unknown }

if (process.argv.includes("--demo-validate")) {
  const { validateDemoSession } = await import("./onboarding/demo-validation.ts")
  const valid = await validateDemoSession(process.cwd()).catch(() => false)
  process.stdout.write(JSON.stringify({ valid }) + "\n")
  process.exit(valid ? 0 : 1)
}

let input: ParserInput
try {
  input = JSON.parse(readFileSync(0, "utf8")) as ParserInput
} catch {
  process.stderr.write("parser input must be JSON\n")
  process.exitCode = 2
  input = {}
}

if (process.exitCode === undefined) {
  if (typeof input.path !== "string" || typeof input.source !== "string") {
    process.stderr.write("parser input requires string path and source fields\n")
    process.exitCode = 2
  } else {
    const result = analyzeTypeFile(input.path, input.source)
    process.stdout.write(`${JSON.stringify(result)}\n`)
  }
}
