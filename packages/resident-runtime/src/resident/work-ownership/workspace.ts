import type { AnalyzerMaterializationPreflight } from "@hapsland/source-analysis/direct-event/languages/contracts"
import core from "./workspace/workspace-sizing-core.js"
import { runWorkspaceSizing } from "./workspace/workspace-sizing.ts"

/** Unknown-size capture retains the full source bound until stable measurement. */
export const captureWorkspaceBytes = (path: string, sourceBytes: number | undefined = undefined): number =>
  runWorkspaceSizing(core, { $: "WorkspaceCapture" }, path, sourceBytes)

/** Stable capture releases its unused maximum-size margin under the same native resource owner. */
export const analysisWorkspaceBytes = (
  path: string,
  sourceBytes: number,
  preflight: AnalyzerMaterializationPreflight | undefined,
  rules: unknown
): number => runWorkspaceSizing(core, { $: "WorkspaceAnalysis" }, path, sourceBytes, preflight, rules)
