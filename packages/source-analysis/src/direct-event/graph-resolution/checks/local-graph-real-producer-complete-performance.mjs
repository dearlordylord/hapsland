import {execFileSync} from 'node:child_process'
import {writeFileSync,mkdtempSync,rmSync} from 'node:fs'
import {resolve,join} from 'node:path'
import {tmpdir} from 'node:os'
import assert from 'node:assert/strict'
const roots={typescript:process.env.HAPSLAND_PERFORMANCE_BASELINE_ROOT??'/workspace/typescript/hapsland-bend-baseline-master-5726758e',integratedBend:process.env.HAPSLAND_PERFORMANCE_CANDIDATE_ROOT??resolve(import.meta.dirname,'../../../../../..')}
const pairs=Number(process.env.HAPSLAND_BENCH_PAIRS??17);assert.ok(Number.isSafeInteger(pairs)&&pairs>0&&pairs<=17)
const temporary=mkdtempSync(join(tmpdir(),'hapsland-reference-bench-')),goldenPath=join(temporary,'golden.json')
const bun=roots.integratedBend+'/node_modules/bun/bin/bun.exe',worker=resolve(import.meta.dirname,'local-graph-real-producer-complete-worker.mjs'),startedAt=new Date().toISOString(),samples={typescript:[],integratedBend:[]},stop=Date.now()+180000
try{
execFileSync('bend',[resolve(import.meta.dirname,'local-graph-representation-prototypes/split-symbol/core.bend'),'-o','/tmp/hapsland-real-graph-symbol-core.mjs'],{timeout:5000})
execFileSync('taskset',['-c','11',bun,worker,roots.typescript,'native','prepare',goldenPath,'/tmp/hapsland-real-graph-symbol-core.mjs'],{timeout:20000})
for(let pair=0;pair<pairs;pair++){const order=Object.entries(roots);if(pair%2)order.reverse();for(const [lane,root] of order){assert.ok(Date.now()<stop);const output=execFileSync('taskset',['-c','11',bun,worker,root,lane==='integratedBend'?'bend':'native','measure',goldenPath,'/tmp/hapsland-real-graph-symbol-core.mjs'],{encoding:'utf8',timeout:Math.min(20000,stop-Date.now())});const sample=JSON.parse(output);assert.ok(sample.fullEqual);samples[lane].push(sample);console.log(JSON.stringify({pair,lane,...sample}));writeFileSync('/tmp/hapsland-real-graph-complete-progress.json',JSON.stringify({startedAt,samples},null,2))}}
const mean=xs=>xs.reduce((sum,x)=>sum+x.seconds,0)/xs.length,ratio=mean(samples.integratedBend)/mean(samples.typescript)
const checksums=new Set(Object.values(samples).flat().map(sample=>sample.checksum));assert.equal(checksums.size,1)
const result={measuredPairs:pairs,allChecksumsMatch:true,startedAt,at:new Date().toISOString(),roots,samples,meanRatio:ratio,executionParity:ratio<=1,scope:'experimental real compiled TypeScript functionFacts producer plus entire local graph planner; native owner buildLocal exposed without policy replacement; candidate compressed structural trie and Nat metadata plus selector-only labels with exact registry lookup/label reuse and allocation-linear ordered dictionary decoding, full bundled payloads and validating registry decoding whole Bend DFS plus encoding/materialization; 7offline fixtures including1missing-root; full nested tree, ordered queues and extensional sets/budgets equal everycall;20rounds5warmups17paired isolated Bunworkers CPU11nonexclusive; no cross-file IO, cold-start, universal-proof or production integration claim'}
writeFileSync('/tmp/hapsland-real-graph-complete-execution.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({ratio,executionParity:ratio<=1}))

}finally{rmSync(temporary,{recursive:true,force:true})}
