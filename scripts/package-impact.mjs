import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { relative, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { readPackageGraph } from "./package-graph.mjs"

const git = (root, args) =>
  execFileSync("git", args, { cwd: root, encoding: "utf8", timeout: 30000, maxBuffer: 32 * 1024 * 1024 })
const sorted = (values) => [...values].sort()
const commit = (root, ref) => git(root, ["rev-parse", "--verify", "--end-of-options", `${ref}^{commit}`]).trim()
const graphAt = (root, revision) =>
  readPackageGraph(root, {
    // Historical analysis validates manifests, without requiring historical
    // source exports to exist in the current checkout.
    checkSources: false,
    loadJson: (path) =>
      JSON.parse(
        revision === null
          ? readFileSync(path, "utf8")
          : git(root, ["show", `${revision}:${relative(root, path).split("\\").join("/")}`])
      )
  })

export const parseChangedPaths = (output) => {
  const tokens = output.split("\0")
  if (tokens.at(-1) === "") tokens.pop()
  const changes = []
  for (let index = 0; index < tokens.length;) {
    const status = tokens[index++]
    const oldPath = tokens[index++]
    if (!status || oldPath === undefined) throw new Error("Invalid Git name-status output")
    if (/^[RC]\d+$/.test(status)) {
      const path = tokens[index++]
      if (path === undefined) throw new Error("Missing renamed/copied path")
      changes.push({ status, oldPath, path })
    } else if (/^[ADMTUXB]$/.test(status)) changes.push({ status, path: oldPath })
    else throw new Error(`Unsupported Git change status: ${status}`)
  }
  return changes
}

export const analyzePackageImpact = (root, options = {}) => {
  root = git(root, ["rev-parse", "--show-toplevel"]).trim()
  if (options.worktree && options.head !== undefined) throw new Error("Choose --head or --worktree")
  if (options.worktree && options.mergeBase) throw new Error("--merge-base requires two committed revisions")
  const head = options.worktree ? null : commit(root, options.head ?? "HEAD")
  const requestedBase = commit(root, options.base ?? (options.worktree ? "HEAD" : "HEAD^"))
  const base = options.mergeBase ? git(root, ["merge-base", requestedBase, head]).trim() : requestedBase
  const before = graphAt(root, base)
  const after = graphAt(root, head)
  const changes = parseChangedPaths(
    git(root, ["diff", "--name-status", "-z", "--find-renames", base, ...(head === null ? [] : [head]), "--"])
  )
  if (head === null)
    for (const path of git(root, ["ls-files", "--others", "--exclude-standard", "-z"]).split("\0"))
      if (path) changes.push({ status: "?", path })
  const nodes = new Map()
  const edges = (graph) =>
    new Set(
      [...graph.workspaces].flatMap(([name, node]) =>
        node.dependencies.map((dependency) => JSON.stringify([dependency, name]))
      )
    )
  const oldEdges = edges(before),
    newEdges = edges(after)
  const allEdges = sorted(new Set([...oldEdges, ...newEdges])).map((edge) => JSON.parse(edge))
  for (const graph of [before, after])
    for (const [name, node] of graph.workspaces) {
      const entry = nodes.get(name) ?? { name, directories: [], role: node.role, changedPaths: new Set() }
      entry.role = node.role
      if (!entry.directories.includes(node.directory)) entry.directories.push(node.directory)
      nodes.set(name, entry)
    }
  const unowned = new Set()
  for (const change of changes)
    for (const path of [change.oldPath, change.path].filter(Boolean)) {
      let owned = false
      for (const node of nodes.values())
        if (node.directories.some((directory) => path.startsWith(`${directory}/`))) {
          owned = true
          node.changedPaths.add(path)
        }
      if (!owned) unowned.add(path)
    }
  // Root-manifest-only workspace additions/removals and edge changes also
  // affect their owners, even when no file under that workspace changed.
  const direct = new Set([...nodes.values()].filter((node) => node.changedPaths.size).map((node) => node.name))
  for (const name of nodes.keys()) if (before.workspaces.has(name) !== after.workspaces.has(name)) direct.add(name)
  const edgeChanges = [
    ...sorted(newEdges)
      .filter((edge) => !oldEdges.has(edge))
      .map((edge) => ({ kind: "added", edge: JSON.parse(edge) })),
    ...sorted(oldEdges)
      .filter((edge) => !newEdges.has(edge))
      .map((edge) => ({ kind: "removed", edge: JSON.parse(edge) }))
  ]
  for (const {
    edge: [, consumer]
  } of edgeChanges)
    direct.add(consumer)
  const affected = new Set(direct)
  const witnesses = new Map()
  const consumers = new Map()
  for (const [dependency, consumer] of allEdges) {
    const list = consumers.get(dependency) ?? []
    list.push(consumer)
    consumers.set(dependency, list)
  }
  const queue = sorted(direct)
  for (let index = 0; index < queue.length; index++)
    for (const consumer of consumers.get(queue[index]) ?? [])
      if (!affected.has(consumer)) {
        affected.add(consumer)
        witnesses.set(consumer, queue[index])
        queue.push(consumer)
      }
  const describe = (name) => {
    const node = nodes.get(name)
    return {
      name,
      directories: sorted(node.directories),
      role: node.role,
      state: !after.workspaces.has(name) ? "removed" : !before.workspaces.has(name) ? "added" : "present",
      changedPaths: sorted(node.changedPaths)
    }
  }
  return {
    base,
    head,
    requestedBase,
    mergeBase: !!options.mergeBase,
    worktree: head === null,
    basis:
      "Manifest-owned build dependencies (dependencies field) from both endpoints; potential impact, not import usage or behavior validation.",
    changes,
    unownedPaths: sorted(unowned),
    direct: sorted(direct).map(describe),
    downstream: sorted([...affected].filter((name) => !direct.has(name))).map((name) => ({
      ...describe(name),
      via: witnesses.get(name)
    })),
    unaffected: sorted([...nodes.keys()].filter((name) => !affected.has(name))),
    edges: allEdges.filter(([dependency, consumer]) => affected.has(dependency) && affected.has(consumer)),
    edgeChanges
  }
}

export const renderPackageImpact = (result) => {
  const short = (name) => name.replace(/^@hapsland\//, "")
  const direct = new Set(result.direct.map((node) => node.name))
  const label = (name) => `${direct.has(name) ? "*" : "~"} ${short(name)}`
  const lines = [
    `Package impact: ${result.base} -> ${result.head ?? "WORKTREE (tracked + untracked)"}`,
    `${result.direct.length} changed workspaces; ${result.downstream.length} potential downstream consumers; ${result.edgeChanges.length} changed dependency edges.`,
    "* changed workspace; ~ unchanged downstream consumer; arrows: dependency -> consumer.",
    "Graph uses the union of endpoint dependencies; it does not establish changed behavior.",
    ""
  ]
  for (const node of [...result.direct, ...result.downstream].sort((a, b) => a.name.localeCompare(b.name))) {
    lines.push(`${label(node.name)}${node.state === "present" ? "" : ` (${node.state})`}`)
    const consumers = result.edges.filter(([dependency]) => dependency === node.name).map(([, consumer]) => consumer)
    consumers.forEach((consumer, index) =>
      lines.push(`  ${index === consumers.length - 1 ? "`" : "+"}--> ${label(consumer)}`)
    )
  }
  if (result.edgeChanges.length) {
    lines.push("", "Dependency edge changes:")
    for (const {
      kind,
      edge: [dependency, consumer]
    } of result.edgeChanges)
      lines.push(`  ${kind}: ${short(dependency)} -> ${short(consumer)}`)
  }
  if (result.unownedPaths.length)
    lines.push(
      "",
      "Outside workspace directories (inspect separately):",
      ...result.unownedPaths.map((path) => `  ${JSON.stringify(path)}`)
    )
  return `${lines.join("\n")}\n`
}

const help = `Usage: node scripts/package-impact.mjs [--base REF] [--head REF | --worktree] [--merge-base] [--format ascii|json]
Defaults: --base HEAD^ --head HEAD. --worktree defaults to --base HEAD and includes untracked files.
--merge-base compares HEAD against its common ancestor with BASE, for branch reviews.
Manifest-based potential impact only; root files are reported separately.\n`

export const parseOptions = (args) => {
  const options = { format: "ascii" }
  for (let index = 0; index < args.length; index++) {
    const arg = args[index]
    if (arg === "--help") return { help: true }
    if (arg === "--worktree" || arg === "--merge-base") options[arg === "--worktree" ? "worktree" : "mergeBase"] = true
    else if (["--base", "--head", "--format"].includes(arg)) {
      const value = args[++index]
      if (value === undefined || value.startsWith("--")) throw new Error(`Missing value for ${arg}`)
      options[arg.slice(2)] = value
    } else throw new Error(`Unknown option: ${arg}`)
  }
  if (!["ascii", "json"].includes(options.format)) throw new Error("--format must be ascii or json")
  return options
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const options = parseOptions(process.argv.slice(2))
    if (options.help) process.stdout.write(help)
    else {
      const result = analyzePackageImpact(process.cwd(), options)
      process.stdout.write(
        options.format === "json" ? `${JSON.stringify(result, null, 2)}\n` : renderPackageImpact(result)
      )
    }
  } catch (error) {
    process.stderr.write(`Package impact failed: ${error.message}\n`)
    process.exitCode = 1
  }
}
