import { readFileSync, writeFileSync } from "node:fs"
import { relative, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import * as Schema from "effect/Schema"
import { CanonicalEventSchema, CanonicalCommandSchema } from "@hapsland/canonical-policy/canonical/models"
import { ImportGraphEventSchema, ImportGraphCommandSchema } from "@hapsland/canonical-policy/canonical/graph-schema"
import { readPackageGraph, resolveWorkspaceTypeSource } from "./package-graph.mjs"

type ObjectValue = Record<string, unknown>
const object = (value: unknown): ObjectValue => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("Expected schema object")
  return value as ObjectValue
}
const markdown = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replace(/[\\`*_[\]{}|]/gu, (character) => `\\${character}`)
export const boundarySchemaRows = (schema: Schema.Constraint) => {
  const document = Schema.toJsonSchemaDocument(schema, { onExcessProperty: "error" })
  const definitions = document.definitions as ObjectValue
  const dereference = (value: unknown, seen = new Set<string>()): ObjectValue => {
    const node = object(value)
    if (typeof node.$ref !== "string") return node
    const name = node.$ref.split("/").at(-1)!.replaceAll("~1", "/").replaceAll("~0", "~")
    if (seen.has(name) || !Object.hasOwn(definitions, name))
      throw new Error(`Unresolved boundary schema reference: ${name}`)
    return dereference(definitions[name], new Set([...seen, name]))
  }
  const root = dereference(document.schema)
  const branches = root.anyOf ?? root.oneOf
  if (!Array.isArray(branches)) throw new Error("Boundary schema must be a tagged union")
  const rows = branches
    .flatMap((value) => {
      const branch = dereference(value)
      const properties = object(branch.properties)
      const discriminator = dereference(properties.kind)
      const kinds = discriminator.const === undefined ? discriminator.enum : [discriminator.const]
      if (!Array.isArray(kinds) || kinds.some((kind) => typeof kind !== "string"))
        throw new Error("Boundary variant lacks kind literals")
      const required = branch.required
      if (!Array.isArray(required) || !required.includes("kind")) throw new Error("Boundary variant must require kind")
      return kinds.map((kind: string) => ({
        kind,
        fields: Object.keys(properties)
          .filter((field) => field !== "kind")
          .sort()
          .map((field) => `${field}${required.includes(field) ? "" : "?"}`)
      }))
    })
    .sort((left, right) => left.kind.localeCompare(right.kind, "en"))
  if (new Set(rows.map((row) => row.kind)).size !== rows.length) throw new Error("Duplicate boundary kind")
  return rows
}
const schemas = [
  { name: "Canonical events", specifier: "@hapsland/canonical-policy/canonical/models", schema: CanonicalEventSchema },
  {
    name: "Canonical commands",
    specifier: "@hapsland/canonical-policy/canonical/models",
    schema: CanonicalCommandSchema
  },
  {
    name: "ImportGraph events",
    specifier: "@hapsland/canonical-policy/canonical/graph-schema",
    schema: ImportGraphEventSchema
  },
  {
    name: "ImportGraph commands",
    specifier: "@hapsland/canonical-policy/canonical/graph-schema",
    schema: ImportGraphCommandSchema
  }
]
export const decisionBoundaryModel = (root: string, descriptions: unknown) => {
  const graph = readPackageGraph(root)
  const source = (specifier: string) => {
    const path = resolveWorkspaceTypeSource(graph, specifier)
    if (path === undefined) throw new Error(`Unknown boundary owner: ${specifier}`)
    return relative(root, path)
  }
  const inventories = schemas.map(({ name, specifier, schema }) => ({
    name,
    source: source(specifier),
    rows: boundarySchemaRows(schema)
  }))
  const events = new Set(inventories[0]!.rows.map((row) => row.kind))
  if (!Array.isArray(descriptions)) throw new Error("Boundary descriptions must be an array")
  const ids = new Set<string>()
  const owners = descriptions.map((raw) => {
    const value = object(raw)
    if (
      Object.keys(value).some((key) => !["id", "owners", "events"].includes(key)) ||
      typeof value.id !== "string" ||
      !/^TS-\d{3}[a-z]?$/u.test(value.id) ||
      ids.has(value.id) ||
      !Array.isArray(value.owners) ||
      value.owners.length === 0 ||
      value.owners.some((owner) => typeof owner !== "string") ||
      new Set(value.owners).size !== value.owners.length
    )
      throw new Error("Invalid boundary description")
    ids.add(value.id)
    const selected = value.events ?? []
    if (
      !Array.isArray(selected) ||
      selected.some((event) => typeof event !== "string" || !events.has(event)) ||
      new Set(selected).size !== selected.length
    )
      throw new Error(`Unknown or duplicate boundary event: ${value.id}`)
    return {
      id: value.id,
      owners: value.owners.map((specifier) => ({ specifier, source: source(specifier) })),
      events: selected as string[]
    }
  })
  const compilers = ["@hapsland/canonical-policy", "@hapsland/agent-flow-bend"].map((name) => {
    const node = graph.workspaces.get(name)!
    return {
      name,
      compiler: node.compiler,
      host: node.manifest.hapsland.host,
      exports: Object.keys(node.manifest.exports).map((key) => ({ key, source: source(`${name}${key.slice(1)}`) }))
    }
  })
  return { inventories, owners, compilers }
}
export const decisionBoundaryDocument = (current: string, model: ReturnType<typeof decisionBoundaryModel>) => {
  const start = "<!-- decision-boundary-facts:start -->"
  const end = "<!-- decision-boundary-facts:end -->"
  const link = (label: string, path: string) => `[${markdown(label)}](../${path})`
  const checkMarkers = () => {
    const begin = current.indexOf(start),
      finish = current.indexOf(end)
    if (
      begin < 0 ||
      finish < begin ||
      current.indexOf(start, begin + start.length) !== -1 ||
      current.indexOf(end, finish + end.length) !== -1
    )
      throw new Error("Decision ledger requires one ordered marker pair")
  }
  checkMarkers()
  for (const owner of model.owners) {
    const heading = `## ${owner.id} —`
    const entryStart = current.indexOf(heading)
    if (entryStart < 0 || current.indexOf(heading, entryStart + heading.length) !== -1)
      throw new Error(`Missing or duplicate reviewed ledger entry: ${owner.id}`)
    const nextHeading = current.indexOf("\n## ", entryStart + heading.length)
    const entryEnd = nextHeading < 0 ? current.indexOf(start, entryStart) : nextHeading
    if (entryEnd < 0) throw new Error(`Missing boundary after reviewed ledger entry: ${owner.id}`)
    const entry = current.slice(entryStart, entryEnd)
    const rows = [...entry.matchAll(/^\| TypeScript owner \|.*$/gm)]
    if (rows.length !== 1) throw new Error(`Expected one TypeScript owner row: ${owner.id}`)
    const row = `| TypeScript owner | ${owner.owners.map((item) => link(item.specifier, item.source)).join("; ")} |`
    current = `${current.slice(0, entryStart)}${entry.replace(rows[0]![0], row)}${current.slice(entryEnd)}`
  }
  const begin = current.indexOf(start),
    finish = current.indexOf(end)
  const lines = [
    start,
    "",
    "## Code-derived boundary inventory",
    "",
    "This inventory resolves declared private exports through the package graph and reads variant kinds and fields from the production Effect schemas. It establishes representation and ownership facts, not why a decision belongs outside Bend, review acceptance, runtime execution, or passing tests. A `?` marks an optional field. Regenerate with `npm run docs:generate`.",
    "",
    "### Reviewed event selections",
    "",
    "Event selections are descriptive annotations checked against the schema. TypeScript owner rows in the entries above are regenerated from selected private exports; reviewed decisions and reasons remain authored prose.",
    "",
    "| Entry | Selected Canonical events |",
    "| --- | --- |"
  ]
  for (const owner of model.owners.filter((entry) => entry.events.length > 0))
    lines.push(`| ${markdown(owner.id)} | ${owner.events.map(markdown).join(", ")} |`)
  lines.push(
    "",
    "### Compiler and private export ownership",
    "",
    "Compiler and host names below are manifest declarations, not measured execution evidence.",
    "",
    "| Workspace | Compiler / host | Authored export sources |",
    "| --- | --- | --- |"
  )
  for (const compiler of model.compilers)
    lines.push(
      `| ${markdown(compiler.name)} | ${markdown(compiler.compiler)} / ${markdown(compiler.host)} | ${compiler.exports.map((item) => link(item.key, item.source)).join("; ")} |`
    )
  for (const inventory of model.inventories) {
    lines.push(
      "",
      `### ${inventory.name}`,
      "",
      `Schema owner: ${link(inventory.source, inventory.source)}.`,
      "",
      "| Kind | Fields after kind |",
      "| --- | --- |"
    )
    for (const row of inventory.rows)
      lines.push(`| ${markdown(row.kind)} | ${row.fields.map(markdown).join(", ") || "—"} |`)
  }
  lines.push("", end)
  return `${current.slice(0, begin)}${lines.join("\n")}${current.slice(finish + end.length)}`
}
export const generateDecisionBoundaryLedger = (root: string, check = false) => {
  const path = resolve(root, "docs/typescript-decision-boundary-ledger.md")
  const current = readFileSync(path, "utf8")
  const descriptions = JSON.parse(readFileSync(resolve(root, "scripts/decision-boundary-descriptions.json"), "utf8"))
  const next = decisionBoundaryDocument(current, decisionBoundaryModel(root, descriptions))
  if (check && current !== next) throw new Error("Decision boundary ledger is stale; run npm run docs:generate")
  if (!check && current !== next) writeFileSync(path, next)
  return next
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 3 || !["--update", "--check"].includes(process.argv[2]!))
    throw new Error("Choose --update or --check")
  generateDecisionBoundaryLedger(resolve(import.meta.dirname, ".."), process.argv[2] === "--check")
}
