import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"

const root = resolve(import.meta.dirname, "../../..")
const sourceRoot = join(root, "packages/agent-flow-bend/request-content")
const bend = process.env.HAPSLAND_CONTENT_BEND ?? "bend"
const version = execFileSync(bend, ["version"], { encoding: "utf8", timeout: 5000 }).trim()
assert.equal(version, "bend 2.0.35", `Bend artifact generation requires exact Bend 2.0.35; observed ${version}`)
const temporary = mkdtempSync(join(tmpdir(), "hapsland-request-content-"))
try {
  const output = join(temporary, "runtime.js")
  execFileSync(bend, [join(sourceRoot, "Runtime.bend"), "-o", output], { timeout: 5000 })
  const raw = readFileSync(output, "utf8")
  const footer = /\ncli\(process\.argv\.slice\(\d+\)\);\nio_exit\(\$main\$, [\s\S]*\);\s*$/
  assert.match(raw, footer)
  assert.ok(raw.includes("function $core$058project$("), "compiler export ABI changed")
  const generated = raw.replace(
    footer,
    "\nexport const projectRequestContent = (fields) => run_loop($core$058project$(fields));\n"
  )
  const target = join(root, "src/review-providers/request-content.generated.js")
  if (process.argv.includes("--check")) {
    assert.equal(
      readFileSync(target, "utf8"),
      generated,
      "request-content artifact differs from freshly compiled production Bend"
    )
  } else writeFileSync(target, generated)
} finally {
  rmSync(temporary, { recursive: true, force: true })
}
