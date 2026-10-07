import { realpathSync, readFileSync } from "node:fs"
import { isAbsolute, resolve } from "node:path"
import { fileEvidence } from "./compiler-evidence.mjs"
export const nativeLinkerPaths = (text, generatedObject) => {
  if (!isAbsolute(generatedObject)) throw new Error("Native generated object must be explicit")
  const paths = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
  if (!paths.length || paths.some((path) => !isAbsolute(path))) throw new Error("Unsupported native linker trace")
  if (!paths.includes(generatedObject)) throw new Error("Native linker trace omits generated object")
  return [...new Set(paths.filter((path) => path !== generatedObject))].sort()
}
export const nativeLinkerEvidence = (root, text, generatedObject) =>
  nativeLinkerPaths(text, generatedObject).map((requested) => {
    const path = realpathSync(resolve(root, requested))
    if (readFileSync(path).subarray(0, 8).toString() === "!<thin>\n")
      throw new Error("Thin native archives require member accounting")
    return { requested, ...fileEvidence(root, path) }
  })
