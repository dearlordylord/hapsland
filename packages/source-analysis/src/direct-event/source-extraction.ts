import { languageForPath } from "./languages/registry.ts"
import { declarationOutcomes } from "./local-analysis/native.ts"
import type { TypeFileOutcomes } from "./analyzer.ts"
import type { GraphFile } from "./languages/contracts.ts"
import type { FunctionFileAnalysis } from "./languages/function-facts.ts"

/** One ExtractSource engine call. Native syntax remains within this invocation;
 * local traversal decisions still come from the packaged Bend Core. */
export const extractSource = (
  path: string,
  source: string
): {
  readonly graph: GraphFile | undefined
  readonly functions: FunctionFileAnalysis | undefined
  readonly typeFile: TypeFileOutcomes
} => {
  const language = languageForPath(path)
  if (language === undefined)
    return {
      graph: undefined,
      functions: undefined,
      typeFile: { status: "unsupported", reason: "extension", units: [] }
    }
  const extraction = language.extractSource(path, source)
  const { graph, functions } = extraction
  const hasCapturedGraph =
    graph !== undefined || (functions !== undefined && functions.functions.size > 0 && functions.types.size === 0)
  const parsed = extraction.parseTypes(hasCapturedGraph)
  const typeFile: TypeFileOutcomes =
    "status" in parsed
      ? parsed
      : {
          status: "analyzed",
          units: declarationOutcomes(parsed, language.supportingTypes?.(path, source) ?? new Map())
        }
  return { graph, functions, typeFile }
}
