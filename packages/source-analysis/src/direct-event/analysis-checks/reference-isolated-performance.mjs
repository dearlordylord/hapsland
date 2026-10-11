import {execFileSync} from 'node:child_process'
import {writeFileSync,mkdtempSync,rmSync} from 'node:fs'
import {resolve,join} from 'node:path'
import {tmpdir} from 'node:os'
import assert from 'node:assert/strict'
const roots={typescript:process.env.HAPSLAND_PERFORMANCE_BASELINE_ROOT??'/workspace/typescript/hapsland-bend-baseline-master-5726758e',integratedBend:process.env.HAPSLAND_PERFORMANCE_CANDIDATE_ROOT??resolve(import.meta.dirname,'../../../../..')}
const pairs=Number(process.env.HAPSLAND_BENCH_PAIRS??17);assert.ok(Number.isSafeInteger(pairs)&&pairs>0&&pairs<=17)
const temporary=mkdtempSync(join(tmpdir(),'hapsland-reference-bench-')),goldenPath=join(temporary,'golden.json')
const bun=roots.integratedBend+'/node_modules/bun/bin/bun.exe',worker=resolve(import.meta.dirname,'./reference-isolated-worker.mjs'),startedAt=new Date().toISOString(),samples={typescript:[],integratedBend:[]},stop=Date.now()+180000
try{
execFileSync('taskset',['-c','11',bun,worker,roots.typescript,'prepare',goldenPath],{timeout:20000})
for(let pair=0;pair<pairs;pair++){const order=Object.entries(roots);if(pair%2)order.reverse();for(const [lane,root] of order){assert.ok(Date.now()<stop);const output=execFileSync('taskset',['-c','11',bun,worker,root,'measure',goldenPath],{encoding:'utf8',timeout:Math.min(20000,stop-Date.now())});const sample=JSON.parse(output);assert.ok(sample.definedAndEqual);samples[lane].push(sample);console.log(JSON.stringify({pair,lane,...sample}));writeFileSync('/tmp/hapsland-reference-isolated-progress.json',JSON.stringify({startedAt,samples},null,2))}}
const mean=xs=>xs.reduce((sum,x)=>sum+x.seconds,0)/xs.length,ratio=mean(samples.integratedBend)/mean(samples.typescript)
const checksums=new Set(Object.values(samples).flat().map(sample=>sample.checksum));assert.equal(checksums.size,1)
const result={measuredPairs:pairs,allChecksumsMatch:true,startedAt,at:new Date().toISOString(),roots,samples,meanRatio:ratio,executionParity:ratio<=1,scope:'actual compiled full TypeScript file analyzer with native parse; one checkout per isolated Bun worker avoids native wrapper cross-import interference; seven offline fixtures and full Map/Set serialized equality on every analysis; five warmups then two caller sites per sample,20rounds;17alternating paired workers,CPU11nonexclusive; subprocess startup/import/warmup excluded; previous helper failures retained; no cold IPC/platform/whole product claim'}
writeFileSync('/tmp/hapsland-reference-isolated-execution.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({ratio,executionParity:ratio<=1}))

}finally{rmSync(temporary,{recursive:true,force:true})}
