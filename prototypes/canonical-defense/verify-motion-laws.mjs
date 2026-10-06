// Optional source-bound motion proof gate. Every subprocess has a five-second
// limit; failure, timeout and a missing terminal exit never count as a proof.
import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { homedir, tmpdir } from "node:os"
import { join } from "node:path"
import { stateSlice } from "./motion-state-slice.mjs"
import { combinedArithmeticProof, arithmeticProofs, readArithmeticSources } from "./motion-arithmetic.mjs"

const root = import.meta.dirname
const receipt = { bend: [], arithmetic: [], mutants: [], sources: {}, trust: {
  bend: "Bend checker and mathematical kernel on selected game definitions; observation proofs generalize only the appended-path field to every typed suffix",
  arithmetic: "source-expression lowering to Lean unsigned BitVec 32; Lean kernel checks ordinary arithmetic proofs; bv_decide is used only to find mutant counterexamples",
  bridge: "The lowering and Bend-U32/Lean-BitVec primitive correspondence are trusted, not proved in Bend. No simulator, frame interpolation or calendar guarantee."
} }
const files = ["DefenseMotion.bend", "DefenseMap.bend", "DefenseMotionTypes.bend", "DefensePresentation.bend", "MotionStateLAWS.bend", "MotionStatePROOF.bend", "MotionArithmeticLAWS.bend", "motion-arithmetic.mjs", "verify-motion-laws.mjs", "motion-state-slice.mjs", "MotionArithmeticFacts.lean", "MotionArithmeticPROOF.lean", "../../packages/agent-flow-bend/Canonical.bend"]
for (const file of files) receipt.sources[file] = createHash("sha256").update(readFileSync(join(root, file))).digest("hex")
const baseDirectory = process.env.BEND_DIR ?? join(homedir(), ".bend/bend2")
const kernelSource = join(baseDirectory, "bendtt.lean")
const kernelHash = createHash("sha256").update(readFileSync(kernelSource)).digest("hex")
const kernel = join(homedir(), ".bend/bendtt", kernelHash.slice(0, 16), "bendtt")
receipt.kernel = { sourceSha256: kernelHash, binarySha256: createHash("sha256").update(readFileSync(kernel)).digest("hex") }
receipt.baseSha256 = createHash("sha256").update(readFileSync(join(baseDirectory, "base.bend"))).digest("hex")
const start = Date.now()
function run(tool, args, expected = 0, options = {}) {
  const result = spawnSync(tool, args, { encoding: "utf8", timeout: 5000, maxBuffer: 4 * 1024 * 1024, ...options })
  assert.ifError(result.error)
  assert.equal(result.status, expected, result.stdout + result.stderr)
  return result.stdout + result.stderr
}
function replace(source, before, after) {
  assert.equal(source.split(before).length, 2, `Mutation must have one target: ${before}`)
  return source.replace(before, after)
}
const temp = mkdtempSync(join(tmpdir(), "hapsland-motion-laws-"))
try {
  receipt.bend = [...readFileSync(join(root, "MotionStateLAWS.bend"), "utf8").matchAll(/^law (\w+):/gm)].map(m => m[1])
  assert.deepEqual(receipt.bend, ["observation_preserves_position", "observation_preserves_identity", "blocked_actor_unchanged", "advance_preserves_identity", "advance_preserves_outcome"], "State law inventory changed; owner review required")
  receipt.stateSlices = []
  function stateProof(law) {
    const selected = stateSlice(temp, { law })
    const artifact = join(temp, "proof.bendtt")
    const emission = run("bend", [join(temp, "MotionStatePROOF.bend"), "-o", artifact])
    assert.equal(emission.trim(), "", `Out-of-scope kernel elaboration: ${emission}`)
    assert.equal(run(kernel, [artifact]).trim(), "ALL PROOFS CHECK")
    return { law, ...selected, bendttSha256: createHash("sha256").update(readFileSync(artifact)).digest("hex") }
  }
  for (const law of receipt.bend) {
    receipt.stateSlices.push(stateProof(law))
    console.log(`PASS Bend kernel ${law}`)
  }
  const sources = readArithmeticSources()
  assert.equal(readFileSync(join(root, "MotionArithmeticPROOF.lean"), "utf8"), combinedArithmeticProof(sources), "Regenerate the arithmetic proof review artifact")
  const leanOptions = { cwd: temp, env: { ...process.env, LEAN_PATH: temp } }
  const definitions = arithmeticProofs(sources)[0].source.split("\ntheorem ")[0]
  writeFileSync(join(temp, "MotionDefinitions.lean"), definitions)
  run("lean", ["-j1", "-o", "MotionDefinitions.olean", "MotionDefinitions.lean"], 0, leanOptions)
  receipt.arithmeticHelpers = []
  const facts = readFileSync(join(root, "MotionArithmeticFacts.lean"), "utf8").replace(/\nend MotionFacts\s*$/, "").split(/^theorem /m).slice(1)
  const expectedHelpers = ["coordinate_up", "coordinate_down", "coordinate_toNat", "distance_toNat", "coordinate_between", "coordinate_step", "coordinate_remaining", "coordinate_close"]
  const modules = ["MotionDefinitions"]
  for (const [index, fact] of facts.entries()) {
    const name = fact.match(/^\w+/)[0]
    assert.equal(name, expectedHelpers[index], "Arithmetic helper inventory changed")
    const code = modules.map(name => `import ${name}`).join("\n") + "\nnamespace MotionFacts\ntheorem " + fact + "\nend MotionFacts\n"
    writeFileSync(join(temp, `${name}.lean`), code)
    run("lean", ["-j1", "-o", `${name}.olean`, `${name}.lean`], 0, leanOptions)
    receipt.arithmeticHelpers.push({ name, sourceSha256: createHash("sha256").update(code).digest("hex") })
    modules.push(name)
  }
  assert.equal(facts.length, expectedHelpers.length)
  function arithmetic(input, name, expected = 0) {
    const proof = arithmeticProofs(input, { style: expected ? "bitvector" : "facts" }).find(item => item.name === name)
    assert.ok(proof)
    const file = join(temp, `${name}.lean`)
    writeFileSync(file, proof.source)
    const output = run("lean", ["-j1", file], expected, leanOptions)
    if (expected) assert.match(output, /counterexample|not prove|failed|error:/)
    else {
      const axioms = /depends on axioms:\s*\[([^\]]*)\]/.exec(output)?.[1]
      assert.ok(axioms !== undefined, "Missing arithmetic theorem axiom report")
      assert.ok(axioms.split(",").every(axiom => ["", "propext", "Classical.choice", "Quot.sound"].includes(axiom.trim())), `Unapproved theorem axiom: ${axioms}`)
    }
    return createHash("sha256").update(proof.source).digest("hex")
  }
  for (const proof of arithmeticProofs(sources)) {
    receipt.arithmetic.push({ law: proof.name, leanSourceSha256: arithmetic(sources, proof.name) })
    console.log(`PASS arithmetic ${proof.name}`)
  }
  const arithmeticMutants = [
    ["coordinate_no_overshoot", "map", "(a + U32.min(pixels,(b - a : U32)) : U32)", "(a + pixels : U32)"],
    ["coordinate_distance_nonincreasing", "map", "(a + U32.min(pixels,(b - a : U32)) : U32)", "(a - U32.min(pixels,(b - a : U32)) : U32)"],
    ["coordinate_step_bounded", "map", "(a + U32.min(pixels,(b - a : U32)) : U32)", "(a + (pixels + 1 : U32) : U32)"],
    ["zero_allowance_stationary", "map", "(a + U32.min(pixels,(b - a : U32)) : U32)", "(a + 1 : U32)"],
    ["arrived_coordinate_stationary", "map", "(a + U32.min(pixels,(b - a : U32)) : U32)", "(a + 1 : U32)"],
    ["travel_one_axis", "motion", "Map.Point{Map.px(start),Map.travel_coordinate(Map.py(start),Map.py(target),4)}", "Map.Point{(Map.px(start) + 1 : U32),Map.travel_coordinate(Map.py(start),Map.py(target),4)}"],
    ["travel_step_bounded", "motion", "Map.travel_coordinate(Map.px(start),Map.px(target),4)", "Map.travel_coordinate(Map.px(start),Map.px(target),5)"],
    ["travel_distance_nonincreasing", "motion", "Map.travel_coordinate(Map.px(start),Map.px(target),4)", "Map.travel_coordinate(Map.px(start),0,4)"],
    ["travel_reaches_close_horizontal_target", "motion", "Map.travel_coordinate(Map.px(start),Map.px(target),4)", "Map.travel_coordinate(Map.px(start),Map.px(target),0)"]
  ]
  for (const [law, file, before, after] of arithmeticMutants) {
    arithmetic({ ...sources, [file]: replace(sources[file], before, after) }, law, 1)
    receipt.mutants.push({ law, boundary: "arithmetic", result: "rejected" })
    console.log(`PASS mutant ${law}`)
  }
  // Mirror imports using absolute references. Only the chosen actual definition
  // is changed; imported owner modules stay the same. Check one law at a time.
  const bendMutants = [
    ["observation_preserves_position", "V.Actor{k,f,lane,x,y,p,next,", "V.Actor{k,f,lane,0,0,p,next,"],
    ["observation_preserves_identity", "V.Actor{k,f,lane,x,y,p,next,", "V.Actor{V.WorkIdentity{0n,0n,0n,0n},f,lane,x,y,p,next,"],
    ["blocked_actor_unchanged", "case False{}: actor\ndef alive_keep", "case False{}: with_outcome(actor,2)\ndef alive_keep"],
    ["advance_preserves_identity", "V.Actor{k,f,l,x,y,p,seen,[],Bool.pick", "V.Actor{V.WorkIdentity{0n,0n,0n,0n},f,l,x,y,p,seen,[],Bool.pick"],
    ["advance_preserves_outcome", "parent,shown,cause,released}\n    case value Con{next,rest}", "parent,shown,2,released}\n    case value Con{next,rest}"]
  ]
  for (const [law, before, after] of bendMutants) {
    stateProof(law)
    stateSlice(temp, { law, mutate: [before, after] })
    const rejected = run("bend", [join(temp, "MotionStatePROOF.bend")], 1)
    assert.match(rejected, /SOME PROOFS FAIL/)
    assert.ok(rejected.includes(law), `Mutation failed outside law ${law}: ${rejected}`)
    receipt.mutants.push({ law, boundary: "Bend", result: "rejected" })
    console.log(`PASS mutant ${law}`)
  }
  // Full-owner runtime probes are a separate optional command; this gate
  // checks universal laws and mutants without importing the complete simulator.
  for (const file of files) assert.equal(createHash("sha256").update(readFileSync(join(root, file))).digest("hex"), receipt.sources[file], `Source changed during gate: ${file}`)
  receipt.elapsedMs = Date.now() - start
  console.log(JSON.stringify(receipt))
} finally {
  rmSync(temp, { recursive: true, force: true })
}
