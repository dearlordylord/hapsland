import { CLI_NAME, LOGIN_FLAG, setupCommand } from "@hapsland/runtime-environment/runtime/cli-names"
import { JEV_PROVIDER } from "@hapsland/runtime-environment/runtime/backend"

export const credentialNextAction = (result: Readonly<Record<string, unknown>>) => {
  return (
    result.action ??
    (result.operation === "logout"
      ? "Use user file exclusions to stop future review dispatches if needed."
      : result.status === "invalid"
        ? `Enter a nonempty ${JEV_PROVIDER.name} key and retry ${CLI_NAME} ${LOGIN_FLAG}. The previous saved key was preserved.`
        : result.status === "cancelled"
          ? "No key was changed. Run hapsland --login again when ready."
          : result.status === "locked" || result.status === "interaction-required"
            ? "Unlock or approve the native credential store in this session, then retry hapsland --login."
            : "Check native credential storage in this user session, then retry hapsland --login.")
  )
}

export const writeLogoutEnvironmentWarning = (result: Readonly<Record<string, unknown>>): void => {
  if (result.operation === "logout") {
    const environment = result.environmentOverride as { envVar?: string; active?: boolean } | undefined
    if (environment?.active === true)
      process.stdout.write(
        `${environment.envVar ?? "The selected environment credential"} remains active; set user excludes to ["**/*"] to stop dispatch.\n`
      )
  }
}

export const writeStoredCredentialSummary = (result: Readonly<Record<string, unknown>>): void => {
  const destination = result.destination as { target?: string } | undefined
  const active = result.activeCredential as { source?: string; file?: string; status?: string } | undefined
  process.stdout.write(
    `${JEV_PROVIDER.name} key saved in ${destination?.target ?? (process.platform === "darwin" ? "Keychain" : "Secret Service")}. No ${JEV_PROVIDER.name} request or review was sent.\n${active === undefined ? "" : `Effective credential: ${active.source}${active.file === undefined ? "" : ` (${active.file})`}; ${active.status}.\n`}Next: run ${setupCommand("claude")} or ${setupCommand("codex")}, then complete client sign-in and native trust.\n`
  )
}

export const writeCredentialOutcomeSummary = (result: Readonly<Record<string, unknown>>): void => {
  const next = credentialNextAction(result)
  process.stdout.write(
    `${result.operation === "logout" ? "Logout" : "Login"}: ${String(result.status)}. ${String(next)}\n`
  )
  writeLogoutEnvironmentWarning(result)
}

export const writeCredentialSummary = (result: Readonly<Record<string, unknown>>): void => {
  if (result.operation === "login" && result.status === "stored") return writeStoredCredentialSummary(result)
  writeCredentialOutcomeSummary(result)
}
