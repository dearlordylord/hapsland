#!/usr/bin/env node
import { Effect } from "effect"
import { diagnosePackage } from "./onboarding/package-diagnostics.ts"

const output = await Effect.runPromise(diagnosePackage())
process.stdout.write(`${JSON.stringify(output)}\n`)
process.exitCode = output.status === "ready" ? 0 : 1
