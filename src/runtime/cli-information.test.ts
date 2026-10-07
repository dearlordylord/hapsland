import { spawn } from "node:child_process"
import { mkdtempSync, readdirSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { expect, it } from "vitest"
import { bunExecutable } from "@hapsland/runtime-environment/runtime/bun-runtime"
import { PACKAGE_VERSION } from "@hapsland/runtime-environment/runtime/cli-information"

const workers = [
  "../../packages/doctor-entry/src/package-doctor.ts",
  "../../packages/parser-entry/src/parser-main.ts",
  "../../packages/resident-entry/src/resident/main.ts"
] as const

it.each(workers)(
  "%s information exits with stdin open and without creating state",
  async (entry) => {
    const directory = mkdtempSync(join(tmpdir(), "hapsland-worker-help-"))
    try {
      for (const flag of ["--help", "-h", "--version"]) {
        const child = spawn(bunExecutable(), [fileURLToPath(new URL(entry, import.meta.url)), flag], {
          cwd: directory,
          env: { ...process.env, HOME: directory },
          stdio: "pipe"
        })
        let output = ""
        let errors = ""
        child.stdout.on("data", (chunk) => {
          output += String(chunk)
        })
        child.stderr.on("data", (chunk) => {
          errors += String(chunk)
        })
        // Deliberately leave stdin open: informational commands must not await EOF.
        child.stdin.on("error", () => {})
        child.stdin.write("invalid JSON")
        const exit = await new Promise<number | null>((resolve, reject) => {
          const deadline = setTimeout(() => {
            child.kill("SIGKILL")
            reject(new Error("Information waited for stdin"))
          }, 5000)
          child.once("error", (error) => {
            clearTimeout(deadline)
            reject(error)
          })
          child.once("close", (code) => {
            clearTimeout(deadline)
            resolve(code)
          })
        })
        expect(exit).toBe(0)
        expect(errors).toBe("")
        if (flag === "--version") expect(output).toBe(PACKAGE_VERSION + "\n")
        else expect(output).toContain("Usage: hapsland-")
        expect(readdirSync(directory)).toEqual([])
      }
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  },
  20000
)
