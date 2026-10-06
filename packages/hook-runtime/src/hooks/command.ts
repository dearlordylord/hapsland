import * as Command from "effect/cli/Command"
import * as CliConfig from "effect/cli/CliConfig"
import * as CliError from "effect/cli/CliError"
import * as GlobalFlag from "effect/cli/GlobalFlag"
import * as Console from "effect/Console"
import * as Effect from "effect/Effect"
import * as NodeServices from "@effect/platform-node/NodeServices"
import { hookArgumentFlags, validateHookArguments, type HookArguments } from "./arguments.ts"
import { CLI_NAME } from "@hapsland/runtime-environment/runtime/cli-names"
import { PACKAGE_VERSION } from "@hapsland/runtime-environment/runtime/cli-information"

/** Hook command errors and help never write to the host response channel. */
export const parseHookArguments = async (args: ReadonlyArray<string>): Promise<HookArguments | undefined> => {
  let invocation: HookArguments | undefined
  const command = Command.make(CLI_NAME, hookArgumentFlags, (values) =>
    Effect.try({
      try: () => {
        validateHookArguments(values)
        const channels: ReadonlyArray<keyof HookArguments> = [
          "codex-hook",
          "claude-hook",
          "pi-hook",
          "opencode-hook",
          "composed-before-edit-hook",
          "composed-background-hook",
          "composed-stop-hook",
          "composed-prompt-hook"
        ]
        if (!channels.some((channel) => values[channel] === true)) throw new Error("A hook channel is required.")
        invocation = values
      },
      catch: (cause) =>
        new CliError.UserError({
          cause,
          userMessage: cause instanceof Error ? cause.message : "Invalid hook arguments"
        })
    })
  )
  const quietConsole = Object.assign(Object.create(console), {
    log: () => undefined,
    error: () => undefined,
    warn: () => undefined,
    info: () => undefined,
    debug: () => undefined
  })
  const result = await Effect.runPromise(
    Command.runWith(command, { version: PACKAGE_VERSION, renderErrors: false })(args).pipe(
      Effect.provide(NodeServices.layer),
      Effect.provideService(CliConfig.CliConfig, { builtIns: [GlobalFlag.Help] }),
      Effect.provideService(Console.Console, quietConsole),
      Effect.result
    )
  )
  if (result._tag === "Failure") throw new Error("Invalid hook arguments")
  return invocation
}
