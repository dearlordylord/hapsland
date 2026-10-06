import * as NodeServices from "@effect/platform-node/NodeServices"
import { Deferred, Effect, Fiber, Terminal } from "effect"
import * as Prompt from "effect/cli/Prompt"
import { activeHost, command, initial, readiness, type Action, type Model } from "./domain.ts"
import { createFakeExecutor } from "./fake.ts"
import { withMachine } from "./machine.ts"
import { reduce } from "./reducer.ts"
import { selectionPrompt } from "./selection.ts"
import { makeTerminal, terminal } from "./terminal.ts"
// Signal cancellation is session-wide; repeated/group signals must not bypass cleanup.
const signals = ["SIGINT", "SIGTERM", "SIGHUP"] as const
let signalCancelled = false
let activeController: AbortController | undefined
const onSignal = () => {
  signalCancelled = true
  activeController?.abort()
}
for (const signal of signals) process.on(signal, onSignal)
const plain = !!process.env.NO_COLOR
const theme = plain ? { primaryColor: "", mutedColor: "", successColor: "", errorColor: "", submittedColor: "" } : {}
const choice = (title: string, value: Action) => ({ title, value })
const runPrompt = <A>(prompt: Prompt.Prompt<A>) =>
  Effect.scoped(
    Prompt.run(prompt).pipe(Effect.provideService(Terminal.Terminal, terminal), Effect.provide(NodeServices.layer))
  )
// Escape navigation races the menu through public Effect APIs; the prompt scope cleans up the losing input reader.
const runMenu = (prompt: Prompt.Prompt<Action>) =>
  Effect.scoped(
    Effect.gen(function* () {
      const back = yield* Deferred.make<Action>()
      const menuTerminal = makeTerminal(() => Deferred.doneUnsafe(back, Effect.succeed({ kind: "back" })))
      return yield* Effect.raceFirst(
        Prompt.run(prompt).pipe(
          Effect.provideService(Terminal.Terminal, menuTerminal),
          Effect.provide(NodeServices.layer)
        ),
        Deferred.await(back)
      )
    })
  )
function action(m: Model): Effect.Effect<Action, unknown> {
  if (m.phase === "Select") return runPrompt(selectionPrompt(m.hosts))
  if (m.phase === "Credential") {
    const options = [
      choice("Project: /fake/project/.env.local", { kind: "destination", destination: "project" }),
      choice("User: /fake/user/.config/hapsland/.env", { kind: "destination", destination: "user" }),
      choice("Native store (simulated, no store access)", { kind: "destination", destination: "native" }),
      choice("Skip credential setup", { kind: "destination", destination: "skip" }),
      choice("Back to agents", { kind: "back" }),
      choice("Exit", { kind: "cancel" })
    ]
    if (m.source !== "none") options.unshift(choice(`Keep existing: ${m.source}`, { kind: "keep" }))
    process.stderr.write(`Credential result: ${m.credentialOutcome}. Last saved destination: ${m.savedDestination}.\n`)
    process.stderr.write(`Effective source: ${m.source}. Environment overrides saved files.\n`)
    process.stderr.write("Esc: Back to agents\n")
    return runMenu(Prompt.Select({ message: "Where should the credential be available?", choices: options, theme }))
  }
  const message =
    m.phase === "Hooks"
      ? `Preview ${activeHost(m)} hooks; approval ${m.digest}`
      : m.phase === "SaveApproval"
        ? `Save fake key in ${m.destination}; approval ${m.digest}. Preserve unrelated entries; no actual write.`
        : "Run one separately consented key check? (simulated; zero paid requests)"
  process.stderr.write("Esc: Back\n")
  return runMenu(
    Prompt.Select({
      message,
      choices: [
        choice("Decline", { kind: "approve", yes: false }),
        choice("Approve", { kind: "approve", yes: true }),
        choice("Back", { kind: "back" }),
        choice("Exit", { kind: "cancel" })
      ],
      theme
    })
  )
}
async function session(dispatch: (e: { revision: number; action: Action }) => Promise<Model>) {
  const execute = createFakeExecutor()
  let model = initial(process.argv.includes("--existing") ? "environment" : "none")
  while (model.phase !== "Done" && model.phase !== "Cancelled") {
    process.stderr.write(`STATE ${JSON.stringify(model)}\n`)
    const c = command(model)
    try {
      const a: Action = c
        ? {
            kind: "observed",
            commandId: c.id,
            outcome: await scopedRun(
              execute(model, () =>
                runPrompt(Prompt.Hidden({ message: "Enter a FAKE key only; it is discarded", theme }))
              )
            )
          }
        : await scopedRun(action(model))
      model = await dispatch({ revision: model.revision, action: a })
    } catch {
      // Input termination before save returns a safe failure; other idle input cancels.
      model = await dispatch({
        revision: model.revision,
        action: c ? { kind: "observed", commandId: c.id, outcome: "cancelled" } : { kind: "cancel" }
      })
      if (c?.type === "save") model = await dispatch({ revision: model.revision, action: { kind: "cancel" } })
    }
  }
  const status = readiness(model)
  if (!model.hosts.length && model.phase === "Done")
    process.stderr.write("No agents selected. No further hook changes; prior results are retained.\n")
  if (model.declinedUpdates.length)
    process.stderr.write(`Declined updates kept prior setup results for: ${model.declinedUpdates.join(", ")}.\n`)
  process.stderr.write(`Credential save: ${model.credentialOutcome}.\n`)
  process.stderr.write(
    `Setup: ${status.setup}. Credential: ${status.credentials}. ${status.verification}.\nNext: ${status.next}\n`
  )
  process.stderr.write(`RESULT ${JSON.stringify(model)}\n`)
  process.stdout.write(JSON.stringify(model) + "\n")
}
async function scopedRun<A>(effect: Effect.Effect<A, unknown>): Promise<A> {
  const controller = new AbortController()
  activeController = controller
  if (signalCancelled) controller.abort()
  const fiber = Effect.runFork(effect, { signal: controller.signal })
  try {
    return await Effect.runPromise(Fiber.join(fiber))
  } finally {
    if (activeController === controller) activeController = undefined
  }
}
try {
  if (!process.stdin.isTTY || !process.stderr.isTTY || process.env.TERM === "dumb") {
    process.stderr.write(
      "Prototype requires interactive stdin/stderr and a capable terminal. Use npm run compare for a plain-text replay.\n"
    )
    process.exitCode = 2
  } else if (process.argv.includes("--machine")) {
    await withMachine(initial(process.argv.includes("--existing") ? "environment" : "none"), session)
  } else {
    let model = initial(process.argv.includes("--existing") ? "environment" : "none")
    await session(async (e) => {
      model = reduce(model, e)
      return model
    })
  }
} finally {
  for (const signal of signals) process.off(signal, onSignal)
}
