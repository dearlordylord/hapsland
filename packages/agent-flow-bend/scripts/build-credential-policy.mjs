import { extractBendFunctions } from "../../../scripts/pure-bend-artifact.mjs"
import { pathToFileURL } from "node:url"
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
  const original = (await import(pathToFileURL(output))).default
  const generated =
    extractBendFunctions(raw, ["$lookup$", "$save_available$"]) +
    "\nexport const lookupSources = $lookup$;\nexport const saveAvailable = $save_available$;\n"
  const selected = join(temporary, "selected.mjs")
  writeFileSync(selected, generated)
  const specialized = await import(pathToFileURL(selected))
  for (let bits = 0; bits < 32; bits++) {
    const facts = Array.from({ length: 5 }, (_, index) => Boolean(bits & (1 << index)))
    assert.deepEqual(specialized.lookupSources(...facts), original.lookup(...facts))
  }
  for (const tag of ["Environment", "ProjectLocal", "Project", "User", "Native"])
    for (const local of [false, true])
      assert.deepEqual(specialized.saveAvailable({ $: tag }, local), original.save_available({ $: tag }, local))
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
