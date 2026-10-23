import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"
import { bendJavaScriptRuntime } from "./bend-js-runtime.mjs"

test("actual compiler retains distinct record owners across enum conversion and reconstruction", (t) => {
  const directory = mkdtempSync(join(tmpdir(), "bend-js-abi-"))
  t.after(() => rmSync(directory, { recursive: true, force: true }))
  for (const owner of ["Input", "Output"])
    writeFileSync(join(directory, owner + ".bend"), "import Base\ntype Value is Data:\n  Item{value: Nat}\n  Empty{}\n")
  const entry = join(directory, "Main.bend")
  writeFileSync(
    entry,
    `import ./Input.bend as I
import ./Output.bend as O
def convert(x: I.Value) -> O.Value:
  match x:
    case I.Item{value}: O.Item{value}
    case I.Empty{}: O.Empty{}
def retain(x: I.Value) -> I.Value:
  match x:
    case I.Item{value}: I.Item{value}
    case I.Empty{}: I.Empty{}
`
  )
  const emitted = join(directory, "main.mjs")
  const built = spawnSync("bend", [entry, "-o", emitted], { encoding: "utf8", timeout: 5000 })
  assert.ifError(built.error)
  assert.equal(built.status, 0, built.stdout + built.stderr)
  const { source, symbols } = bendJavaScriptRuntime(readFileSync(emitted, "utf8"), entry)
  const convert = new Function(source + `;return x=>run_loop(${symbols.get("convert")}(x));`)()
  const retain = new Function(source + `;return x=>run_loop(${symbols.get("retain")}(x));`)()
  assert.deepEqual(convert({ $: "Input.Item", value: 7 }), { $: "Output.Item", value: 7 })
  assert.deepEqual(convert({ $: "Input.Empty" }), { $: "Output.Empty" })
  assert.deepEqual(retain({ $: "Input.Item", value: 9 }), { $: "Input.Item", value: 9 })
  assert.throws(() => bendJavaScriptRuntime("export default []", entry), /layout changed/)
  assert.throws(
    () => bendJavaScriptRuntime('function $unknown(){return {$:"Item",value:1n}}\nexport default {}', entry),
    /Ambiguous Bend constructor/
  )
})
