import assert from "node:assert/strict"
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { createHash } from "node:crypto"
import test from "node:test"
import {
  verifyExecutionIdentity,
  selection,
  fixtureText,
  checkSourceResult,
  verifyRows,
  assertFrozen
} from "./verify-game-lab-native-tests.mjs"
const owner = fileURLToPath(new URL("../prototypes/canonical-defense/DefenseLabTests.bend", import.meta.url))
test("all26 exact predicate definitions remain and are dispatched independently", () => {
  const text = readFileSync(owner, "utf8"),
    ids = selection([]),
    fixture = fixtureText(text, owner, "/numeric.bend", ids)
  assert.equal(ids.length, 26)
  for (const part of text.split(/(?=^def )/m).slice(1)) {
    const name = part.match(/^def (\w+)/)[1]
    if (/^test_\d+$/.test(name)) assert.ok(fixture.includes(part), `exact ${name} definition`)
  }
  for (const id of ids)
    assert.ok(fixture.includes(`case ${id}n: test_${id}(seed,budget${id >= 12 && id <= 14 ? ",fuel" : ""})`))
  assert.equal(
    verifyRows(
      ids.map((id) => [id, 1]),
      ids.map((id) => [id, 1]),
      ids
    ).length,
    26
  )
})
test("false predicates, omissions, duplicates and lane disagreement fail", () => {
  assert.throws(() => verifyRows([[1, 0]], [[1, 1]], [1]), /Result Courier costs40/)
  assert.throws(() => verifyRows([], [[1, 1]], [1]), /coverage/)
  assert.throws(
    () =>
      verifyRows(
        [
          [0, 1],
          [0, 1]
        ],
        [
          [0, 1],
          [1, 1]
        ],
        [0, 1]
      ),
    /Result Courier/
  )
  assert.throws(() => verifyRows([[1, 1]], [[1, 0]], [1]), /Result Courier/)
})
test("invalid and duplicate selections fail before preparation", () => {
  assert.throws(() => selection(["26"]), /ids0..25/)
  assert.throws(() => selection(["1", "1"]), /Duplicate/)
  assert.deepEqual(selection(["9", "25"]), [9, 25])
})
test("only exact foreign numericIO exclusions pass the bounded source check", () => {
  const diagnostic =
    "SOME PROOFS FAIL\nError: 5 defs rely on unsafe or foreign code:\n- ./DefenseNumericOutput.write\n- checked\n- inputs\n- arguments\n- main\n"
  checkSourceResult({ status: 0, stderr: "", stdout: "ALL PROOFS CHECK" })
  checkSourceResult({ status: 1, stderr: diagnostic, stdout: "" })
  checkSourceResult({ status: 1, stderr: diagnostic + "bend 2.0.37 is available: run bend update\n", stdout: "" })
  for (const stderr of [
    "machine stack overflow",
    diagnostic.replace("- main", "- unexpected"),
    diagnostic + "unexpected compiler diagnostic\n"
  ])
    assert.throws(() => checkSourceResult({ status: 1, stderr, stdout: "" }), /batch-source-check failed/)
  assert.throws(() => checkSourceResult({ status: 0, stderr: "", error: { code: "ETIMEDOUT" } }), /ETIMEDOUT/)
})
test("changed source bytes reject qualification", () => {
  const directory = mkdtempSync(join(tmpdir(), "lab-batch-negative-")),
    file = join(directory, "owner.bend")
  try {
    writeFileSync(file, "original")
    const expected = createHash("sha256").update(readFileSync(file)).digest("hex")
    assertFrozen([[file, expected]])
    writeFileSync(file, "mutant")
    assert.throws(() => assertFrozen([[file, expected]]), /qualification input changed/)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test("batch evidence requires compiled artifact hashes and exact runtime selection", () => {
  const identity = {
    sources: [{ file: "owner", expected: "a".repeat(64) }],
    tools: [{ file: "bend", expected: "b".repeat(64) }],
    origin: {
      cHash: "c".repeat(64),
      binaryHash: "d".repeat(64),
      jsHash: "e".repeat(64),
      executionArgumentGroups: [["009", "152", "160", "250"]]
    }
  }
  assert.equal(verifyExecutionIdentity(identity, [9]), identity)
  assert.throws(() =>
    verifyExecutionIdentity({ ...identity, origin: { ...identity.origin, binaryHash: undefined } }, [9])
  )
  assert.throws(() => verifyExecutionIdentity(identity, [8]))
  assert.throws(() => verifyExecutionIdentity({ ...identity, sources: [] }, [9]), /provenance/)
})
