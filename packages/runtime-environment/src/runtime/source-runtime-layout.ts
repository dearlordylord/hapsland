import { basename, dirname, join, resolve } from "node:path"
import type { PackageRole, RuntimeCommand } from "./command-model.ts"

import { SOURCE_ENTRIES } from "./release-identity.generated.ts"

export const sourceRuntimeEntries = SOURCE_ENTRIES
export interface SourceRuntimeLayout {
  readonly root: string
  readonly identity: string
  readonly directory: string
}
export const sourceRuntimeLayout = (root: string, identity: string): SourceRuntimeLayout => {
  if (!/^[a-f0-9]{64}$/.test(identity)) throw new Error("Invalid source runtime identity")
  return { root: resolve(root), identity, directory: join(resolve(root), ".test-runs", "source-runtime", identity) }
}
export const sourceRuntimeFromEntrypoint = (entrypoint: string): SourceRuntimeLayout | undefined => {
  const directory = dirname(resolve(entrypoint))
  const role = basename(entrypoint).replace(/\.mjs$/, "")
  if (
    !entrypoint.endsWith(".mjs") ||
    !Object.hasOwn(sourceRuntimeEntries, role) ||
    !/^[a-f0-9]{64}$/.test(basename(directory)) ||
    basename(dirname(directory)) !== "source-runtime" ||
    basename(dirname(dirname(directory))) !== ".test-runs"
  )
    return undefined
  return sourceRuntimeLayout(resolve(directory, "../../.."), basename(directory))
}
export const sourceRuntimeCommand = (
  layout: SourceRuntimeLayout,
  executable: string,
  role: PackageRole
): RuntimeCommand => ({ executable, args: [join(layout.directory, `${role}.mjs`)] })
