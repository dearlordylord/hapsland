import type { buildInputs } from "./runtime-inputs.ts"
import { type OwnershipRecord } from "./ownership.ts"
import { snapshot, mutation } from "./file-snapshots.ts"
import { bindingDigest } from "../hook-binding.ts"

export const bindingMutation = (
  inputs: ReturnType<typeof buildInputs>,
  record: OwnershipRecord | undefined,
  reinstall = false
) => {
  const binding = inputs.binding
  if (binding === undefined) return []
  const before = snapshot(binding.path)
  const owned = record?.owned.find((entry) => entry.file === binding.path && entry.kind === "hook")
  if (before.exists && !reinstall && (owned === undefined || bindingDigest(before.content) !== owned.fingerprint))
    throw new Error("owned hook launcher was locally modified or unrecorded; preview reinstall")
  return before.content === binding.content
    ? []
    : [mutation(before, binding.content, "select the scoped hook implementation")]
}
