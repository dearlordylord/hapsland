import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { readFileSync, writeFileSync, mkdtempSync, rmSync, mkdirSync, copyFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { pathToFileURL } from "node:url"
const root = resolve(import.meta.dirname, "..")
const outputDirectory = resolve(process.argv.slice(2).find((arg) => arg !== "--check") ?? join(root, "dist"))
const expectedVersion = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).hapsland.toolchain.bend.version
assert.equal(execFileSync("bend", ["version"], { encoding: "utf8", timeout: 5000 }).trim(), `bend ${expectedVersion}`)
execFileSync("bend", [join(root, "direct-login-policy/PROOF.bend"), "--verdict"], { timeout: 5000 })
const temporary = mkdtempSync(join(tmpdir(), "hapsland-direct-login-policy-"))
try {
  const output = join(temporary, "core.mjs")
  execFileSync("bend", [join(root, "direct-login-policy/core.bend"), "-o", output], { timeout: 5000 })
  const core = (await import(pathToFileURL(output))).default
  const phases = ["CheckingStore", "EnteringKey", "SavingKey", "Done", "Cancelled"]
  const constructors = {
    checked: "Checked",
    entered: "Entered",
    "input-ended": "InputEnded",
    observed: "Observed",
    exit: "Exit"
  }
  const commandNames = {
    DirectLoginProbe: "probe",
    DirectLoginInput: "input",
    DirectLoginSave: "save",
    DirectLoginNoCommand: undefined
  }
  const patches = {
    DirectLoginNoPatch: "no",
    DirectLoginAvailabilityPatch: "availability",
    DirectLoginStoragePatch: "storage"
  }
  const leaf = (plan) => {
    if (plan.$ === "DirectLoginHold") return "model"
    assert.equal(plan.$, "DirectLoginAdvance")
    assert.ok(Object.hasOwn(patches, plan.patch.$))
    const phase = plan.phase.$.slice(11)
    assert.ok(phases.includes(phase))
    return `patches.${patches[plan.patch.$]}(model,action,${JSON.stringify(phase)})`
  }
  let command = "export const directLoginCommand=model=>{switch(model.phase){\n"
  let reducer =
    'export const directLoginBindReducer=(facts,patches)=>(model,event)=>{const action=event.action;if(event.revision!==model.revision||("commandId" in action&&action.commandId!==model.revision))return model;switch(model.phase){\n'
  for (const phase of phases) {
    const tag = core.command({ $: "DirectLogin" + phase }).$
    assert.ok(Object.hasOwn(commandNames, tag))
    if (commandNames[tag] !== undefined)
      command += `case ${JSON.stringify(phase)}:return {kind:${JSON.stringify(commandNames[tag])},id:model.revision};\n`
    let branches = ""
    for (const [kind, constructor] of Object.entries(constructors)) {
      const plans = [false, true].map((available) =>
        core.step({ $: "DirectLogin" + phase }, { $: "DirectLogin" + constructor }, true, available)
      )
      for (const available of [false, true])
        assert.equal(
          core.step({ $: "DirectLogin" + phase }, { $: "DirectLogin" + constructor }, false, available).$,
          "DirectLoginHold"
        )
      const no = leaf(plans[0]),
        yes = leaf(plans[1])
      if (no !== "model" || yes !== "model")
        branches += `case ${JSON.stringify(kind)}:return ${no === yes ? no : `(facts.available(action)?${yes}:${no})`};\n`
    }
    reducer += `case ${JSON.stringify(phase)}:${branches ? `switch(action.kind){\n${branches}default:return model;}\n` : "return model;\n"}`
  }
  command += "default:return undefined;}};\n"
  reducer += 'default:throw new TypeError("Unknown direct login phase");}};\n'
  const generated = command + reducer
  const artifact = join(temporary, "specialized.mjs")
  writeFileSync(artifact, generated)
  const specialized = await import(pathToFileURL(artifact))
  const hold = { $: "DirectLoginHold" }
  const materializers = Object.fromEntries(
    Object.entries(patches).map(([tag, name]) => [
      name,
      (_model, _action, phase) => ({ $: "DirectLoginAdvance", phase: { $: "DirectLogin" + phase }, patch: { $: tag } })
    ])
  )
  const bound = specialized.directLoginBindReducer({ available: (action) => action.available }, materializers)
  for (const phase of phases) {
    Object.defineProperties(hold, {
      phase: { value: phase, writable: true, configurable: true },
      revision: { value: 37, writable: true, configurable: true }
    })
    const tag = core.command({ $: "DirectLogin" + phase }).$
    assert.deepEqual(
      specialized.directLoginCommand(hold),
      commandNames[tag] === undefined ? undefined : { kind: commandNames[tag], id: 37 }
    )
    for (const [kind, constructor] of Object.entries(constructors))
      for (const current of [false, true])
        for (const available of [false, true]) {
          const action = { kind, available, ...(kind === "exit" ? {} : { commandId: 37 }) }
          assert.deepEqual(
            bound(hold, { revision: current ? 37 : 38, action }),
            core.step({ $: "DirectLogin" + phase }, { $: "DirectLogin" + constructor }, current, available)
          )
          if (kind !== "exit")
            assert.deepEqual(
              bound(hold, { revision: 37, action: { ...action, commandId: 38 } }),
              core.step({ $: "DirectLogin" + phase }, { $: "DirectLogin" + constructor }, false, available)
            )
        }
  }
  const target = join(outputDirectory, "direct-login-policy.generated.js"),
    declaration = join(outputDirectory, "direct-login-policy.generated.d.ts"),
    abi = join(root, "abi/direct-login-policy.generated.d.ts")
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
