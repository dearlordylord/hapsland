import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import { reduceLogin, loginCommand } from "./login-reference.ts"
const phases = ["SelectingDestination", "PreparingTarget", "EnteringKey", "ConfirmingSave", "SavingKey", "CheckingActive", "Done", "Cancelled"]
const actions = ["selected", "prepared", "entered", "approved", "observed", "active", "back", "exit"]
const constructors = ["Select", "Prepared", "Entered", "Approved", "Observed", "ActiveObserved", "Back", "Exit"]
const commandNames = { LoginChoose: "choose", LoginPrepare: "prepare", LoginInput: "input", LoginConfirm: "confirm", LoginSave: "save", LoginReadActive: "active" }
const patchNames = { LoginDestinationPatch: "destination", LoginProposalPatch: "proposal", LoginStoragePatch: "storage", LoginActivePatch: "active" }
const proposal = { id: "proposal", availability: "available", plan: { destination: "native", target: "/fixture", scope: "user", storage: "native" }, reason: undefined, activeSource: "environment", activeFile: undefined }
const storage = { status: "stored", state: { version: 1, generation: 3, savedUseSuspended: false }, stateLock: "acquired" }
const active = { status: "present", source: "native", generation: 3 }
const directory = mkdtempSync(join(tmpdir(), "hapsland-login-"))
try {
  const source = process.argv[2] ?? "packages/agent-flow-bend/login-policy/core.bend"
  const output = join(directory, "core.mjs")
  execFileSync("bend", [source, "-o", output], { timeout: 5000, stdio: "pipe" })
  const { default: core } = await import(pathToFileURL(output))
  let cases = 0
  for (const phase of phases) {
    const model = { phase, revision: 7, destination: "native", proposal, storage, active }
    const command = core.command({ $: "Login" + phase })
    assert.deepEqual(command.$ === "LoginNoCommand" ? undefined : { kind: commandNames[command.$], id: model.revision }, loginCommand(model))
    for (let actionIndex = 0; actionIndex < actions.length; actionIndex++) for (let bits = 0; bits < 32; bits++) {
      const current = Boolean(bits & 1), matched = Boolean(bits & 2), blocked = Boolean(bits & 4), yes = Boolean(bits & 8), stale = Boolean(bits & 16)
      const kind = actions[actionIndex]
      const action = {
        selected: { kind, destination: "user" },
        prepared: { kind, commandId: 7, proposal: { ...proposal, id: "new-proposal", availability: blocked ? "blocked" : "available" } },
        entered: { kind, commandId: 7, proposalId: matched ? "proposal" : "other-proposal" },
        approved: { kind, proposalId: matched ? "proposal" : "other-proposal", yes },
        observed: { kind, commandId: 7, storage: { ...storage, status: stale ? "stale" : "stored", state: { ...storage.state, generation: 4 } } },
        active: { kind, commandId: 7, active: { status: "missing", source: "environment", generation: 4 } },
        back: { kind }, exit: { kind }
      }[kind]
      const expected = reduceLogin(model, { revision: current ? 7 : 6, action })
      const plan = core.step({ $: "Login" + phase }, { $: "Login" + constructors[actionIndex] }, current, matched, blocked, yes, stale)
      let actual
      if (plan.$ === "LoginHold") actual = model
      else if (plan.$ === "LoginReset") actual = { phase: "SelectingDestination", revision: 8 }
      else {
        assert.equal(plan.$, "LoginAdvance")
        const property = patchNames[plan.patch.$]
        actual = { ...model, ...(property === undefined ? {} : { [property]: action[property] }), phase: plan.phase.$.slice(5), revision: 8 }
      }
      assert.deepEqual(actual, expected, `phase=${phase} action=${kind} bits=${bits}`)
      if (expected === model) assert.equal(actual, model, "Hold must preserve object identity")
      cases++
    }
  }
  const result = { at: new Date().toISOString(), cases, commands: phases.length, result: "pass", scope: "all source-free fact combinations against frozen login reducer; native fact computation and secret lifetime remain separate" }
  if (!process.argv[2]) writeFileSync(new URL("./login-parity.json", import.meta.url), JSON.stringify(result, null, 2) + "\n")
  console.log(JSON.stringify(result))
} finally { rmSync(directory, { recursive: true, force: true }) }
