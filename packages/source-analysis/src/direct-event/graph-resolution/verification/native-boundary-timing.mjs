import { lstat } from "node:fs/promises"
import { parse } from "smol-toml"
import { eligibleNamedPath } from "@hapsland/native-observation/direct-event/selection"
import { inspectPython, pythonModuleAuthority } from "../../../../dist/direct-event/languages/python.js"
import { inspectRustModules } from "../../../../dist/direct-event/languages/rust.js"
import { resolveGraphUnit } from "../../../../dist/direct-event/graph-resolution/verification/native-graph-resolver.js"
import { createNativeLanguageRegistry } from "../../../../dist/direct-event/graph-resolution/verification/native-language-registry.js"
import { createNativeRustPreparation } from "../../../../dist/direct-event/graph-resolution/verification/native-rust-preparation.js"
import { prepareGoGraph } from "../../../../dist/direct-event/graph-resolution/go-module/verification/native-preparation.js"
import { createPythonGraphPreparation } from "../../../../dist/direct-event/graph-resolution/python-module/verification/native-preparation.js"

// Diagnostic timing only: original IO/facts, error boundaries and native state
// remain authoritative. All three consumers use the same tracked native owners.
export function createTimedNativeResolver({
  timedPromise,
  timedEffect,
  timedSync,
  status = "lstat",
  access = "access"
}) {
  const ports = {
    readStatus: (...args) => timedPromise(status, () => lstat(...args)),
    selectPath: (...args) => timedEffect(access, eligibleNamedPath(...args)),
    ...(timedSync === undefined
      ? {}
      : {
          parseCargo: (source) => timedSync("cargo-parser", () => parse(source)),
          inspectModules: (source) => timedSync("rust-modules", () => inspectRustModules(source)),
          inspect: (session, path, source, branch) => timedSync("frontend", () => session.inspect(path, source, branch))
        })
  }
  const registry = createNativeLanguageRegistry(
    new Map([
      ["rust", createNativeRustPreparation(ports)],
      ["go", (...args) => prepareGoGraph(...args, ports)],
      [
        "python",
        createPythonGraphPreparation(
          inspectPython,
          pythonModuleAuthority.package,
          pythonModuleAuthority.binding,
          pythonModuleAuthority.imports,
          ports
        )
      ]
    ])
  )
  return (path, capture, name, context) =>
    resolveGraphUnit(path, capture, name, {
      ...context,
      verification: { ...context.verification, ...ports, languageForPath: registry.languageForPath }
    })
}
