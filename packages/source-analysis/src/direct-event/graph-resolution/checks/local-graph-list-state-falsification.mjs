import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { pathToFileURL } from "node:url"
const temporary = mkdtempSync(join(tmpdir(), "hapsland-trie-laws-"))
try {
  const emitted = join(temporary, "invariant.mjs")
  execFileSync("bend", [resolve(import.meta.dirname, "local-graph-representation-prototypes/list-state/INVARIANT.bend"), "-o", emitted], { timeout: 5000 })
  const core = (await import(pathToFileURL(emitted))).default
  const nil = () => ({ $: "Own.DNil" })
  const cons=(key,rest=nil(),count=1)=>({$:"Own.DCon",key,value:7,rest,count})
  const malformed=[cons(0,nil(),0),cons(0,nil(),2),cons(1,cons(1),2),cons(1,cons(2,nil(),0),2),cons(1,cons(2),3)]
  for (const dictionary of malformed) assert.equal(core.valid(dictionary), false, "malformed structure accepted")
  assert.equal(core.valid(nil()), true)
  let random = 918273
  const draw = () => { random = (Math.imul(random, 1664525) + 1013904223) >>> 0; return random }
  const edges = [0, 1, 2, 3, 0x7fffffff, 0x80000000, 0x80000001, 0xfffffffe, 0xffffffff]
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
      assert.equal(Number(core.records(dictionary)), oracle.size)
      assert.equal(core["Own.contains"](dictionary, key), true)
      assert.equal(core["Own.lookup"](65536, dictionary, key), value)
      for (const probe of pool) {
        assert.equal(core["Own.lookup"](65536, dictionary, probe), oracle.get(probe) ?? 65536, `lookup history ${history}/${step}/${probe}`)
        assert.equal(core["Own.contains"](dictionary, probe), oracle.has(probe))
        lookupChecks++
      }
      updates++
    }
  }
  let rawChecks=0
  for(let trial=0;trial<64;trial++){
    const records=Array.from({length:12},()=>[draw()%8,draw()%256])
    const raw=records.reduceRight((rest,[key,value])=>({$:"Own.DCon",key,value,rest,count:99}),nil())
    const oracle=new Map();for(const [key,value] of records)if(!oracle.has(key))oracle.set(key,value)
    const key=draw()%10,value=draw()%256,updated=core["Own.set"](raw,key,value)
    oracle.set(key,value)
    for(let probe=0;probe<12;probe++){
      assert.equal(core["Own.lookup"](65536,updated,probe),oracle.get(probe)??65536)
      assert.equal(core["Own.contains"](updated,probe),oracle.has(probe))
      rawChecks++
    }
  }
  const record = { passed: true, rawChecks, updates, lookupChecks, malformedRejected: malformed.length, histories: 64, scope: "emitted structural cached-list finite falsification: uint32 edges/high bit/zero, repeated insertion and overwrite; independent native Map oracle, invariant/count checks after every update; no universal proof or whole planner qualification" }
  writeFileSync(resolve(import.meta.dirname, "local-graph-list-state-falsification.json"), JSON.stringify(record, null, 2) + "\n")
  console.log(JSON.stringify(record))
} finally { rmSync(temporary, { recursive: true, force: true }) }
