import { createRequire } from "node:module"
import { packageAssetPath } from "@hapsland/runtime-environment/runtime/package-runtime"

export class InspectionStorageBusy extends Error {
  readonly _tag = "InspectionStorageBusy"
  constructor() {
    super("inspection storage unavailable: journal lock is busy")
    this.name = "InspectionStorageBusy"
  }
}

let binding: ((descriptor: number, shared: boolean) => unknown) | undefined

/** Non-waiting kernel lock; lazy binding loading occurs in the storage worker, never the review producer. */
export const lockInspectionDirectory = (descriptor: number, shared = false): boolean => {
  if (!binding) {
    const value: unknown = createRequire(packageAssetPath("package.json"))(
      packageAssetPath("native", "prebuilt", `${process.platform}-${process.arch}`, "inspection-lock.node")
    )
    if (
      typeof value !== "object" ||
      value === null ||
      !("lockDirectory" in value) ||
      typeof value.lockDirectory !== "function"
    )
      throw new Error("inspection storage unavailable")
    const lock = value.lockDirectory
    binding = (fd, shared) => lock(fd, shared)
  }
  const result = binding(descriptor, shared)
  if (typeof result !== "boolean") throw new Error("inspection storage unavailable")
  return result
}
