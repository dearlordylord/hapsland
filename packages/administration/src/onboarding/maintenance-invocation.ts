import type { InvocationSession } from "../invocation/session.ts"
import { formatOutcome } from "../interaction/outcome.ts"
import type { SetupClient } from "./client-selection.ts"
import * as Config from "effect/Config"
import * as Effect from "effect/Effect"
import { currentCommand } from "@hapsland/runtime-environment/runtime/package-runtime"
import { clientInstallationPorts } from "./client-discovery.ts"

export const reportClientFailure = (host: SetupClient, cause: unknown) => {
  process.stderr.write(
    `${formatOutcome("error", `${host}: ${cause instanceof Error ? cause.message : "operation failed"}`)}\n`
  )
  process.exitCode = 6
}

export const maintenanceInteractive = Effect.fn("InteractiveMaintenance.run")(function* (
  session: InvocationSession,
  command: "repair" | "reinstall" | "uninstall"
) {
  const { maintainClients, maintenanceOwnerLayer, maintenanceTerminalRequired } = yield* Effect.promise(
    () => import("./maintenance.ts")
  )
  const terminalKind = yield* Config.String("TERM").pipe(Config.withDefault(""))
  if (!process.stdin.isTTY || !process.stderr.isTTY || terminalKind === "dumb")
    return yield* Effect.fail(new Error(maintenanceTerminalRequired(command)))
  const { withInteractionSession } = yield* Effect.promise(() => import("../interaction/interaction-session.ts"))
  const { InteractionService } = yield* Effect.promise(() => import("../interaction/interaction.ts"))
  const { installed, inspect } = yield* clientInstallationPorts(session)
  return yield* withInteractionSession(
    (interaction) =>
      maintainClients(command, {
        terminal: true,
        host: session.client?.host,
        reportFailure: (host, cause) => Effect.sync(() => reportClientFailure(host, cause))
      }).pipe(
        Effect.provideService(InteractionService, interaction),
        Effect.provide(
          maintenanceOwnerLayer({
            flags: session.client?.flags ?? new Map(),
            command: currentCommand(),
            installed,
            inspect
          })
        )
      ),
    Effect.sync(() => {
      process.exitCode = 130
    })
  )
})
