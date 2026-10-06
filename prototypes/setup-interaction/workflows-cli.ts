// Prototype: one administration-like process runtime, synthetic owners only.
import { Effect, Exit } from "effect"
import { withInteractionSession } from "./interaction-session.ts"
import { runUpdate, fakeUpdateOwner } from "./update-flow.ts"
import { runMaintenance, fakeMaintenanceOwner, type MaintenanceCommand } from "./maintenance-flow.ts"
import { runLogin } from "./login-flow.ts"
import { runVerification } from "./verification-flow.ts"
import { fakeCredentialOwner, type CredentialSource } from "./credential-owner.ts"
const flow = process.argv[2]
const option = (name: string) => process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3)
const source = option("source") ?? "saved",
  operation = option("operation") ?? "repair",
  scenario = option("scenario") ?? "normal"
const valid =
  ["update", "maintenance", "login", "verification"].includes(flow ?? "") &&
  ["saved", "file", "environment", "none"].includes(source) &&
  ["repair", "reinstall", "uninstall"].includes(operation) &&
  [
    "normal",
    "partial",
    "stale",
    "failed",
    "no-registration",
    "current",
    "activation-failed",
    "unavailable",
    "rejected"
  ].includes(scenario)
if (!valid) {
  process.stderr.write(
    "Use update|maintenance|login|verification with --source=saved|file|environment|none, --operation=repair|reinstall|uninstall and a documented --scenario.\n"
  )
  process.exitCode = 2
} else {
  const update = fakeUpdateOwner({
    ...(scenario === "no-registration" ? { hosts: [] } : {}),
    outcomes:
      scenario === "current"
        ? { Claude: "already-current", Codex: "already-current" }
        : scenario === "partial"
          ? { Claude: "partial" }
          : scenario === "failed"
            ? { Claude: "failed" }
            : {},
    stale: scenario === "stale",
    activationFails: scenario === "activation-failed"
  })
  const maintenance = fakeMaintenanceOwner({
    ...(scenario === "no-registration" ? { hosts: [] } : {}),
    recovered: { Claude: "uninstall" },
    current: scenario === "current" ? ["Claude", "Codex"] : [],
    outcomes: scenario === "partial" ? { Claude: "partial" } : scenario === "failed" ? { Claude: "failed" } : {},
    stale: scenario === "stale",
    activationFails: scenario === "activation-failed"
  })
  const credential = fakeCredentialOwner({
    source: source as CredentialSource,
    writable: scenario !== "unavailable",
    save: scenario === "partial" ? "partial" : scenario === "failed" ? "failed" : "stored",
    checks: scenario === "rejected" ? ["rejected", "rejected", "rejected"] : ["rejected", "accepted"],
    stale: scenario === "stale"
  })
  const observations = () =>
    flow === "update" ? update.observed() : flow === "maintenance" ? maintenance.observed() : credential.observed()
  const program = withInteractionSession(
    (interaction) =>
      Effect.gen(function* () {
        if (flow === "update") return { flow, model: yield* runUpdate(interaction, update), observed: observations() }
        if (flow === "maintenance")
          return {
            flow,
            model: yield* runMaintenance(interaction, maintenance, operation as MaintenanceCommand),
            observed: observations()
          }
        if (flow === "login") return { flow, model: yield* runLogin(interaction, credential), observed: observations() }
        return { flow, model: yield* runVerification(interaction, credential), observed: observations() }
      }),
    Effect.gen(function* () {
      yield* Effect.sync(() =>
        process.stderr.write("Session interrupted (simulated); inspect observed operations. No rollback is implied.\n")
      )
      return { flow, model: { phase: "Interrupted" }, observed: observations() }
    }),
    process.argv.includes("--controlling-terminal") ? "controlling-terminal" : "stdin"
  )
  const exit = await Effect.runPromiseExit(
    program.pipe(Effect.flatMap((result) => Effect.sync(() => process.stdout.write(JSON.stringify(result) + "\n"))))
  )
  if (Exit.isFailure(exit)) {
    process.stderr.write(
      "Prototype session failed or a terminal is unavailable. Use npm run workflows:probe for an offline replay.\n"
    )
    process.exitCode = 2
  }
}
