const dependencyKinds = ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"]
const compare = (left, right) => (left < right ? -1 : left > right ? 1 : 0)
const object = (value) => value !== null && typeof value === "object" && !Array.isArray(value)
const text = (value) => typeof value === "string" && value.trim().length > 0 && !/[\r\n]/u.test(value)

const references = (value, name, field) => {
  if (value === undefined) return []
  if (!Array.isArray(value)) throw new Error(`Invalid architecture ${field}: ${name}`)
  return value.map((reference) => {
    if (
      !object(reference) ||
      Object.keys(reference).some((key) => !["label", "target"].includes(key)) ||
      !text(reference.label)
    )
      throw new Error(`Invalid architecture reference: ${name}: ${field}`)
    if (reference.target !== undefined) {
      const target = reference.target
      const https = typeof target === "string" && target.startsWith("https://") && URL.canParse(target)
      if (
        !text(target) ||
        /[\\<>]/u.test(target) ||
        (!https &&
          (/^(?:\/|[a-z]+:)/iu.test(target) ||
            target
              .split("#")[0]
              .split("/")
              .some((part) => ["", ".", ".."].includes(part))))
      )
        throw new Error(`Architecture reference must be repository-relative or HTTPS: ${name}: ${target}`)
    }
    return { label: reference.label, ...(reference.target === undefined ? {} : { target: reference.target }) }
  })
}

/** Enrich the existing workspace graph without adding facts to its manifests. */
export const architectureModuleModel = (graph, annotations) => {
  if (!object(annotations)) throw new Error("Architecture annotations must be a name-keyed object")
  const names = [...graph.workspaces.keys()].sort(compare)
  for (const name of Object.keys(annotations)) {
    if (!graph.workspaces.has(name)) throw new Error(`Unknown architecture annotation: ${name}`)
  }
  const nodes = names.map((name) => {
    const annotation = Object.hasOwn(annotations, name) ? annotations[name] : undefined
    if (
      !object(annotation) ||
      !text(annotation.summary) ||
      Object.keys(annotation).some((key) => !["summary", "contracts", "verification"].includes(key))
    )
      throw new Error(`Missing or invalid architecture annotation: ${name}`)
    const node = graph.workspaces.get(name)
    return {
      name,
      directory: node.directory,
      role: node.role,
      compiler: node.compiler,
      summary: annotation.summary,
      contracts: references(annotation.contracts, name, "contracts"),
      verification: references(annotation.verification, name, "verification")
    }
  })
  const edges = names.flatMap((from) =>
    dependencyKinds.flatMap((kind) =>
      Object.keys(graph.workspaces.get(from).dependencyVersions[kind] ?? {})
        .filter((to) => graph.workspaces.has(to))
        .sort(compare)
        .map((to) => ({ from, to, kind }))
    )
  )
  return {
    nodes,
    edges,
    counts: {
      production: nodes.filter((node) => node.role === "production").length,
      auxiliary: nodes.filter((node) => node.role !== "production").length
    },
    auxiliarySccs: (graph.auxiliarySccs ?? [])
      .map((members) => [...members].sort(compare))
      .sort((left, right) => compare(left[0], right[0]))
  }
}

const markdown = (value) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replace(/[\\`*_[\]{}|]/gu, (character) => `\\${character}`)
const mermaid = (value) =>
  value
    .replaceAll("&", "#38;")
    .replaceAll('"', "#34;")
    .replaceAll("<", "#60;")
    .replaceAll(">", "#62;")
    .replaceAll("[", "#91;")
    .replaceAll("]", "#93;")
const link = (label, target) =>
  `[${markdown(label)}](${target.startsWith("https://") ? "" : "../"}${target.replaceAll(" ", "%20").replaceAll("(", "%28").replaceAll(")", "%29").replaceAll("|", "%7C")})`
const selectedReferences = (values) =>
  values.length === 0
    ? "—"
    : values
        .map((reference) => (reference.target ? link(reference.label, reference.target) : markdown(reference.label)))
        .join("; ")
const related = (model, name, incoming) =>
  dependencyKinds
    .flatMap((kind) => {
      const names = model.edges
        .filter((edge) => edge.kind === kind && (incoming ? edge.to : edge.from) === name)
        .map((edge) => (incoming ? edge.from : edge.to))
      return names.length === 0 ? [] : [`${kind}: ${names.map((value) => `\`${value}\``).join(", ")}`]
    })
    .join("<br>") || "—"

/** Both views consume the same typed edges, including auxiliary consumers. */
export const renderModuleArchitecture = (model) => {
  const lines = [
    `${model.nodes.length} private workspaces: ${model.counts.production} production and ${model.counts.auxiliary} auxiliary owners.`,
    "",
    "Edges point from consumer to dependency and retain the manifest dependency field. External dependencies are omitted. Selected verification references identify checks to consult; they do not claim coverage or a passing result.",
    ""
  ]
  for (const [heading, predicate] of [
    ["Production owners", (node) => node.role === "production"],
    ["Auxiliary owners", (node) => node.role !== "production"]
  ]) {
    lines.push(
      `### ${heading}`,
      "",
      "| Workspace and concept | Direct consumers | Workspace dependencies | Contracts and selected verification |",
      "| --- | --- | --- | --- |"
    )
    for (const node of model.nodes.filter(predicate)) {
      lines.push(
        `| ${link(node.name, `${node.directory}/package.json`)}: ${markdown(node.summary)} | ${related(model, node.name, true)} | ${related(model, node.name, false)} | ${selectedReferences(node.contracts)}<br>Selected verification: ${selectedReferences(node.verification)} |`
      )
    }
    lines.push("")
  }
  lines.push("### Workspace dependency graph", "", "```mermaid", "flowchart LR")
  const ids = new Map(model.nodes.map((node, index) => [node.name, `module${index}`]))
  for (const [role, label] of [
    ["production", "Production"],
    ["tooling", "Tooling"],
    ["verification", "Verification"]
  ]) {
    const nodes = model.nodes.filter((node) => node.role === role)
    if (nodes.length === 0) continue
    lines.push(`  subgraph ${role}["${label}"]`)
    for (const node of nodes) lines.push(`    ${ids.get(node.name)}["${mermaid(node.name)}"]`)
    lines.push("  end")
  }
  for (const edge of model.edges) lines.push(`  ${ids.get(edge.from)} -->|${edge.kind}| ${ids.get(edge.to)}`)
  lines.push(
    "```",
    "",
    "Strongly connected auxiliary components below use only `dependencies` edges, matching the build graph reader; development, peer and optional edges remain visible above.",
    ""
  )
  if (model.auxiliarySccs.length === 0) lines.push("No auxiliary cycle in that edge scope.")
  else for (const component of model.auxiliarySccs) lines.push(`- ${component.map((name) => `\`${name}\``).join(", ")}`)
  return lines.join("\n")
}

export const moduleArchitectureDocument = (current, model) => {
  const start = "<!-- architecture-modules:start -->"
  const end = "<!-- architecture-modules:end -->"
  const begin = current.indexOf(start)
  const finish = current.indexOf(end)
  if (
    begin < 0 ||
    finish < begin ||
    current.indexOf(start, begin + start.length) !== -1 ||
    current.indexOf(end, finish + end.length) !== -1
  )
    throw new Error("Module architecture requires one ordered pair of markers")
  return `${current.slice(0, begin)}${start}\n\n${renderModuleArchitecture(model)}\n${end}${current.slice(finish + end.length)}`
}
