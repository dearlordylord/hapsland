import { createHash } from "node:crypto"
import { existsSync, readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import {
  commandFromEntrypoint,
  commandTokens,
  packageRootFromEntrypoint
} from "@hapsland/runtime-environment/runtime/package-runtime"

const quote = (value: string): string => `'${value.replaceAll("'", "'\\''")}'`
export const bindingDigest = (content: string): string => createHash("sha256").update(content).digest("hex")
/** Published hooks keep native command text stable while their selected package changes. */
export const standaloneHookBinding = (
  runtime: string,
  entrypoint: string,
  home: string,
  adapter: "codex" | "claude"
) => {
  if (commandFromEntrypoint(runtime, entrypoint).args.length !== 0) return undefined
  const path = join(home, ".hapsland", `${adapter}-hook-launcher.sh`)
  const content = `#!/bin/sh\nexec ${commandTokens(runtime, entrypoint).map(quote).join(" ")} "$@"\n`
  return { path, content, fingerprint: bindingDigest(content), command: `${quote("/bin/sh")} ${quote(path)}` }
}
export const sameStandaloneImplementation = (
  previous: { executable: string; args: ReadonlyArray<string> },
  next: { executable: string; args: ReadonlyArray<string> },
  platform: NodeJS.Platform = process.platform
): boolean => {
  if (previous.args.length !== 0 || next.args.length !== 0) return false
  try {
    if (!readFileSync(previous.executable).equals(readFileSync(next.executable))) return false
    const previousPayload = `${previous.executable}.js`
    const nextPayload = `${next.executable}.js`
    if (existsSync(previousPayload) || existsSync(nextPayload)) {
      if (!readFileSync(previousPayload).equals(readFileSync(nextPayload))) return false
      const runtime = (executable: string): string => {
        if (!existsSync(join(dirname(executable), "hapsland"))) throw new Error("Missing shared runtime")
        const declaration = JSON.parse(
          readFileSync(join(packageRootFromEntrypoint(executable), "package-runtime.json"), "utf8")
        ).runtime
        if (
          declaration?.name !== "bun" ||
          typeof declaration.version !== "string" ||
          declaration.version.length === 0 ||
          declaration.distribution !== "shared-embedded-runtime"
        )
          throw new Error("Invalid shared runtime declaration")
        return declaration.version
      }
      // The shared binary also embeds unrelated CLI code; only its Bun runtime affects hooks.
      if (runtime(previous.executable) !== runtime(next.executable)) return false
    }
    if (platform !== "darwin") return true
    const capture = (executable: string) =>
      join(packageRootFromEntrypoint(executable), "native/prebuilt/darwin-arm64/capture-open")
    return readFileSync(capture(previous.executable)).equals(readFileSync(capture(next.executable)))
  } catch {
    return false
  }
}
