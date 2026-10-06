import { spawnSync } from "node:child_process"
import { resolve } from "node:path"
import { checkWorkspaceImports } from "./check-workspace-imports.mjs"
import { checkCompilerReceipts } from "./check-compiler-receipts.mjs"
import { generatePackageConfigs } from "./package-graph.mjs"
import { generateReleaseIdentity } from "./generate-release-identity.mjs"
const root = resolve(import.meta.dirname, "..")
generatePackageConfigs(root)
generateReleaseIdentity(root)
checkWorkspaceImports(root)
const result = spawnSync(
  resolve(root, "node_modules/.bin/turbo"),
  ["run", "build", "--cache=local:rw", "--concurrency=2", "--cache-dir=.test-runs/turbo-cache"],
  { cwd: root, stdio: "inherit", timeout: 180000, env: { ...process.env, TURBO_TELEMETRY_DISABLED: "1" } }
)
if (result.status !== 0) throw result.error ?? new Error("Workspace compilation failed")

checkCompilerReceipts(root)
