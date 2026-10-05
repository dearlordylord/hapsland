import { mkdir, writeFile } from "node:fs/promises"
import { join, resolve } from "node:path"

export const preparePackageInstall = async (installation, archive, env = process.env) => {
  const manager = env.HAPSLAND_PACKAGE_INSTALLER ?? "bun"
  if (manager !== "bun" && manager !== "npm") throw new Error("HAPSLAND_PACKAGE_INSTALLER must be bun or npm")
  await mkdir(installation, { recursive: true })
  // A manifest keeps package managers from adopting an ancestor project in /tmp.
  await writeFile(
    join(installation, "package.json"),
    JSON.stringify({ name: "hapsland-package-conformance", version: "0.0.0", private: true }),
    { flag: "wx" }
  )
  return manager === "bun"
    ? {
        manager,
        executable: env.HAPSLAND_BUILD_BUN ?? "bun",
        args: ["add", "--ignore-scripts", "--no-save", "--cwd", installation, resolve(archive)]
      }
    : {
        manager,
        executable: "npm",
        args: [
          "install",
          "--global=false",
          "--legacy-peer-deps",
          "--ignore-scripts=true",
          "--prefer-offline",
          "--omit=dev",
          "--bin-links=true",
          "--prefix",
          installation,
          resolve(archive)
        ]
      }
}
