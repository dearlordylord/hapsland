// Adversarial, synthetic interaction checks. This imports only the throwaway
// prototype and its fake executor; it never reads credentials or touches stores.
import { Effect } from "effect"
import { isDeepStrictEqual } from "node:util"
import * as Fake from "./fake.ts"
import * as Domain from "./domain.ts"
import { command, initial, type Action, type Destination, type Event, type Model, type Phase } from "./domain.ts"
import { withMachine } from "./machine.ts"
import { reduce } from "./reducer.ts"

type Dispatch = (event: Event) => Promise<Model>
type Body = (dispatch: Dispatch, start: Model, check: Check) => Promise<void>
type Finding = { controller: string; check: string; detail: string }
type Check = (name: string, ok: boolean, detail: string) => void

const findings: Finding[] = []
let expectations = 0
const checkFor =
  (controller: string): Check =>
  (name, ok, detail) => {
    expectations++
    if (!ok) findings.push({ controller, check: name, detail })
  }
const send = (dispatch: Dispatch, model: Model, action: Action) => dispatch({ revision: model.revision, action })

async function eachController(start: Model, body: Body): Promise<void> {
  let reducerModel = start
  await body(
    async (event) => {
      reducerModel = reduce(reducerModel, event)
      return reducerModel
    },
    start,
    checkFor("reducer")
  )
  await withMachine(start, (dispatch) => body(dispatch, start, checkFor("effect-machine")))
}

async function toCredential(dispatch: Dispatch, model: Model): Promise<Model> {
  model = await send(dispatch, model, { kind: "select", hosts: ["Claude"] })
  model = await send(dispatch, model, { kind: "approve", yes: false })
  return model
}

async function saveFrom(dispatch: Dispatch, source: string, destination: Exclude<Destination, "skip">): Promise<Model> {
  let model = await toCredential(dispatch, initial(source))
  model = await send(dispatch, model, { kind: "destination", destination })
  model = await send(dispatch, model, { kind: "approve", yes: true })
  const pendingCommand = command(model)
  if (!pendingCommand) throw new Error("expected synthetic save command")
  return send(dispatch, model, { kind: "observed", commandId: pendingCommand.id, outcome: "saved" })
}

function detail(model: Model): string {
  return JSON.stringify(model)
}

const completedStates: Record<Phase, Action[]> = {
  Select: [
    { kind: "approve", yes: true },
    { kind: "keep" },
    { kind: "destination", destination: "project" },
    { kind: "observed", commandId: 0, outcome: "complete" }
  ],
  Hooks: [
    { kind: "keep" },
    { kind: "destination", destination: "skip" },
    { kind: "observed", commandId: 0, outcome: "complete" }
  ],
  Applying: [{ kind: "back" }, { kind: "cancel" }, { kind: "destination", destination: "skip" }, { kind: "keep" }],
  Credential: [
    { kind: "approve", yes: true },
    { kind: "observed", commandId: 0, outcome: "complete" }
  ],
  SaveApproval: [
    { kind: "keep" },
    { kind: "select", hosts: ["Pi"] },
    { kind: "observed", commandId: 0, outcome: "saved" }
  ],
  Saving: [{ kind: "back" }, { kind: "cancel" }, { kind: "destination", destination: "skip" }, { kind: "keep" }],
  CheckApproval: [
    { kind: "keep" },
    { kind: "select", hosts: ["Pi"] },
    { kind: "destination", destination: "skip" },
    { kind: "observed", commandId: 0, outcome: "checked" }
  ],
  Checking: [{ kind: "back" }, { kind: "cancel" }, { kind: "destination", destination: "skip" }, { kind: "keep" }],
  Done: [
    { kind: "back" },
    { kind: "cancel" },
    { kind: "approve", yes: true },
    { kind: "destination", destination: "project" },
    { kind: "select", hosts: ["Pi"] },
    { kind: "observed", commandId: 0, outcome: "late" }
  ],
  Cancelled: [
    { kind: "back" },
    { kind: "cancel" },
    { kind: "approve", yes: true },
    { kind: "destination", destination: "project" },
    { kind: "select", hosts: ["Pi"] },
    { kind: "observed", commandId: 0, outcome: "late" }
  ]
}

async function reach(dispatch: Dispatch, phase: Phase): Promise<Model> {
  let model = initial("environment")
  if (phase === "Select") return model
  model = await send(dispatch, model, { kind: "select", hosts: ["Claude"] })
  if (phase === "Hooks") return model
  if (phase === "Cancelled") return send(dispatch, model, { kind: "cancel" })
  if (phase === "Done") {
    model = await send(dispatch, model, { kind: "approve", yes: false })
    return send(dispatch, model, { kind: "destination", destination: "skip" })
  }
  if (phase === "Applying") return send(dispatch, model, { kind: "approve", yes: true })
  model = await send(dispatch, model, { kind: "approve", yes: false })
  if (phase === "Credential") return model
  if (phase === "SaveApproval" || phase === "Saving") {
    model = await send(dispatch, model, { kind: "destination", destination: "project" })
    if (phase === "SaveApproval") return model
    return send(dispatch, model, { kind: "approve", yes: true })
  }
  model = await send(dispatch, model, { kind: "keep" })
  if (phase === "CheckApproval") return model
  if (phase === "Checking") return send(dispatch, model, { kind: "approve", yes: true })
  throw new Error(`no phase path for ${phase}`)
}

await eachController(initial(), async (dispatch, start, check) => {
  let model = await send(dispatch, start, { kind: "select", hosts: ["Claude"] })
  model = await send(dispatch, model, { kind: "approve", yes: true })
  const pendingCommand = command(model)
  if (!pendingCommand) throw new Error("expected pending hook command")
  const completion: Event = {
    revision: model.revision,
    action: { kind: "observed", commandId: pendingCommand.id, outcome: "complete" }
  }
  model = await dispatch(completion)
  const afterFirstCompletion = model
  model = await dispatch(completion)
  check(
    "duplicate completion is rejected",
    isDeepStrictEqual(model, afterFirstCompletion) && model.results.Claude === "complete",
    `replayed observation changed or replaced the accepted result: ${detail(model)}`
  )
})

await eachController(initial(), async (dispatch, start, check) => {
  let model = await toCredential(dispatch, start)
  model = await send(dispatch, model, { kind: "cancel" })
  check("cancel works from credential choice", model.phase === "Cancelled", detail(model))
})

for (const phase of Object.keys(completedStates) as Phase[]) {
  for (const storedAction of completedStates[phase]) {
    await eachController(initial("environment"), async (dispatch, _start, check) => {
      const model = await reach(dispatch, phase)
      check(`fixture reaches ${phase}`, model.phase === phase, detail(model))
      const action = storedAction.kind === "observed" ? { ...storedAction, commandId: model.revision } : storedAction
      const after = await send(dispatch, model, action)
      check(
        `wrong-screen ${action.kind} ignored in ${phase}`,
        isDeepStrictEqual(after, model),
        `${action.kind} changed ${phase}: ${detail(after)}`
      )
    })
  }
}

await eachController(initial(), async (dispatch, start, check) => {
  let model = await send(dispatch, start, { kind: "select", hosts: ["Claude", "Codex"] })
  model = await send(dispatch, model, { kind: "approve", yes: true })
  let current = command(model)
  if (!current) throw new Error("expected first hook command")
  model = await send(dispatch, model, { kind: "observed", commandId: current.id, outcome: "partial: restart required" })
  model = await send(dispatch, model, { kind: "approve", yes: false })
  model = await send(dispatch, model, { kind: "destination", destination: "skip" })
  const output = detail(model)
  check(
    "all completed hook outcomes survive skip",
    model.phase === "Done" &&
      model.results.Claude === "partial: restart required" &&
      model.results.Codex === "declined",
    output
  )
  const readinessFunction = Reflect.get(Domain, "readiness")
  const readiness = typeof readinessFunction === "function" ? readinessFunction(model) : Reflect.get(model, "readiness")
  const readinessRecord = typeof readiness === "object" && readiness !== null ? readiness : undefined
  check(
    "done-without-credential exposes readiness blocker",
    readinessRecord !== undefined &&
      Reflect.get(readinessRecord, "credentialAvailable") === false &&
      /missing|unavailable|configure/i.test(JSON.stringify(readinessRecord)),
    `readiness omits credential availability or recovery guidance: ${JSON.stringify(readiness) ?? output}`
  )
})

const rawOwnerError = "EACCES path=/fake/private/.env key=SWARM_SECRET_SENTINEL"
await eachController(initial(), async (dispatch, start, check) => {
  let model = await send(dispatch, start, { kind: "select", hosts: ["Claude"] })
  model = await send(dispatch, model, { kind: "approve", yes: true })
  const pendingCommand = command(model)
  if (!pendingCommand) throw new Error("expected pending hook command")
  const hostileEvent = {
    revision: model.revision,
    action: { kind: "observed", commandId: pendingCommand.id, outcome: rawOwnerError }
  } as unknown as Event
  model = await dispatch(hostileEvent)
  check(
    "raw owner error is scrubbed before entering state",
    !detail(model).includes("SWARM_SECRET_SENTINEL"),
    `source-bearing owner error appears in serialized state: ${detail(model)}`
  )
})

const effectiveSourceCases: Array<{
  source: string
  destination: "project" | "user" | "native"
  shouldRemain: boolean
  marker: string
}> = [
  { source: "project .env.local", destination: "user", shouldRemain: true, marker: ".env.local" },
  { source: "project .env", destination: "native", shouldRemain: true, marker: "project .env" },
  { source: "user", destination: "native", shouldRemain: true, marker: "user" },
  { source: "native", destination: "project", shouldRemain: false, marker: "project" },
  { source: "environment", destination: "project", shouldRemain: true, marker: "environment" }
]
for (const scenario of effectiveSourceCases) {
  await eachController(initial(scenario.source), async (dispatch, _start, check) => {
    const model = await saveFrom(dispatch, scenario.source, scenario.destination)
    const source = model.source
    const ok = scenario.shouldRemain
      ? source.includes(scenario.marker) &&
        !(scenario.source === "project .env.local" && source === "user") &&
        !(scenario.source === "project .env" && source === "native") &&
        !(scenario.source === "user" && source === "native")
      : source.includes(scenario.marker) && source !== "native"
    check(
      `effective source after ${scenario.destination} save from ${scenario.source}`,
      ok,
      `reported source=${JSON.stringify(source)}; prior source=${JSON.stringify(scenario.source)}`
    )
  })
}

await eachController(initial("project .env.local"), async (dispatch, _start, check) => {
  let model = await saveFrom(dispatch, "project .env.local", "user")
  model = await send(dispatch, model, { kind: "back" })
  model = await send(dispatch, model, { kind: "destination", destination: "native" })
  model = await send(dispatch, model, { kind: "approve", yes: true })
  const pendingCommand = command(model)
  if (!pendingCommand) throw new Error("expected second synthetic save command")
  model = await send(dispatch, model, { kind: "observed", commandId: pendingCommand.id, outcome: "saved" })
  check(
    "repeated lower-priority saves keep the effective project credential source",
    model.source.includes(".env.local") && !model.source.startsWith("native"),
    `reported source after user then native saves=${JSON.stringify(model.source)}`
  )
})

await eachController(initial(), async (dispatch, start, check) => {
  let model = await toCredential(dispatch, start)
  model = await send(dispatch, model, { kind: "destination", destination: "user" })
  model = await send(dispatch, model, { kind: "approve", yes: true })
  const pendingCommand = command(model)
  if (!pendingCommand) throw new Error("expected pending save command")
  const beforeCancel = model
  model = await send(dispatch, model, { kind: "cancel" })
  check("pending save cannot be abandoned before owner outcome", isDeepStrictEqual(model, beforeCancel), detail(model))
  model = await send(dispatch, model, { kind: "observed", commandId: pendingCommand.id, outcome: "failed" })
  check(
    "save failure returns to credential choice and clears approval digest",
    model.phase === "Credential" && model.digest === "" && model.results.Claude === "declined",
    detail(model)
  )
  model = await send(dispatch, model, { kind: "cancel" })
  check(
    "cancel after failed save preserves completed hook result",
    model.phase === "Cancelled" && model.results.Claude === "declined",
    detail(model)
  )
})

await eachController(initial(), async (dispatch, start, check) => {
  let model = await toCredential(dispatch, start)
  model = await send(dispatch, model, { kind: "destination", destination: "project" })
  model = await send(dispatch, model, { kind: "approve", yes: true })
  const pendingCommand = command(model)
  if (!pendingCommand) throw new Error("expected pending partial-save command")
  model = await send(dispatch, model, {
    kind: "observed",
    commandId: pendingCommand.id,
    outcome: "partial: file written but permissions could not be tightened"
  })
  check(
    "partial save reports bounded recovery status and clears approval digest",
    model.phase === "Credential" &&
      model.digest === "" &&
      model.credentialOutcome === "partial: credential save needs recovery",
    detail(model)
  )
  const readinessFunction = Reflect.get(Domain, "readiness")
  const readiness = typeof readinessFunction === "function" ? readinessFunction(model) : undefined
  check(
    "partial save recovery reaches final readiness",
    typeof readiness === "object" &&
      readiness !== null &&
      Reflect.get(readiness, "setup") === "needs action" &&
      Reflect.get(readiness, "credentialRecovery") === "partial: credential save needs recovery",
    JSON.stringify(readiness) ?? detail(model)
  )
})

// A command projection may be read more than once. The side-effect boundary
// must be session-local and idempotent for a repeated pending command ID.
const fakeExports = Fake as unknown as Record<string, unknown>
const makeExecutor = fakeExports.createFakeExecutor
const callLog = fakeExports.calls
if (typeof makeExecutor !== "function") {
  findings.push({
    controller: "runner",
    check: "per-session command execution is idempotent",
    detail: "createFakeExecutor() is missing; no session-local dispatch guard can be exercised"
  })
} else if (Array.isArray(callLog)) {
  type Executor = (model: Model) => Effect.Effect<string, unknown>
  const factory = makeExecutor as () => Executor
  const cases: Model[] = [
    { ...initial(), phase: "Applying", hosts: ["Claude"], digest: "hook" },
    { ...initial(), phase: "Saving", destination: "user", digest: "save" },
    { ...initial(), phase: "Checking" }
  ]
  for (const model of cases) {
    const execute = factory()
    const before = callLog.length
    const [first, second] = await Promise.all([Effect.runPromise(execute(model)), Effect.runPromise(execute(model))])
    const after = callLog.length
    await Effect.runPromise(execute(model))
    const afterReplay = callLog.length
    const freshSession = factory()
    await Effect.runPromise(freshSession(model))
    const afterFreshSession = callLog.length
    checkFor("runner")(
      `command ${command(model)?.type ?? "unknown"} deduplicates only within one session`,
      first === second && after - before === 1 && afterReplay === after && afterFreshSession - afterReplay === 1,
      `calls=${before}->${after}->${afterReplay}->${afterFreshSession}; outcomes=${first}/${second}`
    )
  }

  const model = cases[0]
  if (model) {
    const execute = factory()
    const before = callLog.length
    await Effect.runPromise(execute(model))
    let rejected = false
    let result = ""
    try {
      result = await Effect.runPromise(execute({ ...model, hosts: ["Pi"] }))
    } catch {
      rejected = true
    }
    checkFor("runner")(
      "same command ID with a different fingerprint performs no second side effect",
      (rejected || result === "failed") && callLog.length - before === 1,
      `fingerprint conflict rejected=${rejected}; result=${result}; calls=${before}->${callLog.length}`
    )
  }
}

console.log(JSON.stringify({ checks: "synthetic setup interaction adversary", expectations, findings }, null, 2))
if (findings.length > 0) process.exitCode = 1
