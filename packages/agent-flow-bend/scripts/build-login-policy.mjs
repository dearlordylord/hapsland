import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { readFileSync, writeFileSync, mkdtempSync, rmSync, mkdirSync, copyFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { pathToFileURL } from "node:url"
import { join, resolve } from "node:path"
const root = resolve(import.meta.dirname, "..")
const outputDirectory = resolve(process.argv.slice(2).find((arg) => arg !== "--check") ?? join(root, "dist"))
const expectedVersion = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).hapsland.toolchain.bend.version
assert.equal(execFileSync("bend", ["version"], { encoding: "utf8", timeout: 5000 }).trim(), `bend ${expectedVersion}`)
execFileSync("bend", [join(root, "login-policy/PROOF.bend"), "--verdict"], { timeout: 5000 })
const temporary = mkdtempSync(join(tmpdir(), "hapsland-login-policy-"))
try {
  const output = join(temporary, "core.mjs")
  execFileSync("bend", [join(root, "login-policy/core.bend"), "-o", output], { timeout: 5000 })
  const raw = readFileSync(output, "utf8")
  assert.equal(raw.split("export default {").length, 2, "compiler module export ABI changed")
  const core = (await import(pathToFileURL(output))).default
  const phases = [
    "SelectingDestination",
    "PreparingTarget",
    "EnteringKey",
    "ConfirmingSave",
    "SavingKey",
    "CheckingActive",
    "Done",
    "Cancelled"
  ]
  const actions = ["selected", "prepared", "entered", "approved", "observed", "active", "back", "exit"]
  const constructors = ["Select", "Prepared", "Entered", "Approved", "Observed", "ActiveObserved", "Back", "Exit"]
  const options = [],
    ids = new Map()
  let dispatch = "\nexport const loginRouteIndex = (phase, action) => { switch (phase) {\n"
  for (const phase of phases) {
    dispatch += `case ${JSON.stringify(phase)}: switch (action) {\n`
    const groups = new Map()
    for (let action = 0; action < actions.length; action++) {
      let plans = Array.from({ length: 16 }, (_, bits) =>
        core.step(
          { $: "Login" + phase },
          { $: "Login" + constructors[action] },
          true,
          Boolean(bits & 1),
          Boolean(bits & 2),
          Boolean(bits & 4),
          Boolean(bits & 8)
        )
      )
      if (plans.every((plan) => JSON.stringify(plan) === JSON.stringify(plans[0]))) plans = [plans[0]]
      const key = JSON.stringify(plans)
      if (!ids.has(key)) {
        ids.set(key, options.length)
        options.push(plans)
      }
      const id = ids.get(key)
      groups.set(id, [...(groups.get(id) ?? []), actions[action]])
    }
    for (const [id, names] of groups)
      dispatch += names.map((name) => `case ${JSON.stringify(name)}:`).join(" ") + ` return ${id};\n`
    dispatch += 'default: throw new TypeError("Unknown login action"); }\n'
  }
  dispatch += 'default: throw new TypeError("Unknown login phase"); }};\n'
  dispatch += `export const loginRoutePlans = ${JSON.stringify(options)};\n`
  const commandNames = {
    LoginChoose: "choose",
    LoginPrepare: "prepare",
    LoginInput: "input",
    LoginConfirm: "confirm",
    LoginSave: "save",
    LoginReadActive: "active",
    LoginNoCommand: undefined
  }
  dispatch += "export const loginCommandName = phase => { switch (phase) {\n"
  for (const phase of phases) {
    const command = core.command({ $: "Login" + phase })
    assert.ok(Object.hasOwn(commandNames, command.$))
    dispatch += `case ${JSON.stringify(phase)}: return ${JSON.stringify(commandNames[command.$]) ?? "undefined"};\n`
  }
  dispatch += 'default: throw new TypeError("Unknown login phase"); }};\n'

  const generated = dispatch
  const specializedOutput = join(temporary, "specialized.mjs")
  writeFileSync(specializedOutput, generated)
  const specialized = await import(pathToFileURL(specializedOutput))
  for (const phase of phases) {
    assert.equal(specialized.loginCommandName(phase), commandNames[core.command({ $: "Login" + phase }).$])
    for (let action = 0; action < actions.length; action++)
      for (let bits = 0; bits < 32; bits++) {
        const expected = core.step(
          { $: "Login" + phase },
          { $: "Login" + constructors[action] },
          Boolean(bits & 1),
          Boolean(bits & 2),
          Boolean(bits & 4),
          Boolean(bits & 8),
          Boolean(bits & 16)
        )
        const plans = specialized.loginRoutePlans[specialized.loginRouteIndex(phase, actions[action])]
        const actual = (bits & 1) === 0 ? { $: "LoginHold" } : plans[plans.length === 1 ? 0 : bits >> 1]
        assert.deepEqual(actual, expected)
      }
  }
  const target = join(outputDirectory, "login-policy.generated.js")
  const declaration = join(outputDirectory, "login-policy.generated.d.ts")
  const abi = join(root, "abi/login-policy.generated.d.ts")
  if (process.argv.includes("--check")) {
    assert.equal(readFileSync(target, "utf8"), generated)
    assert.ok(readFileSync(declaration).equals(readFileSync(abi)))
  } else {
    mkdirSync(outputDirectory, { recursive: true })
    writeFileSync(target, generated)
    copyFileSync(abi, declaration)
  }
} finally {
  rmSync(temporary, { recursive: true, force: true })
}
