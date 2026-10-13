import { extname } from "node:path"
import { registeredLanguages } from "../../languages/registry.ts"
import { inspectPython, pythonModuleAuthority } from "../../languages/python.ts"
import { prepareGoGraph } from "../go-module/verification/native-preparation.ts"
import { createPythonGraphPreparation } from "../python-module/verification/native-preparation.ts"
import { prepareNativeRustGraph } from "./native-rust-preparation.ts"
import { prepareNativeTypeScriptGraph, prepareNativeBendGraph } from "./native-simple-preparation.ts"
import type { NativeLanguageAdapter } from "./native-language-contract.ts"
const preparations = new Map<string, NativeLanguageAdapter["prepareGraph"]>([
  ["typescript", prepareNativeTypeScriptGraph],
  ["bend", prepareNativeBendGraph],
  ["rust", prepareNativeRustGraph],
  ["go", prepareGoGraph],
  [
    "python",
    createPythonGraphPreparation(
      inspectPython,
      pythonModuleAuthority.package,
      pythonModuleAuthority.binding,
      pythonModuleAuthority.imports
    )
  ]
])
const nativeLanguages: readonly NativeLanguageAdapter[] = registeredLanguages.map((adapter) => {
  const prepareGraph = preparations.get(adapter.id)
  if (prepareGraph === undefined) throw new Error("Missing independent native graph reference for " + adapter.id)
  return { ...adapter, prepareGraph }
})
export const languageForPath = (path: string) =>
  nativeLanguages.find((adapter) => adapter.extensions.includes(extname(path).toLowerCase()))
export const nativeRustAdapter = nativeLanguages.find((adapter) => adapter.id === "rust")!
