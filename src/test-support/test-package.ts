import { accessSync, constants, copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, relative } from "node:path"
import { execFileSync } from "../../scripts/test-harness/process.mjs"
import { standaloneEnvironment } from "../../scripts/test-harness/standalone-environment.mjs"
import { standaloneCommand, type RuntimeCommand } from "../runtime/package-runtime.ts"

export interface TestPackage {
  readonly packageRoot: string
  readonly cli: RuntimeCommand
  readonly resident: RuntimeCommand
  readonly environment: NodeJS.ProcessEnv
  readonly command: readonly string[]
  readonly cleanup: () => void
}

/** Extract the production archive into its package layout; npm installation has separate conformance gates. */
export const prepareTestPackage = (): TestPackage => {
  const temporaryRoot = mkdtempSync(join(tmpdir(), "hapsland-test-package-"))
  const cleanup = () => rmSync(temporaryRoot, { recursive: true, force: true })
  try {
    const artifacts = join(temporaryRoot, "artifacts")
    mkdirSync(artifacts)
    const suppliedArchive = process.env.HAPSLAND_TEST_PACKAGE_ARCHIVE
    let artifact: string
    if (suppliedArchive !== undefined) {
      artifact = join(artifacts, "reviewed-local.tgz")
      copyFileSync(suppliedArchive, artifact)
    } else {
      const prepared = JSON.parse(
        execFileSync(process.execPath, [join(process.cwd(), "scripts/prepare-package.mjs"), "--timeout-ms=120000"], {
          cwd: process.cwd(),
          encoding: "utf8",
          stdio: ["ignore", "pipe", "pipe"],
          timeout: 125000
        })
      ) as { readonly archivePath: string }
      artifact = join(artifacts, "reviewed-local.tgz")
      copyFileSync(prepared.archivePath, artifact)
    }
    const installation = join(temporaryRoot, "installation")
    const packageRoot = join(installation, "node_modules/@hapsland/hapsland")
    mkdirSync(packageRoot, { recursive: true })
    execFileSync("tar", ["-xzf", artifact, "-C", packageRoot, "--strip-components=1"], {
      cwd: temporaryRoot,
      stdio: "pipe",
      timeout: 120_000
    })
    const manifest = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8")) as {
      readonly bin: Readonly<Record<string, string>>
    }
    const binDirectory = join(installation, "node_modules/.bin")
    mkdirSync(binDirectory)
    for (const [name, target] of Object.entries(manifest.bin)) {
      const executable = join(packageRoot, target)
      accessSync(executable, constants.X_OK)
      symlinkSync(relative(binDirectory, executable), join(binDirectory, name))
    }
    for (const role of ["cli", "doctor", "parser", "resident"] as const) {
      accessSync(standaloneCommand(packageRoot, role).executable, constants.X_OK)
    }
    return {
      packageRoot,
      cli: standaloneCommand(packageRoot, "cli"),
      resident: standaloneCommand(packageRoot, "resident"),
      environment: standaloneEnvironment(join(temporaryRoot, "standalone-path")),
      command: [join(installation, "node_modules/.bin/hapsland")],
      cleanup
    }
  } catch (error) {
    cleanup()
    throw error
  }
}
