import { existsSync } from "node:fs"
import { execFileSync } from "node:child_process"
import { extname, isAbsolute, relative, resolve, sep } from "node:path"

const extensions = new Set([".js", ".mjs", ".cjs", ".jsx", ".ts", ".mts", ".cts", ".tsx"])
const ignored = new Set(["node_modules", "dist", "coverage", "vendor", "fixtures", "prototypes", ".git"])
export const isQualityFile = (path) => {
  if (path === ".." || path.startsWith("../") || isAbsolute(path)) return false
  if (!extensions.has(extname(path)) || path.split("/").some((part) => ignored.has(part))) return false
  if (
    /\.generated\./u.test(path) ||
    ["packages/monkey-business-bend/engine.mjs", "packages/monkey-business-bend/run.mjs"].includes(path)
  )
    return false
  return /^(?:src|packages|scripts|test)\//u.test(path) || /^[^/]+\.config\.[^/]+$/u.test(path)
}
const gitPaths = (args, cwd) =>
  execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 10_000 })
    .split("\0")
    .filter(Boolean)
export const discoverQualityFiles = ({ root = process.cwd(), files, changed = false, base = "HEAD" } = {}) => {
  const candidates =
    files ??
    (changed
      ? [
          ...gitPaths(["diff", "--name-only", "--no-renames", "--diff-filter=ACMR", "-z", base, "--"], root),
          ...gitPaths(["ls-files", "--others", "--exclude-standard", "-z"], root)
        ]
      : gitPaths(["ls-files", "--cached", "--others", "--exclude-standard", "-z"], root))
  return [...new Set(candidates.map((path) => relative(root, resolve(root, path)).split(sep).join("/")))]
    .filter((path) => isQualityFile(path) && existsSync(resolve(root, path)))
    .sort()
}
