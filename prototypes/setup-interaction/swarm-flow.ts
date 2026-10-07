// THROWAWAY: bounded, synthetic adversarial checks for the setup interaction flow.
// No production imports, storage, environment reads, network, or provider calls.
import { withMachine } from "./machine.ts"
import { initial, command, readiness, type Action, type Event, type Model } from "./domain.ts"
import { reduce } from "./reducer.ts"

type Controller = "reducer" | "effect-machine"
type Send = (action: Action, revision?: number, commandId?: number) => Promise<Model>
type Finding = { controller: Controller; case: string; expected: string; observed: string; severity: "high" | "medium" }

const findings: Finding[] = []
let expectationCount = 0
const check = (
  controller: Controller,
  name: string,
  condition: boolean,
  expected: string,
  observed: string,
  severity: Finding["severity"] = "medium"
) => {
  expectationCount += 1
  if (!condition) findings.push({ controller, case: name, expected, observed, severity })
}

async function exercise<A>(
  controller: Controller,
  source: string,
  body: (send: Send, read: () => Model) => Promise<A>
): Promise<A> {
  let current = initial(source)
  if (controller === "reducer") {
    const send: Send = async (action, revision = current.revision, commandId) => {
      const event: Event = {
        revision,
        action: action.kind === "observed" && commandId !== undefined ? { ...action, commandId } : action
      }
      current = reduce(current, event)
      return current
    }
    return body(send, () => current)
  }
  return withMachine(current, async (dispatch) => {
    const send: Send = async (action, revision = current.revision, commandId) => {
      const event: Event = {
        revision,
        action: action.kind === "observed" && commandId !== undefined ? { ...action, commandId } : action
      }
      current = await dispatch(event)
      return current
    }
    return body(send, () => current)
  })
}

async function observed(send: Send, model: Model, outcome: string, commandId?: number) {
  const active = command(model)
  if (!active) throw new Error(`expected a pending command in ${model.phase}`)
  return send({ kind: "observed", commandId: active.id, outcome }, model.revision, commandId)
}

async function toCredential(send: Send) {
  let model = await send({ kind: "select", hosts: ["Claude"] })
  model = await send({ kind: "approve", yes: false })
  return model
}

// The repository's lookup order is env > project .env.local > project .env > user file > native.
// A successfully written lower-priority destination cannot become the reported effective source.
const sources = ["environment", "project .env.local", "project .env", "user", "native"] as const
const sourcePriority = (source: string) =>
  source.startsWith("environment")
    ? 5
    : source === "project .env.local" || source === "project"
      ? 4
      : source === "project .env"
        ? 3
        : source === "user"
          ? 2
          : source === "native"
            ? 1
            : 0
const destinationPriority = { project: 4, user: 2, native: 1 } as const

for (const controller of ["reducer", "effect-machine"] as const) {
  // The actual client picker permits deselecting every host. That is a successful no-op setup,
  // distinct from cancellation, and cannot accidentally issue hook/credential work.
  await exercise(controller, "none", async (send, read) => {
    const model = await send({ kind: "select", hosts: [] })
    const status = readiness(model)
    check(
      controller,
      "empty host selection finishes as a no-op",
      model.phase === "Done" && model.hosts.length === 0 && command(model) === undefined,
      "zero selected hosts reaches a completed no-op result with no command",
      `phase=${model.phase}; hosts=${JSON.stringify(model.hosts)}; command=${JSON.stringify(command(model))}; readiness=${JSON.stringify(status)}`,
      "high"
    )
    check(
      controller,
      "empty host selection is distinct from cancellation",
      model.phase === "Done",
      "empty selection reports completion instead of user cancellation",
      `phase=${model.phase}; readiness=${JSON.stringify(status)}`
    )
    return read()
  })

  for (const source of sources) {
    for (const destination of ["project", "user", "native"] as const) {
      const name = `precedence ${source} -> ${destination}`
      await exercise(controller, source, async (send, read) => {
        await toCredential(send)
        await send({ kind: "destination", destination })
        let model = await send({ kind: "approve", yes: true })
        model = await observed(send, model, "saved")
        const expectedPriority = Math.max(sourcePriority(source), destinationPriority[destination])
        const actualPriority = sourcePriority(model.source)
        check(
          controller,
          name,
          actualPriority === expectedPriority,
          `effective source priority ${expectedPriority} (keep ${source} when it outranks ${destination})`,
          `source=${JSON.stringify(model.source)}; priority=${actualPriority}`,
          "high"
        )
        return read()
      })
    }
  }

  // The exact environment sentinel is converted into a descriptive string after one save.
  // Saving again to another lower-priority destination must still remember that env wins.
  await exercise(controller, "environment", async (send, read) => {
    await toCredential(send)
    await send({ kind: "destination", destination: "user" })
    let model = await send({ kind: "approve", yes: true })
    model = await observed(send, model, "saved")
    model = await send({ kind: "back" })
    model = await send({ kind: "destination", destination: "project" })
    model = await send({ kind: "approve", yes: true })
    model = await observed(send, model, "saved")
    check(
      controller,
      "repeated save keeps environment precedence",
      sourcePriority(model.source) === 5,
      "environment remains effective after both user and project saves",
      `source=${JSON.stringify(model.source)}`,
      "high"
    )
    return read()
  })

  // Setup can fail after a destination was touched. The proposal requires partial writes and
  // failure outcomes to remain explicit, while untrusted owner text stays out of model/UI state.
  await exercise(controller, "none", async (send, read) => {
    await toCredential(send)
    await send({ kind: "destination", destination: "user" })
    let model = await send({ kind: "approve", yes: true })
    const ownerText =
      "partial: synthetic file write completed; permission repair failed; sentinel=OWNER_TEXT_SECRET_MUST_NOT_SURVIVE"
    model = await observed(send, model, ownerText)
    const visible = JSON.stringify(model)
    const status = readiness(model)
    check(
      controller,
      "partial save has a canonical recovery status",
      status.setup === "needs action" || visible.includes("recovery") || visible.includes("failed"),
      "the model/final readiness exposes a safe failure or recovery state",
      `readiness=${JSON.stringify(status)}; model=${visible}`,
      "high"
    )
    check(
      controller,
      "partial save does not retain untrusted owner text",
      !visible.includes("OWNER_TEXT_SECRET_MUST_NOT_SURVIVE") &&
        !JSON.stringify(status).includes("permission repair failed"),
      "only a canonical outcome is retained; owner diagnostic text is excluded",
      `readiness=${JSON.stringify(status)}; model=${visible}`,
      "high"
    )
    return read()
  })

  // A Back input from the credential choice currently has no transition. Once setup reaches
  // credentials, users must be able to return to the completed host choices/results to correct them.
  await exercise(controller, "none", async (send, read) => {
    let model = await send({ kind: "select", hosts: ["Claude", "Codex"] })
    model = await send({ kind: "approve", yes: true })
    model = await observed(send, model, "complete")
    model = await send({ kind: "approve", yes: false })
    const before = model
    model = await send({ kind: "back" })
    check(
      controller,
      "Back from credential step can revisit host choices",
      model.phase !== before.phase,
      "Back leaves Credential and returns to a prior editable setup step",
      `phase stayed ${model.phase}; revision ${before.revision} -> ${model.revision}`,
      "medium"
    )
    check(
      controller,
      "completed host result survives credential Back",
      model.results.Claude === "complete" && model.results.Codex === "declined",
      "both completed host outcomes remain visible when revisiting setup",
      `results=${JSON.stringify(model.results)}`,
      "medium"
    )
    return read()
  })

  // Reselect after a completed host: keep prior durable outcomes, update the active target set,
  // and require a fresh explicit approval before issuing any additional hook command.
  await exercise(controller, "none", async (send, read) => {
    let model = await send({ kind: "select", hosts: ["Claude", "Codex"] })
    model = await send({ kind: "approve", yes: true })
    model = await observed(send, model, "complete")
    model = await send({ kind: "back" })
    model = await send({ kind: "select", hosts: ["Pi"] })
    check(
      controller,
      "reselect does not discard completed host outcomes",
      model.results.Claude === "complete",
      "the already-applied Claude result remains in shared context",
      `results=${JSON.stringify(model.results)}`
    )
    check(
      controller,
      "reselect alone does not issue a write",
      command(model) === undefined,
      "selection waits for a fresh hook approval",
      `phase=${model.phase}; command=${JSON.stringify(command(model))}`,
      "high"
    )
    model = await send({ kind: "approve", yes: true })
    check(
      controller,
      "reselected host targets the new selection",
      command(model)?.target === "Pi",
      "the next apply command targets Pi only",
      `command=${JSON.stringify(command(model))}`,
      "high"
    )
    return read()
  })

  // A retry is not an undo. Back and selecting the same host again must not let a declined second
  // attempt erase a previously applied complete/partial outcome from final readiness.
  for (const priorOutcome of ["complete", "partial: restart required"] as const) {
    await exercise(controller, "none", async (send, read) => {
      let model = await send({ kind: "select", hosts: ["Claude"] })
      model = await send({ kind: "approve", yes: true })
      model = await observed(send, model, priorOutcome)
      model = await send({ kind: "back" })
      model = await send({ kind: "select", hosts: ["Claude"] })
      model = await send({ kind: "approve", yes: false })
      const status = readiness(model)
      check(
        controller,
        `reselect Claude then decline preserves prior ${priorOutcome} outcome`,
        String(model.results.Claude).includes(priorOutcome),
        `the prior applied ${priorOutcome} result remains in final results because decline made no write`,
        `results=${JSON.stringify(model.results)}; readiness=${JSON.stringify(status)}`,
        "high"
      )
      check(
        controller,
        `reselect Claude then decline preserves prior ${priorOutcome} readiness`,
        priorOutcome === "complete" ? status.setup === "configured (simulated)" : status.setup === "needs action",
        `final readiness still reflects the earlier ${priorOutcome} operation`,
        `results=${JSON.stringify(model.results)}; readiness=${JSON.stringify(status)}`,
        "high"
      )
      return read()
    })
  }

  // Wrong operation results must fail closed, expose a canonical recovery status, and never persist
  // arbitrary owner diagnostics. Here a save command returns an apply-shaped result.
  await exercise(controller, "none", async (send, read) => {
    await toCredential(send)
    await send({ kind: "destination", destination: "native" })
    let model = await send({ kind: "approve", yes: true })
    const ownerText = "hook partially installed; native store unavailable; sentinel=OWNER_DIAGNOSTIC_SECRET"
    model = await observed(send, model, ownerText)
    const visible = JSON.stringify(model)
    const status = readiness(model)
    check(
      controller,
      "inconsistent save result creates visible recovery",
      model.phase === "Credential" &&
        (status.setup === "needs action" || visible.includes("recovery") || visible.includes("failed")),
      "the flow returns to credential recovery with a canonical failure status",
      `phase=${model.phase}; readiness=${JSON.stringify(status)}; model=${visible}`,
      "high"
    )
    check(
      controller,
      "inconsistent owner diagnostic is not retained",
      !visible.includes("OWNER_DIAGNOSTIC_SECRET") && !JSON.stringify(status).includes("native store unavailable"),
      "untrusted owner text is replaced by a generic safe status",
      `readiness=${JSON.stringify(status)}; model=${visible}`,
      "high"
    )
    return read()
  })

  // Retry after a failed write must expose the failure, clear the old approval digest, and require
  // a fresh destination choice and approval before issuing another save command.
  await exercise(controller, "none", async (send, read) => {
    await toCredential(send)
    let model = await send({ kind: "destination", destination: "user" })
    model = await send({ kind: "approve", yes: true })
    const firstCommand = command(model)
    if (!firstCommand) throw new Error("expected first save command")
    model = await observed(send, model, "failed")
    check(
      controller,
      "save failure leaves a safe recovery status",
      model.phase === "Credential" && model.credentialOutcome === "failed" && model.digest === "",
      "failure is visible and the old preview/approval digest is cleared",
      `phase=${model.phase}; credentialOutcome=${model.credentialOutcome}; digest=${model.digest}`,
      "high"
    )
    model = await send({ kind: "destination", destination: "user" })
    check(
      controller,
      "retry waits for a fresh approval",
      model.phase === "SaveApproval" && command(model) === undefined,
      "choosing the same destination alone cannot retry the write",
      `phase=${model.phase}; command=${JSON.stringify(command(model))}`,
      "high"
    )
    model = await send({ kind: "approve", yes: true })
    const retryCommand = command(model)
    check(
      controller,
      "retry issues a newly correlated save",
      retryCommand !== undefined && retryCommand.id !== firstCommand.id && retryCommand.target === firstCommand.target,
      "the second write has a fresh command ID and the explicitly reselected target",
      `first=${JSON.stringify(firstCommand)}; retry=${JSON.stringify(retryCommand)}`,
      "high"
    )
    model = await observed(send, model, "saved")
    check(
      controller,
      "successful retry clears recovery status",
      model.phase === "CheckApproval" && model.source === "user" && model.credentialOutcome === "saved",
      "the credential becomes available and the failed-save status is resolved",
      `phase=${model.phase}; source=${model.source}; credentialOutcome=${model.credentialOutcome}`,
      "high"
    )
    model = await send({ kind: "approve", yes: false })
    check(
      controller,
      "declining verification after retry remains unverified",
      model.phase === "Done" && model.check === "not requested",
      "save success does not imply paid verification",
      `phase=${model.phase}; check=${model.check}`
    )
    return read()
  })

  // Existing-source and skip precedence: keep is a read-only path; skip cannot start a write or
  // a paid check, and it must not erase the source already selected by lookup precedence.
  await exercise(controller, "project .env.local", async (send, read) => {
    await toCredential(send)
    let model = await send({ kind: "keep" })
    check(
      controller,
      "keep existing credential does not save",
      model.phase === "CheckApproval" && model.source === "project .env.local" && command(model) === undefined,
      "existing project credential remains effective and no save command is issued",
      `phase=${model.phase}; source=${model.source}; command=${JSON.stringify(command(model))}`
    )
    model = await send({ kind: "back" })
    model = await send({ kind: "destination", destination: "skip" })
    check(
      controller,
      "skip preserves an existing effective source",
      model.phase === "Done" && model.source === "project .env.local" && model.check === "not requested",
      "skip ends setup without changing the existing source or requesting verification",
      `phase=${model.phase}; source=${model.source}; check=${model.check}; command=${JSON.stringify(command(model))}`
    )
    return read()
  })

  // Every Back that leaves an approval screen invalidates its prior yes. An old click must not
  // issue a save/check after the user has returned to choose a different path.
  await exercise(controller, "none", async (send, read) => {
    await toCredential(send)
    let model = await send({ kind: "destination", destination: "user" })
    const staleSaveRevision = model.revision
    model = await send({ kind: "back" })
    model = await send({ kind: "approve", yes: true }, staleSaveRevision)
    check(
      controller,
      "Back invalidates save approval",
      model.phase === "Credential" && command(model) === undefined,
      "a prior save approval cannot enter Saving after Back",
      `phase=${model.phase}; command=${JSON.stringify(command(model))}`,
      "high"
    )
    model = await send({ kind: "destination", destination: "native" })
    const staleDestination = model.revision
    model = await send({ kind: "back" })
    model = await send({ kind: "destination", destination: "project" })
    model = await send({ kind: "approve", yes: true }, staleDestination)
    check(
      controller,
      "changing destination invalidates old consent",
      model.phase === "SaveApproval" && command(model) === undefined && model.destination === "project",
      "the old destination's yes cannot save the newly selected destination",
      `phase=${model.phase}; destination=${model.destination}; command=${JSON.stringify(command(model))}`,
      "high"
    )
    return read()
  })

  // Correlation controls: late and wrong-ID responses must not advance a currently pending write.
  await exercise(controller, "none", async (send, read) => {
    let model = await send({ kind: "select", hosts: ["Codex"] })
    model = await send({ kind: "approve", yes: true })
    const pending = model
    model = await observed(send, model, "complete", 999_999)
    check(
      controller,
      "wrong command ID is ignored",
      model.phase === pending.phase && model.revision === pending.revision,
      "pending apply remains unchanged after a foreign reply",
      `before=${pending.phase}@${pending.revision}; after=${model.phase}@${model.revision}`,
      "high"
    )
    model = await observed(send, model, "complete")
    check(
      controller,
      "matching command ID completes current write",
      model.phase === "Credential" && model.results.Codex === "complete",
      "matching reply records Codex completion and advances",
      `phase=${model.phase}; results=${JSON.stringify(model.results)}`,
      "high"
    )
    return read()
  })

  // A completion already consumed before Back/cancel must remain stale even if the late sender
  // retries the identical event after the session has reached a terminal state.
  await exercise(controller, "none", async (send, read) => {
    await toCredential(send)
    let model = await send({ kind: "destination", destination: "user" })
    model = await send({ kind: "approve", yes: true })
    const save = command(model)
    if (!save) throw new Error("expected save command before duplicate completion check")
    model = await observed(send, model, "saved")
    model = await send({ kind: "back" })
    model = await send({ kind: "cancel" })
    const terminal = model
    model = await send({ kind: "observed", commandId: save.id, outcome: "saved" }, save.id, save.id)
    check(
      controller,
      "duplicate save reply after Back and cancel stays stale",
      model.phase === "Cancelled" && model.revision === terminal.revision && model.source === terminal.source,
      "a completion from the prior save cannot change a cancelled session",
      `before=${terminal.phase}@${terminal.revision}; after=${model.phase}@${model.revision}; source=${model.source}`,
      "high"
    )
    return read()
  })
}

console.log(
  JSON.stringify(
    {
      runtime: Bun.version,
      controllers: ["reducer", "effect-machine"],
      independentSemanticExpectations: expectationCount,
      findings,
      status: findings.length === 0 ? "PASS" : "FAIL"
    },
    null,
    2
  )
)
if (findings.length > 0) process.exitCode = 1
