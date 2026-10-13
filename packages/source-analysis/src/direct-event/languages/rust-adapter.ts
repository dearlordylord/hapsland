import { LANGUAGE_EXTENSIONS } from "@hapsland/native-observation/direct-event/languages/path-language"
import * as rust from "./rust.ts"
import type { LanguageAdapter } from "./contracts.ts"

export const rustAdapter: LanguageAdapter = {
  id: "rust",
  extensions: LANGUAGE_EXTENSIONS.rust,
  displayName: "Rust",
  probe: { path: "doctor.rs", source: "struct DoctorProbe { ready: bool }" },
  parseTypes: rust.parseTypes,
  inspect: rust.inspectRust,
  hasImports: (source) => /\b(?:use|mod)\b|::/u.test(source),
  combinedPreflight: (_path, _source, bound) => bound
}
