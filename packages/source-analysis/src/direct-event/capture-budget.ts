import { GRAPH_LIMIT_CEILINGS } from "@hapsland/canonical-policy/canonical/graph-limits"
import type { CaptureDiagnostic, StableCapture } from "@hapsland/native-observation/direct-event/capture"
import type { LanguageGraphHost } from "./languages/contracts.ts"

export const MAX_OBSERVATION_GRAPH_FILES = 64
export const MAX_OBSERVATION_GRAPH_READ_BYTES = 16 * 1024 * 1024

/** Preserve the existing aggregate admission decision and its observed facts. */
export const observationCaptureBudgetRefusal = (
  captures: ReadonlyMap<string, StableCapture>,
  path: string,
  requestedBytes: number = GRAPH_LIMIT_CEILINGS.sourceBytes
): Extract<CaptureDiagnostic, { readonly code: "capture-budget-limit" }> | undefined => {
  if (captures.has(path)) return undefined
  if (captures.size >= MAX_OBSERVATION_GRAPH_FILES)
    return {
      stage: "capture",
      code: "capture-budget-limit",
      args: { resource: "files", used: captures.size, requested: 1, limit: MAX_OBSERVATION_GRAPH_FILES }
    }
  const used = [...captures.values()].reduce((sum, source) => sum + source.byteLength, 0)
  if (used + requestedBytes > MAX_OBSERVATION_GRAPH_READ_BYTES)
    return {
      stage: "capture",
      code: "capture-budget-limit",
      args: { resource: "bytes", used, requested: requestedBytes, limit: MAX_OBSERVATION_GRAPH_READ_BYTES }
    }
  return undefined
}

export const observeCaptureDiagnostic = (
  context: LanguageGraphHost,
  path: string,
  diagnostic: CaptureDiagnostic
): void => {
  try {
    context.observeCaptureDiagnostic?.(path, diagnostic)
  } catch {
    /* Optional diagnosis cannot change graph or review authority. */
  }
}
