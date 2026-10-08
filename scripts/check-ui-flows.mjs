import { parse } from "@babel/parser"
import { existsSync, readFileSync, readdirSync } from "node:fs"
import { resolve, relative } from "node:path"
import { fileURLToPath } from "node:url"
import {
  uiFlows,
  uiJourneys,
  inputFragments,
  interactionInfrastructure,
  interactionCompositionRoots,
  directUiExceptions
} from "../packages/administration/src/interaction/flow-registry.ts"

const root = resolve(import.meta.dirname, "..")
const ast = (source) => parse(source, { sourceType: "module", plugins: ["typescript"] })
const walk = (node, visit, parent) => {
  if (!node || typeof node !== "object") return
  if (Array.isArray(node)) {
    for (const child of node) walk(child, visit, parent)
    return
  }
  if (typeof node.type === "string") visit(node, parent)
  for (const key of Object.keys(node))
    if (key !== "loc" && key !== "tokens" && key !== "comments") walk(node[key], visit, node)
}
const sourceFiles = (directory) =>
  existsSync(directory)
    ? readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
        const path = resolve(directory, entry.name)
        return entry.isDirectory()
          ? sourceFiles(path)
          : /\.[cm]?[jt]sx?$/.test(entry.name) && !/\.test\.|\.d\.ts$/.test(entry.name)
            ? [path]
            : []
      })
    : []
const memberName = (node) => (node.computed ? node.property?.value : node.property?.name)
const declarations = (tree) => {
  const names = new Set()
  walk(tree, (node) => {
    if (["VariableDeclarator", "FunctionDeclaration", "ClassDeclaration"].includes(node.type) && node.id?.name)
      names.add(node.id.name)
  })
  return names
}

/** Source-only preflight: no compiled package, dependency build or replay execution. */
export function checkUiFlows(
  candidateRoot = root,
  registry = {
    uiFlows,
    uiJourneys,
    inputFragments,
    interactionInfrastructure,
    interactionCompositionRoots,
    directUiExceptions
  }
) {
  const errors = []
  const owners = new Map()
  const diagrams = new Map()
  const infrastructure = new Set(registry.interactionInfrastructure)
  const compositions = new Set(registry.interactionCompositionRoots)
  const entries = { ...registry.uiFlows, ...registry.inputFragments }
  for (const [id, definition] of Object.entries(entries)) {
    if (owners.has(definition.owner)) errors.push(`UI owners must be unique: ${definition.owner}`)
    owners.set(definition.owner, { id, definition })
    if (definition.diagram) {
      if (definition.diagramOwner && registry.uiFlows[definition.diagramOwner]?.diagram !== definition.diagram)
        errors.push(`Invalid shared UI diagram owner: ${id}`)
      if (diagrams.has(definition.diagram) && diagrams.get(definition.diagram) !== (definition.diagramOwner ?? id))
        errors.push(`Duplicate UI diagram: ${definition.diagram}`)
      diagrams.set(definition.diagram, definition.diagramOwner ?? id)
      if (!existsSync(resolve(candidateRoot, definition.diagram)))
        errors.push(`Missing UI diagram: ${id}: ${definition.diagram}`)
      else if (!readFileSync(resolve(candidateRoot, definition.diagram), "utf8").includes("```mermaid"))
        errors.push(`UI diagram has no Mermaid graph: ${id}`)
    }
    for (const child of definition.composes ?? definition.parents ?? [])
      if (!Object.hasOwn(registry.uiFlows, child)) errors.push(`Unknown UI composition: ${id} -> ${child}`)
  }
  for (const [id, definition] of Object.entries(registry.directUiExceptions)) {
    if (!definition.reason) errors.push(`UI exception requires a reason: ${id}`)
    for (const child of definition.composes)
      if (!Object.hasOwn(registry.uiFlows, child)) errors.push(`Unknown UI exception composition: ${id} -> ${child}`)
  }
  const observedJourneys = new Set()
  const observedCompositions = new Set()
  const trees = new Map()
  const files = readdirSync(resolve(candidateRoot, "packages"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .flatMap((entry) => sourceFiles(resolve(candidateRoot, "packages", entry.name, "src")))
  for (const file of files) {
    const path = relative(candidateRoot, file)
    const tree = ast(readFileSync(file, "utf8"))
    trees.set(path, tree)
    const parents = new WeakMap()
    const owner = owners.get(path)
    let registered = false
    const serviceNames = new Set(["InteractionService"])
    const dispatchNames = new Set(["flowInteraction"])
    const childNames = new Set(["childFlow"])
    const journeyNames = new Set(["cliJourney"])
    const childEntries = new Map(Object.entries(entries).map(([id, definition]) => [definition.entry, id]))
    walk(tree, (node, parent) => {
      if (node.type === "ObjectProperty" && parent) parents.set(node, parent)
      if (node.type === "ImportDeclaration") {
        if (
          /\/flow-input(?:\.ts)?$/.test(node.source.value) &&
          !infrastructure.has(path) &&
          node.specifiers.some((specifier) => specifier.type !== "ImportSpecifier")
        )
          errors.push(`UI dispatch must use named imports: ${path}`)
        for (const specifier of node.specifiers) {
          if (specifier.imported?.name === "InteractionService") serviceNames.add(specifier.local.name)
          if (specifier.imported?.name === "flowInteraction") dispatchNames.add(specifier.local.name)
          if (specifier.imported?.name === "childFlow") childNames.add(specifier.local.name)
          if (specifier.imported?.name === "cliJourney") journeyNames.add(specifier.local.name)
          if (childEntries.has(specifier.imported?.name))
            childEntries.set(specifier.local.name, childEntries.get(specifier.imported.name))
          if (
            /\/interaction(?:\.ts)?$/.test(node.source.value) &&
            !infrastructure.has(path) &&
            node.importKind !== "type" &&
            specifier.importKind !== "type"
          ) {
            const imported = specifier.imported?.name
            if (imported !== "InputInterrupted" && imported !== "InteractionService")
              errors.push(`Unregistered terminal capability: ${path}: ${imported ?? "namespace"}`)
            if (imported === "InteractionService" && !owner && !compositions.has(path))
              errors.push(`UI owner bypasses registered dispatch: ${path}`)
          }
          if (childEntries.has(specifier.imported?.name) && owner) {
            const child = childEntries.get(specifier.imported.name)
            if (registry.inputFragments[child] && !registry.inputFragments[child].parents.includes(owner.id))
              errors.push(`Undeclared UI fragment: ${owner.id} -> ${child}`)
            else if (registry.uiFlows[child] && child !== owner.id && !owner.definition.composes?.includes(child))
              errors.push(`Undeclared UI composition: ${owner.id} -> ${child}`)
          }
        }
        if (
          /^(?:node:)?readline(?:\/promises)?$|^effect\/cli\/Prompt$/.test(node.source.value) &&
          !infrastructure.has(path)
        )
          errors.push(`Unregistered terminal adapter: ${path}`)
      }
    })
    walk(tree, (node, parent) => {
      if (node.type === "CallExpression" && journeyNames.has(node.callee?.name)) {
        const id = node.arguments[0]?.type === "StringLiteral" ? node.arguments[0].value : undefined
        const definition = registry.uiJourneys?.[id]
        const callback = node.arguments[1]
        const call = callback?.type === "ArrowFunctionExpression" ? callback.body : undefined
        if (
          !definition ||
          !compositions.has(path) ||
          call?.type !== "CallExpression" ||
          call.callee?.name !== definition.entry
        )
          errors.push(`CLI journey binding does not match its registered entry: ${path}: ${id ?? "nonliteral"}`)
        else observedJourneys.add(id)
      }
      if (
        node.type === "ObjectProperty" &&
        parents.get(node)?.type === "ObjectPattern" &&
        ["choose", "chooseMany", "confirm", "hidden"].includes(node.key?.name ?? node.key?.value) &&
        !infrastructure.has(path)
      ) {
        const method = node.key.name ?? node.key.value
        if (!owner) errors.push(`Unregistered UI input: ${path}: ${method}`)
        else if (!owner.definition.inputs.includes(method)) errors.push(`Undeclared UI input kind: ${path}: ${method}`)
      }
      if (node.type === "CallExpression" && owner && childEntries.has(node.callee?.name)) {
        const child = childEntries.get(node.callee.name)
        if (registry.uiFlows[child] && child !== owner.id && !owner.definition.composes?.includes(child))
          errors.push(`Undeclared UI composition: ${owner.id} -> ${child}`)
      }
      if (node.type === "CallExpression" && childNames.has(node.callee?.name)) {
        const from = node.arguments[0]?.value
        const child = node.arguments[1]?.value
        if ((!owner || owner.id !== from) && !compositions.has(path))
          errors.push(`UI child dispatch must match its owner: ${path}`)
        if (!registry.uiFlows[from]?.composes.includes(child))
          errors.push(`Undeclared UI composition: ${from} -> ${child}`)
        else observedCompositions.add(`${from}:${child}`)
      }
      if (
        !infrastructure.has(path) &&
        ((node.type === "Identifier" &&
          ["runPrompt", "runNavigable", "liveInteraction", "acquireInteraction", "interactionLayer"].includes(
            node.name
          ) &&
          !["ImportSpecifier", "TSTypeReference"].includes(parent?.type)) ||
          (["MemberExpression", "OptionalMemberExpression"].includes(node.type) &&
            ["runPrompt", "runNavigable", "liveInteraction", "acquireInteraction", "interactionLayer"].includes(
              memberName(node)
            )))
      )
        errors.push(`Unregistered terminal capability: ${path}`)
      if (
        node.type === "Identifier" &&
        serviceNames.has(node.name) &&
        !infrastructure.has(path) &&
        !["ImportSpecifier", "TSTypeReference"].includes(parent?.type)
      ) {
        const provision =
          parent?.type === "CallExpression" &&
          memberName(parent.callee ?? {}) === "provideService" &&
          parent.arguments[0] === node
        const assembly = compositions.has(path) && parent?.type === "YieldExpression"
        const binding =
          compositions.has(path) && parent?.type === "ObjectProperty" && parents.get(parent)?.type === "ObjectPattern"
        if (!provision && !assembly && !binding) errors.push(`UI owner bypasses registered dispatch: ${path}`)
      }
      if (
        (node.type === "ImportExpression" ||
          (node.type === "CallExpression" && ["require", "Import"].includes(node.callee?.name ?? node.callee?.type))) &&
        !infrastructure.has(path)
      ) {
        const target = node.source?.value ?? node.arguments?.[0]?.value
        if (typeof target === "string" && /^(?:node:)?readline(?:\/promises)?$|^effect\/cli\/Prompt$/.test(target))
          errors.push(`Unregistered terminal adapter: ${path}`)
        if (typeof target === "string" && /\/flow-input(?:\.ts)?$/.test(target))
          errors.push(`UI dispatch must use named imports: ${path}`)
        if (typeof target === "string" && /\/interaction(?:\.ts)?$/.test(target) && !compositions.has(path))
          errors.push(`Unregistered terminal capability: ${path}`)
      }
      if (
        node.type === "MemberExpression" &&
        node.object?.type === "MemberExpression" &&
        node.object.object?.name === "process" &&
        memberName(node.object) === "stdin" &&
        memberName(node) !== "isTTY" &&
        !infrastructure.has(path)
      )
        errors.push(`Unregistered terminal adapter: ${path}`)
      if (node.type === "CallExpression" && dispatchNames.has(node.callee?.name)) {
        const id = node.arguments[0]?.type === "StringLiteral" ? node.arguments[0].value : undefined
        if (!owner || id !== owner.id)
          errors.push(`UI dispatch must match its registered owner: ${path}: ${id ?? "nonliteral"}`)
        else registered = true
      }
      if (
        node.type === "YieldExpression" &&
        serviceNames.has(node.argument?.name) &&
        !infrastructure.has(path) &&
        !compositions.has(path)
      )
        errors.push(`UI owner bypasses registered dispatch: ${path}`)
      if (["MemberExpression", "OptionalMemberExpression"].includes(node.type)) {
        const method = memberName(node)
        if (
          ["choose", "chooseMany", "confirm", "hidden", "question"].includes(method) &&
          ["CallExpression", "OptionalCallExpression"].includes(parent?.type) &&
          parent.callee === node &&
          !infrastructure.has(path)
        ) {
          if (!owner) errors.push(`Unregistered UI input: ${path}: ${method}`)
          else if (!owner.definition.inputs.includes(method))
            errors.push(`Undeclared UI input kind: ${path}: ${method}`)
        }
      }
    })
    if (owner && !registered) errors.push(`UI owner has no registered dispatch: ${path}`)
  }
  const reachable = new Set()
  const reach = (id) => {
    if (reachable.has(id)) return
    reachable.add(id)
    for (const child of registry.uiFlows[id]?.composes ?? []) reach(child)
  }
  for (const [id, journey] of Object.entries(registry.uiJourneys ?? {})) {
    if (!registry.uiFlows[journey.root] || !registry.uiFlows[journey.diagramFlow])
      errors.push(`Invalid CLI journey: ${id}`)
    if (registry.uiFlows[journey.root]?.diagram !== registry.uiFlows[journey.diagramFlow]?.diagram)
      errors.push(`CLI journey diagram does not match its input flow: ${id}`)
    if (!observedJourneys.has(id)) errors.push(`CLI journey has no production binding: ${id}`)
    const tree = trees.get(journey.owner)
    if (!tree || !declarations(tree).has(journey.entry)) errors.push(`Missing CLI journey entry: ${id}`)
    const functions = new Map()
    if (tree)
      walk(tree, (node) => {
        if ((node.type === "VariableDeclarator" || node.type === "FunctionDeclaration") && node.id?.name)
          functions.set(node.id.name, node)
      })
    const called = new Set()
    const visitCall = (name) => {
      if (called.has(name)) return
      called.add(name)
      const fn = functions.get(name)
      if (fn)
        walk(fn, (node) => {
          if (node.type === "CallExpression" && node.callee?.type === "Identifier") visitCall(node.callee.name)
        })
    }
    visitCall(journey.entry)
    const rootEntry = registry.uiFlows[journey.root]
    if (rootEntry && ![rootEntry.entry, ...(rootEntry.aliases ?? [])].some((entry) => called.has(entry)))
      errors.push(`CLI journey does not reach its registered input flow: ${id} -> ${journey.root}`)
    reach(journey.root)
  }
  for (const id of Object.keys(registry.uiFlows))
    if (!reachable.has(id)) errors.push(`UI flow has no CLI journey: ${id}`)
  for (const [id, definition] of Object.entries(registry.uiFlows))
    for (const child of definition.composes)
      if (!observedCompositions.has(`${id}:${child}`))
        errors.push(`UI composition has no production dispatch: ${id} -> ${child}`)
  for (const [id, definition] of Object.entries({ ...entries, ...registry.directUiExceptions })) {
    const tree = trees.get(definition.owner)
    if (!tree || !declarations(tree).has(definition.entry))
      errors.push(`Missing UI entry: ${id}: ${definition.owner}#${definition.entry}`)
  }
  const generator = ast(readFileSync(resolve(candidateRoot, "scripts/interaction-diagram-generators.ts"), "utf8"))
  let generatorIds = []
  const generatorBindings = new Map()
  walk(generator, (node) => {
    if (node.type === "VariableDeclarator" && node.id?.name === "diagramGenerators") {
      const object = node.init.type === "TSSatisfiesExpression" ? node.init.expression : node.init
      generatorIds = object.properties.map((property) => property.key?.name ?? property.key?.value)
      for (const property of object.properties)
        generatorBindings.set(property.key?.name ?? property.key?.value, property.value?.name)
    }
  })
  for (const id of Object.keys(registry.uiFlows))
    if (!generatorIds.includes(id)) errors.push(`Missing UI replay generator: ${id}`)
  for (const id of generatorIds)
    if (!Object.hasOwn(registry.uiFlows, id)) errors.push(`Unregistered UI replay generator: ${id}`)
  for (const [id, definition] of Object.entries(registry.uiFlows))
    if (definition.diagramOwner && generatorBindings.get(id) !== generatorBindings.get(definition.diagramOwner))
      errors.push(`Shared UI diagram must use its owner replay: ${id}`)
  if (errors.length) throw new Error([...new Set(errors)].join("\n"))
  return {
    journeys: Object.keys(registry.uiJourneys ?? {}).length,
    workflows: Object.keys(registry.uiFlows).length,
    fragments: Object.keys(registry.inputFragments).length,
    exceptions: Object.keys(registry.directUiExceptions).length
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(`UI flow registry: ${JSON.stringify(checkUiFlows())}`)
}
