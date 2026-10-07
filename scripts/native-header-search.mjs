import { isAbsolute, resolve, dirname } from "node:path"
import { runBuildProcess } from "./build-process.mjs"
export const nativeHeaderSearchPaths = (text) => {
  const lines = text.split(/\r?\n/),
    paths = []
  let active = false,
    found = false,
    angle = false,
    ended = false
  for (const line of lines) {
    const missing = line.match(/^ignoring nonexistent directory "([^"]+)"$/)
    if (missing) paths.push(missing[1])
    if (line === '#include "..." search starts here:') {
      if (found || ended) throw new Error("Unsupported native include search profile")
      active = true
      found = true
      continue
    }
    if (line === "#include <...> search starts here:") {
      if (!active || angle) throw new Error("Incomplete native include search")
      angle = true
      continue
    }
    if (line === "End of search list.") {
      if (!active || !angle) throw new Error("Incomplete native include search")
      ended = true
      active = false
      continue
    }
    if (active) paths.push(line.trim())
  }
  if (!found || !angle || !ended || !paths.length || paths.some((path) => !isAbsolute(path)))
    throw new Error("Unsupported native include search profile")
  return [...new Set(paths)]
}
export async function nativeHeaderSearch(root, source, flags, env) {
  const result = await runBuildProcess("cc", [...flags, "-E", "-v", "-x", "c", "/dev/null"], {
    cwd: root,
    env,
    stdio: "pipe",
    timeout: 10000
  })
  return [...new Set([dirname(resolve(root, source)), ...nativeHeaderSearchPaths(result.stderr)])]
}
