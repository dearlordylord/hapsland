// Copies owner declarations needed by the proof. Observation laws additionally
// generalize the appended-path field to every well-typed suffix.
// The selected game code has no dependency on the simulator scheduler.
import assert from "node:assert/strict"
import { readFileSync, writeFileSync } from "node:fs"
import { join, resolve } from "node:path"

const root = import.meta.dirname
const read = name => readFileSync(resolve(root, name), "utf8")
// Match Bend tokens while retaining the original byte ranges. Formatting and
// comments may vary; changed tokens and ambiguous mutation sites still fail.
function tokens(source) {
  return [...source.matchAll(/#[^\n]*|"(?:\\.|[^"\\])*"|[A-Za-z_][\w.]*|[0-9]+n?|->|<>|==|<=|>=|&&|\|\||[^\s]/g)]
    .filter(match => !match[0].startsWith("#"))
}
export function tokenSpan(source, fragment) {
  const actual = tokens(source), wanted = tokens(fragment)
  assert.ok(wanted.length, "Empty token fragment")
  const matches = []
  for (let i = 0; i <= actual.length - wanted.length; i++) {
    if (wanted.every((token, j) => token[0] === actual[i + j][0]))
      matches.push([actual[i].index, actual[i + wanted.length - 1].index + actual[i + wanted.length - 1][0].length])
  }
  assert.equal(matches.length, 1, `Expected one token location: ${fragment}`)
  return matches[0]
}
export function replaceTokens(source, before, after) {
  const [start, end] = tokenSpan(source, before)
  const existing = tokens(source.slice(start, end)), replacement = tokens(after)
  let prefix = 0, suffix = 0
  while (prefix < existing.length && prefix < replacement.length &&
    existing[prefix][0] === replacement[prefix][0]) prefix++
  while (suffix < existing.length - prefix && suffix < replacement.length - prefix &&
    existing[existing.length - suffix - 1][0] === replacement[replacement.length - suffix - 1][0]) suffix++
  if (prefix === existing.length && prefix === replacement.length) return source
  const editStart = prefix < existing.length ? start + existing[prefix].index : end
  const lastChanged = existing[existing.length - suffix - 1]
  const editEnd = existing.length - suffix > prefix ? start + lastChanged.index + lastChanged[0].length : editStart
  const replacementStart = prefix < replacement.length ? replacement[prefix].index : after.length
  const lastReplacement = replacement[replacement.length - suffix - 1]
  const replacementEnd = replacement.length - suffix > prefix ? lastReplacement.index + lastReplacement[0].length : replacementStart
  const inserted = after.slice(replacementStart, replacementEnd)
  const expected = tokens(source.slice(0, start) + after + source.slice(end)).map(token => token[0])
  let result = source.slice(0, editStart) + inserted + source.slice(editEnd)
  if (JSON.stringify(tokens(result).map(token => token[0])) !== JSON.stringify(expected))
    result = source.slice(0, editStart) + " " + inserted + " " + source.slice(editEnd)
  assert.deepEqual(tokens(result).map(token => token[0]), expected,
    "Whitespace-preserving mutation changed token boundaries")
  return result
}
export function stateSlice(directory, { law, mutate, ownerSource = read("DefenseMotion.bend") } = {}) {
  const allLaws = read("MotionStateLAWS.bend")
  const allProofs = read("MotionStatePROOF.bend")
  let laws = law ? allLaws.split(/^law /m)[0] + "law " + allLaws.split(/^law /m).find(part => part.startsWith(`${law}:`)) : allLaws
  let proofs = law ? allProofs.split(/^def Laws\./m)[0] + "def Laws." + allProofs.split(/^def Laws\./m).find(part => part.startsWith(`${law}(`)) : allProofs
  let owner = ownerSource
  if (mutate) {
    const [before, after] = mutate
    owner = replaceTokens(owner, before, after)
  }
  const abstractSuffix = law?.startsWith("observation_") === true
  if (abstractSuffix) {
    // Stronger parametric lemma: any well-typed appended path preserves pose.
    // Abstract ONLY this constructor field's route-building expression. All
    // actor fields and their source expressions remain the exact owner code.
    const [changedStart] = tokenSpan(owner, "def changed(")
    const nextDefinition = owner.indexOf("\ndef ", changedStart + 1)
    const changedEnd = nextDefinition < 0 ? owner.length : nextDefinition
    const changed = owner.slice(changedStart, changedEnd)
    const [appendStart, argumentStart] = tokenSpan(changed, "List.append(&2,V.Waypoint,steps,")
    // Scan the call structurally, then replace only its fourth argument.
    const callTokens = tokens(changed.slice(appendStart))
    let depth = 0, end
    for (const token of callTokens.slice(1)) {
      if (token[0] === "(") depth++
      if (token[0] === ")" && --depth === 0) { end = appendStart + token.index; break }
    }
    assert.ok(end !== undefined, "Unbalanced owner path append")
    const argument = changed.slice(argumentStart, end)
    const leading = argument.match(/^\s*/)[0], trailing = argument.match(/\s*$/)[0]
    const abstracted = changed.slice(0, argumentStart) + leading + "suffix" + trailing + changed.slice(end)
    owner = owner.slice(0, changedStart) + abstracted + owner.slice(changedEnd)
    const [, parameterStart] = tokenSpan(owner, "def changed(")
    owner = owner.slice(0, parameterStart) + "suffix: List<&2,V.Waypoint>, " + owner.slice(parameterStart)
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
  const types = ["ReviewWorkRecord", "ReviewWorkPhase"].map(name => {
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
  return { abstractSuffix, selectedDefinitions: kept.map(([name]) => name), selectedMapDefinitions: keptMap.map(([name]) => name), canonicalTypes: ["ReviewWorkRecord", "ReviewWorkPhase"] }
}
