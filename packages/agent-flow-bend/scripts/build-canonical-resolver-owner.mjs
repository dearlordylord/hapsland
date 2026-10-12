import { execFileSync } from "node:child_process"
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { pathToFileURL } from "node:url"
import { bendGeneratedLoaderEvidence } from "../../../scripts/bend-producer.mjs"

const root = resolve(import.meta.dirname, "..")
const output = resolve(process.argv[2] ?? join(root, "dist"))
const version = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).hapsland.toolchain.bend.version
if (execFileSync("bend", ["version"], { encoding: "utf8", timeout: 5000 }).trim() !== `bend ${version}`)
  throw new Error(`Canonical resolver owner requires Bend ${version}`)
const temporary = mkdtempSync(join(tmpdir(), "hapsland-canonical-resolver-owner-"))
try {
  const emitted = join(temporary, "canonical-resolver-owner.mjs")
  execFileSync("bend", [join(root, "preparation-lifecycle/CanonicalResolverOwner.bend"), "-o", emitted], {
    stdio: "pipe",
    timeout: 5000
  })
  const source = readFileSync(emitted, "utf8")
  const loaders = bendGeneratedLoaderEvidence(source, emitted)
  if (loaders.modules.length || loaders.libraries.length || loaders.symbols.length)
    throw new Error("Canonical resolver owner must have no foreign loaders")
  const owner = (await import(pathToFileURL(emitted))).default
  const declaration = readFileSync(join(root, "abi/canonical-resolver-owner.generated.d.ts"), "utf8")
  for (const [, method] of declaration.matchAll(/^  (\w+)\(/gm))
    if (typeof owner?.[method] !== "function") throw new Error(`Missing Canonical resolver owner method: ${method}`)
  mkdirSync(output, { recursive: true })
  copyFileSync(emitted, join(output, "canonical-resolver-owner.generated.js"))
  copyFileSync(
    join(root, "abi/canonical-resolver-owner.generated.d.ts"),
    join(output, "canonical-resolver-owner.generated.d.ts")
  )
} finally {
  rmSync(temporary, { recursive: true, force: true })
}
