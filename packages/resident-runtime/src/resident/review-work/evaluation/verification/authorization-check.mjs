import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { pathToFileURL } from "node:url"

// Independent ordered specification of authorization.ts, including the two
// credential-generation reads around its suspension and the second root read.
// This checks an emitted candidate, not production connection or universal laws.
const temporary = mkdtempSync(join(tmpdir(), "hapsland-evaluation-authorization-"))
try {
  const output = join(temporary, "authorization.mjs")
  execFileSync("taskset", ["-c", "10", "bend", join(import.meta.dirname, "../Authorization.bend"), "-o", output], {
    timeout: 10000
  })
  const core = (await import(pathToFileURL(output))).default
  const tag = ($, fields = {}) => ({ $, ...fields })
  const flags = [
    "controlled",
    "required",
    "shape",
    "initialRoot",
    "present",
    "generationBefore",
    "generationAfter",
    "name",
    "provider",
    "dispatchRoot",
    "selected",
    "admitted",
    "current",
    "physical"
  ]
  function reference(facts, decision) {
    const commands = []
    const emit = ($, fields) => commands.push(tag($, fields))
    const deny = (reason) => {
      emit("DenyRequest")
      if (decision.$ === "Issued") return { commands, terminal: tag("Rejected") }
      if (decision.$ === "Unavailable") emit("ObserveUnavailable")
      return { commands, terminal: tag("NotAuthorized", { reason: tag(reason) }) }
    }
    emit("ReadEffectiveAnalytics")
    emit("ValidateControlled")
    if (!facts.controlled) return deny("Lost")
    emit("ReadCredentialRequired")
    emit("CheckCredentialShape", { required: facts.required })
    if (!facts.shape) return deny("Credential")
    emit("VerifyInitialRoot")
    if (!facts.initialRoot) return deny("Lost")
    emit("AuthorizationBarrier")
    emit("ResolveCredential", { required: facts.required })
    if (facts.required && !facts.present) return deny("Credential")
    emit("CheckCredentialGeneration")
    if (!facts.generationBefore) return deny("Credential")
    emit("CredentialBarrier")
    emit("CheckCredentialGeneration")
    if (!facts.generationAfter) return deny("Credential")
    emit("CheckCredentialName", { required: facts.required })
    if (!facts.name) return deny("Credential")
    emit("CheckProviderIdentity")
    if (!facts.provider) return deny("Lost")
    emit("VerifyDispatchRoot")
    if (!facts.dispatchRoot) {
      emit("ObserveRootRefusal")
      return deny("Lost")
    }
    emit("ReadFileAdmission", { credential_ready: true })
    emit("ObserveFileAdmission", { selected: facts.selected, admitted: facts.admitted })
    emit("ReadCurrentWork")
    emit("ReadPhysicalAvailable")
    emit("ReadyRequest", {
      facts: tag("Facts", {
        credential_ready: true,
        selected: facts.selected && facts.admitted,
        current_work: facts.current,
        physical_available: facts.physical
      })
    })
    if (decision.$ === "Issued") {
      emit("ObserveIssued", { request: decision.request })
      emit("ArmInterruption")
      return { commands, terminal: tag("AuthorizedRequest", { request: decision.request }) }
    }
    if (decision.$ === "Unavailable") emit("ObserveUnavailable")
    return { commands, terminal: tag("NotAuthorized", { reason: tag("Lost") }) }
  }
  let cases = 0,
    prefixes = 0,
    comparisons = 0
  const commandsCovered = new Set()
  for (let mask = 0; mask < 2 ** flags.length; mask++) {
    const facts = Object.fromEntries(flags.map((name, index) => [name, Boolean(mask & (1 << index))]))
    for (const decision of [tag("Issued", { request: 73 }), tag("Unavailable"), tag("Stale")]) {
      const expected = reference(facts, decision)
      let step = core.initial(41),
        generationReads = 0,
        next = 0
      for (const command of expected.commands) {
        assert.equal(step.$, "Await")
        assert.equal(step.invocation, 41)
        assert.equal(step.id, next++)
        assert.deepEqual(step.request, tag("Request", { invocation: 41, id: step.id, command }))
        commandsCovered.add(command.$)
        let response
        const flagCommands = {
          ValidateControlled: "controlled",
          ReadCredentialRequired: "required",
          CheckCredentialShape: "shape",
          VerifyInitialRoot: "initialRoot",
          CheckCredentialName: "name",
          CheckProviderIdentity: "provider",
          VerifyDispatchRoot: "dispatchRoot",
          ReadCurrentWork: "current",
          ReadPhysicalAvailable: "physical"
        }
        if (command.$ in flagCommands) response = tag("Flag", { value: facts[flagCommands[command.$]] })
        else if (command.$ === "CheckCredentialGeneration")
          response = tag("Flag", { value: facts[generationReads++ === 0 ? "generationBefore" : "generationAfter"] })
        else if (command.$ === "ResolveCredential") response = tag("Resolved", { present: facts.present })
        else if (command.$ === "ReadFileAdmission")
          response = tag("FileAdmission", { selected: facts.selected, admitted: facts.admitted })
        else if (command.$ === "ReadyRequest" || command.$ === "DenyRequest")
          response = tag("RequestDecision", { decision })
        else response = tag("Ack")
        const reply = tag("Reply", { invocation: 41, id: step.id, response })
        assert.equal(core.resume(step, { ...reply, invocation: 42 }).$, "Rejected")
        assert.equal(core.resume(step, { ...reply, id: step.id + 1 }).$, "Rejected")
        assert.equal(core.resume({ ...step, request: { ...step.request, invocation: 42 } }, reply).$, "Rejected")
        assert.equal(core.resume({ ...step, request: { ...step.request, id: step.id + 1 } }, reply).$, "Rejected")
        assert.deepEqual(
          core.resume(step, { ...reply, response: tag("Failed", { token: 19 }) }),
          tag("Aborted", { token: 19 })
        )
        step = core.resume(step, reply)
        prefixes++
        comparisons += 9
      }
      assert.deepEqual(step, expected.terminal)
      assert.equal(core.resume(step, tag("Reply", { invocation: 41, id: 0, response: tag("Ack") })).$, "Rejected")
      cases++
      comparisons += 2
    }
  }
  assert.equal(commandsCovered.size, 22)
  const dispatchOutput = join(temporary, "dispatch.mjs")
  execFileSync("taskset", ["-c", "10", "bend", join(import.meta.dirname, "../Dispatch.bend"), "-o", dispatchOutput], {
    timeout: 10000
  })
  const dispatch = (await import(pathToFileURL(dispatchOutput))).default
  let dispatchCases = 0
  const dispatchCommands = new Set()
  for (let mask = 0; mask < 16; mask++) {
    const valid = Boolean(mask & 1),
      accepted = Boolean(mask & 2),
      aborted = Boolean(mask & 4),
      interruptionAccepted = Boolean(mask & 8)
    const tape = [["CheckCredentialGeneration", tag("Flag", { value: valid })]]
    let terminal = tag("CredentialChanged")
    if (valid) {
      tape.push(["ClaimDemoBudget", tag("Ack")], ["StartRequest", tag("Flag", { value: accepted })])
      terminal = tag("StartRefused")
      if (accepted) {
        tape.push(["ObserveStarted", tag("Ack")], ["ReadAborted", tag("Flag", { value: aborted })])
        terminal = tag("Dispatched")
        if (aborted) {
          tape.push(["InterruptRequest", tag("Flag", { value: interruptionAccepted })])
          if (interruptionAccepted) tape.push(["ObserveInterrupted", tag("Ack")])
        }
      }
    }
    let state = dispatch.initial(83)
    for (const [id, [command, response]] of tape.entries()) {
      assert.equal(state.$, "Await")
      assert.deepEqual(state.request, tag("Request", { invocation: 83, id, command: tag(command) }))
      dispatchCommands.add(command)
      const reply = tag("Reply", { invocation: 83, id, response })
      for (const malformed of [
        { ...reply, invocation: 84 },
        { ...reply, id: id + 1 }
      ])
        assert.equal(dispatch.resume(state, malformed).$, "Rejected")
      assert.equal(dispatch.resume({ ...state, request: { ...state.request, invocation: 84 } }, reply).$, "Rejected")
      assert.equal(dispatch.resume({ ...state, request: { ...state.request, id: id + 1 } }, reply).$, "Rejected")
      assert.deepEqual(
        dispatch.resume(state, { ...reply, response: tag("Failed", { token: 29 }) }),
        tag("Aborted", { token: 29 })
      )
      assert.equal(
        dispatch.resume(state, { ...reply, response: response.$ === "Ack" ? tag("Flag", { value: true }) : tag("Ack") })
          .$,
        "Rejected"
      )
      state = dispatch.resume(state, reply)
      comparisons += 8
      prefixes++
    }
    assert.deepEqual(state, terminal)
    assert.equal(dispatch.resume(state, tag("Reply", { invocation: 83, id: 0, response: tag("Ack") })).$, "Rejected")
    dispatchCases++
    comparisons += 2
  }
  assert.equal(dispatchCommands.size, 7)
  console.log(
    JSON.stringify({
      passed: true,
      cases,
      prefixes,
      comparisons,
      commands: commandsCovered.size,
      dispatchCases,
      dispatchCommands: dispatchCommands.size,
      scope:
        "emitted authorization and nested dispatch candidates, independent ordered finite specifications and identity/failure refusals; not production connection or universal proof"
    })
  )
} finally {
  rmSync(temporary, { recursive: true, force: true })
}
