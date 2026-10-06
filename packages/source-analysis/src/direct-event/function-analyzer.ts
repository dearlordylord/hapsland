import { languageForPath } from "./languages/registry.ts"
import type { FunctionFileAnalysis } from "./languages/function-facts.ts"
export type * from "./languages/function-facts.ts"
export const analyzeFunctionFile = (path: string, source: string): FunctionFileAnalysis | undefined =>
  languageForPath(path)?.analyzeFunctions?.(path, source)
