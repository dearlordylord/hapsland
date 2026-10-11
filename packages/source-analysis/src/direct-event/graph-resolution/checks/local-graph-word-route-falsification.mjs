import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { pathToFileURL } from "node:url"
const temporary = mkdtempSync(join(tmpdir(), "hapsland-trie-laws-"))
try {
  const emitted = join(temporary, "invariant.mjs")
  execFileSync("bend", [resolve(import.meta.dirname, "local-graph-representation-prototypes/word-route/INVARIANT.bend"), "-o", emitted], { timeout: 5000 })
  const core = (await import(pathToFileURL(emitted))).default
  const nil = () => ({ $: "Own.DNil" })
  const leaf = key => ({ $: "Own.DLeaf", key, value: 7 })
  const branch = (divisor, zero, one, count = 2) => ({ $: "Own.DBranch", divisor, zero, one, count })
  const malformed = [branch(0, leaf(0), leaf(1)), branch(3, leaf(0), leaf(3)), branch(1, leaf(0), leaf(1), 3), branch(1, nil(), leaf(1), 1), branch(2, leaf(0), leaf(3)), branch(1, leaf(1), leaf(0)), branch(1, leaf(0), leaf(0)), leaf(4294967296), branch(2, branch(1, leaf(0), leaf(1)), leaf(2), 3)]
  for (const dictionary of malformed) assert.equal(core.valid(dictionary), false, "malformed structure accepted")
  assert.equal(core.valid(nil()), true)
  let random = 918273
  const draw = () => { random = (Math.imul(random, 1664525) + 1013904223) >>> 0; return random }
  const edges = [0, 1, 2, 3, 0x7fffffff, 0x80000000, 0x80000001, 0xfffffffe, 0xffffffff]
  const splitPairs = []
  for (const a of edges) for (const b of edges) if (a !== b) splitPairs.push([a, b])
  for (let pair = 0; pair < 2048; pair++) { const a = draw(), b = draw(); if (a !== b) splitPairs.push([a, b]) }
  for (const [a, b] of splitPairs) {
    const divisor = core["Own.split_go"](32, a, b, 1)
    assert.equal(core.split_valid(a, b, divisor), true, `split ${a}/${b}`)
  }
  let updates = 0, lookupChecks = 0
  for (let history = 0; history < 64; history++) {
    let dictionary = nil()
    const oracle = new Map()
    const pool = [...edges, ...Array.from({ length: 32 }, draw)]
    for (let step = 0; step < 96; step++) {
      const key = step < edges.length ? edges[step] : pool[draw() % pool.length]
      const value = draw() % 65536, oldSize = oracle.size
      const hadKey = oracle.has(key)
      assert.equal(core.valid(dictionary), true)
      assert.equal(core["Own.contains"](dictionary, key), hadKey)
      dictionary = core["Own.set"](dictionary, key, value)
      oracle.set(key, value)
      assert.equal(core.valid(dictionary), true, `invariant history ${history}/${step}`)
      assert.equal(Number(core["Own.size"](dictionary)), oldSize + (hadKey ? 0 : 1))
      assert.equal(Number(core.leaves(dictionary)), oracle.size)
      assert.equal(core["Own.contains"](dictionary, key), true)
      assert.equal(core["Own.lookup"](65536, dictionary, key), value)
      assert.equal(core["Own.seek"](dictionary, key).$, "Some")
      for (const probe of pool) {
        assert.equal(core["Own.lookup"](65536, dictionary, probe), oracle.get(probe) ?? 65536, `lookup history ${history}/${step}/${probe}`)
        assert.equal(core["Own.contains"](dictionary, probe), oracle.has(probe))
        lookupChecks++
      }
      updates++
    }
  }
  const record = { passed: true, updates, lookupChecks, distinctKeySplits: splitPairs.length, malformedRejected: malformed.length, histories: 64, scope: "emitted structural trie finite falsification: uint32 edges/high bit/zero, repeated insertion and overwrite; independent native Map oracle, invariant/count checks after every update; no universal proof or whole planner qualification" }
  writeFileSync(resolve(import.meta.dirname, "local-graph-word-route-falsification.json"), JSON.stringify(record, null, 2) + "\n")
  console.log(JSON.stringify(record))
} finally { rmSync(temporary, { recursive: true, force: true }) }
