import type { InvocationSession } from "../invocation/session.ts"
import { cliJourney } from "../interaction/flow-input.ts"
import { type ClientCommand } from "./client-command.ts"
import { type ClientArguments } from "../invocation/arguments.ts"
import * as Effect from "effect/Effect"
import { localFailureMessage } from "../invocation/failure-message.ts"
import { assignResultExitCode } from "../invocation/result.ts"
import { cliSwitch } from "../invocation/session-options.ts"
import { runHumanDoctor } from "./doctor-invocation.ts"
import { updateInteractive } from "./update-invocation.ts"
import { maintenanceInteractive } from "./maintenance-invocation.ts"
import { chooseSetupClients, pilotSetupSession } from "./setup-invocation.ts"

export const runUnattended = Effect.fn("Cli.unattended")(function* (args: ClientArguments) {
  const { runUnattendedSetup } = yield* Effect.promise(() => import("./unattended.ts"))
  const result = yield* runUnattendedSetup(args).pipe(
    Effect.catch((cause) =>
      Effect.succeed({
        version: 1,
        operation: "setup",
        status: "needs-user-action",
        providerCalls: 0,
        paidVerificationPerformed: false,
        message: localFailureMessage(cause)
      })
    )
  )
  assignResultExitCode(result)
  process.stdout.write(JSON.stringify(result) + "\n")
})

export const unattendedRequested = (session: InvocationSession, args: ClientArguments) =>
  !cliSwitch(session, "pilot") &&
  (["--no-input", "--apply", "--save-plan", "--apply-plan"].some((flag) => args.flags.has(flag)) ||
    !process.stdin.isTTY ||
    !process.stderr.isTTY)

export const runLocalLifecycle = Effect.fn("Cli.localLifecycle")(function* (
  session: InvocationSession,
  command: ClientCommand,
  args: ClientArguments
) {
  if (command === "doctor") return yield* runHumanDoctor(session, args)
  if (command === "update") return yield* cliJourney("update", () => updateInteractive(session))
  if (command === "repair") return yield* cliJourney("repair", () => maintenanceInteractive(session, command))
  if (command === "reinstall") return yield* cliJourney("reinstall", () => maintenanceInteractive(session, command))
  if (command === "uninstall") return yield* cliJourney("uninstall", () => maintenanceInteractive(session, command))
  if (unattendedRequested(session, args)) return yield* runUnattended(args)
  const host = args.host
  if (host === undefined) return yield* cliJourney("setup", () => chooseSetupClients(session))
  return yield* cliJourney("setup-agent", () => pilotSetupSession(session, host))
})

export const runLifecycle = Effect.fn("Cli.lifecycle")(function* (
  session: InvocationSession,
  invocation:
    | { readonly kind: "automation"; readonly client: ClientArguments }
    | { readonly kind: "lifecycle"; readonly command: ClientCommand; readonly client: ClientArguments }
) {
  const command = invocation.kind === "lifecycle" ? invocation.command : "setup"
  const args = invocation.client
  const { dispatchSelectedPackage, dispatchActivePackage } = yield* Effect.promise(
    () => import("./client-lifecycle.ts")
  )
  const selectedPackage = args.flags.get("--target")
  const dispatched = yield* selectedPackage !== undefined && command !== "update"
    ? dispatchSelectedPackage(selectedPackage, command, args.host, args.flags)
    : dispatchActivePackage([
        command,
        ...(args.host === undefined ? [] : [args.host]),
        ...[...args.flags].filter(([name]) => name !== "--host").map(([name, value]) => `${name}=${value}`)
      ])
  if (dispatched !== undefined) {
    process.exitCode = dispatched
    return
  }
  yield* runLocalLifecycle(session, command, args)
})
