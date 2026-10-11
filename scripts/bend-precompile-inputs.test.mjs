import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"
import { bendPrecompileEntryMethods } from "./bend-precompile-inputs.mjs"

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
