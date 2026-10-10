import type { stepCanonical } from "@hapsland/canonical-policy/canonical/adapter"

export function validateCleanupResult(result: ReturnType<typeof stepCanonical>, stage: "check" | "commit"): void {
  if (result.rejection !== undefined || result.outputs.length !== 1)
    throw new Error(`canonical cleanup ${stage} refused`)
}
