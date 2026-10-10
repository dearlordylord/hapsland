import * as Effect from "effect/Effect"
import { type InstallationOperation, installationDigest } from "./request.ts"

const opencodeInstallationRequest = (operation: Extract<InstallationOperation, { host: "opencode" }>) => {
  return {
    ...(operation.opencodeConfigHome === undefined ? {} : { opencodeConfigHome: operation.opencodeConfigHome }),
    ...(!("opencodeExecutable" in operation) || operation.opencodeExecutable === undefined
      ? {}
      : { opencodeExecutable: operation.opencodeExecutable }),
    ...installationDigest(operation)
  }
}

export const dispatchOpencodeInstallation = Effect.fn("Cli.dispatchOpencodeInstallation")(function* (
  operation: Extract<InstallationOperation, { host: "opencode" }>
): Effect.fn.Return<unknown, Error> {
  const {
    diagnoseOpenCodeIntegration,
    previewOpenCodeInstallation,
    installOpenCodeIntegration,
    previewOpenCodeUpdate,
    updateOpenCodeIntegration,
    uninstallOpenCodeIntegration
  } = yield* Effect.promise(() => import("../opencode-installation.ts"))
  const opencodeInstallationHandlers = {
    doctor: diagnoseOpenCodeIntegration,
    "install-preview": (request: ReturnType<typeof opencodeInstallationRequest>) =>
      Effect.succeed(previewOpenCodeInstallation(request)),
    install: installOpenCodeIntegration,
    "update-preview": (request: ReturnType<typeof opencodeInstallationRequest>) =>
      Effect.succeed(previewOpenCodeUpdate(request)),
    update: updateOpenCodeIntegration,
    uninstall: uninstallOpenCodeIntegration
  }

  return yield* opencodeInstallationHandlers[operation.operation](opencodeInstallationRequest(operation))
})
