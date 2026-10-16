import assert from "node:assert/strict"
import { inspectGoFile } from "@hapsland/source-analysis/direct-event/languages/go"
import { inspectGoPackage, packageSpellings, projectGoFile } from "@hapsland/source-analysis/testing/go-package"
import core from "../../../../dist/direct-event/graph-resolution/go-artifact-core.js"
import { goFileFacts } from "./parser-facts.ts"
import { list } from "@hapsland/source-artifacts/direct-event/value/codec"
const named = (name) => ({ kind: "named", name })
const unsupported = (name) => ({ kind: "unsupported", name })
const declaration = (file, name, references = []) => [file, name, references]
const inferred = (name, sourcePath) => (sourcePath === undefined ? { name } : { name, sourcePath })
const cycle = (work) => ({
  work,
  declarations: [declaration(0, "Root", [named("@0:0")]), declaration(0, "@0:0", [named("Root")])],
  constants: [["@0:0", [inferred("Root")]]]
})
// Finite authored package plans. @file:group selects parser-supplied artifact
// identity only. Bindings, reference order, inference and work are explicit.
const plans = [
  { work: 0, declarations: [], constants: [] },
  { work: 2, declarations: [declaration(0, "Root")], constants: [] },
  cycle(10),
  cycle(21),
  cycle(34),
  { work: 12, declarations: [declaration(0, "Root"), declaration(0, "@0:0")], constants: [["@0:0", []]] },
  {
    work: 15,
    declarations: [
      declaration(0, "Root", [named("@0:0")]),
      declaration(0, "Alias", [named("Root"), named("@0:0")]),
      declaration(0, "@0:0", [named("Alias")])
    ],
    constants: [["@0:0", [inferred("Alias"), inferred("Root")]]]
  },
  {
    work: 15,
    declarations: [
      declaration(0, "A", [named("B"), named("@0:0")]),
      declaration(0, "B", [named("A"), named("@0:0")]),
      declaration(0, "@0:0", [named("A")])
    ],
    constants: [["@0:0", [inferred("A"), inferred("B")]]]
  },
  cycle(32),
  cycle(31),
  {
    work: 18,
    declarations: [
      declaration(0, "Root", [named("@0:0")]),
      declaration(0, "@0:0", [named("Root"), unsupported("min")])
    ],
    constants: [["@0:0", [inferred("Root")]]]
  },
  cycle(36),
  {
    work: 10,
    declarations: [
      declaration(0, "Alias", [unsupported("x.T"), named("@0:0")]),
      declaration(0, "@0:0", [named("Alias")])
    ],
    constants: [["@0:0", [inferred("Alias"), inferred("x.T", "f0.go")]]]
  },
  {
    work: 14,
    declarations: [declaration(0, "@0:0", [unsupported("x.T")]), declaration(1, "@1:0", [unsupported("x.T")])],
    constants: [
      ["@0:0", [inferred("x.T", "f0.go")]],
      ["@1:0", [inferred("x.T", "f1.go")]]
    ]
  },
  {
    work: 7,
    declarations: [declaration(0, "@0:0", [unsupported("α.Τ")])],
    constants: [["@0:0", [inferred("α.Τ", "f0.go")]]]
  },
  {
    work: 10,
    declarations: [declaration(0, "Root", [named("@1:0")]), declaration(1, "@1:0", [named("Root")])],
    constants: [["@1:0", [inferred("Root")]]]
  },
  undefined,
  { work: 7, declarations: [declaration(0, "@0:0")], constants: [["@0:0", []]] },
  cycle(16),
  {
    work: 8,
    declarations: [declaration(0, "Root", [named("@0:0")]), declaration(0, "@0:0")],
    constants: [["@0:0", []]]
  },
  {
    work: 12,
    declarations: [
      declaration(0, "int", [named("@0:0")]),
      declaration(0, "Root", [named("int")]),
      declaration(0, "@0:0", [named("int")])
    ],
    constants: [["@0:0", [inferred("int")]]]
  },
  {
    work: 8,
    declarations: [declaration(0, "Root", [unsupported("T")]), declaration(0, "@0:0", [unsupported("T")])],
    constants: [["@0:0", []]]
  },
  {
    work: 7,
    declarations: [declaration(0, "Root"), declaration(0, "@0:0", [unsupported("Root")])],
    constants: [["@0:0", []]]
  },
  cycle(15),
  cycle(30),
  cycle(14),
  {
    work: 10,
    declarations: [
      declaration(0, "Alias", [unsupported("x.T"), named("@1:0")]),
      declaration(1, "@1:0", [named("Alias")])
    ],
    constants: [["@1:0", [inferred("Alias"), inferred("x.T", "f0.go")]]]
  },
  {
    work: 14,
    declarations: [declaration(0, "@0:0", [unsupported("x.C")]), declaration(1, "@1:0", [named("@0:0")])],
    constants: [
      ["@0:0", [inferred("x.C", "f0.go")]],
      ["@1:0", [inferred("x.C", "f0.go")]]
    ]
  }
]
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

assert.equal(cases.length, plans.length)
let comparisons = 0
for (const [index, sources] of cases.entries()) {
  const files = sources.map((source, i) =>
    inspectGoFile(`f${i}.go`, source.replaceAll("; ", "\n").replaceAll(" )", "\n)") + "\n")
  )
  assert.ok(files.every(Boolean), "parser fixture " + index)
  const plan = plans[index]
  const identity = (name) => {
    if (!name.startsWith("@")) return name
    const [file, group] = name.slice(1).split(":").map(Number)
    return files[file].constants[group].artifact.name
  }
  const expected = plan && {
    declarations: new Map(
      plan.declarations.map(([file, name, references]) => {
        const key = identity(name),
          parsed = files[file]
        const source = [...parsed.types, ...parsed.constants].find(({ artifact }) => artifact.name === key)
        assert.ok(source, "authored fixture metadata")
        return [
          key,
          {
            artifact: source.artifact,
            exported: source.exported ?? false,
            references: references.map((ref) => ({ ...ref, name: identity(ref.name) })),
            ...(source.location ? { location: source.location } : {})
          }
        ]
      })
    ),
    imports: new Map(),
    discoveryWork: plan.work,
    constantTypes: new Map(plan.constants.map(([name, values]) => [identity(name), values]))
  }
  const budgets = [
    ...new Set([0, 1, ...(plan ? [Math.max(0, plan.work - 1), plan.work, plan.work + 1] : []), 127, 128, 129, 100000])
  ]
  for (const budget of budgets) {
    const actual = inspectGoPackage(files, budget)
    const admitted = plan && budget >= plan.work ? expected : undefined
    assert.deepEqual(actual, admitted, `fixture ${index} budget ${budget}`)
    if (admitted)
      for (const [name, value] of admitted.declarations)
        assert.equal(
          actual.declarations.get(name).artifact,
          value.artifact,
          `fixture ${index} parser artifact identity ${name}`
        )
    comparisons++
  }
}
for (const source of ["package p\ntype Root int\n", "package p\ntype Root int\nconst A Root = 1\n"]) {
  const file = inspectGoFile("projection.go", source)
  const projection = projectGoFile(file)
  assert.ok(projection)
  for (const type of file.types) {
    const projected = projection.declarations.get(type.artifact.name)
    assert.equal(projected, type, "Source projection retains original declaration")
    assert.equal(projected.artifact, type.artifact)
    assert.equal(projected.references, type.references)
  }
}
const missing = goFileFacts(inspectGoFile("missing.go", "package p\ntype Root int\nconst A Root = 1\n"))
assert.equal(core.package_facts(list([missing]), 100000, list([])).$, "go-module/Package.Refused")
assert.equal(
  core.package_facts(list([missing]), 100000, packageSpellings([missing])).$,
  "go-module/Package.PackageFacts"
)
console.log(
  JSON.stringify({
    passed: true,
    cases: comparisons + 2,
    packageFixtures: cases.length,
    scope:
      "Packaged GoPackage against authored full declaration/reference/inference/work plans at exact budget boundaries; missing spelling refusal. Native parser metadata is shared; finite evidence, not universal correspondence."
  })
)
