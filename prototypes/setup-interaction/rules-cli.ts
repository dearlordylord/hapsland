// THROWAWAY: standalone rules demo; one top-level Effect runtime.
import { Deferred, Effect, Exit } from "effect"
import { liveInteraction } from "./interaction.ts"
import { runRules } from "./rules-flow.ts"
import { createRulesOwner, type OwnerOutcome } from "./rules-owner.ts"
import type { RuleAction } from "./rules-model.ts"
const argument = (name: string) => process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3)
const action = argument("action") ?? "create"
const outcome = argument("outcome") ?? "applied"
if (
  !["create", "connect", "enable", "disable"].includes(action) ||
  !["applied", "failed", "partial", "stale"].includes(outcome)
) {
  process.stderr.write("Use --action=create|connect|enable|disable and --outcome=applied|failed|partial|stale.\n")
  process.exitCode = 2
} else if (!process.stdin.isTTY || !process.stderr.isTTY || process.env.TERM === "dumb") {
  process.stderr.write(
    "Rules prototype requires interactive stdin/stderr. Use npm run rules:probe for a scripted replay.\n"
  )
  process.exitCode = 2
} else {
  const program = Effect.scoped(
    Effect.gen(function* () {
      const stop = yield* Deferred.make<void>()
      const signals = ["SIGINT", "SIGTERM", "SIGHUP"] as const
      const cancel = () => Deferred.doneUnsafe(stop, Effect.void)
      yield* Effect.acquireRelease(
        Effect.sync(() => signals.forEach((signal) => process.on(signal, cancel))),
        () => Effect.sync(() => signals.forEach((signal) => process.off(signal, cancel)))
      )
      const owner = createRulesOwner(outcome as OwnerOutcome)
      const result = yield* Effect.raceFirst(
        runRules(liveInteraction, owner, action as RuleAction).pipe(
          Effect.map((model) => ({ ...model, simulatedWrites: owner.writes() }))
        ),
        Deferred.await(stop).pipe(Effect.map(() => ({ phase: "Cancelled", simulatedWrites: owner.writes() })))
      )
      if (!("revision" in result))
        yield* liveInteraction.present(
          "Rules: interrupted (simulated).\nNext: inspect any observed owner outcome before retrying.\n"
        )
      yield* Effect.sync(() => process.stdout.write(JSON.stringify(result) + "\n"))
    })
  )
  const exit = await Effect.runPromiseExit(program)
  if (Exit.isFailure(exit)) {
    process.stderr.write("Rules prototype failed; inspect the owner before retrying.\n")
    process.exitCode = 1
  }
}
