import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { pathToFileURL } from "node:url"

// Evaluate the approved law's actual equation, rather than another observer.
// Finite falsification is a prerequisite, never a universal proof claim.
const folder = import.meta.dirname,
  temporary = mkdtempSync(join(tmpdir(), "hapsland-visited-"))
const wrapper = join(folder, ".visited-membership-" + process.pid + ".bend")
const source = readFileSync(
  join(folder, "../../../../packages/source-analysis/src/direct-event/graph-resolution/traversal/VISITED_LAWS.bend"),
  "utf8"
)
const equation = source
  .slice(source.indexOf("law visited_insert_membership:"))
  .match(/\{\s*([\s\S]*?)\s*==\s*([\s\S]*?)\s*:\s*Bool\s*\}\s*$/)
assert.ok(equation, "unique approved membership equation")
const list = (values) => values.reduceRight((tail, head) => ({ $: "Con", head, tail }), { $: "Nil" })
try {
  writeFileSync(
    wrapper,
    "import Base\nimport ./core.bend as Core\nimport ./BOUNDARY.bend as Boundary\ndef check(+prior: List<&2, String>, +inserted: String, +query: String) -> Bool:\n  Bool.not(Bool.xor(" +
      equation[1] +
      ", " +
      equation[2] +
      "))\ndef main() -> Unit:\n  Unit{}\n"
  )
  const output = join(temporary, "check.mjs")
  execFileSync("bend", [wrapper, "-o", output], { timeout: 5000 })
  const { default: program } = await import(pathToFileURL(output))
  const keys = [
    "",
    "a",
    "aa",
    "ab",
    "b",
    "a\0",
    "\0",
    "\0a",
    "a\0b",
    "/",
    "src/a.rs",
    "src/a/mod.rs",
    "type:Root",
    "function:Root",
    "λ",
    "🙂",
    "\ue000",
    "\u{10000}"
  ]
  const histories = [[], ...keys.map((key) => [key]), ...keys.map((key) => [key, key]), keys, keys.slice().reverse()]
  for (let offset = 0; offset < keys.length; offset++) histories.push([...keys.slice(offset), ...keys.slice(0, offset)])
  let comparisons = 0
  for (const history of histories)
    for (const inserted of keys)
      for (const query of keys) {
        assert.equal(program.check(list(history), inserted, query), true, JSON.stringify({ history, inserted, query }))
        comparisons++
      }
  assert.equal(
    readFileSync(
      join(
        folder,
        "../../../../packages/source-analysis/src/direct-event/graph-resolution/traversal/VISITED_LAWS.bend"
      ),
      "utf8"
    ),
    source,
    "law frozen during falsification"
  )
  const record = {
    at: new Date().toISOString(),
    law: "visited_insert_membership",
    lawSHA256: createHash("sha256").update(source).digest("hex"),
    comparisons,
    histories: histories.length,
    keys,
    allPassed: true,
    scope:
      "Actual approved equation evaluated on BaseMap.set/has over Boundary-created insertion histories; prefixes, duplicate identities, NUL and Unicode. Finite falsification only; arbitrary String membership and original whole completion laws remain unproved."
  }
  writeFileSync(join(folder, "visited-membership-falsification.json"), JSON.stringify(record, null, 2) + "\n")
  console.log(JSON.stringify({ comparisons, histories: histories.length, allPassed: true }))
} finally {
  rmSync(wrapper, { force: true })
  rmSync(temporary, { recursive: true, force: true })
}
