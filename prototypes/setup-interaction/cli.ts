import * as NodeServices from "@effect/platform-node/NodeServices"
import { Effect, Fiber, Terminal } from "effect"
import * as Prompt from "effect/cli/Prompt"
import { activeHost, command, initial, type Action, type Model } from "./domain.ts"
import { executeFake } from "./fake.ts"
import { withMachine } from "./machine.ts"
import { reduce } from "./reducer.ts"
import { terminal } from "./terminal.ts"
const plain = !!process.env.NO_COLOR
const theme = plain ? { primaryColor: "", mutedColor: "", successColor: "", errorColor: "", submittedColor: "" } : {}
const choice = (title: string, value: Action) => ({ title, value })
const runPrompt = <A>(prompt: Prompt.Prompt<A>) =>
  Effect.scoped(
    Prompt.run(prompt).pipe(Effect.provideService(Terminal.Terminal, terminal), Effect.provide(NodeServices.layer))
  )
function action(m: Model): Effect.Effect<Action, unknown> {
  if (m.phase === "Select")
    return runPrompt(
      Prompt.MultiSelect({
        message: "Select synthetic agents (Space, Enter; Ctrl+C cancels)",
        choices: ["Claude", "Codex", "Pi"].map((host) => ({ title: host, value: host })),
        min: 1,
        theme
      })
    ).pipe(Effect.map((hosts) => ({ kind: "select", hosts })))
  if (m.phase === "Credential") {
    const options = [
      choice("Project: /fake/project/.env.local", { kind: "destination", destination: "project" }),
      choice("User: /fake/user/.config/hapsland/.env", { kind: "destination", destination: "user" }),
      choice("Native store (simulated, no store access)", { kind: "destination", destination: "native" }),
      choice("Skip credential setup", { kind: "destination", destination: "skip" }),
      choice("Cancel", { kind: "cancel" })
    ]
    if (m.source !== "none") options.unshift(choice(`Keep existing: ${m.source}`, { kind: "keep" }))
    process.stderr.write(`Effective source: ${m.source}. Environment overrides saved files.\n`)
    return runPrompt(Prompt.Select({ message: "Where should the credential be available?", choices: options, theme }))
  }
  const message =
    m.phase === "Hooks"
      ? `Preview ${activeHost(m)} hooks; approval ${m.digest}`
      : m.phase === "SaveApproval"
        ? `Save fake key in ${m.destination}; approval ${m.digest}. Preserve unrelated entries; no actual write.`
        : "Run one separately consented key check? (simulated; zero paid requests)"
  return runPrompt(
    Prompt.Select({
      message,
      choices: [
        choice("Decline", { kind: "approve", yes: false }),
        choice("Approve", { kind: "approve", yes: true }),
        choice("Back", { kind: "back" }),
        choice("Cancel", { kind: "cancel" })
      ],
      theme
    })
  )
}
async function session(dispatch: (e: { revision: number; action: Action }) => Promise<Model>) {
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
              executeFake(model, () =>
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
  process.stderr.write(`RESULT ${JSON.stringify(model)}\n`)
  process.stdout.write(JSON.stringify(model) + "\n")
}
async function scopedRun<A>(effect: Effect.Effect<A, unknown>): Promise<A> {
  const controller = new AbortController()
  const interrupt = () => controller.abort()
  process.once("SIGINT", interrupt)
  process.once("SIGTERM", interrupt)
  process.once("SIGHUP", interrupt)
  const fiber = Effect.runFork(effect, { signal: controller.signal })
  try {
    return await Effect.runPromise(Fiber.join(fiber))
  } finally {
    process.off("SIGINT", interrupt)
    process.off("SIGTERM", interrupt)
    process.off("SIGHUP", interrupt)
  }
}
if (!process.stdin.isTTY || !process.stderr.isTTY || process.env.TERM === "dumb") {
  process.stderr.write(
    "Prototype requires interactive stdin/stderr and a capable terminal. Use bun compare.ts for a plain-text replay.\n"
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
