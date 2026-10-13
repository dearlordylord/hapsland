import { Parser, Python, descendants } from "@hapsland/source-analysis/direct-event/languages/native-parser"
const nativeBindings = await import(
  new URL("../../../../../dist/direct-event/languages/python/scope-bindings.js", import.meta.url)
)
const nativeAuthority = await import(
  new URL("../../../../../dist/direct-event/languages/python/module-authority.js", import.meta.url)
)
const native = { ...nativeBindings, ...nativeAuthority }
const text = "from dataclasses import field\nclass C:\n x=field(default_factory=lambda: run())\n"
let differences = 0,
  identityFailures = 0,
  unknownTrue = 0,
  namespaceTrue = 0,
  firstMismatch
for (let i = 0; i < 300; i++) {
  const p = new Parser()
  p.setLanguage(Python)
  const root = p.parse(text).rootNode,
    scope = native.moduleScope(root)
  const unknown = native.unknownEvaluatedCall(root, scope.bindings, new Set(scope.facts.map((f) => f.name))),
    namespace = native.unavailableImportNamespace(root, scope.bindings)
  if (unknown !== namespace && !firstMismatch)
    firstMismatch = {
      iteration: i,
      unknown,
      namespace,
      evaluatedCalls: native
        .evaluatedNodes(root)
        .filter((n) => n.type === "call")
        .map((n) => ({ id: n.id, text: n.text })),
      lambdas: descendants(root)
        .filter((n) => n.type === "lambda")
        .map((n) => ({
          id: n.id,
          children: n.namedChildren.map((c) => ({
            id: c.id,
            text: c.text,
            bodyId: n.childForFieldName("body")?.id,
            same: c === n.childForFieldName("body")
          }))
        }))
    }
  unknownTrue += +unknown
  namespaceTrue += +namespace
  differences += +(unknown !== namespace)
  for (const node of descendants(root))
    if (node.type === "lambda")
      for (const child of node.namedChildren)
        if (child.id === node.childForFieldName("body")?.id && child !== node.childForFieldName("body"))
          identityFailures++
  p.reset()
}
console.log(
  JSON.stringify({
    runtime: process.version,
    iterations: 300,
    differences,
    identityFailures,
    unknownTrue,
    namespaceTrue,
    firstMismatch
  })
)
