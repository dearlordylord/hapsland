import { emittedReleaseEntrypoints } from "@hapsland/runtime-environment/runtime/package-runtime"
import { existsSync, mkdirSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"

/** Synthetic installation metadata for deterministic tests, not a release support declaration. */
export const installationPackageDeclaration = () => ({
  schemaVersion: 1,
  runtime: { name: "node", version: process.version.slice(1) },
  codex: { testedVersions: ["0.155.1", "0.156.0"] },
  profiles: [{ operatingSystem: process.platform, architecture: process.arch }],
  residentProtocol: 1
})

/** Files are observed for installation readiness; these fixtures never execute hook review. */
export const createInstallationPackageFixture = (root: string) => {
  const packageRoot = join(root, "installation-package")
  const entrypoint = join(packageRoot, emittedReleaseEntrypoints.hook)
  if (existsSync(entrypoint)) return entrypoint
  mkdirSync(packageRoot, { recursive: true })
  writeFileSync(
    join(packageRoot, "package.json"),
    JSON.stringify({ name: "@hapsland/hapsland", version: "0.1.0", type: "module" })
  )
  writeFileSync(join(packageRoot, "package-runtime.json"), JSON.stringify(installationPackageDeclaration()))
  for (const role of ["hook", "parser", "resident"] as const) {
    const path = join(packageRoot, emittedReleaseEntrypoints[role])
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, "// deterministic installation fixture\n")
  }
  return entrypoint
}
