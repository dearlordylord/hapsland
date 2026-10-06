#!/usr/bin/env node
import { Effect } from "effect"
import { diagnosePackage } from "./onboarding/package-diagnostics.ts"
import { formatPackageDoctor, formatOutcome } from "./onboarding/human-output.ts"
import { handleWorkerInformation } from "./runtime/cli-information.ts"

const args = process.argv.slice(2)
if (handleWorkerInformation("doctor", args)) {
  // Information does not probe the package or consume stdin.
} else if (args.length > 1 || (args.length === 1 && args[0] !== "--json")) {
  process.stderr.write(`${formatOutcome("error", "Unknown package doctor option. Usage: hapsland-doctor [--json]")}\n`)
  process.exitCode = 2
} else {
  const output = await Effect.runPromise(diagnosePackage())
  process.stdout.write(`${args.includes("--json") ? JSON.stringify(output) : formatPackageDoctor(output).join("\n")}\n`)
  process.exitCode = output.status === "ready" ? 0 : 1
}
