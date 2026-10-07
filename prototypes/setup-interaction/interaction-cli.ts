// THROWAWAY: physical interaction seam probe; no production credential owner.
import { Effect, Exit, Redacted } from "effect"
import { withInteractionSession } from "./interaction-session.ts"
const mode = process.argv[2] ?? "hidden"
const source = process.argv.includes("--controlling-terminal") ? "controlling-terminal" : "stdin"
const exit = await Effect.runPromiseExit(
  withInteractionSession(
    (interaction) =>
      Effect.gen(function* () {
        if (mode === "many")
          return yield* interaction.chooseMany({
            message: "Choose synthetic targets",
            back: true,
            choices: [
              { id: "a", title: "Alpha", value: "a" },
              { id: "b", title: "Beta", value: "b" }
            ]
          })
        if (mode === "confirm")
          return yield* interaction.confirm({ message: "Apply fake changes?", preview: "No real writes.", back: true })
        const key = yield* interaction.hidden("Enter fake secret")
        Redacted.wipeUnsafe(key)
        return { kind: "captured" }
      }).pipe(Effect.catchTag("QuitError", () => Effect.succeed({ kind: "terminated" }))),
    Effect.succeed({ kind: "interrupted" }),
    source
  )
)
if (Exit.isSuccess(exit)) process.stdout.write(JSON.stringify(exit.value) + "\n")
else {
  process.stderr.write(
    "Interaction session failed or input is unavailable. Inspect terminal capability before retrying.\n"
  )
  process.exitCode = 2
}
