import { createRequire } from "node:module"
import { packageAssetPath } from "../runtime/package-runtime.ts"

let binding: ((descriptor: number) => unknown) | undefined

/** Non-waiting kernel lock; lazy binding loading occurs in the storage worker, never the review producer. */
export const lockInspectionDirectory = (descriptor: number): boolean => {
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
    binding = (fd) => lock(fd)
  }
  const result = binding(descriptor)
  if (typeof result !== "boolean") throw new Error("inspection storage unavailable")
  return result
}
