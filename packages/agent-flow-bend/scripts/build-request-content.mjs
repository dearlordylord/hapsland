import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { readFileSync, writeFileSync, mkdtempSync, rmSync, mkdirSync, copyFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"

const root = resolve(import.meta.dirname, "..")
const sourceRoot = join(root, "request-content")
const outputDirectory = resolve(process.argv.slice(2).find((arg) => arg !== "--check") ?? join(root, "dist"))
const expectedVersion = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).hapsland.toolchain.bend.version
const bend = process.env.HAPSLAND_CONTENT_BEND ?? "bend"
const version = execFileSync(bend, ["version"], { encoding: "utf8", timeout: 5000 }).trim()
assert.equal(
  version,
  `bend ${expectedVersion}`,
  `Bend artifact generation requires exact Bend ${expectedVersion}; observed ${version}`
)
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
  const target = join(outputDirectory, "request-content.generated.js")
  const declaration = join(outputDirectory, "request-content.generated.d.ts")
  const abi = join(root, "abi/request-content.generated.d.ts")
  if (process.argv.includes("--check")) {
    assert.equal(
      readFileSync(target, "utf8"),
      generated,
      "request-content artifact differs from freshly compiled production Bend"
    )
    assert.ok(
      readFileSync(declaration).equals(readFileSync(abi)),
      "request-content declaration differs from authored ABI"
    )
  } else {
    mkdirSync(outputDirectory, { recursive: true })
    writeFileSync(target, generated)
    copyFileSync(abi, declaration)
  }
} finally {
  rmSync(temporary, { recursive: true, force: true })
}
