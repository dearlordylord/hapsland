// Own the Hapsland tagged-record ABI independently of Bend's JavaScript names.
import { parse } from "@babel/parser"
import { readFileSync, realpathSync } from "node:fs"
import { basename, dirname, resolve } from "node:path"

const builtins = new Set(["Con", "Nil", "Some", "None", "Unit", "True", "False", "WCon", "WNil", "$JMP"])
function fieldNames(body) {
  const result = []
  let depth = 0,
    start = 0
  const field = (text) => {
    const match = /^\s*[+~-]?([A-Za-z_]\w*)\s*:/.exec(text)
    if (match) result.push(match[1])
  }
  for (let i = 0; i < body.length; i++) {
    if ("(<[".includes(body[i])) depth++
    else if (")>]".includes(body[i]) && body[i - 1] !== "-") depth--
    else if (body[i] === "," && depth === 0) {
      field(body.slice(start, i))
      start = i + 1
    }
  }
  field(body.slice(start))
  return result.sort()
}
function sourceBook(entry) {
  const modules = new Map(),
    constructors = new Map()
  function visit(file) {
    file = realpathSync(file)
    if (modules.has(file)) return modules.get(file)
    const text = readFileSync(file, "utf8").replace(
        /"(?:\\[\s\S]|[^"\\])*"|'(?:\\[\s\S]|[^'\\])*'|#[^\r\n]*/g,
        (token) => token.replace(/[^\r\n]/g, " ")
      ),
      module = { file, imports: new Map(), constructors: new Map(), definitions: new Map() }
    modules.set(file, module)
    for (const match of text.matchAll(/^import (\S+) as (\w+)\s*$/gm))
      module.imports.set(match[2], visit(resolve(dirname(file), match[1])))
    for (const type of text.matchAll(/^type [\s\S]*?(?=^(?:type |def |law |import |@)|$(?![\s\S]))/gm)) {
      const cases = [...type[0].matchAll(/\b([A-Z]\w*)\{([^{}]*)\}/g)]
      for (const match of cases) {
        const item = {
          variants: cases.length,
          name: match[1],
          fields: fieldNames(match[2]),
          module,
          tag: file === realpathSync(entry) ? match[1] : basename(file, ".bend") + "." + match[1]
        }
        module.constructors.set(item.name, item)
        if (!constructors.has(item.name)) constructors.set(item.name, [])
        constructors.get(item.name).push(item)
      }
    }
    for (const match of text.matchAll(/^def ([\w.]+)[\s\S]*?(?=^(?:type |def |law |import |@)|$(?![\s\S]))/gm))
      module.definitions.set(match[1], match[0])
    return module
  }
  visit(entry)
  return { modules, constructors }
}
function properties(node) {
  return node.properties
    .filter((p) => p.type === "ObjectProperty" && !p.computed)
    .map((p) => (p.key.type === "Identifier" ? p.key.name : p.key.value))
    .filter((k) => k !== "$")
    .sort()
}
export function bendJavaScriptRuntime(raw, entry) {
  const tree = parse(raw, { sourceType: "module" }),
    { modules, constructors } = sourceBook(entry)
  const exported = tree.program.body.find((n) => n.type === "ExportDefaultDeclaration")
  if (exported?.declaration.type !== "ObjectExpression") throw Error("Bend 2.0.38 default export layout changed")
  const symbols = new Map(),
    contexts = new Map()
  for (const property of exported.declaration.properties) {
    if (property.type !== "ObjectProperty" || property.key.type !== "StringLiteral")
      throw Error("Unsupported Bend export")
    const key = property.key.value,
      body = raw.slice(property.value.start, property.value.end)
    const symbol = /run_loop\((\$[\w$]+)\(/.exec(body)?.[1]
    if (!symbol) continue
    symbols.set(key, symbol)
    const colon = key.lastIndexOf(":"),
      file = colon < 0 ? realpathSync(entry) : resolve(dirname(entry), key.slice(0, colon) + ".bend"),
      name = colon < 0 ? key : key.slice(colon + 1)
    const module = modules.get(file)
    if (module) contexts.set(symbol, { module, definition: module.definitions.get(name) ?? "" })
  }
  const changes = []
  function candidates(tag, context, keys) {
    let items = constructors.get(tag) ?? []
    if (context) {
      const mentioned = [],
        allMentioned = []
      const patterns = [...context.definition.matchAll(/\bcase\s+[^:]*:/g)].map((m) => [m.index, m.index + m[0].length])
      for (const match of context.definition.matchAll(/\b((?:[A-Za-z_]\w*\.)?)([A-Z]\w*)\s*\{/g)) {
        if (match[2] !== tag) continue
        const pattern = patterns.some(([start, end]) => match.index >= start && match.index < end)
        const owner = match[1] ? context.module.imports.get(match[1].slice(0, -1)) : context.module
        const item = owner?.constructors.get(tag)
        if (item && !allMentioned.includes(item)) allMentioned.push(item)
        if (item && pattern !== Boolean(keys) && !mentioned.includes(item)) mentioned.push(item)
      }
      if (mentioned.length) items = mentioned
      else if (allMentioned.length) items = allMentioned
    }
    if (keys) items = items.filter((c) => JSON.stringify(c.fields) === JSON.stringify(keys))
    else items = items.filter((c) => c.variants > 1)
    return [...new Set(items.map((c) => c.tag))]
  }
  function tag(node, context, keys) {
    if (node.type !== "StringLiteral" || builtins.has(node.value) || node.value.includes(".")) return
    if (!constructors.has(node.value)) return
    const choices = candidates(node.value, context, keys)
    if (choices.length !== 1)
      throw Error(
        `Ambiguous Bend constructor ${node.value} at ${node.start}: ${choices.join(", ")} (${context?.module.file}; ${keys})`
      )
    if (choices[0] !== node.value) changes.push([node.start, node.end, JSON.stringify(choices[0])])
  }
  function walk(node, context) {
    if (!node || typeof node !== "object") return
    if (node === exported) return
    if (node.type === "FunctionDeclaration") {
      context =
        contexts.get(node.id.name) ??
        [...contexts]
          .filter(([key]) => node.id.name.startsWith(key + "_c"))
          .sort((a, b) => b[0].length - a[0].length)[0]?.[1] ??
        context
    }
    if (node.type === "ObjectExpression") {
      for (const p of node.properties)
        if (
          p.type === "ObjectProperty" &&
          !p.computed &&
          ((p.key.type === "Identifier" && p.key.name === "$") ||
            (p.key.type === "StringLiteral" && p.key.value === "$"))
        )
          tag(p.value, context, properties(node))
    }
    if (node.type === "BinaryExpression" && ["===", "!=="].includes(node.operator)) {
      const member = node.left
      if (
        member.type === "MemberExpression" &&
        ((!member.computed && member.property.name === "$") || (member.computed && member.property.value === "$"))
      )
        tag(node.right, context)
    }
    for (const [key, value] of Object.entries(node))
      if (!["loc", "start", "end", "extra", "tokens", "comments"].includes(key)) {
        if (Array.isArray(value)) for (const item of value) walk(item, context)
        else if (value && typeof value === "object") walk(value, context)
      }
  }
  walk(tree.program, null)
  let source = raw.slice(0, exported.start)
  for (const [start, end, value] of changes.sort((a, b) => b[0] - a[0]))
    source = source.slice(0, start) + value + source.slice(end)
  return { source, symbols, exportSource: raw.slice(exported.start, exported.end) }
}
