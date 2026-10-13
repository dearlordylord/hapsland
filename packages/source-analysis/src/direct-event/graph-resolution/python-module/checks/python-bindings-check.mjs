import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { mkdtemp, rm } from "node:fs/promises"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import { unlist } from "@hapsland/source-artifacts/direct-event/value/codec"
import { projectPythonSyntax } from "../syntax-projection.ts"
import { Parser, Python } from "@hapsland/source-analysis/direct-event/languages/native-parser"
const temp = await mkdtemp("/tmp/hapsland-python-bindings-")
try {
  const file = join(import.meta.dirname, "../../PythonModule.bend"),
    emitted = join(temp, "bindings.mjs")
  execFileSync("taskset", ["-c", "10", "bend", file, "-o", emitted], { timeout: 10000 })
  const { default: child } = await import(pathToFileURL(emitted))
  const nativeBindings = await import(
    pathToFileURL(join(import.meta.dirname, "../../../../../dist/direct-event/languages/python/scope-bindings.js"))
  )
  const nativeAuthority = await import(
    pathToFileURL(join(import.meta.dirname, "../../../../../dist/direct-event/languages/python/module-authority.js"))
  )
  const native = { ...nativeBindings, ...nativeAuthority }
  const fixtures = [
    "from typing import TYPE_CHECKING as TC\nfrom .foo import Name as Alias\n",
    "import a.b\nimport c.d as E\nfrom . import child\n",
    "from typing import T\nT = 1\ndel T\n",
    "a, [b, c] = value\na.attr = 1\na[0] = 2\n",
    "class C:\n  from .foo import Hidden\n  x = call()\ndef f(x=default()):\n  import ignored\n",
    "f = lambda x=(a := 1): (b := 2)\n",
    "for a, b in values:\n  c=1\nwith manager as alias:\n  d=2\n",
    'match value:\n case [a, *b]: pass\n case {"x": x, **rest}: pass\n case Something() as found: pass\n',
    "if TYPE_CHECKING:\n from .foo import Foo\n",
    "from .foo import Name\nfrom .bar import Name\n",
    "type Alias[T] = list[T]\n",
    "@decorate(alias := 1)\nclass C[T](Base):\n  value = 1\n",
    "def f[T](x: T):\n return (ignored := 1)\n",
    "删除 = 1\ndel 删除\nimport 包.子 as 名\n",
    ...["TYPE_CHECKING", "typing.TYPE_CHECKING", "not TYPE_CHECKING", "TYPE_CHECKING and other"].map(
      (condition) => "from typing import TYPE_CHECKING\nimport typing\nif " + condition + ":\n from .foo import Foo\n"
    ),
    "from typing import TYPE_CHECKING\nTYPE_CHECKING = False\nif TYPE_CHECKING:\n from .foo import Foo\n",
    "from typing import TYPE_CHECKING\nif TYPE_CHECKING:\n from .foo import Foo\nelse:\n from .bar import Foo\n",
    "from typing import TYPE_CHECKING\nif TYPE_CHECKING:\n Foo = 1\n",
    "from typing_extensions import TYPE_CHECKING as TC\nif TC:\n # static comment\n pass\n from .foo import Foo as Alias\n"
  ]
  let nodes = 0
  for (const source of fixtures) {
    const parser = new Parser()
    try {
      parser.setLanguage(Python)
      const root = parser.parse(source).rootNode,
        syntax = projectPythonSyntax(root)
      nodes += unlist(syntax.nodes).length
      const expectedScope = native.moduleScope(root),
        actualScope = child.module_scope(syntax)
      const projected = (facts) =>
        unlist(facts).map((fact) => ({
          name: fact.name,
          ...(fact.identity.$ === "Some" ? { identity: fact.identity.value } : {})
        }))
      assert.deepEqual(projected(actualScope.facts), expectedScope.facts, source + " module facts")
      assert.deepEqual(
        unlist(actualScope.bindings).map((fact) => [fact.name, fact.identity.value]),
        [...expectedScope.bindings],
        source + " module identities"
      )
      assert.deepEqual(
        unlist(actualScope.static_blocks).map(Number),
        [...expectedScope.staticBlocks],
        source + " static blocks"
      )
      for (const staticImport of [false, true]) {
        const expected = native.scopeBindings(root, staticImport),
          facts = child.scope_bindings(syntax, BigInt(syntax.root), staticImport)
        assert.deepEqual(
          unlist(facts).map((fact) => ({
            name: fact.name,
            ...(fact.identity.$ === "Some" ? { identity: fact.identity.value } : {})
          })),
          expected,
          source
        )
        const identities = unlist(child.identities(facts)).map((fact) => [fact.name, fact.identity.value])
        assert.deepEqual(identities, [...native.identities(expected)], source + " identities")
      }
    } finally {
      parser.reset()
    }
  }
  console.log(
    JSON.stringify({
      status: "PASS",
      cases: fixtures.length,
      scopeVariants: fixtures.length * 2,
      nativeRows: nodes,
      scope:
        "scopeBindings, identities and full moduleScope over native syntax; excludes authority policies and complete GraphSession"
    })
  )
} finally {
  await rm(temp, { recursive: true, force: true })
}
