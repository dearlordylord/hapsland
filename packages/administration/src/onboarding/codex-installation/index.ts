import { OWNED_MARKER } from "./hook-identity.ts"
import { previewCodexInstallation } from "./workflows/preview-install.ts"
import { installCodexIntegration } from "./workflows/install.ts"
import { uninstallCodexIntegration } from "./workflows/uninstall.ts"
import { inspectCodexInstallation } from "./inspection.ts"

export const codexInstallation = {
  marker: OWNED_MARKER,
  preview: previewCodexInstallation,
  install: installCodexIntegration,
  uninstall: uninstallCodexIntegration,
  inspect: inspectCodexInstallation
}

export { CodexInstallationError } from "./request.ts"
export type { InstallationRequest } from "./request.ts"
export type { InstallationResult } from "./request.ts"
export { previewCodexInstallation } from "./workflows/preview-install.ts"
export { hasCodexRegistration } from "./inspection.ts"
export { inspectCodexInstallation } from "./inspection.ts"
export { previewCodexUpdate } from "./workflows/preview-update.ts"
export { updateCodexIntegration } from "./workflows/update.ts"
export { installCodexIntegration } from "./workflows/install.ts"
export { uninstallCodexIntegration } from "./workflows/uninstall.ts"
