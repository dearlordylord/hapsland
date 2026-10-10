import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { execFile } from "node:child_process"
import { promisify } from "node:util"
import { resolve } from "node:path"
import { pathToFileURL } from "node:url"
import { test } from "node:test"

const execute = promisify(execFile)

test("renaming parser commands and flags changes the journey index without registry edits", async () => {
  const scratch = resolve(import.meta.dirname, "../.test-runs")
  await mkdir(scratch, { recursive: true })
  const directory = await mkdtemp(resolve(scratch, "journey-syntax-"))
  try {
    await cp(resolve(import.meta.dirname, "../packages/administration/src"), directory, { recursive: true })
    const file = resolve(directory, "rules/cli-definition.ts")
    const current = await readFile(file, "utf8")
    await writeFile(
      file,
      current
        .replace('name: "create"', 'name: "author"')
        .replace('const ruleIdName = "id"', 'const ruleIdName = "identity"')
    )
    const moduleUrl = pathToFileURL(resolve(directory, "cli-command.ts")).href
    const script = `
      import assert from "node:assert/strict"
      import { Effect } from "effect"
      import { cliJourneyCommands, parseInvocation } from ${JSON.stringify(moduleUrl)}
      const commands = cliJourneyCommands().rules
      assert(commands.includes("hapsland rules author --identity <identity>"))
      assert(!commands.some(command => command.includes(" rules create ")))
      const parsed = await Effect.runPromise(parseInvocation(["rules", "author", "--identity", "example"]))
      assert.equal(parsed.kind, "rules")
      assert.equal(parsed.options.action, "author")
      assert.equal(parsed.options.id, "example")
    `
    await execute(process.execPath, ["--experimental-strip-types", "--input-type=module", "-e", script], {
      cwd: resolve(import.meta.dirname, ".."),
      timeout: 15000
    })
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
