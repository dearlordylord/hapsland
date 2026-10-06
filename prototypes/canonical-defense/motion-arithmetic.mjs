// Deliberately small, fail-closed Bend-expression lowering for the U32 laws.
// Trusted boundary: Bend U32 arithmetic/comparisons -> unsigned BitVec 32.
import { readFileSync } from "node:fs"

const numeric = ["coordinate_no_overshoot", "coordinate_distance_nonincreasing", "coordinate_step_bounded", "zero_allowance_stationary", "arrived_coordinate_stationary", "travel_one_axis", "travel_step_bounded", "travel_distance_nonincreasing", "travel_reaches_close_horizontal_target"]
const names = ["Map.px", "Map.py", "Map.distance_order", "Map.distance", "Map.travel_coordinate_order", "Map.travel_coordinate", "Motion.travel"]
const type = value => ({ U32: "U32", Bool: "Bool", "Map.Point": "Point", Point: "Point" }[value] ?? (() => { throw new Error(`Unsupported type ${value}`) })())

function expression(source) {
  const tokens = source.match(/(?:[A-Za-z_][\w.]*)|(?:\d+)|(?:<=|==|&&|\|\||[{}(),:+-])/g) ?? []
  if (tokens.join("") !== source.replace(/\s/g, "")) throw new Error(`Unsupported syntax: ${source}`)
  let at = 0
  const take = expected => { const value = tokens[at++]; if (expected && value !== expected) throw new Error(`Expected ${expected}, got ${value}`); return value }
  const precedence = { "||": 1, "&&": 2, "<=": 3, "==": 3, "+": 4, "-": 4 }
  const binary = (op, a, b) => ({ "+": `(${a} + ${b})`, "-": `(${a} - ${b})`, "<=": `(BitVec.ule ${a} ${b})`, "==": `(${a} == ${b})`, "&&": `(${a} && ${b})`, "||": `(${a} || ${b})` }[op])
  function atom() {
    const word = take()
    if (word === "(") {
      const result = parse(0)
      if (tokens[at] === ":") { take(":"); type(take()) }
      take(")")
      return result
    }
    if (/^\d+$/.test(word)) return `(${word} : U32)`
    if (tokens[at] === "{") {
      take("{")
      if (word === "True" || word === "False") { take("}"); return word.toLowerCase() }
      if (word !== "Map.Point") throw new Error(`Unsupported constructor ${word}`)
      const x = parse(0); take(","); const y = parse(0); take("}")
      return `(Point.mk ${x} ${y})`
    }
    if (tokens[at] === "(") {
      take("(")
      const args = []
      if (tokens[at] !== ")") { args.push(parse(0)); while (tokens[at] === ",") { take(","); args.push(parse(0)) } }
      take(")")
      if (word === "Bool.pick") {
        if (args.length !== 4) throw new Error("Invalid Bool.pick")
        type(args[0]); return `(if ${args[1]} then ${args[2]} else ${args[3]})`
      }
      const functions = { "U32.min": "min32", "U32.max": "max32", "U32.is_eq": "eq32", "Map.px": "Point.x", "Map.py": "Point.y" }
      if (!(word in functions) && !names.includes(word)) throw new Error(`Unsupported function ${word}`)
      return `(${functions[word] ?? word} ${args.join(" ")})`
    }
    if (["U32", "Map.Point", "Point"].includes(word)) return word
    if (!/^[A-Za-z_][\w]*$/.test(word)) throw new Error(`Unsupported variable ${word}`)
    return word
  }
  function parse(min) {
    let left = atom()
    while (precedence[tokens[at]] >= min) {
      const op = take(); left = binary(op, left, parse(precedence[op] + 1))
    }
    return left
  }
  const result = parse(0)
  if (at !== tokens.length) throw new Error(`Unconsumed expression: ${tokens.slice(at)}`)
  return result
}

function definition(source, qualified) {
  const name = qualified.split(".")[1]
  const declarations = source.split(/(?=^def )/m).filter(part => part.startsWith(`def ${name}(`))
  if (declarations.length !== 1) throw new Error(`Expected unique definition ${qualified}`)
  const lines = declarations[0].split("\n").filter(line => line.trim() && !line.trim().startsWith("#"))
  const header = /^def \w+\((.*)\)\s*->\s*(\w+(?:\.\w+)?)\s*:$/.exec(lines.shift())
  if (!header) throw new Error(`Unsupported header ${qualified}`)
  const params = header[1].split(",").map(part => {
    const match = /^\s*\+?(\w+)\s*:\s*(\w+(?:\.\w+)?)\s*$/.exec(part)
    if (!match) throw new Error(`Unsupported parameter ${part}`)
    return { name: match[1], type: type(match[2]) }
  })
  let body
  const lower = text => expression(qualified.startsWith("Map.") ? text.replace(/(?<![\w.])(px|py|distance_order|distance|travel_coordinate_order|travel_coordinate)(?=\()/g, "Map.$1") : text)
  if (qualified === "Map.px" || qualified === "Map.py") {
    const expected = qualified === "Map.px" ? "x" : "y"
    if (lines.join("\n").replace(/\s/g, "") !== `matchpoint:casePoint{${expected === "x" ? "x,_" : "_,y"}}:${expected}`) throw new Error(`Unsupported projection ${qualified}`)
    return "" // Point fields implement exactly these two projections.
  }
  if (qualified.endsWith("_order")) {
    if (lines.length !== 3 || lines[0].trim() !== "match up:" || !lines[1].trim().startsWith("case True{}:") || !lines[2].trim().startsWith("case False{}:")) throw new Error(`Unsupported branch ${qualified}`)
    body = `(if up then ${lower(lines[1].split(":").slice(1).join(":"))} else ${lower(lines[2].split(":").slice(1).join(":"))})`
  } else body = lower(lines.join("\n"))
  return `def ${qualified} ${params.map(p => `(${p.name} : ${p.type})`).join(" ")} : ${type(header[2])} := ${body}\n`
}

const prelude = `import Std.Tactic.BVDecide
set_option linter.unusedSimpArgs false
abbrev U32 := BitVec 32
structure Point where
  x : U32
  y : U32
  deriving DecidableEq
def min32 (a b : U32) : U32 := if a.ult b then a else b
def max32 (a b : U32) : U32 := if a.ult b then b else a
def eq32 (a b : U32) : Bool := a == b
`

const factProofs = {
  coordinate_no_overshoot: `have bounds := MotionFacts.coordinate_between start target pixels
  simp only [Bool.and_eq_true, BitVec.ule_eq_decide, decide_eq_true_eq]
  unfold min32 max32
  simp only [BitVec.ult_eq_decide, decide_eq_true_eq]
  by_cases h : start.toNat < target.toNat
  · simp only [ite_eq_left h]
    have hle := Nat.le_of_lt h
    simpa only [Nat.min_eq_left hle, Nat.max_eq_right hle] using bounds
  · have hle : target.toNat ≤ start.toNat := by omega
    simp only [ite_eq_right h]
    simpa only [Nat.min_eq_right hle, Nat.max_eq_left hle] using bounds`,
  coordinate_distance_nonincreasing: `simpa only [BitVec.ule_eq_decide, decide_eq_true_eq] using MotionFacts.coordinate_remaining start target pixels`,
  coordinate_step_bounded: `simpa only [BitVec.ule_eq_decide, decide_eq_true_eq] using MotionFacts.coordinate_step start target pixels`,
  zero_allowance_stationary: `apply BitVec.eq_of_toNat_eq
  rw [MotionFacts.coordinate_toNat]
  simp`,
  arrived_coordinate_stationary: `apply BitVec.eq_of_toNat_eq
  rw [MotionFacts.coordinate_toNat]
  simp`,
  travel_one_axis: `rcases start with ⟨sx, sy⟩
  rcases target with ⟨tx, ty⟩
  simp only [Motion.travel, eq32, Point.x, Point.y]
  by_cases h : (sx == tx) = true <;> simp only [h, Bool.false_eq_true, ite_true, ite_false, Point.x, Point.y, beq_self_eq_true, Bool.true_or, Bool.or_true]`,
  travel_step_bounded: `rcases start with ⟨sx, sy⟩
  rcases target with ⟨tx, ty⟩
  simp only [Motion.travel, eq32, Point.x, Point.y]
  by_cases h : (sx == tx) = true <;> simp only [h, Bool.false_eq_true, ite_true, ite_false, Point.x, Point.y, Bool.and_eq_true, BitVec.ule_eq_decide, decide_eq_true_eq]
  · constructor
    · simp [MotionFacts.distance_toNat]
    · simpa using MotionFacts.coordinate_step sy ty (4 : U32)
  · constructor
    · simpa using MotionFacts.coordinate_step sx tx (4 : U32)
    · simp [MotionFacts.distance_toNat]`,
  travel_distance_nonincreasing: `rcases start with ⟨sx, sy⟩
  rcases target with ⟨tx, ty⟩
  simp only [Motion.travel, eq32, Point.x, Point.y]
  by_cases h : (sx == tx) = true <;> simp only [h, Bool.false_eq_true, ite_true, ite_false, Point.x, Point.y, Bool.and_eq_true, BitVec.ule_eq_decide, decide_eq_true_eq]
  · constructor
    · exact Nat.le_refl _
    · exact MotionFacts.coordinate_remaining sy ty (4 : U32)
  · constructor
    · exact MotionFacts.coordinate_remaining sx tx (4 : U32)
    · exact Nat.le_refl _`,
  travel_reaches_close_horizontal_target: `intro h
  have close := MotionFacts.coordinate_close x target (4 : U32) (by simpa only [BitVec.ule_eq_decide, decide_eq_true_eq] using h)
  have stationary : Map.travel_coordinate y y (4 : U32) = y := by
    apply BitVec.eq_of_toNat_eq
    rw [MotionFacts.coordinate_toNat]
    simp
  simp only [Motion.travel, eq32, Point.x, Point.y]
  by_cases hx : (x == target) = true
  · have equal : x = target := eq_of_beq hx
    simp only [hx, Bool.false_eq_true, ite_true, ite_false, Point.mk.injEq]
    exact ⟨equal, stationary⟩
  · simp only [hx, Bool.false_eq_true, ite_true, ite_false]
    rw [close]`
}

export function arithmeticProofs({ map, motion, laws }, { style = "bitvector" } = {}) {
  if (!["bitvector", "facts"].includes(style)) throw new Error("Unsupported proof style")
  const definitions = names.map(name => definition(name.startsWith("Map.") ? map : motion, name)).join("\n")
  const blocks = [...laws.matchAll(/^law (\w+):\n([\s\S]*?)(?=^law |$(?![\s\S]))/gm)]
  if (blocks.length !== numeric.length || blocks.some((block, i) => block[1] !== numeric[i])) throw new Error("Arithmetic law inventory changed; review required")
  return blocks.map(([, name, block]) => {
    const binders = [...block.matchAll(/^  for \+?(\w+): (\w+(?:\.\w+)?)$/gm)].map(([, n, t]) => `(${n} : ${type(t)})`)
    const clauses = []
    let remainder = block.replace(/^#.*$/gm, "").replace(/^  for \+?\w+: \w+(?:\.\w+)?$/gm, "")
    const text = block.replace(/^#.*$/gm, "")
    for (let i = 0; i < text.length; i++) {
      if (text[i] !== "{") continue
      const start = ++i
      let depth = 1
      while (i < text.length && depth) { if (text[i] === "{") depth++; if (text[i] === "}") depth--; i++ }
      if (depth) throw new Error(`Unbalanced law ${name}`)
      const clause = /^([\s\S]*) == ([\s\S]*) : (Bool|U32|Map.Point)$/.exec(text.slice(start, i - 1).trim())
      if (!clause) throw new Error(`Unsupported clause ${name}`)
      remainder = remainder.replace(text.slice(start - 1, i), "")
      clauses.push(clause)
      i--
    }
    if (clauses.length !== (name === "travel_reaches_close_horizontal_target" ? 2 : 1)) throw new Error(`Unsupported law ${name}`)
    if (remainder.trim() !== (clauses.length === 2 ? "->" : "")) throw new Error(`Unconsumed law syntax ${name}`)
    const statement = clauses.map(([, lhs, rhs]) => `(${expression(lhs)} = ${expression(rhs)})`).join(" → ")
    const pointCases = [...block.matchAll(/^  for \+?(\w+): Map.Point$/gm)].map(([, name]) => `cases ${name}\n  `).join("")
    const theorem = `theorem ${name} ${binders.join(" ")} : ${statement} := by\n  ${pointCases}${name === "travel_reaches_close_horizontal_target" ? "intro h\n  " : ""}simp only [${names.filter(n => n !== "Map.px" && n !== "Map.py").join(", ")}, min32, max32, eq32, Point.mk.injEq] at *\n  bv_decide\n`
    const factTheorem = `theorem ${name} ${binders.join(" ")} : ${statement} := by\n  ${factProofs[name]}\n#print axioms ${name}\n`
    return { name, source: style === "facts"
      ? "import coordinate_close\nset_option linter.unusedSimpArgs false\n" + factTheorem
      : prelude + definitions + "\n" + theorem }
  })
}

export function readArithmeticSources(directory = import.meta.dirname) {
  return Object.fromEntries([["map", "DefenseMap.bend"], ["motion", "DefenseMotion.bend"], ["laws", "MotionArithmeticLAWS.bend"]].map(([name, file]) => [name, readFileSync(`${directory}/${file}`, "utf8")]))
}

// Review artifact: the same lowered definitions and exact statements checked
// separately by the finite gate. Supports no handwritten replacement model.
export function combinedArithmeticProof(input = readArithmeticSources()) {
  const definitions = arithmeticProofs(input)[0].source.split("\ntheorem ")[0]
  const facts = readFileSync(`${import.meta.dirname}/MotionArithmeticFacts.lean`, "utf8")
  const theorems = arithmeticProofs(input, { style: "facts" }).map(proof => proof.source.slice(proof.source.indexOf("theorem "))).join("\n")
  return "-- Generated by motion-arithmetic.mjs from the actual owner definitions and accepted laws.\n" + definitions + "\n" + facts + "\n" + theorems
}
