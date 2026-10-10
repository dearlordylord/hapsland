import { switchFlag } from "@hapsland/runtime-environment/runtime/argument-flags"
import type * as Command from "effect/cli/Command"
import * as Flag from "effect/cli/Flag"
import type { SUPPORTED_CLIENTS } from "@hapsland/runtime-environment/runtime/agent-clients"
import { JEV_PROVIDER } from "@hapsland/runtime-environment/runtime/backend"
import { ROOT_OPERATIONS, operationHelp } from "../cli-help.ts"
import { NEW_KEY_OPTION } from "@hapsland/runtime-environment/runtime/cli-names"

export const operationFlags = Object.fromEntries(
  Object.keys(ROOT_OPERATIONS).map((key) => {
    const information = operationHelp(key as keyof typeof ROOT_OPERATIONS)
    return [
      key,
      switchFlag(information.flag ?? key, information.aliases ?? [], information.hidden ?? false).pipe(
        Flag.withDescription(information.description)
      )
    ]
  })
) as { readonly [Key in keyof typeof ROOT_OPERATIONS]: Flag.Flag<boolean> }

export const automationFlags = {
  ...operationFlags,
  [NEW_KEY_OPTION]: switchFlag(NEW_KEY_OPTION, [], false).pipe(
    Flag.withDescription(
      `With setup or --pilot, request a new saved ${JEV_PROVIDER.name} key instead of checking the existing key`
    )
  ),
  human: switchFlag("human", ["status-human"], false).pipe(
    Flag.withDescription("Human output for --status; JSON is the status default")
  ),
  json: switchFlag("json", [], false).pipe(
    Flag.withDescription("Structured credential login/logout output; JSON-stdin operations already return JSON")
  ),
  "credential-stdin": switchFlag("credential-stdin"),
  "evaluation-live": switchFlag("evaluation-live"),
  "controlled-reviewer": switchFlag("controlled-reviewer")
}

export type AutomationOptions = Command.Command.Config.Infer<typeof automationFlags>

export interface ClientArguments {
  readonly host: (typeof SUPPORTED_CLIENTS)[number] | undefined
  readonly flags: ReadonlyMap<string, string>
}
