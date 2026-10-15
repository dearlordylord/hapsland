import assert from "node:assert/strict"
import { execFileSync, spawnSync } from "node:child_process"
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join, relative, resolve } from "node:path"

const owner = import.meta.dirname
const root = resolve(owner, "../../../../..")
const proof = join(owner, "JointFreshProof.bend")
execFileSync("timeout", ["10s", "taskset", "-c", "10", "bend", proof, "--verdict"], { timeout: 11000, stdio: "pipe" })
const temporary = mkdtempSync(join(tmpdir(), "hapsland-joint-fresh-mutants-"))
try {
  const copied = new Set()
  function copyClosure(path) {
    if (copied.has(path)) return
    copied.add(path)
    const destination = relative(root, path)
    assert.ok(!destination.startsWith("..") && destination.endsWith(".bend"), destination)
    const source = readFileSync(path, "utf8")
    mkdirSync(dirname(join(temporary, destination)), { recursive: true })
    copyFileSync(path, join(temporary, destination))
    for (const match of source.matchAll(/^import\s+(\.[^\s]+\.bend)(?:\s|$)/gm))
      copyClosure(resolve(dirname(path), match[1]))
  }
  copyClosure(proof)
  const path = join(temporary, relative(root, join(owner, "Joint.bend")))
  const original = readFileSync(path, "utf8")
  for (const [mutant, before, after, expectedLocation] of [
    ["fresh_identity_not_expanded", "identity <> expanded,", "expanded,", "actual_fresh"],
    ["parked_parent_depth_not_retained", "Ghost{1n+depth, prefix,", "Ghost{depth, prefix,", "reconstruct_fresh"]
  ]) {
    assert.equal(original.split(before).length, 2, mutant)
    writeFileSync(path, original.replace(before, after))
    const result = spawnSync("taskset", ["-c", "10", "bend", join(temporary, relative(root, proof)), "--verdict"], {
      timeout: 10000,
      encoding: "utf8"
    })
    if (result.error) throw result.error
    const diagnostic = result.stdout + result.stderr
    assert.equal(result.status, 1, diagnostic)
    assert.ok(diagnostic.includes("SOME PROOFS FAIL"), diagnostic)
    const locations = [...diagnostic.matchAll(/Location: ([^\r\n]+)/g)].map((match) => match[1])
    assert.deepEqual(locations, [expectedLocation], diagnostic)
    assert.ok(!/PARSE ERROR|SYNTAX ERROR|UNBOUND VARIABLE/.test(diagnostic), diagnostic)
    console.log(
      JSON.stringify({
        mutant,
        rejected: true,
        locations,
        scope:
          "full fresh-branch joint preservation and actual transition; rejection may occur in a shared proof helper"
      })
    )
  }
} finally {
  rmSync(temporary, { recursive: true, force: true })
}
