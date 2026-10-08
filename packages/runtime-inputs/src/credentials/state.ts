import { CredentialState } from "./policy.ts"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { HAPSLAND_STATE_DIRECTORY } from "@hapsland/runtime-environment/runtime/user-paths"

export const DEFAULT_CREDENTIAL_STATE_PATH = join(HAPSLAND_STATE_DIRECTORY, "credential-state.json")

export { CredentialState } from "./policy.ts"

export const makeInitialCredentialState = (): CredentialState => ({
  version: 1,
  generation: 0,
  savedUseSuspended: false
})

const decodeState = (value: unknown): CredentialState =>
  Option.getOrElse(Schema.decodeUnknownOption(CredentialState)(value), () => ({
    ...makeInitialCredentialState(),
    savedUseSuspended: true
  }))

export const readCredentialState = (statePath = DEFAULT_CREDENTIAL_STATE_PATH): CredentialState => {
  try {
    return decodeState(JSON.parse(readFileSync(statePath, "utf8")) as unknown)
  } catch (cause) {
    return typeof cause === "object" && cause !== null && "code" in cause && cause.code === "ENOENT"
      ? makeInitialCredentialState()
      : { ...makeInitialCredentialState(), savedUseSuspended: true }
  }
}
