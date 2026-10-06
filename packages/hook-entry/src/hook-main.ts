#!/usr/bin/env bun
import { monotonicNow } from "@hapsland/resident-transport/resident/hook-clock"
import { parseHookArguments } from "@hapsland/hook-runtime/hooks/command"
import { runHookProgram } from "@hapsland/hook-runtime/hooks/program"

import { handleWorkerInformation } from "@hapsland/runtime-environment/runtime/cli-information"
import { runtimeVersion } from "@hapsland/runtime-environment/runtime/package-runtime"

const arguments_ = process.argv.slice(2)
if (arguments_.length === 1 && arguments_[0] === "--runtime-identity") {
  process.stdout.write(
    JSON.stringify({ version: runtimeVersion(), platform: process.platform, architecture: process.arch }) + "\n"
  )
} else if (!handleWorkerInformation("hook", arguments_)) {
  const startedAt = monotonicNow()
  try {
    const options = await parseHookArguments(arguments_)
    if (options !== undefined) await runHookProgram(options, startedAt)
  } catch {
    // Argument and local failures must not write generic output to the host.
  }
}
