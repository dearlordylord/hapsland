import * as Effect from "effect/Effect"
import { type InstallationOperation, installationDigest, installationReinstall } from "./request.ts"
import { doctorRepositoryChecks } from "./diagnostics.ts"

const piInstallationDoctor = Effect.fn("Cli.piInstallationDoctor")(function* (
  request: Extract<InstallationOperation, { host: "pi" }>,
  cwd: string,
  userConfigPath: string | undefined
) {
  const { diagnosePiIntegration } = yield* Effect.promise(() => import("../pi-installation.ts"))
  const diagnosis = yield* diagnosePiIntegration(request)
  const repository = yield* doctorRepositoryChecks(cwd, userConfigPath)
  return {
    ...diagnosis,
    checks: [
      ...diagnosis.checks.filter((check) => check.stage !== "credential"),
      repository.repository,
      repository.credential
    ]
  }
})

export const dispatchPiInstallation = Effect.fn("Cli.dispatchPiInstallation")(function* (
  operation: Extract<InstallationOperation, { host: "pi" }>,
  userConfigPath: string | undefined
) {
  const { previewPiInstallation, installPiIntegration, previewPiUpdate, updatePiIntegration, uninstallPiIntegration } =
    yield* Effect.promise(() => import("../pi-installation.ts"))
  const piInstallationHandlers = {
    "install-preview": previewPiInstallation,
    install: installPiIntegration,
    "update-preview": previewPiUpdate,
    update: updatePiIntegration,
    uninstall: uninstallPiIntegration
  }

  const request = { ...operation, ...installationDigest(operation), ...installationReinstall(operation) }
  if (operation.operation === "doctor") return yield* piInstallationDoctor(request, operation.cwd, userConfigPath)
  return yield* piInstallationHandlers[operation.operation](request)
})
