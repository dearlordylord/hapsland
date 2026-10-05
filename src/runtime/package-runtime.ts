import { realpathSync } from "node:fs"
import { dirname, extname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { CLI_NAME } from "./cli-names.ts"

export interface RuntimeCommand {
  readonly executable: string
  readonly args: ReadonlyArray<string>
}
export type PackageRole = "cli" | "doctor" | "parser" | "resident"
export const BUN_VERSION = "1.3.14"
const roleNames: Readonly<Record<PackageRole, string>> = {
  cli: CLI_NAME,
  doctor: "hapsland-doctor",
  parser: "hapsland-parser",
  resident: "hapsland-resident"
}
const sourceEntries: Readonly<Record<PackageRole, string>> = {
  cli: "cli",
  doctor: "package-doctor",
  parser: "parser-main",
  resident: "resident/main"
}
const moduleUrl = import.meta.url
export const standalone = moduleUrl.includes("/$bunfs/")
const executablePath = (): string => {
  try {
    return realpathSync(process.execPath)
  } catch {
    return resolve(process.execPath)
  }
}
export const packageRoot = standalone
  ? resolve(dirname(executablePath()), "../../..")
  : resolve(dirname(fileURLToPath(moduleUrl)), "../..")
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
  const suffix = moduleUrl.endsWith(".js") ? ".js" : ".ts"
  const directory = suffix === ".js" ? "dist" : "src"
  return { executable: process.execPath, args: [join(packageRoot, directory, `${sourceEntries[role]}${suffix}`)] }
}
export const currentCommand = (): RuntimeCommand => packageCommand("cli")
export const commandEntrypoint = (command: RuntimeCommand): string => command.args[0] ?? command.executable
export const packageRootFromEntrypoint = (entrypoint: string): string =>
  [".ts", ".js", ".mjs"].includes(extname(entrypoint))
    ? resolve(dirname(entrypoint), "..")
    : resolve(dirname(entrypoint), "../../..")
export const runtimeVersion = (): string => {
  const engine = (globalThis as { readonly Bun?: { readonly version?: string } }).Bun
  return standalone ? (engine?.version ?? "unavailable") : process.version
}
export const runtimeProbeArguments = (runtime: string): ReadonlyArray<string> =>
  Object.values(roleNames).includes(runtime.split("/").at(-1) ?? "")
    ? ["--runtime-identity"]
    : [
        "-e",
        "process.stdout.write(JSON.stringify({version:process.version,platform:process.platform,architecture:process.arch}))"
      ]
export const commandTokens = (runtime: string, entrypoint: string): ReadonlyArray<string> => {
  const command = commandFromEntrypoint(runtime, entrypoint)
  return [command.executable, ...command.args]
}
export const expectedRuntimeVersion = (entrypoint: string): string =>
  [".ts", ".js", ".mjs"].includes(extname(entrypoint)) ? "v24.20.0" : BUN_VERSION
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
    : ["-e", "process.stdout.write(process.version)"]
