import { readFileSync } from "node:fs"
import { npmToolingRequire, npmPackageFiles } from "./npm-tooling.mjs"
import { fileURLToPath } from "node:url"
import { resolve } from "node:path"

/** Use the invoking npm's packlist and tar implementation, with fast local compression. */
export async function packDevelopmentArchive({ root, destination, npmEntrypoint }) {
  const require = npmToolingRequire(npmEntrypoint)
  const tar = require("tar")
  const manifest = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"))
  if (manifest.name !== "@hapsland/hapsland") throw new Error("pack did not select a Hapsland package")
  const files = await npmPackageFiles(root, npmEntrypoint)
  const archive = resolve(
    destination,
    `${manifest.name.replace(/^@/, "").replaceAll("/", "-")}-${manifest.version}.tgz`
  )
  const bins = new Set(typeof manifest.bin === "string" ? [manifest.bin] : Object.values(manifest.bin ?? {}))
  await tar.c(
    {
      cwd: root,
      file: archive,
      prefix: "package/",
      portable: true,
      gzip: { level: 1 },
      mtime: new Date("1985-10-26T08:15:00.000Z"),
      filter: (path, stat) => {
        if (bins.has(path.replace(/^\.\//, ""))) stat.mode |= 0o111
        return true
      }
    },
    files
  )
  return archive
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [root, destination, ...extra] = process.argv.slice(2)
  if (!root || !destination || extra.length) throw new Error("Usage: dev-pack.mjs ROOT DESTINATION")
  console.log(await packDevelopmentArchive({ root: resolve(root), destination: resolve(destination) }))
}
