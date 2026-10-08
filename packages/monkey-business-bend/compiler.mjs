import { spawnSync } from "node:child_process"
import { accessSync, constants, readFileSync, realpathSync } from "node:fs"

import { delimiter, isAbsolute, resolve } from "node:path"

export const bendCompilerPath = (command = "bend", env = process.env) => {
  const candidates =
    isAbsolute(command) || command.includes("/")
      ? [resolve(command)]
      : (env.PATH ?? "").split(delimiter).map((directory) => resolve(directory, command))
  for (const candidate of candidates) {
    try {
      accessSync(candidate, constants.X_OK)
      return realpathSync(candidate)
    } catch {
      /* Try the next PATH entry. */
    }
  }
  throw new Error(`Bend compiler not found: ${command}`)
}

// Production and optional consumers use the same producer-owned compiler pin.
export const bendCompilerVersion = () => {
  const manifest = JSON.parse(readFileSync(new URL("../agent-flow-bend/package.json", import.meta.url), "utf8"))
  return `bend ${manifest.hapsland.toolchain.bend.version}`
}

export const assertBendCompilerVersion = (version) => {
  const expected = bendCompilerVersion()
  if (version !== expected) throw new Error(`Bend requires exact ${expected}; observed ${version}`)
  return expected
}

export const checkBendCompiler = (command = "bend", env = process.env) => {
  const result = spawnSync(command, ["version"], {
    env: { ...env, BEND_NO_TELEMETRY: "1" },
    encoding: "utf8",
    timeout: 5000
  })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`Cannot identify Bend compiler: ${result.stderr}`)
  return assertBendCompilerVersion(result.stdout.trim())
}
