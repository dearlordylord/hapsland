import { readFileSync, readdirSync } from "node:fs"
import { resolve } from "node:path"

// The workflows extracted from the CLI retain the CLI's source-boundary rules.
// Existing native adapters have their separate owner-specific checks.
const workflowDirectories = ["invocation", "composition", "status", "explanation", "onboarding/installation"]
const workflowFiles = [
  "credentials/command",
  "credentials/summary",
  "credentials/request",
  "credentials/read-command",
  "evaluation/invocation",
  "interaction/outcome",
  ...[
    "setup-invocation",
    "demo-invocation",
    "client-discovery",
    "update-invocation",
    "maintenance-invocation",
    "doctor-invocation",
    "lifecycle-invocation",
    "invocation-fields"
  ].map((name) => `onboarding/${name}`)
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
export const administrationWorkflowSourceFiles = (root) => {
  const administration = resolve(root, "packages/administration/src")
  return [
    resolve(root, "packages/cli-entry/src/cli.ts"),
    ...workflowDirectories.flatMap((name) => sourceFiles(resolve(administration, name))),
    ...workflowFiles.map((name) => resolve(administration, `${name}.ts`))
  ]
}
export const readAdministrationWorkflowSource = (root) =>
  administrationWorkflowSourceFiles(root)
    .map((path) => readFileSync(path, "utf8"))
    .join("\n")
