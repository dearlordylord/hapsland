import assert from "node:assert/strict"
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"
import { arithmeticProofs, readArithmeticSources } from "./motion-arithmetic.mjs"
import { stateSlice } from "./motion-state-slice.mjs"

test("numeric proof lowering binds the actual unsigned expressions and all nine laws", () => {
  const proofs = arithmeticProofs(readArithmeticSources())
  assert.equal(proofs.length, 9)
  assert.match(proofs[0].source, /BitVec 32/)
  assert.match(proofs[0].source, /BitVec.ule a b/)
  assert.match(proofs[0].source, /a \+ \(min32 pixels \(b - a\)\)/)
  assert.match(proofs[8].source, /→/)
  assert.match(proofs[8].source, /intro h/)
})

test("unsupported primitives, field mappings and leftover law syntax fail closed", () => {
  const original = readArithmeticSources()
  for (const changed of [
    { ...original, map: original.map.replace("case Point{x,_}:x", "case Point{x,_}:0") },
    { ...original, map: original.map.replace("U32.min(pixels,(b - a : U32))", "U32.div(pixels,(b - a : U32))") },
    { ...original, laws: original.laws.replace("law coordinate_no_overshoot:", "law hidden_other_property:") },
    { ...original, laws: original.laws.replace("for +start: U32", "for +start: U32\n  require True{}") },
    { ...original, laws: original.laws.replace("for +start: U32", "for +start: Nat") }
  ]) assert.throws(() => arithmeticProofs(changed), /Unsupported|inventory|Unconsumed/)
})

test("state proof selection retains source bodies and exposes its stronger suffix generalization", () => {
  const directory = mkdtempSync(join(tmpdir(), "hapsland-motion-slice-test-"))
  try {
    const identity = stateSlice(directory, { law: "observation_preserves_position" })
    assert.equal(identity.abstractSuffix, true)
    assert.deepEqual(identity.selectedDefinitions, ["phase", "point", "changed"])
    const code = readFileSync(join(directory, "DefenseMotion.bend"), "utf8")
    assert.match(code, /V.Actor\{k,f,lane,x,y,p,next,/)
    assert.match(code, /List.append\(&2,V.Waypoint,steps,suffix\)/)
    assert.match(readFileSync(join(directory, "MotionStateLAWS.bend"), "utf8"), /for suffix: List/)
    const baseline = stateSlice(directory, { law: "advance_preserves_identity" })
    assert.equal(baseline.abstractSuffix, false)
    assert.match(readFileSync(join(directory, "DefenseMotion.bend"), "utf8"), /case value Con\{next,rest\}: move_to\(value,next,rest\)/)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})
