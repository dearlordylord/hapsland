import assert from "node:assert/strict"
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"
import { bendPrecompileEntryMethods, readBendPrecompile } from "./bend-precompile-inputs.mjs"
import { selectBendPrecompileEntries } from "./bend-precompile-entry.mjs"

const library = `function run_lib(f, n) {
  return (...a) => a.length < n ? run_lib((...b) => f(...a, ...b), n - a.length)
    : f(...a);
}
function helper(x) { return x + 1 }
export default {
  "initial": run_lib((x) => helper(x), 1),
  "unused": run_lib(() => helper(100), 0),
  "resume": run_lib((x, y) => x + y, 2)
};
const sentinel = 17;
`

test("private ABI selection preserves bodies, retained expressions and currying", async () => {
  const selected = selectBendPrecompileEntries(library, ["initial", "resume"])
  assert.equal(
    selected.slice(0, selected.indexOf("export default")),
    library.slice(0, library.indexOf("export default"))
  )
  assert.ok(selected.endsWith(";\nconst sentinel = 17;\n"))
  assert.ok(selected.includes('"initial": run_lib((x) => helper(x), 1)'))
  assert.ok(selected.includes('"resume": run_lib((x, y) => x + y, 2)'))
  const { default: core } = await import("data:text/javascript," + encodeURIComponent(selected))
  assert.deepEqual(Object.keys(core), ["initial", "resume"])
  assert.equal(core.initial(3), 4)
  assert.equal(core.resume(3)(4), 7)
})

test("unknown, effectful, missing and duplicate export layouts fail before publication", () => {
  for (const source of [
    library.replace('"initial":', '["initial"]:'),
    library.replace('"unused":', '"initial":'),
    library.replace("run_lib((x) => helper(x), 1)", "effect()"),
    library.replace("function run_lib(f, n) {", "function run_lib(f, n) { effect();"),
    library + "\nexport const other = 1;"
  ])
    assert.throws(() => selectBendPrecompileEntries(source, ["initial", "resume"]))
  for (const methods of [[], ["initial", "initial"], ["missing"]])
    assert.throws(() => selectBendPrecompileEntries(library, methods))
})

test("each private core uses its authored entry ABI", () => {
  for (const name of ["preparation", "preparation-finalization"]) {
    const declaration = readFileSync(
      new URL(`../packages/review-execution/src/direct-event/preparation/${name}-core.d.ts`, import.meta.url),
      "utf8"
    )
    assert.deepEqual(
      bendPrecompileEntryMethods(declaration),
      name === "preparation" ? ["initial_settled", "resume_settled"] : ["initial", "advance", "resume"]
    )
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
