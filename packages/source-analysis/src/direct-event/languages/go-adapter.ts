import { LANGUAGE_EXTENSIONS } from "@hapsland/native-observation/direct-event/languages/path-language"
import { inspectGoFile, parseGoTypes, localGoDeclarations, goUnselectedTypeEditReason } from "./go.ts"
import { projectGoFile } from "../graph-resolution/go-module/package.ts"
import type { LanguageAdapter } from "./contracts.ts"
export { MAX_GO_DIRECTORY_ENTRIES } from "./go-directory-policy.ts"
export const goAdapter: LanguageAdapter = {
  id: "go",
  extensions: LANGUAGE_EXTENSIONS.go,
  displayName: "Go",
  probe: { path: "doctor.go", source: "package doctor\ntype DoctorProbe struct { Ready bool }\n" },
  parseTypes: parseGoTypes,
  inspect: (path, source) => projectGoFile(inspectGoFile(path, source)),
  extractSource(path, source) {
    const file = inspectGoFile(path, source)
    return { graph: projectGoFile(file), functions: undefined, parseTypes: () => localGoDeclarations(file) }
  },
  unselectedTypeEditReason: goUnselectedTypeEditReason,
  hasImports: () => true,
  combinedPreflight: (_path, source, bound, policy) =>
    policy.go(bound, () => inspectGoFile("preflight.go", source) !== undefined)
}
