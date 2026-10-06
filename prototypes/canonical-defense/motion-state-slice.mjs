// Copies owner declarations needed by the proof. Observation laws additionally
// generalize the appended-path field to every well-typed suffix.
// The selected game code has no dependency on the simulator scheduler.
import assert from "node:assert/strict"
import { readFileSync, writeFileSync } from "node:fs"
import { join, resolve } from "node:path"

const root = import.meta.dirname
const read = name => readFileSync(resolve(root, name), "utf8")
export function stateSlice(directory, { law, mutate } = {}) {
  const allLaws = read("MotionStateLAWS.bend")
  const allProofs = read("MotionStatePROOF.bend")
  let laws = law ? allLaws.split(/^law /m)[0] + "law " + allLaws.split(/^law /m).find(part => part.startsWith(`${law}:`)) : allLaws
  let proofs = law ? allProofs.split(/^def Laws\./m)[0] + "def Laws." + allProofs.split(/^def Laws\./m).find(part => part.startsWith(`${law}(`)) : allProofs
  let owner = read("DefenseMotion.bend")
  if (mutate) {
    const [before, after] = mutate
    assert.equal(owner.split(before).length, 2, "Mutation must have one owner location")
    owner = owner.replace(before, after)
  }
  const abstractSuffix = law?.startsWith("observation_") === true
  if (abstractSuffix) {
    // Stronger parametric lemma: any well-typed appended path preserves pose.
    // Abstract ONLY this constructor field's route-building expression. All
    // actor fields and their source expressions remain the exact owner code.
    const start = owner.indexOf("List.append(&2,V.Waypoint,steps,", owner.indexOf("def changed("))
    assert.ok(start >= 0, "Missing owner path append")
    let end = start + "List.append".length
    let depth = 0
    do { if (owner[end] === "(") depth++; if (owner[end] === ")") depth--; end++ } while (depth > 0 && end < owner.length)
    assert.equal(depth, 0, "Unbalanced owner path append")
    owner = owner.slice(0, start) + "List.append(&2,V.Waypoint,steps,suffix)" + owner.slice(end)
    owner = owner.replace("def changed(+actor:", "def changed(suffix: List<&2,V.Waypoint>, +actor:")
    laws = laws.replace(`law ${law}:`, `law ${law}:\n  for suffix: List<&2,V.Waypoint>`).replace("Motion.changed(actor,", "Motion.changed(suffix,actor,")
    proofs = proofs.replace(`def Laws.${law}(actor,`, `def Laws.${law}(suffix,actor,`)
  }
  const parts = owner.split(/(?=^def )/m)
  const definitions = new Map(parts.slice(1).map(text => [text.match(/^def (\w+)/)[1], text]))
  const selected = new Set([...(`${laws}\n${proofs}`).matchAll(/\bMotion\.(\w+)/g)].map(match => match[1]))
  const pending = [...selected]
  while (pending.length) {
    const text = definitions.get(pending.pop())
    assert.ok(text, "Missing actual motion definition")
    for (const name of definitions.keys()) {
      if (!(abstractSuffix && name === "route") && !selected.has(name) && new RegExp(`(?<![\\w.])${name}\\s*\\(`).test(text)) { selected.add(name); pending.push(name) }
    }
  }
  const imports = `import Base\nimport ./DefenseMotionTypes.bend as V\nimport ./DefenseMap.bend as Map\nimport ./DefensePresentation.bend as Display\nimport ./Canonical.bend as C\n`
  const kept = [...definitions].filter(([name]) => selected.has(name))
  writeFileSync(join(directory, "DefenseMotion.bend"), imports + kept.map(([, text]) => text).join("\n"))
  const canonical = read("../../packages/agent-flow-bend/Canonical.bend")
  const declarations = canonical.split(/(?=^(?:type|def|law) )/m)
  const types = ["Work", "WorkKind"].map(name => {
    const found = declarations.filter(part => part.startsWith(`type ${name} is Data:`))
    assert.equal(found.length, 1, `Missing exact Canonical type ${name}`)
    return found[0]
  })
  writeFileSync(join(directory, "Canonical.bend"), "import Base\n" + types.join("\n"))
  const map = read("DefenseMap.bend")
  assert.ok(!/\bM\./.test(map), "Geometry gained a model dependency; slice review required")
  const mapParts = map.split(/(?=^def )/m)
  const mapDefs = new Map(mapParts.slice(1).map(text => [text.match(/^def (\w+)/)[1], text]))
  const mapSelected = new Set([...(`${kept.map(([, text]) => text).join("\n")}\n${laws}\n${proofs}`).matchAll(/\bMap\.(\w+)/g)].map(match => match[1]).filter(name => mapDefs.has(name)))
  const mapPending = [...mapSelected]
  while (mapPending.length) {
    const text = mapDefs.get(mapPending.pop())
    for (const name of mapDefs.keys()) {
      if (!mapSelected.has(name) && new RegExp(`(?<![\\w.])${name}\\s*\\(`).test(text)) { mapSelected.add(name); mapPending.push(name) }
    }
  }
  const mapHeader = mapParts[0].replace(/^import .* as M\n/m, "")
  const keptMap = [...mapDefs].filter(([name]) => mapSelected.has(name))
  writeFileSync(join(directory, "DefenseMap.bend"), mapHeader + keptMap.map(([, text]) => text).join("\n"))
  for (const file of ["DefenseMotionTypes.bend", "DefensePresentation.bend"]) writeFileSync(join(directory, file), read(file))
  const redirect = source => source.replace(/^import .*Canonical\.bend as C$/m, "import ./Canonical.bend as C")
  writeFileSync(join(directory, "MotionStateLAWS.bend"), redirect(laws))
  writeFileSync(join(directory, "MotionStatePROOF.bend"), proofs)
  return { abstractSuffix, selectedDefinitions: kept.map(([name]) => name), selectedMapDefinitions: keptMap.map(([name]) => name), canonicalTypes: ["Work", "WorkKind"] }
}
