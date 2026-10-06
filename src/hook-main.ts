#!/usr/bin/env bun
import { monotonicNow } from "./resident/hook-clock.ts"
import { parseHookArguments } from "./hooks/command.ts"
import { runHookProgram } from "./hooks/program.ts"

const startedAt = monotonicNow()
try {
  const options = await parseHookArguments(process.argv.slice(2))
  if (options !== undefined) await runHookProgram(options, startedAt)
} catch {
  // Argument and local failures must not write generic output to the host.
}
