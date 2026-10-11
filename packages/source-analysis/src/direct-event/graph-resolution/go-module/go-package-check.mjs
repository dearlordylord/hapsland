import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import { inspectGoFile, goGraphFacts } from "../../languages/go.ts"
import { goFileFacts } from "./parser-facts.ts"
import { factDeclaration } from "../frontend-codec.ts"
import { list, unlist } from "@hapsland/source-artifacts/direct-event/value/codec"

// Mechanical transport: emitter-relative nominal paths and Nat representation.
const transport = (value) => {
  if (typeof value === "number") return BigInt(value)
  if (Array.isArray(value)) return value.map(transport)
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        key === "$" && typeof item === "string"
          ? item.replace(/^Types\./u, "../Types.").replace(/^traversal\/core\./u, "../traversal/core.")
          : transport(item)
      ])
    )
  return value
}
const spellings = (files) => {
  const strings = new Set()
  const visit = (value) => {
    if (typeof value === "string") strings.add(value)
    else if (Array.isArray(value)) value.forEach(visit)
    else if (value && typeof value === "object") Object.values(value).forEach(visit)
  }
  files.forEach(visit)
  return list(
    [...strings].map((text) => ({
      $: "Input.Spelling",
      text,
      characters: list(
        [...text].map((text) => ({
          $: "Input.Character",
          text,
          letter: /^\p{L}$/u.test(text),
          number: /^\p{N}$/u.test(text),
          uppercase: /^\p{Lu}$/u.test(text)
        }))
      )
    }))
  )
}
const cases = [
  [],
  ["package p\ntype Root int"],
  ["package p\ntype Root int\nconst A Root = 1"],
  ["package p\ntype Root int\nconst ( A Root = iota; B; C )"],
  ["package p\ntype Root int\nconst ( A = B; B = C; C Root = 1 )"],
  ["package p\ntype Root int\nconst ( A = B; B = A )"],
  ["package p\ntype Root int\ntype Alias = Root\nconst X Alias = 1"],
  ["package p\ntype A = B\ntype B = A\nconst X A = 1"],
  ["package p\ntype Root int\nconst ( A Root = 1; B = A + A; C = A == A; D = A << A )"],
  ["package p\ntype Root int\nconst ( A Root = 1; B = min(A, A); C = max(A, A) )"],
  ["package p\ntype Root int\nvar min int\nconst ( A Root = 1; B = min(A) )"],
  ["package p\ntype Root int\nconst ( A = Root(1); B = (Root)(1); C = -A; D = (A) )"],
  ['package p\nimport x "example/x"\ntype Alias = x.T\nconst A Alias = 1'],
  ['package p\nimport x "example/x"\nconst A = x.T(1)', 'package p\nimport x "example/y"\nconst B = x.T(2)'],
  ['package p\nimport α "example/x"\nconst A = α.Τ(1)'],
  ["package p\ntype Root int", "package p\nconst A Root = 1"],
  ["package p\ntype Root int", "package p\ntype Root int"],
  ["package p\nconst ( _ = 1; _ = 2 )"],
  ["package p\ntype Root int\nconst ( _ Root = 1; B = _ )"],
  ["package p\ntype Root struct { X [A]int }; const A = 3"],
  ["package p\ntype int struct {}; type Root int; const A int = 1"],
  ['package p\nimport . "example/x"\ntype Root T; const A = T(1)'],
  ['package p\nimport Root "example/x"\ntype Root int; const A Root = 1'],
  ["package p\ntype Root int\nconst A = (Root)(max(1,2))"],
  ["package p\ntype Root int\nconst ( A Root = 1; B = A >> 2; C = 2 << A; D = A != 0 )"],
  ["package p\ntype Root[T any] int\nconst A = Root[int](1)"],
  ['package p\nimport x "example/x"\ntype Alias = x.T', "package p\nconst A Alias = 1"],
  ['package p\nimport x "example/x"\nconst A = x.C', "package p\nconst B = A"]
]
const temporary = mkdtempSync(join(tmpdir(), "hapsland-go-package-"))
try {
  const output = join(temporary, "package.mjs")
  execFileSync("bend", [join(import.meta.dirname, "Package.bend"), "-o", output], { timeout: 5000 })
  const core = (await import(pathToFileURL(output))).default
  const missingFacts = [goFileFacts(inspectGoFile("missing.go", "package p\ntype Root int\nconst A Root = 1\n"))]
  assert.equal(core.run(list(missingFacts.map(transport)), 100000n, list([])).$, "Refused")
  let comparisons = 1
  for (const [index, sources] of cases.entries()) {
    const files = sources.map((source, i) =>
      inspectGoFile(`f${i}.go`, source.replaceAll("; ", "\n").replaceAll(" )", "\n)") + "\n")
    )
    assert.ok(files.every(Boolean), `parser fixture ${index}`)
    const facts = files.map(goFileFacts)
    const expected = goGraphFacts(files, 100000)
    const budgets = expected
      ? [
          ...new Set([
            0,
            1,
            Math.max(0, expected.discoveryWork - 1),
            expected.discoveryWork,
            expected.discoveryWork + 1,
            100000
          ])
        ]
      : [0, 1, 128, 100000]
    for (const budget of budgets) {
      const native = goGraphFacts(files, budget)
      const actual = core.run(list(facts.map(transport)), BigInt(budget), spellings(facts))
      if (native === undefined) assert.equal(actual.$, "Refused", `fixture ${index} budget ${budget}`)
      else {
        assert.equal(actual.$, "PackageFacts", `fixture ${index} budget ${budget}`)
        assert.equal(actual.discovery_work, BigInt(native.discoveryWork), `work ${index}/${budget}`)
        const declarations = unlist(actual.declarations).map(({ value, location }) => ({ value, location }))
        const expectedDeclarations = [...native.declarations].map(([key, value]) => ({
          value: transport(factDeclaration(key, value)),
          location:
            value.location === undefined
              ? { $: "None" }
              : transport({
                  $: "Some",
                  value: {
                    $: "Types.GoSourceLocation",
                    start: { $: "Types.GoSourcePosition", ...value.location.start },
                    end: { $: "Types.GoSourcePosition", ...value.location.end }
                  }
                })
        }))
        assert.deepEqual(declarations, expectedDeclarations, `declarations ${index}/${budget}`)
        const constantTypes = unlist(actual.constant_types).map(({ name, values }) => [
          name,
          unlist(values).map((value) =>
            value.$ === "LocalType" ? { name: value.name } : { name: value.name, sourcePath: value.source_path }
          )
        ])
        assert.deepEqual(constantTypes, [...native.constantTypes], `inferred ${index}/${budget}`)
        assert.equal(native.imports.size, 0)
      }
      comparisons++
    }
  }
  console.log(
    JSON.stringify({
      passed: true,
      cases: comparisons,
      packages: cases.length,
      scope:
        "actual native whole goGraphFacts ordered outputs/work/refusal; no universal proof or whole Go session adoption"
    })
  )
} finally {
  rmSync(temporary, { recursive: true, force: true })
}
