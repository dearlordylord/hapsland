import assert from "node:assert/strict"
import { execFileSync, spawnSync } from "node:child_process"
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { pathToFileURL } from "node:url"
import { productValue, list } from "@hapsland/source-artifacts/direct-event/value/codec"

const temporary = mkdtempSync(join(tmpdir(), "hapsland-capture-evidence-"))
const label = (value) => value.$.split(".").at(-1)
const normalize = (value) =>
  value !== null && typeof value === "object"
    ? Object.fromEntries(
        Object.entries(value).map(([key, item]) => [key, key === "$" ? label(value) : normalize(item)])
      )
    : value
const equal = (actual, expected) => assert.deepEqual(normalize(actual), normalize(expected))
const roots = [
  "UnitEvidence.bend",
  "UnitEvidenceCaptureSpecification.bend",
  "UnitEvidenceCaptureLaws.bend",
  "UnitEvidenceCaptureProof.bend"
]
try {
  const modules = []
  for (const [index, name] of roots.slice(0, 2).entries()) {
    const output = join(temporary, `${index}.mjs`)
    execFileSync(
      "timeout",
      [
        "-s",
        "KILL",
        "10s",
        "taskset",
        "-c",
        "10",
        process.env.BEND ?? "bend",
        join(import.meta.dirname, name),
        "-o",
        output
      ],
      { timeout: 11000 }
    )
    modules.push((await import(pathToFileURL(output))).default)
  }
  const [actual, original] = modules
  const records = [
    null,
    false,
    "bad",
    {},
    { path: null },
    { path: "a" },
    { path: "a", contentHash: 7, byteLength: 3 },
    { path: "a", contentHash: "a-hash", byteLength: 0 },
    { path: "a", contentHash: "later-hash", byteLength: 4 },
    { path: "b", contentHash: "b-hash", byteLength: -0 },
    { path: "😀", contentHash: "unicode-hash", byteLength: NaN }
  ].map(productValue)
  const paths = ["a", "b", "missing", "", "😀", "\ud800", "\udfff", "a\0b"]
  let seed = 0x51c4a7e
  const next = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0)
  const fixtures = [[], [records[5], records[7]], [records[7], records[8]], [...records], [...records].reverse()]
  for (let index = 0; index < 512; index += 1)
    fixtures.push(Array.from({ length: next() % 24 }, () => records[next() % records.length]))
  let queries = 0
  for (const values of fixtures) {
    const captures = list(values)
    const before = JSON.stringify(captures)
    const prepared = actual.prepare_captures(captures)
    for (const path of paths) {
      equal(actual.lookup_prepared(path, prepared), original.capture_at(path, captures))
      queries++
    }
    for (const selected of [[], paths, [...paths].reverse(), ["a", "a"], ["a", "missing", "b"]])
      equal(actual.fingerprints_prepared(list(selected), prepared), original.fingerprints(list(selected), captures))
    assert.equal(JSON.stringify(captures), before)
  }
  // Original first matching path blocks later valid duplicates.
  assert.equal(label(actual.lookup_prepared("a", actual.prepare_captures(list([records[5], records[7]])))), "None")
  const sources = roots.map((name) => readFileSync(join(import.meta.dirname, name), "utf8"))
  const copies = new Map(roots.map((name) => [join(import.meta.dirname, name), join(temporary, name)]))
  const mutations = [
    { name: "baseline" },
    {
      name: "last match wins",
      before: "case True{}: value\n    case False{}: rest(Unit{})",
      after: "case True{}: rest(Unit{})\n    case False{}: rest(Unit{})",
      section: "selected_exact"
    },
    {
      name: "fingerprints discard requested head",
      before:
        "fingerprint_cons(\n      lookup_prepared(path, captures),\n      fingerprints_prepared(tail, captures)\n    )",
      after: "fingerprints_prepared(tail, captures)",
      section: "Laws.fingerprints_exact"
    },
    {
      name: "preparation reverses capture priority",
      before: "prepare_go(captures, [])",
      after: "List.reverse(&2, PreparedCapture, prepare_go(captures, []))",
      section: "Laws.lookup_exact"
    }
  ]
  for (const mutation of mutations) {
    let implementation = sources[0]
    if (mutation.before !== undefined) {
      // The selected branch also exists in field_answer; target only the capture selector.
      const start = implementation.indexOf("def prepared_selected(")
      if (mutation.name === "last match wins")
        implementation =
          implementation.slice(0, start) + implementation.slice(start).replace(mutation.before, mutation.after)
      else {
        assert.equal(implementation.split(mutation.before).length, 2)
        implementation = implementation.replace(mutation.before, mutation.after)
      }
    }
    for (const [index, name] of roots.entries()) {
      const source = index === 0 ? implementation : sources[index]
      writeFileSync(
        copies.get(join(import.meta.dirname, name)),
        source.replace(
          /^import ([./][^ \n]+)(.*)$/gm,
          (_line, path, rest) =>
            `import ${copies.get(resolve(import.meta.dirname, path)) ?? resolve(dirname(join(import.meta.dirname, name)), path)}${rest}`
        )
      )
    }
    const result = spawnSync(
      "timeout",
      ["-s", "KILL", "10s", "taskset", "-c", "10", process.env.BEND ?? "bend", join(temporary, roots[3]), "--verdict"],
      { encoding: "utf8", timeout: 11000 }
    )
    assert.ifError(result.error)
    const output = result.stdout + result.stderr
    assert.equal(result.status, mutation.before === undefined ? 0 : 1, output)
    assert.match(output, mutation.before === undefined ? /ALL PROOFS CHECK/ : /SOME PROOFS FAIL/)
    if (mutation.before !== undefined) assert.ok(output.includes(`Location: ${mutation.section}`), output)
  }
  console.log(
    `Capture evidence: ${fixtures.length} capture lists/${queries} lookup comparisons, ordered fingerprints, immutable inputs and three semantic mutants; three universal laws.`
  )
} finally {
  rmSync(temporary, { recursive: true, force: true })
}
