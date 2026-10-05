import { execFileSync } from "node:child_process"
import { mkdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs"
import { join } from "node:path"

// Keep external OS tools available without exposing an interpreter search path.
// The test driver and explicit observer fixtures may use their absolute host Node.
export const standaloneEnvironment = (directory, environment = process.env, extraCommands = []) => {
  mkdirSync(directory, { recursive: true })
  for (const name of new Set([
    "sh",
    "uname",
    "dirname",
    "readlink",
    "git",
    "script",
    "stty",
    "python3",
    "security",
    ...extraCommands
  ])) {
    if (name === "node" || name === "bun") throw new Error("Standalone PATH cannot expose Node or Bun")
    try {
      const path = execFileSync("/bin/sh", ["-c", 'command -v "$1"', "resolve-tool", name], {
        encoding: "utf8",
        env: environment
      }).trim()
      if (!path.startsWith("/")) continue
      if (
        extraCommands.includes(name) &&
        readFileSync(path).subarray(0, 64).toString().startsWith("#!/usr/bin/env node")
      ) {
        const quote = (value) => `'${value.replaceAll("'", "'\\''")}'`
        writeFileSync(join(directory, name), `#!/bin/sh\nexec ${quote(process.execPath)} ${quote(path)} "$@"\n`, {
          mode: 0o700
        })
      } else symlinkSync(path, join(directory, name))
    } catch (error) {
      if (error.code === "EEXIST") continue
    }
  }
  return { ...environment, PATH: directory }
}
