import * as Schema from "effect/Schema"
import * as Option from "effect/Option"
import type { SetupClient } from "./client-selection.ts"
import { JEV_PROVIDER, REVIEW_PROVIDERS } from "@hapsland/runtime-environment/runtime/backend"
import { NEW_KEY_FLAG, setupCommand } from "@hapsland/runtime-environment/runtime/cli-names"

export const JEV_KEY_ENTRY_GUIDANCE = `Get a ${JEV_PROVIDER.name} API key from ${JEV_PROVIDER.credentialIssuer}: ${JEV_PROVIDER.keysUrl}\nUse the ${JEV_PROVIDER.credentialIssuer} key, not your coding agent or model-provider key. Paste it below and press Enter; input is hidden. Ctrl+C cancels.\n`

const Source = Schema.Struct({
  source: Schema.Literals(["environment", "saved"]),
  file: Schema.optionalKey(Schema.String),
  envVar: Schema.String,
  environmentOnly: Schema.Boolean,
  provider: Schema.Literals(["jev", "cloudflare"])
})

export const credentialSourceGuidance = (observed: unknown, host: SetupClient, platform: NodeJS.Platform): string[] => {
  const source = Option.getOrUndefined(Schema.decodeUnknownOption(Source)(observed))
  if (source === undefined) return []
  const store = platform === "darwin" ? "login Keychain" : "Secret Service (login keyring)"
  if (source.file !== undefined)
    return [
      `Selected key source: ${source.envVar} in ${source.file}.`,
      `To replace it, edit ${source.envVar} in that file. ${NEW_KEY_FLAG} changes saved login only; it does not overwrite this file.`
    ]
  if (source.source === "environment")
    return [
      `Selected key source: environment variable ${source.envVar} in this terminal.`,
      `To replace it, update ${source.envVar} in the environment used to launch your agent.`,
      source.environmentOnly
        ? "Your configuration selects environment/file credentials only; saved login is not used."
        : `This variable overrides file keys and saved login. Unset it and remove any file key before using ${setupCommand(host, true)}.`
    ]
  return [
    `Selected key source: saved ${REVIEW_PROVIDERS[source.provider].name} key in ${store}.`,
    `To replace it, run ${setupCommand(host, true)}. Environment and file keys take priority over saved login.`
  ]
}
