// THROWAWAY: standalone rules demo; one top-level Effect runtime.
import { Effect, Exit } from "effect"
import { liveInteraction } from "./interaction.ts"
import { withInteractionSession } from "./interaction-session.ts"
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
  const owner = createRulesOwner(outcome as OwnerOutcome)
  const program = withInteractionSession(
    (interaction) =>
      runRules(interaction, owner, action as RuleAction).pipe(
        Effect.map((model) => ({ ...model, simulatedWrites: owner.writes() }))
      ),
    Effect.gen(function* () {
      yield* liveInteraction.present(
        "Rules: interrupted (simulated).\nNext: inspect any observed owner outcome before retrying.\n"
      )
      return { phase: "Cancelled", simulatedWrites: owner.writes() }
    })
  ).pipe(Effect.flatMap((result) => Effect.sync(() => process.stdout.write(JSON.stringify(result) + "\n"))))
  const exit = await Effect.runPromiseExit(program)
  if (Exit.isFailure(exit)) {
    process.stderr.write("Rules prototype failed; inspect the owner before retrying.\n")
    process.exitCode = 1
  }
}
