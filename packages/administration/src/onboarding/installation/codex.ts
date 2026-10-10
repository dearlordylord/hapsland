import * as Effect from "effect/Effect"
import {
  type CodexInstallationOperation,
  installationReinstall,
  installationDigest,
  type CodexInstallOperation,
  type CodexLifecycleOperation,
  type CodexDoctorOperation
} from "./request.ts"
import { doctorRepositoryChecks } from "./diagnostics.ts"

const codexInstallationRequest = (operation: CodexInstallationOperation) => {
  return {
    ...installationReinstall(operation),
    ...(operation.codexHome === undefined ? {} : { codexHome: operation.codexHome }),
    ...(!("codexExecutable" in operation) || operation.codexExecutable === undefined
      ? {}
      : { codexExecutable: operation.codexExecutable }),
    ...installationDigest(operation)
  }
}

const dispatchCodexInstall = Effect.fn("Cli.dispatchCodexInstall")(function* (
  operation: CodexInstallOperation,
  request: ReturnType<typeof codexInstallationRequest>
) {
  const { previewCodexInstallation, installCodexIntegration } = yield* Effect.promise(
    () => import("../codex-installation.ts")
  )
  return operation.operation === "install-preview"
    ? yield* previewCodexInstallation(request)
    : yield* installCodexIntegration(request)
})

const dispatchCodexLifecycleOperation = Effect.fn("Cli.dispatchCodexLifecycleOperation")(function* (
  operation: CodexLifecycleOperation,
  request: ReturnType<typeof codexInstallationRequest>
) {
  const { previewCodexUpdate, updateCodexIntegration, uninstallCodexIntegration } = yield* Effect.promise(
    () => import("../codex-installation.ts")
  )
  if (operation.operation === "update-preview") return yield* previewCodexUpdate(request)
  if (operation.operation === "update") return yield* updateCodexIntegration(request)
  return yield* uninstallCodexIntegration(request)
})

const dispatchCodexDoctor = Effect.fn("Cli.dispatchCodexDoctor")(function* (
  operation: CodexDoctorOperation,
  request: ReturnType<typeof codexInstallationRequest>,
  userConfigPath: string | undefined
) {
  const { diagnoseInstalledIntegration } = yield* Effect.promise(() => import("../doctor.ts"))
  const repositoryResult = yield* doctorRepositoryChecks(operation.cwd, userConfigPath)
  return yield* diagnoseInstalledIntegration({
    installation: request,
    repository: repositoryResult.repository,
    credential: repositoryResult.credential
  })
})

export const dispatchCodexInstallation = Effect.fn("Cli.dispatchCodexInstallation")(function* (
  operation: CodexInstallationOperation,
  userConfigPath: string | undefined
) {
  const request = codexInstallationRequest(operation)
  if (operation.operation === "doctor") return yield* dispatchCodexDoctor(operation, request, userConfigPath)
  if (operation.operation === "install-preview" || operation.operation === "install")
    return yield* dispatchCodexInstall(operation, request)
  return yield* dispatchCodexLifecycleOperation(operation, request)
})
