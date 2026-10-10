import type { InvocationSession } from "../invocation/session.ts"
import { formatOutcome } from "../interaction/outcome.ts"
import { DEFAULT_UPDATE_CHANNEL } from "@hapsland/runtime-environment/runtime/cli-names"
import type { SetupClient } from "./client-selection.ts"
import type { ReleaseSelection } from "./distribution.ts"
import * as Config from "effect/Config"
import * as Effect from "effect/Effect"
import { flagValue, positionalHost, selectedHost } from "./invocation-fields.ts"

const validateArchiveSelection = (
  session: InvocationSession,
  archive: string | undefined,
  version: string | undefined
): void => {
  if (archive !== undefined && (version !== undefined || flagValue(session, "--channel") !== undefined))
    throw new Error("select either --tarball or a registry channel/version")
}

const selectedRelease = (session: InvocationSession): ReleaseSelection => {
  const channel = flagValue(session, "--channel") ?? DEFAULT_UPDATE_CHANNEL
  if (channel !== "latest" && channel !== "next") throw new Error("--channel must be latest or next")
  const archive = flagValue(session, "--tarball")
  const version = flagValue(session, "--version")
  validateArchiveSelection(session, archive, version)
  return archive === undefined
    ? { kind: "registry", channel, ...(version === undefined ? {} : { version }) }
    : { kind: "archive", path: archive }
}

const releaseSelectionLabel = (selection: ReleaseSelection): string =>
  selection.kind === "archive" ? selection.path : `@hapsland/hapsland@${selection.version ?? selection.channel}`

const updateExecutable = Effect.fn("InteractiveUpdate.target")(function* (session: InvocationSession) {
  const { stageRelease } = yield* Effect.promise(() => import("./distribution.ts"))
  const target = flagValue(session, "--target")
  if (target !== undefined) {
    if (["--tarball", "--version", "--channel"].some((flag) => flagValue(session, flag) !== undefined))
      throw new Error("--target cannot be combined with --tarball, --version, or --channel")
    return target
  }
  const selection = selectedRelease(session)
  process.stderr.write(
    `Select ${releaseSelectionLabel(selection)}; reuse a verified package when available. The previous package is retained.\n`
  )
  const staged = yield* stageRelease(selection)
  process.stderr.write(`Target ${staged.packageVersion}: ${staged.executable}\n`)
  return staged.executable
})

const explicitUpdateHost = (session: InvocationSession): SetupClient | "resident" | undefined =>
  session.client?.flags.has("--resident-only")
    ? "resident"
    : flagValue(session, "--host") !== undefined || positionalHost(session) !== undefined
      ? selectedHost(session)
      : undefined

const reportUpdateFailure = (host: SetupClient | "resident", cause: unknown): void => {
  process.stderr.write(
    `${formatOutcome("error", `${host}: ${cause instanceof Error ? cause.message : "Update failed"}`)}\n`
  )
  process.exitCode = 6
}

export const updateInteractive = Effect.fn("InteractiveUpdate.run")(function* (session: InvocationSession) {
  const { updateClients, updateOwnerLayer, UPDATE_TERMINAL_REQUIRED } = yield* Effect.promise(
    () => import("./update.ts")
  )
  const { withInteractionSession } = yield* Effect.promise(() => import("../interaction/interaction-session.ts"))
  const { InteractionService } = yield* Effect.promise(() => import("../interaction/interaction.ts"))
  const terminalKind = yield* Config.String("TERM").pipe(Config.withDefault(""))
  if (!process.stdin.isTTY || !process.stderr.isTTY || terminalKind === "dumb")
    return yield* Effect.fail(new Error(UPDATE_TERMINAL_REQUIRED))
  return yield* withInteractionSession(
    (interaction) =>
      updateClients({
        terminal: true,
        host: explicitUpdateHost(session),
        reportFailure: (host, cause) => Effect.sync(() => reportUpdateFailure(host, cause))
      }).pipe(
        Effect.provideService(InteractionService, interaction),
        Effect.provide(
          updateOwnerLayer({
            flags: session.client?.flags ?? new Map(),
            environment: process.env,
            target: updateExecutable(session)
          })
        )
      ),
    Effect.sync(() => {
      process.exitCode = 130
    })
  )
})
