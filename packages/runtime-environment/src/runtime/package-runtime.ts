import { EMITTED_ENTRIES, SOURCE_ENTRIES, RELEASE_NAME } from "./release-identity.generated.ts"
import { BUN_VERSION, bunExecutable } from "./bun-runtime.ts"
import { realpathSync, readFileSync } from "node:fs"
import { dirname, extname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { sourceRuntimeFromEntrypoint, sourceRuntimeCommand } from "./source-runtime-layout.ts"
import { PACKAGE_COMMAND_NAMES } from "./cli-information.ts"
export { BUN_VERSION } from "./bun-runtime.ts"

export interface RuntimeCommand {
  readonly executable: string
  readonly args: ReadonlyArray<string>
}
export type PackageRole = "cli" | "doctor" | "hook" | "parser" | "resident"
const roleNames: Readonly<Record<PackageRole, string>> = PACKAGE_COMMAND_NAMES
const moduleUrl = import.meta.url
export const standalone = moduleUrl.includes("/$bunfs/")
const sourceRuntime = standalone ? undefined : sourceRuntimeFromEntrypoint(fileURLToPath(moduleUrl))
const executablePath = (): string => {
  try {
    return realpathSync(process.execPath)
  } catch {
    return resolve(process.execPath)
  }
}
const sourcePackageRoot = (): string => {
  let directory = dirname(fileURLToPath(moduleUrl))
  for (;;) {
    try {
      if (JSON.parse(readFileSync(join(directory, "package.json"), "utf8")).name === RELEASE_NAME) return directory
    } catch {
      // Continue through source/build directories until the release manifest.
    }
    const parent = dirname(directory)
    if (parent === directory) throw new Error("Cannot locate Hapsland release root")
    directory = parent
  }
}
export const packageRoot = standalone
  ? resolve(dirname(executablePath()), "../../..")
  : (sourceRuntime?.root ?? sourcePackageRoot())
export const packageAssetPath = (...segments: ReadonlyArray<string>): string => join(packageRoot, ...segments)
export const standaloneCommand = (root: string, role: PackageRole): RuntimeCommand => ({
  executable: join(root, "dist", "bin", `${process.platform}-${process.arch}`, roleNames[role]),
  args: []
})
export const commandFromEntrypoint = (runtime: string, entrypoint: string): RuntimeCommand =>
  [".ts", ".js", ".mjs"].includes(extname(entrypoint))
    ? { executable: resolve(runtime), args: [resolve(entrypoint)] }
    : { executable: resolve(entrypoint), args: [] }
export const packageCommand = (role: PackageRole): RuntimeCommand => {
  if (standalone) return standaloneCommand(packageRoot, role)
  if (sourceRuntime) return sourceRuntimeCommand(sourceRuntime, bunExecutable(), role)
  return { executable: bunExecutable(), args: [join(packageRoot, EMITTED_ENTRIES[role])] }
}
export const currentCommand = (): RuntimeCommand => packageCommand("cli")
export const commandEntrypoint = (command: RuntimeCommand): string => command.args[0] ?? command.executable
export const packageRootFromEntrypoint = (entrypoint: string): string => {
  const source = sourceRuntimeFromEntrypoint(entrypoint)
  if (source) return source.root
  const absolute = resolve(entrypoint)
  for (const entry of [...Object.values(SOURCE_ENTRIES), ...Object.values(EMITTED_ENTRIES)]) {
    const suffix = `/${entry}`
    if (absolute.endsWith(suffix)) return absolute.slice(0, -suffix.length)
  }
  return [".ts", ".js", ".mjs"].includes(extname(entrypoint))
    ? resolve(dirname(entrypoint), "..")
    : resolve(dirname(entrypoint), "../../..")
}
export const runtimeVersion = (): string => {
  const engine = (globalThis as { readonly Bun?: { readonly version?: string } }).Bun
  return engine?.version ?? "unavailable"
}
export const runtimeProbeArguments = (runtime: string): ReadonlyArray<string> =>
  Object.values(roleNames).includes(runtime.split("/").at(-1) ?? "")
    ? ["--runtime-identity"]
    : [
        "-e",
        'process.stdout.write(JSON.stringify({version:globalThis.Bun?.version??"unavailable",platform:process.platform,architecture:process.arch}))'
      ]
export const commandTokens = (runtime: string, entrypoint: string): ReadonlyArray<string> => {
  const command = commandFromEntrypoint(runtime, entrypoint)
  return [command.executable, ...command.args]
}
export const expectedRuntimeVersion = (_entrypoint: string): string => BUN_VERSION
export const observedRuntimeVersion = (output: string): string => {
  const trimmed = output.trim()
  if (!trimmed.startsWith("{")) return trimmed
  try {
    return (JSON.parse(trimmed) as { version: string }).version
  } catch {
    return "unavailable"
  }
}
export const versionProbeArguments = (runtime: string, entrypoint: string): ReadonlyArray<string> =>
  commandFromEntrypoint(runtime, entrypoint).args.length === 0
    ? ["--runtime-identity"]
    : ["-e", 'process.stdout.write(globalThis.Bun?.version??"unavailable")']
