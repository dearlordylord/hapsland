import { extname, dirname, join, normalize, relative } from "node:path"
import * as rust from "../../languages/rust.ts"
import * as Effect from "effect/Effect"
import type { GraphInspectionOptions } from "../../languages/rust.ts"
import type { GraphSession, NativeLanguageAdapter } from "./native-language-contract.ts"
import { resolveRustModuleContext, type NativeRustPorts } from "./native-rust-module-context.ts"

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

const rustGraphSession = (
  rootPath: string,
  options: GraphInspectionOptions | undefined,
  inspect: typeof rust.inspectRust
): GraphSession => ({
  inspect: (file, source, branch) =>
    branch === "function" ? undefined : inspect(file, source, rustModuleOptions(file, rootPath, options)),
  importCandidates: (from, importPath) => {
    const base = normalize(join(dirname(from), importPath))
    return extname(base) === "" ? [`${base}.rs`, join(base, "mod.rs")] : []
  }
})

export const createNativeRustPreparation = (
  ports?: NativeRustPorts,
  inspect: typeof rust.inspectRust = rust.inspectRust
): NativeLanguageAdapter["prepareGraph"] =>
  Effect.fn(function* (path, capture, host, limits, expired) {
    const needsBinding = /\b(?:use|mod)\b|::/u.test(capture.text)
    const binding = needsBinding
      ? yield* resolveRustModuleContext(path, capture, host, limits, expired, ports)
      : { options: undefined, dependencies: [], remaining: limits }
    if (
      binding.remaining.files < 1 ||
      binding.remaining.work < 1 ||
      (needsBinding && binding.remaining.readBytes < binding.remaining.sourceBytes) ||
      expired()
    )
      return undefined
    const options = binding.options
    return {
      dependencies: binding.dependencies,
      limits: binding.remaining,
      session: rustGraphSession(path, options, inspect)
    }
  })

export const prepareNativeRustGraph = createNativeRustPreparation()
