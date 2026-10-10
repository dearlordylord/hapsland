import { LANGUAGE_EXTENSIONS } from "@hapsland/native-observation/direct-event/languages/path-language"
import { extname, dirname, join, normalize, relative } from "node:path"
import * as rust from "./rust.ts"
import * as Effect from "effect/Effect"
import type { GraphSession, LanguageAdapter } from "./contracts.ts"
import { resolveRustModuleContext } from "./rust-module-context.ts"
import type { GraphInspectionOptions } from "./rust.ts"

const rustModuleOptions = (
  file: string,
  rootPath: string,
  options: GraphInspectionOptions | undefined
): GraphInspectionOptions => {
  if (file === rootPath) return options ?? {}
  if (options?.rustCrateModules === undefined) return { rustExternalModule: true }
  return {
    rustExternalModule: true,
    rustCrateModules: new Map(
      [...options.rustCrateModules].map(([name, target]) => [
        name,
        relative(dirname(file), join(dirname(rootPath), target)) || "."
      ])
    )
  }
}

const rustGraphSession = (rootPath: string, options: GraphInspectionOptions | undefined): GraphSession => ({
  inspect: (file, source, branch) =>
    branch === "function" ? undefined : rust.inspectRust(file, source, rustModuleOptions(file, rootPath, options)),
  importCandidates: (from, importPath) => {
    const base = normalize(join(dirname(from), importPath))
    return extname(base) === "" ? [`${base}.rs`, join(base, "mod.rs")] : []
  }
})

export const rustAdapter: LanguageAdapter = {
  id: "rust",
  extensions: LANGUAGE_EXTENSIONS.rust,
  displayName: "Rust",
  probe: { path: "doctor.rs", source: "struct DoctorProbe { ready: bool }" },
  parseTypes: rust.parseTypes,
  inspect: rust.inspectRust,
  hasImports: (source) => /\b(?:use|mod)\b|::/u.test(source),
  combinedPreflight: (_path, _source, bound) => bound,
  prepareGraph: Effect.fn(function* (path, capture, host, limits, expired) {
    const needsBinding = /\b(?:use|mod)\b|::/u.test(capture.text)
    const binding = needsBinding
      ? yield* resolveRustModuleContext(path, capture, host, limits, expired)
      : { options: undefined, dependencies: [], remaining: limits }
    if (
      binding.remaining.files < 1 ||
      binding.remaining.work < 1 ||
      (needsBinding && binding.remaining.readBytes < binding.remaining.sourceBytes) ||
      expired()
    )
      return undefined
    const options = binding.options
    return { dependencies: binding.dependencies, limits: binding.remaining, session: rustGraphSession(path, options) }
  })
}
