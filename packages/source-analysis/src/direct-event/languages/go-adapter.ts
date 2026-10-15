import { LANGUAGE_EXTENSIONS } from "@hapsland/native-observation/direct-event/languages/path-language"
import { goGraphFacts, inspectGoFile, parseGoTypes, localGoDeclarations, goUnselectedTypeEditReason } from "./go.ts"
import type { LanguageAdapter } from "./contracts.ts"
export { MAX_GO_DIRECTORY_ENTRIES } from "./go-directory-policy.ts"
const graphProjection = (file: ReturnType<typeof inspectGoFile>) => {
  const facts = file === undefined ? undefined : goGraphFacts([file])
  return facts === undefined
    ? undefined
    : { declarations: new Map(file?.types.map((type) => [type.artifact.name, type])), imports: new Map() }
}
export const goAdapter: LanguageAdapter = {
  id: "go",
  extensions: LANGUAGE_EXTENSIONS.go,
  displayName: "Go",
  probe: { path: "doctor.go", source: "package doctor\ntype DoctorProbe struct { Ready bool }\n" },
  parseTypes: parseGoTypes,
  inspect: (path, source) => graphProjection(inspectGoFile(path, source)),
  extractSource(path, source) {
    const file = inspectGoFile(path, source)
    return { graph: graphProjection(file), functions: undefined, parseTypes: () => localGoDeclarations(file) }
  },
  unselectedTypeEditReason: goUnselectedTypeEditReason,
  hasImports: () => true,
  combinedPreflight: (_path, source, bound, policy) =>
    policy.go(bound, () => inspectGoFile("preflight.go", source) !== undefined)
}
