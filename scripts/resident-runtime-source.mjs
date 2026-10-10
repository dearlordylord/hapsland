import { readFileSync, readdirSync } from "node:fs"
import { resolve } from "node:path"

// Check the complete resident workflow implementation, including private stages.
const capabilityDirectories = [
  "review-work",
  "advice-delivery",
  "authorization",
  "recipient",
  "inspection",
  "ipc",
  "work-ownership",
  "endpoint-lifecycle",
  "execution-controls",
  "composition"
]
const sourceFiles = (directory) =>
  readdirSync(directory, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name))
    .flatMap((entry) => {
      const path = resolve(directory, entry.name)
      return entry.isDirectory()
        ? sourceFiles(path)
        : entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts")
          ? [path]
          : []
    })
export const readResidentRuntimeSource = (root) => {
  const resident = resolve(root, "packages/resident-runtime/src/resident")
  return [
    ...["server", "runtime", "runtime-options", "adapter-error"].map((name) => resolve(resident, `${name}.ts`)),
    ...capabilityDirectories.flatMap((name) => sourceFiles(resolve(resident, name))),
    resolve(resident, "state/encoded-size.ts")
  ]
    .filter((path) => !path.endsWith("/advice-delivery/collection.ts"))
    .map((path) => readFileSync(path, "utf8"))
    .join("\n")
}

export const residentRuntimeSourceFiles = (root) => sourceFiles(resolve(root, "packages/resident-runtime/src/resident"))

// Native records and canonical drafts remain one resident state authority.
export const readResidentStateSource = (root, ...owners) =>
  owners
    .flatMap((owner) => sourceFiles(resolve(root, "packages/resident-runtime/src/resident/state", owner)))
    .map((path) => readFileSync(path, "utf8"))
    .join("\n")
