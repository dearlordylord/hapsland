import { MAX_SOURCE_BYTES } from "../direct-event/capture.ts"
import { MAX_TYPE_DECLARATIONS, type AnalyzerMaterializationPreflight } from "../direct-event/languages/contracts.ts"
import { canonicalValue } from "../direct-event/model.ts"

const logicalBytes = (value: unknown): number => Buffer.byteLength(canonicalValue(value), "utf8")
/** Retained supporting parse facts under the 1.5 MiB graph read ceiling. */
const IMPORT_GRAPH_WORKSPACE_BYTES = 8 * 1024 * 1024

/** Unknown-size capture retains the full source bound until stable measurement. */
export const captureWorkspaceBytes = (path: string, sourceBytes = MAX_SOURCE_BYTES): number => {
  if (!Number.isSafeInteger(sourceBytes) || sourceBytes < 0 || sourceBytes > MAX_SOURCE_BYTES) {
    throw new RangeError("invalid captured source workspace measurement")
  }
  // Covers dual buffers/text and bounded declaration-count preflight metadata.
  return 8 * sourceBytes + MAX_TYPE_DECLARATIONS * (logicalBytes(path) + 512)
}

/** Stable capture has measured the source; release its unused maximum-size margin. */
export const analysisWorkspaceBytes = (
  path: string,
  sourceBytes: number,
  preflight: AnalyzerMaterializationPreflight | undefined,
  rules: unknown
): number => {
  const declarations = preflight?.declarations ?? MAX_TYPE_DECLARATIONS
  return (
    captureWorkspaceBytes(path, sourceBytes) +
    (preflight?.hasImports ? IMPORT_GRAPH_WORKSPACE_BYTES : 0) +
    (preflight?.expandedUnitBytes ?? MAX_TYPE_DECLARATIONS * MAX_SOURCE_BYTES) +
    declarations * (logicalBytes(rules) + sourceBytes + 4 * logicalBytes(path) + 4096)
  )
}
