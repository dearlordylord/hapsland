// Prototype: one administration-like process runtime, synthetic owners only.
import { Effect, Exit } from "effect"
import { withInteractionSession } from "./interaction-session.ts"
import { runUpdate, fakeUpdateOwner, type UpdateModel } from "./update-flow.ts"
import {
  runMaintenance,
  fakeMaintenanceOwner,
  type MaintenanceModel,
  type MaintenanceCommand
} from "./maintenance-flow.ts"
import { runLogin, type LoginModel } from "./login-flow.ts"
import { runVerification, type VerificationModel } from "./verification-flow.ts"
import { fakeCredentialOwner, type CredentialSource } from "./credential-owner.ts"
import { unobserved } from "./workflow-replay.ts"
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
  let snapshot: UpdateModel | MaintenanceModel | LoginModel | VerificationModel | undefined
  const publish = (model: NonNullable<typeof snapshot>) => {
    snapshot = model
  }
  const program = withInteractionSession(
    (interaction) =>
      Effect.gen(function* () {
        if (flow === "update")
          return {
            flow,
            termination: "finished",
            model: yield* runUpdate(interaction, update, unobserved, publish),
            observed: observations()
          }
        if (flow === "maintenance")
          return {
            flow,
            termination: "finished",
            model: yield* runMaintenance(
              interaction,
              maintenance,
              operation as MaintenanceCommand,
              unobserved,
              publish
            ),
            observed: observations()
          }
        if (flow === "login")
          return {
            flow,
            termination: "finished",
            model: yield* runLogin(interaction, credential, unobserved, publish),
            observed: observations()
          }
        return {
          flow,
          termination: "finished",
          model: yield* runVerification(interaction, credential, unobserved, publish),
          observed: observations()
        }
      }),
    Effect.gen(function* () {
      yield* Effect.sync(() =>
        process.stderr.write(
          `Session interrupted (simulated). Last observed workflow state: ${JSON.stringify(snapshot ?? null)}.\nPending owner operations have no inferred outcome. No rollback is implied.\n`
        )
      )
      return { flow, termination: "interrupted", model: snapshot ?? null, observed: observations() }
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
