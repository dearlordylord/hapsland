import { join } from "node:path"
import { execFileSync } from "../../scripts/test-harness/process.mjs"
import { bunExecutable } from "../runtime/bun-runtime.ts"
import type { PackageRole, RuntimeCommand } from "../runtime/package-runtime.ts"
import { sourceRuntimeEntries, sourceRuntimeLayout, sourceRuntimeCommand } from "../runtime/source-runtime-layout.ts"

export interface TestSourceRuntime {
  readonly identity: string
  readonly commands: Readonly<Record<PackageRole, RuntimeCommand>>
  readonly environment: Readonly<Record<string, string>>
}
export const prepareTestSourceRuntime = (): TestSourceRuntime => {
  const root = process.cwd()
  const artifact = JSON.parse(
    execFileSync(process.execPath, [join(root, "scripts/source-runtime.mjs")], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 125000
    })
  ) as TestSourceRuntime
  const layout = sourceRuntimeLayout(root, artifact.identity)
  for (const role of Object.keys(sourceRuntimeEntries) as Array<PackageRole>) {
    const expected = sourceRuntimeCommand(layout, bunExecutable(), role)
    if (JSON.stringify(artifact.commands[role]) !== JSON.stringify(expected))
      throw new Error("Prepared source command does not belong to the current runtime/checkout")
  }
  const manifest = artifact.environment.HAPSLAND_BUN_COVERAGE_MANIFEST
  if (manifest !== undefined && manifest !== join(layout.directory, "source-manifest.json"))
    throw new Error("Prepared coverage manifest does not belong to the source runtime")
  if (process.env.HAPSLAND_BUN_COVERAGE_DIRECTORY && !manifest)
    throw new Error("Prepared source runtime is missing instrumentation for the owned coverage run")
  return artifact
}
