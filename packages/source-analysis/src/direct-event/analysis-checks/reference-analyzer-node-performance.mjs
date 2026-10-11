import assert from 'node:assert/strict'
import {writeFileSync,readFileSync} from 'node:fs'
import {createHash} from 'node:crypto'
import {performance} from 'node:perf_hooks'
const baselineRoot='/workspace/typescript/hapsland-bend-baseline-master-5726758e',root='/workspace/typescript/hapsland-bend-selection-ui'
const modulePath='/packages/source-analysis/dist/direct-event/languages/typescript-functions.js'
const baseline=await import(baselineRoot+modulePath),candidate=await import(root+modulePath)
const sources=[
"import type { Thing as Item } from './thing'; import { help as helper } from './help'; interface Local { value: number } function sibling(x: Local): Local { return x } export function run(item: Item): Local { helper(item); return sibling({ value: 1 }) }",
"function f(helper: () => void) { helper(); obj.method(); factory()[key](); missing() }",
"function helper() { return 1 } function run() { return helper }",
"import type { String } from './types'; type Local<T> = Readonly<T>; function run(x: String): Local<String> { return x }",
"interface Item { value: number } function help(x: Item): Item { return x } const run = (x: Item): Item => help(x)",
"function f(x: string): string; function f(x: string) { return x }",
"import { Effect } from 'effect'; interface Item { value: number } const run = Effect.fn('run')(function* (x: Item) { return x })"
]
const normalize=value=>JSON.stringify(value,(_,v)=>v instanceof Map?{map:[...v]}:v instanceof Set?{set:[...v]}:v)
const expected=sources.map(source=>{const a=baseline.analyzeFunctionFile('src/example.ts',source),b=candidate.analyzeFunctionFile('src/example.ts',source);assert.notEqual(a,undefined);assert.notEqual(b,undefined);assert.deepEqual(b,a);return normalize(a)})
const rounds=10,siteSource='return analyze=>{let sum=0;for(let round=0;round<rounds;round++)for(let i=0;i<sources.length;i++){const actual=normalize(analyze("src/example.ts",sources[i]));if(actual!==expected[i])throw new Error("analysis result drift");sum+=actual?.length??0}return sum}'
const sites=[0,1].map(()=>new Function('sources','expected','normalize','rounds',siteSource)(sources,expected,normalize,rounds))
const lanes={typescript:baseline.analyzeFunctionFile,integratedBend:candidate.analyzeFunctionFile},samples={typescript:[],integratedBend:[]},startedAt=new Date().toISOString();let checksum
for(let pair=0;pair<22;pair++){const order=Object.entries(lanes);if(pair%2)order.reverse();for(const [name,analyze]of order){let seconds=0;for(const site of sites){const start=performance.now(),actual=site(analyze);seconds+=(performance.now()-start)/1000;checksum??=actual;assert.equal(actual,checksum)}if(pair>=5)samples[name].push(seconds)}}
const mean=xs=>xs.reduce((a,b)=>a+b,0)/xs.length,ratio=mean(samples.integratedBend)/mean(samples.typescript)
const record={startedAt,at:new Date().toISOString(),fixtures:sources.length,sources,rounds,callers:2,warmupPairs:5,measuredPairs:17,samples,checksum,meanRatio:ratio,executionParity:ratio<=1,sourceHashes:Object.fromEntries([['baseline',baselineRoot],['candidate',root]].map(([name,path])=>[name,createHash('sha256').update(readFileSync(path+modulePath)).digest('hex')])),scope:'diagnostic actual compiled TypeScript file analyzer including native parse, callable/reference fact collection and full serialized Map/Set result equality; seven offline controlled source fixtures, two shared callers, alternating pairs, CPU11 nonexclusive; no IO, platform, whole product or cold-start claim; prior helper failures retained'}
writeFileSync('/tmp/hapsland-reference-analyzer-node-execution.json',JSON.stringify(record,null,2)+'\n');console.log(JSON.stringify({ratio,executionParity:ratio<=1}))
