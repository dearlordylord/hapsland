import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { mkdtemp, rm } from "node:fs/promises"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import { TYPE_INPUT_CONTRACT, FUNCTION_INPUT_CONTRACT } from "../../../../review-definition/src/rules/targets.ts"
const temp = await mkdtemp("/tmp/hapsland-preparation-selection-")
try {
  const emitted = join(temp, "selection.mjs")
  execFileSync(
    "taskset",
    ["-c", "10", "bend", join(import.meta.dirname, "./PreparationSelection.bend"), "-o", emitted],
    { timeout: 10000 }
  )
  const m = (await import(pathToFileURL(emitted))).default
  const list = (items) => items.reduceRight((tail, head) => ({ $: "Con", head, tail }), { $: "Nil" })
  const array = (value) => {
    const out = []
    while (value.$ === "Con") {
      out.push(value.head)
      value = value.tail
    }
    assert.equal(value.$, "Nil")
    return out
  }
  const maybe = (value) => (value === undefined ? { $: "None" } : { $: "Some", value })
  const position = (p) => ({
    $: "../../../../native-observation/src/direct-event/edit-attribution/RootAttribution.Position",
    line: p.line,
    column: p.column
  })
  const location = (p) => ({
    $: "../../../../native-observation/src/direct-event/edit-attribution/RootAttribution.Location",
    start: position(p.start),
    end: position(p.end)
  })
  const span = (a, b, c, d) => ({ start: { line: a, column: b }, end: { line: c, column: d } })
  const path = "root.py",
    capture = { text: "class Foo:\n field: int\nclass Bar:\n value: str\n", contentHash: "hash" }
  const root = (name, loc) => ({ artifact: { id: "id-" + name, kind: "class", name }, location: loc })
  const foo = root("Foo", span(1, 1, 2, 12)),
    bar = root("Bar", span(3, 1, 4, 12))
  const hunk = { path, verified: true, location: span(2, 2, 2, 7) }
  const duplicate = { ...foo, artifact: { ...foo.artifact, id: "duplicate" } }
  const verifiedFoo = { path, contentHash: "hash", hunks: [hunk] }
  // Expectations are explicit contract examples, not a second selector.
  const fixtures = [
    { line: 1, selected: ["id-Foo"], roots: ["id-Foo"] },
    { line: 2, selected: ["id-Foo"], roots: ["id-Foo"] },
    { line: 3, selected: ["id-Bar"], roots: ["id-Bar"] },
    { line: 4, selected: ["id-Bar"], roots: ["id-Bar"] },
    { line: 5, selected: [] },
    { line: 1, frozen: new Set(["Bar"]), contract: "other", selected: ["id-Foo"], roots: ["id-Foo"] },
    { line: 1, declarations: [foo, duplicate], selected: [], ambiguous: true, roots: ["id-Foo", "duplicate"] },
    { line: 1, declarations: [], selected: [] },
    { frozen: new Set(), selected: [] },
    { frozen: new Set(["Foo"]), contract: "other", selected: ["id-Foo"] },
    { frozen: new Set(["Bar", "Foo"]), selected: ["id-Bar", "id-Foo"] },
    { operation: "add", selected: ["id-Bar", "id-Foo"] },
    { operation: "add", contract: FUNCTION_INPUT_CONTRACT, selected: ["id-Bar", "id-Foo"] },
    { operation: "add", contract: "other", selected: [] },
    { operation: "add", declarations: [], selected: [] },
    {
      operation: "add",
      declarations: [{ ...foo, artifact: { ...foo.artifact, kind: "constant-group" } }],
      selected: []
    },
    { verified: verifiedFoo, selected: ["id-Foo"] },
    { verified: { ...verifiedFoo, contentHash: "wrong" }, selected: [], ambiguous: true },
    { verified: { ...verifiedFoo, path: "other.py" }, selected: [], ambiguous: true },
    { selected: [], ambiguous: true }
  ]
  let cases = 0
  for (const fixture of fixtures) {
    const {
      operation = "update",
      line,
      frozen,
      contract = TYPE_INPUT_CONTRACT,
      declarations = [foo, bar],
      verified
    } = fixture
    const analyses = [bar, foo].map(({ artifact }) => ({
      status: "unsupported",
      root: artifact,
      reason: "missing-evidence"
    }))
    const input = {
      $: "Input",
      snapshot: {
        $: "../../../../native-observation/src/direct-event/edit-attribution/RootAttribution.Snapshot",
        path,
        addition: operation === "add",
        source: capture.text
      },
      content_hash: capture.contentHash,
      contract:
        contract === TYPE_INPUT_CONTRACT
          ? { $: "TypeContract" }
          : contract === FUNCTION_INPUT_CONTRACT
            ? { $: "FunctionContract" }
            : { $: "OtherContract", name: contract },
      line: maybe(line === undefined ? undefined : line),
      frozen: maybe(frozen === undefined ? undefined : list([...frozen])),
      verified: maybe(
        verified === undefined
          ? undefined
          : {
              $: "VerifiedSpans",
              path: verified.path,
              content_hash: verified.contentHash,
              hunks: list(
                verified.hunks.map((h) => ({
                  $: "../../../../native-observation/src/direct-event/edit-attribution/RootAttribution.Hunk",
                  path: h.path,
                  verified: h.verified,
                  location: location(h.location)
                }))
              )
            }
      ),
      native_hunks: { $: "None" },
      declarations: list(
        declarations.map((d) => ({
          $: "Root",
          id: d.artifact.id,
          declaration: {
            $: "../../../../native-observation/src/direct-event/edit-attribution/RootAttribution.Declaration",
            path,
            kind: d.artifact.kind,
            name: d.artifact.name,
            location: location(d.location),
            selection_locations: { $: "None" }
          }
        }))
      ),
      analyses: list(analyses.map((a) => ({ $: "Analysis", ...a.root })))
    }
    const actual = m.select(input)
    assert.deepEqual(
      array(actual.selected).map((a) => a.id),
      fixture.selected,
      "selected " + cases
    )
    assert.equal(actual.ambiguous, fixture.ambiguous ?? false, "ambiguity " + cases)
    assert.deepEqual([...new Set(array(actual.line_roots))], fixture.roots ?? [], "line roots " + cases)
    cases++
  }
  console.log(
    JSON.stringify({
      passed: true,
      cases,
      scope:
        "Fixture-authored selection/refusal regressions: line/frozen/edit precedence, verified path/hash, constants, analysis order and line-root accumulation; not whole Preparation acceptance"
    })
  )
} finally {
  await rm(temp, { recursive: true, force: true })
}
