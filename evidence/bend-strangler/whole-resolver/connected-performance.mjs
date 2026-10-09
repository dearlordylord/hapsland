import assert from 'node:assert/strict'
import {execFileSync} from 'node:child_process'
import {mkdtempSync,writeFileSync,rmSync,readFileSync,readdirSync} from 'node:fs'
import {join} from 'node:path'
import {createHash} from 'node:crypto'
assert.ok(!process.env.HAPSLAND_WHOLE_TARGET_PROFILE,'instrumented registration cannot qualify complete consumer')
assert.ok(!process.env.HAPSLAND_WHOLE_COMPLETION_PROFILE,'instrumented completion cannot qualify complete consumer')
assert.ok(!process.env.HAPSLAND_WHOLE_PRODUCT_VALUES,'instrumented product collection cannot qualify complete consumer')
assert.ok(!process.env.HAPSLAND_WHOLE_DIAGNOSTIC_FIXTURE,'isolated diagnostic cannot qualify complete consumer')
const temporary=mkdtempSync('/tmp/hapsland-whole-pairs-'),goldenPath=join(temporary,'golden.json')
const runtime=process.env.HAPSLAND_WHOLE_BENCH_RUNTIME??process.execPath
const pairs=Number(process.env.HAPSLAND_WHOLE_BENCH_PAIRS??17)
assert.ok(Number.isSafeInteger(pairs)&&pairs>=1&&pairs<=17)
const deadlineSeconds=Number(process.env.HAPSLAND_WHOLE_BENCH_DEADLINE_SECONDS??180)
assert.ok(Number.isSafeInteger(deadlineSeconds)&&deadlineSeconds>=60&&deadlineSeconds<=310)
const worker=join(import.meta.dirname,'connected-worker.mjs'),startedAt=new Date().toISOString(),stop=Date.now()+deadlineSeconds*1000
const samples={typescript:[],wholeBend:[]}
const sourceFiles=[...readdirSync(import.meta.dirname).filter(name=>/\.(bend|mjs|js)$/.test(name)).map(name=>'whole-resolver/'+name),
 'whole-resolver-runtime-probe/transport.mjs','local-graph-draft/core.bend',
 '../../packages/agent-flow-bend/ImportGraph.bend',
 '../../packages/source-analysis/dist/direct-event/graph-resolver.js',
 '../../packages/source-analysis/dist/direct-event/languages/typescript.js',
 '../../packages/source-analysis/dist/direct-event/languages/rust.js',
 '../../packages/source-analysis/dist/direct-event/languages/rust-module-context.js',
 '../../packages/source-analysis/dist/direct-event/languages/bend/adapter.js']
const hashes=()=>Object.fromEntries(sourceFiles.sort().map(name=>[name,createHash('sha256').update(readFileSync(join(import.meta.dirname,'..',name))).digest('hex')]))
const sourceHashes=hashes()
const run=(lane,mode)=>{const before=performance.now();const output=execFileSync('taskset',['-c','11',runtime,worker,lane,mode,goldenPath],{encoding:'utf8',timeout:Math.min(20000,stop-Date.now()),maxBuffer:4*1024*1024});return{output,workerSeconds:(performance.now()-before)/1000}}
try{
 run('typescript','prepare')
 for(let pair=0;pair<pairs;pair++){
  const lanes=pair%2?['wholeBend','typescript']:['typescript','wholeBend']
  for(const lane of lanes){assert.ok(Date.now()<stop);const {output,workerSeconds}=run(lane,'measure'),sample={...JSON.parse(output),workerSeconds};samples[lane].push(sample);console.log(JSON.stringify({pair,...sample}))}
 }
 const mean=xs=>xs.reduce((sum,x)=>sum+x.seconds,0)/xs.length,ratio=mean(samples.wholeBend)/mean(samples.typescript)
 assert.equal(new Set(Object.values(samples).flat().map(x=>x.checksum)).size,1)
 assert.deepEqual(hashes(),sourceHashes,'measurement sources changed during pairs')
 const record={packagedRuntime:process.env.HAPSLAND_WHOLE_PACKAGE_RUNTIME==='1',startedAt,at:new Date().toISOString(),runtime,pairs,deadlineSeconds,samples,meanRatio:ratio,executionParity:ratio<=1,sourceHashes,
  scope:'Complete unadopted resolveGraphUnit candidate, all declared physical TS/function/Bend/Rust/Cargo/module fixtures, exact full ordered result/errors/clock/capture/cache/diagnostics outside timing; session construction, actual foreign dispatch, physical filesystem access/status, fixture capture provider, native frontends, encoding, result conversion and cleanup included; fixture setup, artifact compilation/import, subprocess startup and one warmup excluded; three measured sweeps, alternating isolated workers, CPU11 nonexclusive; stable filesystem capture, cancellation, rootIdentity and complete service trace not qualified; no whole laws/proof or adoption claim'}
 writeFileSync(join(import.meta.dirname,'connected-'+(runtime.includes('bun')?'bun':'node')+'-performance.json'),JSON.stringify(record,null,2)+'\n')
 console.log(JSON.stringify({meanRatio:ratio,executionParity:ratio<=1}))
}finally{rmSync(temporary,{recursive:true,force:true})}
