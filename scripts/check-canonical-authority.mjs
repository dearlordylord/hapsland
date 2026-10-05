import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

const root = resolve(import.meta.dirname, "..")
const read = (path) => readFileSync(resolve(root, path), "utf8")
const adapter = read("src/canonical/canonical-boundary.ts")
const models = read("src/canonical/models.ts")
const schemas = read("src/canonical/constructors.ts")
const scalarSchemas = read("src/canonical/boundary-schema.ts")
const bend = read("packages/agent-flow-bend/Canonical.bend")
const generated = read("src/canonical/canonical.generated.js")
const declaration = read("src/canonical/canonical.generated.d.ts")
const between = (source, start, end) => {
  const first = source.indexOf(start)
  const last = source.indexOf(end, first + start.length)
  assert.ok(first >= 0 && last > first, `missing boundary ${start} → ${end}`)
  return source.slice(first + start.length, last)
}
const matches = (source, expression) => new Set([...source.matchAll(expression)].map((match) => match[1]))
const sameSet = (actual, expected, label) => {
  const missing = [...expected].filter((item) => !actual.has(item))
  const extra = [...actual].filter((item) => !expected.has(item))
  assert.deepEqual({ missing, extra }, { missing: [], extra: [] }, label)
}
const bendConstructors = (name) =>
  matches(between(bend, `type ${name} is Data:`, "\ntype "), /^  ([A-Z][A-Za-z0-9_]*)\{/gm)

// Inspect each schema discriminant independently of the encoder and Bend declarations.
const schemaKinds = (source) => {
  const result = new Set()
  for (const match of source.matchAll(/\bkind:\s*/g)) {
    let depth = 0
    let end = match.index + match[0].length
    for (; end < source.length; end++) {
      const char = source[end]
      if (char === "(" || char === "[") depth++
      if (char === ")" || char === "]") depth--
      if ((char === "," || char === "}") && depth === 0) break
    }
    for (const literal of source.slice(match.index, end).matchAll(/"([A-Za-z][A-Za-z0-9]*)"/g)) result.add(literal[1])
  }
  return result
}
const declaredEventKinds = schemaKinds(
  between(models, "export const CanonicalEventSchema =", "export type CanonicalEvent =")
)
const encoder = between(adapter, "const eventEncoders:", "const encodeVariant =")
const encodedEventKinds = matches(encoder, /^\s*"?([A-Za-z][A-Za-z0-9]*)"?:/gm)
sameSet(encodedEventKinds, declaredEventKinds, "CanonicalEvent kind and encoder coverage")
assert.match(adapter, /encodeVariant\(decodeEvent\(input\)\)/)

const bendCommands = bendConstructors("Command")
const decodedCommands = matches(
  between(adapter, "const commandDecoders:", "const decodeCommand ="),
  /"Canonical\.([A-Z][A-Za-z0-9_]*)":/g
)
sameSet(decodedCommands, bendCommands, "Bend Command and runtime decoder coverage")
const declaredCommandKinds = schemaKinds(
  between(models, "export const CanonicalCommandSchema =", "export type CanonicalCommand =")
)
const bendCommandKinds = new Set([...bendCommands].map((name) => name[0].toLowerCase() + name.slice(1)))
sameSet(declaredCommandKinds, bendCommandKinds, "CanonicalCommand type and Bend Command coverage")
assert.match(adapter, /Object\.hasOwn\(commandDecoders, name\)/)
assert.match(adapter, /throw new TypeError\("unknown canonical command"\)/)
for (const command of bendCommands) {
  assert.ok(generated.includes(`"Canonical.${command}"`), `compiled Bend lacks Command ${command}`)
}

const consumedTags = matches(
  adapter,
  /"((?:Canonical|Ledger|Admission|Work|Dispatch|Collection|Delivery|Revision|CollectorAuthority|Reuse|Cache|Notice|Retention|Configuration|RulePolicy)\.[A-Z][A-Za-z0-9_]*)"/g
)
// Bend's JS compiler omits literal tags for constructors used only as input
// and for the last arm of a closed Data match. Pin those exact exceptions so a
// changed compiler layout or new consumed constructor forces a review.
const compilerElidedTags = new Set([
  "RulePolicy.Words",
  "Retention.CleanupFacts",
  "Canonical.ForgetAdmission",
  "CollectorAuthority.Backend",
  "CollectorAuthority.Capacity",
  "CollectorAuthority.Stale",
  "CollectorAuthority.Lost",
  "Delivery.SubmissionFacts"
])
const missingTags = new Set([...consumedTags].filter((name) => !generated.includes(`"${name}"`)))
sameSet(missingTags, compilerElidedTags, "compiled Bend tag exceptions")
// Constructor field contracts come from Bend source, independently of TypeScript schemas.
// This catches malformed shape inventories even when both mapping and schema names compile.
let auditedConstructors = 0
for (const match of schemas.matchAll(
  /"([A-Za-z]+\.[A-Za-z]+)":\s*Schema\.suspend\(\s*\(\)\s*=>\s*Schema\.Struct\(\s*\{([^}]*)\}\s*\)\s*\)/g
)) {
  auditedConstructors++
  const [module, name] = match[1].split(".")
  const source = read(`packages/agent-flow-bend/${module}.bend`)
  const constructor = new RegExp(`^  ${name}\\{([^}]*)\\}`, "m").exec(source)
  assert.ok(constructor, `Bend lacks constructor schema ${match[1]}`)
  const expectedFields = matches(constructor[1], /([a-z_]+):/g)
  const decodedFields = matches(match[2], /\b([a-z_]+):/g)
  sameSet(decodedFields, expectedFields, `${match[1]} exact constructor fields`)
  for (const field of constructor[1].matchAll(/([a-z_]+):\s*(Nat|Bool)(?:[,\s]|$)/g)) {
    const expected = field[2] === "Nat" ? "Nat" : "Schema.Boolean"
    assert.match(match[2], new RegExp(`\\b${field[1]}:\\s*${expected}\\b`), `${match[1]}.${field[1]} primitive schema`)
  }
}
assert.ok(auditedConstructors >= 300, "constructor schema audit unexpectedly lost coverage")
const declaredExports = matches(declaration, /^export declare const (bendCanonical[A-Za-z0-9]+):/gm)
const compiledExports = matches(generated, /^export const (bendCanonical[A-Za-z0-9]+) =/gm)
sameSet(declaredExports, compiledExports, "generated declarations and compiled exports")
assert.deepEqual(
  [...declaredExports].sort(),
  [
    "bendCanonicalInitial",
    "bendCanonicalInventory",
    "bendCanonicalPartitionUsage",
    "bendCanonicalStep",
    "bendCanonicalTotal"
  ].sort()
)
assert.match(scalarSchemas, /maximum: 2 \*\* 48 - 1/)
assert.match(adapter, /^export const CANONICAL_MAX_BYTES = 2 \*\* 47 - 1;?$/m)
assert.match(adapter, /^export const CANONICAL_MAX_UNITS = 1024;?$/m)
assert.match(adapter, /default:\s*throw new TypeError\("unknown canonical step"\)/)
console.log(
  `checked ${declaredEventKinds.size} event kinds, ${bendCommands.size} command variants, ${consumedTags.size} consumed tags, ${auditedConstructors} exact constructor schemas, and ${declaredExports.size} compiled exports`
)
