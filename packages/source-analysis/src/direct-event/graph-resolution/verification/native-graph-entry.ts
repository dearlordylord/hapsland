export {
  resolveGraphUnit,
  GRAPH_ANALYSIS_DEADLINE_MS,
  MAX_OBSERVATION_GRAPH_UNITS,
  MAX_OBSERVATION_GRAPH_FILES,
  MAX_OBSERVATION_GRAPH_READ_BYTES,
  observationCaptureBudgetRefusal
} from "./native-graph-resolver.ts"
export type { GraphResolveContext } from "./native-graph-resolver.ts"
export { nativeRustAdapter } from "./native-language-registry.ts"
export { resolveRustModuleContext } from "./native-rust-module-context.ts"
