import { LANGUAGE_EXTENSIONS } from "@hapsland/native-observation/direct-event/languages/path-language"
import { goGraphFacts, inspectGoFile, parseGoTypes, goUnselectedTypeEditReason } from "./go.ts"
import { prepareGoGraph } from "./go-module-context.ts"
import type { LanguageAdapter } from "./contracts.ts"
export { MAX_GO_DIRECTORY_ENTRIES } from "./go-module-context.ts"
export const goAdapter: LanguageAdapter = {
  id: "go",
  extensions: LANGUAGE_EXTENSIONS.go,
  displayName: "Go",
  probe: { path: "doctor.go", source: "package doctor\ntype DoctorProbe struct { Ready bool }\n" },
  parseTypes: parseGoTypes,
  inspect: (path, source) => {
    const file = inspectGoFile(path, source)
    const facts = file === undefined ? undefined : goGraphFacts([file])
    return facts === undefined
      ? undefined
      : { declarations: new Map(file?.types.map((type) => [type.artifact.name, type])), imports: new Map() }
  },
  unselectedTypeEditReason: goUnselectedTypeEditReason,
  hasImports: () => true,
  combinedPreflight: (_path, source, bound) =>
    bound ??
    (inspectGoFile("preflight.go", source) === undefined
      ? undefined
      : { declarations: 0, expandedUnitBytes: 0, hasImports: true }),
  prepareGraph: prepareGoGraph
}
