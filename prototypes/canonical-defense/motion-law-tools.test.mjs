import assert from "node:assert/strict"
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"
import { arithmeticProofs, readArithmeticSources } from "./motion-arithmetic.mjs"
import { stateSlice, tokenSpan, replaceTokens } from "./motion-state-slice.mjs"

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
    tokenSpan(code, "V.Actor{k,f,lane,x,y,p,next,")
    tokenSpan(code, "List.append(&2,V.Waypoint,steps,suffix)")
    assert.match(readFileSync(join(directory, "MotionStateLAWS.bend"), "utf8"), /for suffix: List/)
    const baseline = stateSlice(directory, { law: "advance_preserves_identity" })
    assert.equal(baseline.abstractSuffix, false)
    tokenSpan(readFileSync(join(directory, "DefenseMotion.bend"), "utf8"), "case value Con{next,rest}: move_to(value,next,rest)")
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test("token mutations preserve unrelated whitespace and reject missing or ambiguous targets", () => {
  const source = '# f(x,y)\ndef example():\n  f(\n    x,  y\n  ) # retained\n'
  assert.equal(replaceTokens(source, "f(x,y)", "f(x,z)"),
    '# f(x,y)\ndef example():\n  f(\n    x,  z\n  ) # retained\n')
  assert.throws(() => replaceTokens(source, "f(x,z)", "g(x)"), /Expected one token location/)
  assert.throws(() => replaceTokens(source + "f(x,y)", "f(x,y)", "g(x)"), /Expected one token location/)
  assert.throws(() => tokenSpan('"f(x,y)"', "f(x,y)"), /Expected one token location/)
})

test("state slices preserve formatted owner bodies outside the explicit suffix abstraction", () => {
  const directory = mkdtempSync(join(tmpdir(), "hapsland-motion-format-test-"))
  try {
    const original = readFileSync(new URL("./DefenseMotion.bend", import.meta.url), "utf8")
    const ownerSource = original.replaceAll(",", ", ")
    stateSlice(directory, { law: "advance_preserves_identity", ownerSource })
    const sliced = readFileSync(join(directory, "DefenseMotion.bend"), "utf8")
    const start = ownerSource.indexOf("def advance(")
    const end = ownerSource.indexOf("\ndef ", start + 1)
    assert.ok(sliced.includes(ownerSource.slice(start, end < 0 ? undefined : end)))
    stateSlice(directory, { law: "observation_preserves_position", ownerSource,
      mutate: ["V.Actor{k,f,lane,x,y,p,next,", "V.Actor{k,f,lane,0,y,p,next,"] })
    tokenSpan(readFileSync(join(directory, "DefenseMotion.bend"), "utf8"),
      "V.Actor{k,f,lane,0,y,p,next,List.append(&2,V.Waypoint,steps,suffix)")
  } finally { rmSync(directory, { recursive: true, force: true }) }
})

test("inserting a case keeps the adjacent constructor separated after formatting",()=>{
 const source="def value(x: Bool) -> U32:\n  match x:\n    case True{}: 1\n";
 const changed=replaceTokens(source,"case True{}: 1","case False{}: 0\n    case True{}: 1");
 assert.match(changed,/case\s+False\{\}: 0/);
 assert.match(changed,/case\s+True\{\}: 1/);
 assert.doesNotMatch(changed,/caseTrue|caseFalse/);
});
