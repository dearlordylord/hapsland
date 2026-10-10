import assert from 'node:assert/strict'
import {execFileSync} from 'node:child_process'
import {mkdtempSync,writeFileSync,rmSync,readFileSync,readdirSync,copyFileSync} from 'node:fs'
import {join} from 'node:path'
import {createHash} from 'node:crypto'
import {createGraphFixtures} from './fixtures.mjs'
assert.equal(process.env.HAPSLAND_WHOLE_DIAGNOSTIC_ROUNDS,undefined,'diagnostic round selection cannot qualify complete consumer')
assert.equal(process.env.HAPSLAND_WHOLE_OPERATION_COUNTS,undefined,'instrumented operation counts are diagnostic only')
assert.equal(process.env.HAPSLAND_WHOLE_BOUNDARY_TIMINGS,undefined,'instrumented boundary timing is diagnostic only')
assert.ok(!process.env.HAPSLAND_WHOLE_PROFILE,'CPU profiling cannot qualify complete consumer')
assert.ok(!process.env.HAPSLAND_WHOLE_CASE_TIMINGS,'case timing instrumentation cannot qualify complete consumer')
assert.ok(!process.env.HAPSLAND_WHOLE_TARGET_PROFILE,'instrumented registration cannot qualify complete consumer')
assert.ok(!process.env.HAPSLAND_WHOLE_COMPLETION_PROFILE,'instrumented completion cannot qualify complete consumer')
assert.ok(!process.env.HAPSLAND_WHOLE_PRODUCT_VALUES,'instrumented product collection cannot qualify complete consumer')
assert.ok(!process.env.HAPSLAND_WHOLE_DIAGNOSTIC_FIXTURE,'isolated diagnostic cannot qualify complete consumer')
const temporary=mkdtempSync('/tmp/hapsland-whole-pairs-'),goldenPath=join(temporary,'golden.json')
const runtime=process.env.HAPSLAND_WHOLE_BENCH_RUNTIME??process.execPath
const pairs=Number(process.env.HAPSLAND_WHOLE_BENCH_PAIRS??17)
assert.ok(Number.isSafeInteger(pairs)&&pairs>=1&&pairs<=17)
const deadlineSeconds=Number(process.env.HAPSLAND_WHOLE_BENCH_DEADLINE_SECONDS??180)
assert.ok(Number.isSafeInteger(deadlineSeconds)&&deadlineSeconds>=60&&deadlineSeconds<=720)
const worker=join(import.meta.dirname,'connected-worker.mjs'),startedAt=new Date().toISOString(),stop=Date.now()+deadlineSeconds*1000
const stableCaptureLane=process.env.HAPSLAND_WHOLE_STABLE_CAPTURE==='1'
const expectedCases=createGraphFixtures().filter(fixture=>!stableCaptureLane||!fixture.unavailable).length+(stableCaptureLane?2:0)
const outputLane=stableCaptureLane?'connected-stable-':'connected-'
const samples={typescript:[],wholeBend:[]};let artifactHash
const sourceFiles=[...readdirSync(import.meta.dirname).filter(name=>/\.(bend|mjs|js)$/.test(name)).map(name=>'whole-resolver/'+name),
 'whole-resolver-runtime-probe/transport.mjs','local-graph-draft/core.bend','local-graph-draft/Traversal.bend',
 '../../packages/agent-flow-bend/ImportGraph.bend',
 '../../packages/source-analysis/dist/direct-event/graph-resolver.js',
 '../../packages/source-analysis/dist/direct-event/languages/typescript.js',
 '../../packages/source-analysis/dist/direct-event/languages/python.js',
 '../../packages/source-analysis/dist/direct-event/languages/rust.js',
 '../../packages/source-analysis/dist/direct-event/languages/rust-module-context.js',
 '../../packages/source-analysis/dist/direct-event/languages/bend/adapter.js']
const hashes=()=>Object.fromEntries(sourceFiles.sort().map(name=>[name,createHash('sha256').update(readFileSync(join(import.meta.dirname,'..',name))).digest('hex')]))
const sourceHashes=hashes()
const run=(lane,mode)=>{const before=performance.now();const output=execFileSync('taskset',['-c','11',runtime,worker,lane,mode,goldenPath],{encoding:'utf8',env:{...process.env,HAPSLAND_WHOLE_RUNTIME_ARTIFACT:join(temporary,'runtime.mjs'),HAPSLAND_WHOLE_RUNTIME_SHA256:artifactHash},timeout:Math.min(45000,stop-Date.now()),maxBuffer:4*1024*1024});return{output,workerSeconds:(performance.now()-before)/1000}}
try{
 const artifactPath=join(temporary,'runtime.mjs')
 const frozenManifestPath=process.env.HAPSLAND_WHOLE_RUNTIME_MANIFEST
 if(frozenManifestPath){
  const manifest=JSON.parse(readFileSync(frozenManifestPath,'utf8'))
  assert.equal(manifest.entry,join(import.meta.dirname,'Runtime.bend'),'manifest owns actual complete Runtime')
  for(const [source,digest] of Object.entries(manifest.sources))assert.equal(createHash('sha256').update(readFileSync(join(import.meta.dirname,'../../..',source))).digest('hex'),digest,'emitted Runtime source unchanged: '+source)
  assert.equal(createHash('sha256').update(readFileSync(manifest.artifact)).digest('hex'),manifest.artifactHash,'previously qualified complete emitted artifact')
  copyFileSync(manifest.artifact,artifactPath)
 }else execFileSync('bend',[join(import.meta.dirname,'Runtime.bend'),'-o',artifactPath],{timeout:5000})
 artifactHash=createHash('sha256').update(readFileSync(artifactPath)).digest('hex')
 if(!stableCaptureLane)run('typescript','prepare')
 for(let pair=0;pair<pairs;pair++){
  const lanes=pair%2?['wholeBend','typescript']:['typescript','wholeBend']
  for(const lane of lanes){assert.ok(Date.now()<stop);const {output,workerSeconds}=run(lane,'measure'),sample={...JSON.parse(output),workerSeconds};if(lane==='wholeBend')assert.equal(sample.runtimeArtifactHash,artifactHash,'worker emitted artifact verification');samples[lane].push(sample);console.log(JSON.stringify({pair,...sample}))}
 }
 const mean=xs=>xs.reduce((sum,x)=>sum+x.seconds,0)/xs.length,ratio=mean(samples.wholeBend)/mean(samples.typescript)
 if(stableCaptureLane){for(const sample of Object.values(samples).flat()){assert.equal(sample.cases,expectedCases);assert.equal(sample.rounds,3);for(const field of ['allResultsAndEffectsEqual','actualStableCapture','physicalRootIdentity','nativeReferenceSamePhysicalFiles','fullCaptureCacheMetadataCompared','sourceReadEffectsCompared','registryClosed'])assert.equal(sample[field],true,field+' mandatory physical qualification');assert.equal(typeof sample.productChecksum,'string');assert.equal(typeof sample.checksum,'string')}assert.equal(new Set(Object.values(samples).flat().map(x=>x.productChecksum)).size,1,'portable product/error equality; full physical metadata checked within each worker')}else assert.equal(new Set(Object.values(samples).flat().map(x=>x.checksum)).size,1)
 assert.deepEqual(hashes(),sourceHashes,'measurement sources changed during pairs')
 assert.equal(createHash('sha256').update(readFileSync(join(temporary,'runtime.mjs'))).digest('hex'),artifactHash,'frozen emitted runtime')
 const record={actualStableCapture:stableCaptureLane,crossWorkerComparison:stableCaptureLane?'secondary portable product/error checksum only; primary full result/effect/cache metadata equality against native on same physical files inside every worker':'full checksum',workerDeadlineSeconds:45,deadlineDeclaration:stableCaptureLane?'Declared stablecapture series360s inner375s outer from measuredpilot worker5.2066+6.6404s:17pairs predict201s beforevariance. Full17pairs/threshold1/sourceandartifactguards unchanged; pilot retained separately.':'Astra-agreed720s series750s outer: observed17.486+15.313 worker seconds imply17pairs approximately558s before variance/setup; previous20s worker failures retained. Samples/warmups/isolation/CPU11/threshold unchanged.',artifactHash,artifactPreparation:frozenManifestPath?'Previously qualified complete Runtime emission reused after verifying every recorded transitive source and artifact hash; identical artifact loaded in each isolated worker; compilation/import excluded.':'Single pinned Runtime emission before paired workers, max5s; identical artifact loaded in each isolated worker; compilation/import excluded as before.',packagedRuntime:process.env.HAPSLAND_WHOLE_PACKAGE_RUNTIME==='1',startedAt,at:new Date().toISOString(),runtime,pairs,deadlineSeconds,samples,meanRatio:ratio,executionParity:pairs===17&&ratio<=1,qualification:pairs===17?'complete declared17pair series':'bounded preflight; no17pair parity claim',sourceHashes,
  scope:stableCaptureLane?'Complete unadopted cancellation-capable Effect resolver with actual stable filesystem capture on the complete declared Linux fixture set, including Python, including rootidentity mismatch and between-read filechange refusals. Everyworker compares native and candidate on samephysicalfiles with fullmetadata/effects/cache equality everyround; portable product/error checksum is only secondarycrossworker check. Three measuredsweeps, actualcapture/foreigncalls/encoding/sessioncleanupincluded, setup/emission/import/startup/warmupexcluded; declared alternatingisolated CPU11workers, threshold1. No generalfilesystem/cancellation/platform/proof/adoption claim.':'Complete unadopted resolveGraphUnit candidate, all declared physical TS/function/Bend/Rust/Cargo/module fixtures, exact full ordered result/errors/clock/capture/cache/diagnostics outside timing; session construction, actual foreign dispatch, physical filesystem access/status, fixture capture provider, native frontends, encoding, result conversion and cleanup included; fixture setup, artifact compilation/import, subprocess startup and one warmup excluded; three measured sweeps, alternating isolated workers, CPU11 nonexclusive; stable filesystem capture, cancellation, rootIdentity and complete service trace not qualified; no whole laws/proof or adoption claim'}
 writeFileSync(join(import.meta.dirname,outputLane+(runtime.includes('bun')?'bun':'node')+'-performance.json'),JSON.stringify(record,null,2)+'\n')
 console.log(JSON.stringify({meanRatio:ratio,executionParity:pairs===17&&ratio<=1,pairs}))
}catch(error){writeFileSync(join(import.meta.dirname,outputLane+(runtime.includes('bun')?'bun':'node')+'-incomplete.json'),JSON.stringify({startedAt,at:new Date().toISOString(),runtime,pairs,deadlineSeconds,samples,sourceHashes,artifactHash,status:'incomplete',error:{name:error.name,message:error.message},executionParity:false},null,2)+'\n');throw error}finally{rmSync(temporary,{recursive:true,force:true})}
