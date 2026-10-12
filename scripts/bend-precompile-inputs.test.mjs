import assert from "node:assert/strict"
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"
import { bendPrecompileEntryMethods, readBendPrecompile } from "./bend-precompile-inputs.mjs"

test("each private core uses its authored entry ABI", () => {
  for (const name of ["preparation", "preparation-finalization"]) {
    const declaration = readFileSync(
      new URL(`../packages/review-execution/src/direct-event/preparation/${name}-core.d.ts`, import.meta.url),
      "utf8"
    )
    assert.deepEqual(bendPrecompileEntryMethods(declaration), ["initial", "advance", "resume"])
  }
  assert.deepEqual(
    bendPrecompileEntryMethods(
      "declare const core: { begin(input: bigint): bigint; resume(input: bigint): bigint }; export default core"
    ),
    ["begin", "resume"]
  )
})

test("ambiguous or incomplete authored ABIs fail before emission", () => {
  for (const source of [
    "declare const core: any; export default core",
    "declare const core: {}; export default core",
    "declare const core: { resume?(input: bigint): bigint }; export default core",
    "declare const core: { [name: string]: Function }; export default core",
    "declare const core: { resume(): bigint; resume(): bigint }; export default core"
  ])
    assert.throws(() => bendPrecompileEntryMethods(source), /Bend precompile ABI/)
})

test("nested capability recipes preserve source, ABI and output custody", () => {
  const root = mkdtempSync(join(tmpdir(), "hapsland-recipe-paths-"))
  try {
    const path = join(root, "packages", "probe")
    const directory = join(path, "src", "work", "composition")
    mkdirSync(directory, { recursive: true })
    writeFileSync(join(directory, "Core.bend"), "import Base\ndef main() -> Unit: Unit{}\n")
    writeFileSync(
      join(directory, "generic-core.d.ts"),
      "declare const core: { initial(): bigint }; export default core"
    )
    const recipe = join(path, "src", "work", "build-recipe.json")
    const entry = {
      source: "composition/Core.bend",
      output: "composition/generic-core.js",
      declaration: "composition/generic-core.d.ts"
    }
    const node = {
      path,
      compiler: "typescript",
      manifest: { name: "@probe/core", hapsland: { bendPrecompile: "src/work/build-recipe.json" } }
    }
    const read = (value) => {
      writeFileSync(recipe, JSON.stringify([value]))
      return readBendPrecompile(root, node)
    }
    assert.equal(read(entry).artifacts[0].output, "work/composition/generic-core.js")
    for (const invalid of [
      { ...entry, source: "../Core.bend" },
      { ...entry, output: "other/generic-core.js", declaration: "other/generic-core.d.ts" },
      { ...entry, declaration: "../generic-core.d.ts" }
    ])
      assert.throws(() => read(invalid), /Invalid or duplicate/)
    const outside = join(root, "outside.bend")
    writeFileSync(outside, "import Base")
    symlinkSync(outside, join(directory, "Link.bend"))
    assert.throws(() => read({ ...entry, source: "composition/Link.bend" }), /Escaped/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
