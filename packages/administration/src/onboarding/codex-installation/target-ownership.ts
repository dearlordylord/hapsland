import { OWNERSHIP_VERSION } from "./ownership.ts"
import type { buildInputs } from "./runtime-inputs.ts"
import { type OwnershipRecord } from "./ownership.ts"
import { expectedRuntimeVersion, commandFromEntrypoint } from "@hapsland/runtime-environment/runtime/package-runtime"
import { OWNED_MARKER, hookFingerprint } from "./hook-identity.ts"
import { ownedGroup, composedGroups } from "./hooks.ts"
import { HOOKS_FEATURE_FINGERPRINT } from "./hooks-feature.ts"

export const makeOwnershipRecord = (
  inputs: ReturnType<typeof buildInputs>,
  fingerprint: string,
  featureOwned: boolean
): OwnershipRecord => ({
  version: OWNERSHIP_VERSION,
  adapter: "codex",
  codexHome: inputs.home,
  runtimeVersion: expectedRuntimeVersion(inputs.entrypoint),
  packageVersion: inputs.packageVersion,
  residentProtocol: inputs.residentProtocol,
  ...commandFromEntrypoint(inputs.executable, inputs.entrypoint),
  marker: OWNED_MARKER,
  hookFingerprint: fingerprint,
  hookGroups: {
    PostToolUse: ownedGroup(
      inputs.executable,
      inputs.entrypoint,
      inputs.codex.version,
      inputs.controlledReviewer,
      inputs.binding?.command
    ),
    ...composedGroups(
      inputs.executable,
      inputs.entrypoint,
      inputs.codex.version,
      inputs.controlledReviewer,
      inputs.binding?.command
    )
  },
  composedFingerprints: {
    preToolUse: hookFingerprint(
      composedGroups(
        inputs.executable,
        inputs.entrypoint,
        inputs.codex.version,
        inputs.controlledReviewer,
        inputs.binding?.command
      ).PreToolUse
    ),
    stop: hookFingerprint(
      composedGroups(
        inputs.executable,
        inputs.entrypoint,
        inputs.codex.version,
        inputs.controlledReviewer,
        inputs.binding?.command
      ).Stop
    ),
    subagentStop: hookFingerprint(
      composedGroups(
        inputs.executable,
        inputs.entrypoint,
        inputs.codex.version,
        inputs.controlledReviewer,
        inputs.binding?.command
      ).SubagentStop
    )
  },
  owned: [
    ...(inputs.binding === undefined
      ? []
      : [{ file: inputs.binding.path, kind: "hook" as const, fingerprint: inputs.binding.fingerprint }]),
    ...(featureOwned
      ? [{ file: inputs.paths.config, kind: "feature" as const, fingerprint: HOOKS_FEATURE_FINGERPRINT }]
      : []),
    { file: inputs.paths.hooks, kind: "hook", fingerprint }
  ]
})
