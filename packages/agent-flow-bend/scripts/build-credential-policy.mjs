import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { readFileSync, writeFileSync, mkdtempSync, rmSync, mkdirSync, copyFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
const root = resolve(import.meta.dirname, "..")
const outputDirectory = resolve(process.argv.slice(2).find((arg) => arg !== "--check") ?? join(root, "dist"))
const expectedVersion = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).hapsland.toolchain.bend.version
assert.equal(execFileSync("bend", ["version"], { encoding: "utf8", timeout: 5000 }).trim(), `bend ${expectedVersion}`)
execFileSync("bend", [join(root, "credential-policy/PROOF.bend"), "--verdict"], { timeout: 5000 })
const temporary = mkdtempSync(join(tmpdir(), "hapsland-credential-policy-"))
try {
  const output = join(temporary, "core.mjs")
  execFileSync("bend", [join(root, "credential-policy/core.bend"), "-o", output], { timeout: 5000 })
  const raw = readFileSync(output, "utf8")
  assert.equal(raw.split("export default {").length, 2, "compiler module export ABI changed")
  const generated =
    raw.replace("export default {", "const credentialPolicy = {") +
    "\nexport const lookupSources = credentialPolicy.lookup;\nexport const saveAvailable = credentialPolicy.save_available;\n"
  const target = join(outputDirectory, "credential-policy.generated.js")
  const declaration = join(outputDirectory, "credential-policy.generated.d.ts")
  const abi = join(root, "abi/credential-policy.generated.d.ts")
  if (process.argv.includes("--check")) {
    assert.equal(readFileSync(target, "utf8"), generated)
    assert.ok(readFileSync(declaration).equals(readFileSync(abi)))
  } else {
    mkdirSync(outputDirectory, { recursive: true })
    writeFileSync(target, generated)
    copyFileSync(abi, declaration)
  }
} finally {
  rmSync(temporary, { recursive: true, force: true })
}
