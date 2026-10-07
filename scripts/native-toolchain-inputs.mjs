import { realpathSync, readdirSync, lstatSync, readlinkSync, accessSync, constants } from "node:fs"
import { isAbsolute, resolve } from "node:path"
import { fileEvidence } from "./compiler-evidence.mjs"
import { runBuildProcess } from "./build-process.mjs"
export const nativeToolNames = ["cc", "cc1", "collect2", "as", "ld", "pkg-config", "ldd"]
// Only a command's ordered candidates can affect its PATH selection. Unrelated
// executables (including concurrently updated agent runtimes) are not inputs.
export function nativeToolSelection(root, command, env) {
  if (typeof command !== "string" || !command || command.includes("\0")) throw new Error("Invalid native tool command")
  if (!isAbsolute(command) && command.includes("/")) throw new Error("Unsupported relative native tool command")
  if (!isAbsolute(command) && typeof env.PATH !== "string") throw new Error("Missing native tool PATH")
  const paths = isAbsolute(command)
    ? [command]
    : env.PATH.split(":").map((directory) => resolve(root, directory, command))
  const candidates = []
  for (const requested of paths) {
    let stat
    try {
      stat = lstatSync(requested)
    } catch (error) {
      if (error.code !== "ENOENT" && error.code !== "ENOTDIR") throw error
      candidates.push({ requested, state: "absent" })
      continue
    }
    const candidate = {
      requested,
      mode: stat.mode & 0o777,
      type: stat.isSymbolicLink()
        ? "symlink"
        : stat.isFile()
          ? "file"
          : stat.isDirectory()
            ? "directory"
            : "unsupported"
    }
    if (candidate.type === "unsupported") throw new Error("Unsupported native tool candidate")
    if (stat.isSymbolicLink()) candidate.target = readlinkSync(requested)
    let selected
    try {
      selected = realpathSync(requested)
    } catch (error) {
      if (error.code !== "ENOENT" && error.code !== "ENOTDIR") throw error
      candidates.push({ ...candidate, state: "dangling" })
      continue
    }
    candidate.selected = selected
    const actual = lstatSync(selected)
    candidate.selectedMode = actual.mode & 0o777
    if (!actual.isFile() && !actual.isDirectory()) throw new Error("Unsupported selected native tool candidate")
    let executable = actual.isFile()
    if (executable) {
      try {
        accessSync(requested, constants.X_OK)
      } catch (error) {
        if (error.code !== "EACCES") throw error
        executable = false
      }
    }
    candidates.push({ ...candidate, state: executable ? "selected" : "not-executable" })
    if (executable) return { command, candidates, requested, ...fileEvidence(root, selected) }
  }
  throw new Error(`Missing executable native tool: ${command}`)
}
export const nativeToolLibraries = (text) => {
  const paths = []
  for (const line of text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)) {
    if (/^linux-vdso\.so\.\d+ \(0x[\da-f]+\)$/.test(line)) continue
    const match = line.match(/^(?:\S+ => )?(\/[^\s]+) \(0x[\da-f]+\)$/)
    if (!match) throw new Error("Unsupported native tool library resolution")
    paths.push(match[1])
  }
  if (!paths.length) throw new Error("Missing native tool library evidence")
  return [...new Set(paths)].sort()
}
export const nativeSearchDirectories = (text) => {
  const result = {}
  for (const line of text.trim().split(/\r?\n/)) {
    const match = line.match(/^(install|programs|libraries): =?(.*)$/)
    if (!match || result[match[1]]) throw new Error("Unsupported native compiler search configuration")
    const paths = match[2].split(":").filter(Boolean)
    if (!paths.length || paths.some((path) => !isAbsolute(path)))
      throw new Error("Unsupported native compiler search directory")
    result[match[1]] = paths
  }
  if (Object.keys(result).length !== 3) throw new Error("Incomplete native compiler search configuration")
  return result
}
export const nativeDirectoryInventory = (path, recursive = false, ancestors = new Set()) => {
  let names
  try {
    names = readdirSync(path).sort()
  } catch (error) {
    if (error.code === "ENOENT") return null
    throw error
  }
  const canonical = realpathSync(path)
  if (ancestors.has(canonical)) return [{ type: "cycle", selected: canonical }]
  const next = new Set([...ancestors, canonical])
  return names.map((name) => {
    const entry = resolve(path, name),
      stat = lstatSync(entry)
    const mode = stat.mode & 0o777
    if (stat.isDirectory())
      return {
        name,
        mode,
        type: "directory",
        ...(recursive ? { entries: nativeDirectoryInventory(entry, true, next) } : {})
      }
    if (stat.isFile()) return { name, mode, type: "file", sha256: fileEvidence(path, entry).sha256 }
    if (stat.isSymbolicLink()) {
      const target = readlinkSync(entry)
      let selected
      try {
        selected = realpathSync(entry)
      } catch (error) {
        if (error.code === "ENOENT") return { name, mode, type: "symlink", target, selected: null }
        throw error
      }
      const actual = lstatSync(selected)
      return {
        name,
        mode,
        type: "symlink",
        target,
        selected,
        sha256: actual.isFile() ? fileEvidence(path, selected).sha256 : null,
        ...(recursive && actual.isDirectory() ? { entries: nativeDirectoryInventory(selected, true, next) } : {})
      }
    }
    throw new Error("Unsupported native search entry")
  })
}
export async function nativeToolchainInputs(root, tools, env = process.env) {
  if (process.platform !== "linux") throw new Error("Native toolchain evidence profile is Linux only")
  const libraries = []
  for (const tool of tools) {
    const result = await runBuildProcess("ldd", [resolve(root, tool.path)], { env, stdio: "pipe", timeout: 5000 })
    libraries.push(...nativeToolLibraries(result.stdout))
  }
  const search = await runBuildProcess("cc", ["-print-search-dirs"], { env, stdio: "pipe", timeout: 5000 })
  return {
    libraries: [...new Set(libraries)]
      .sort()
      .map((requested) => ({ requested, ...fileEvidence(root, realpathSync(requested)) })),
    search: Object.fromEntries(
      Object.entries(nativeSearchDirectories(search.stdout)).map(([kind, paths]) => [
        kind,
        paths.map((path) => ({ path, entries: nativeDirectoryInventory(path) }))
      ])
    ),
    environment: Object.fromEntries(
      [
        "PATH",
        "CPATH",
        "C_INCLUDE_PATH",
        "LIBRARY_PATH",
        "COMPILER_PATH",
        "GCC_EXEC_PREFIX",
        "LD_LIBRARY_PATH",
        "LD_PRELOAD",
        "PKG_CONFIG_PATH",
        "PKG_CONFIG_LIBDIR",
        "PKG_CONFIG_SYSROOT_DIR",
        "SOURCE_DATE_EPOCH",
        "LANG",
        "LC_ALL"
      ].map((key) => [key, env[key] ?? null])
    )
  }
}
