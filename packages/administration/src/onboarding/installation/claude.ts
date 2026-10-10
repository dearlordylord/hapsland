import * as Effect from "effect/Effect"
import { type InstallationOperation, installationReinstall, installationDigest } from "./request.ts"

const claudeInstallationRequest = (operation: Extract<InstallationOperation, { host: "claude" }>) => {
  return {
    ...installationReinstall(operation),
    ...(operation.claudeHome === undefined ? {} : { claudeHome: operation.claudeHome }),
    ...(!("claudeExecutable" in operation) || operation.claudeExecutable === undefined
      ? {}
      : { claudeExecutable: operation.claudeExecutable }),
    ...installationDigest(operation)
  }
}

export const dispatchClaudeInstallation = Effect.fn("Cli.dispatchClaudeInstallation")(function* (
  operation: Extract<InstallationOperation, { host: "claude" }>
) {
  const {
    diagnoseClaudeIntegration,
    previewClaudeInstallation,
    installClaudeIntegration,
    previewClaudeUpdate,
    updateClaudeIntegration,
    uninstallClaudeIntegration
  } = yield* Effect.promise(() => import("../claude-installation.ts"))
  const claudeInstallationHandlers = {
    doctor: diagnoseClaudeIntegration,
    "install-preview": previewClaudeInstallation,
    install: installClaudeIntegration,
    "update-preview": previewClaudeUpdate,
    update: updateClaudeIntegration,
    uninstall: uninstallClaudeIntegration
  }

  return yield* claudeInstallationHandlers[operation.operation](claudeInstallationRequest(operation))
})
