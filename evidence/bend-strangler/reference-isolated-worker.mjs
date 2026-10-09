import assert from 'node:assert/strict'
import {readFileSync,writeFileSync} from 'node:fs'
import {performance} from 'node:perf_hooks'
const [root,mode]=process.argv.slice(2),sources=JSON.parse(readFileSync('/tmp/hapsland-reference-isolated-fixtures.json','utf8'))
const {analyzeFunctionFile}=await import(root+'/packages/source-analysis/dist/direct-event/languages/typescript-functions.js')
const normalize=value=>JSON.stringify(value,(_,v)=>v instanceof Map?{map:[...v]}:v instanceof Set?{set:[...v]}:v)
const actual=sources.map(source=>{const value=analyzeFunctionFile('src/example.ts',source);assert.notEqual(value,undefined);return normalize(value)})
if(mode==='prepare'){writeFileSync('/tmp/hapsland-reference-isolated-golden.json',JSON.stringify(actual));process.exit(0)}
const expected=JSON.parse(readFileSync('/tmp/hapsland-reference-isolated-golden.json','utf8'));assert.deepEqual(actual,expected)
const rounds=20,siteSource='return ()=>{let sum=0;for(let round=0;round<rounds;round++)for(let i=0;i<sources.length;i++){const value=analyze("src/example.ts",sources[i]);if(value===undefined)throw new Error("missing analysis");const result=normalize(value);if(result!==expected[i])throw new Error("analysis drift");sum+=result.length}return sum}'
const sites=[0,1].map(()=>new Function('sources','expected','normalize','rounds','analyze',siteSource)(sources,expected,normalize,rounds,analyzeFunctionFile))
let checksum
for(let warmup=0;warmup<5;warmup++)for(const site of sites){const value=site();checksum??=value;assert.equal(value,checksum)}
const cpu=process.cpuUsage(),start=performance.now();for(const site of sites)assert.equal(site(),checksum);const seconds=(performance.now()-start)/1000,used=process.cpuUsage(cpu)
console.log(JSON.stringify({seconds,cpuSeconds:(used.user+used.system)/1e6,checksum,fixtures:sources.length,rounds,warmups:5,callers:2,definedAndEqual:true,runtime:Bun.version}))
