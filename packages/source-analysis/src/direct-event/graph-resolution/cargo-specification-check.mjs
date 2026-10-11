import assert from 'node:assert/strict'
import {execFileSync} from 'node:child_process'
import {createHash} from 'node:crypto'
import {mkdirSync,mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs'
import {dirname,join,relative,extname,isAbsolute,sep} from 'node:path'
import {pathToFileURL} from 'node:url'
import {stringify,parse} from 'smol-toml'
import {tomlValue} from './frontend-codec.mjs'
import {unlist} from './service-session.mjs'
const folder=import.meta.dirname,root=join(folder,'../../../../..'),cache=join(root,'node_modules/.cache')
mkdirSync(cache,{recursive:true})
const temporary=mkdtempSync(join(cache,'cargo-specification-'))
const native=join(root,'packages/source-analysis/dist/direct-event/languages/rust-module-context.js')
const inputs=['CargoSpecification.bend','CargoSpecificationCheck.bend','Types.bend','cargo-specification-check.mjs','frontend-codec.mjs',native]
const hash=path=>createHash('sha256').update(readFileSync(path)).digest('hex')
const sources=Object.fromEntries(inputs.map(path=>[path,hash(isAbsolute(path)?path:join(folder,path))]))
try{
 assert.equal(sep,'/','this check qualifies Linux path algebra only')
 const emitted=join(temporary,'spec.mjs')
 execFileSync('bend',[join(folder,'CargoSpecificationCheck.bend'),'-o',emitted],{timeout:5000})
 const spec=(await import(pathToFileURL(emitted))).default
 const nativeCopy=join(temporary,'native.mjs')
 writeFileSync(nativeCopy,readFileSync(native,'utf8').replaceAll(/from "(\.{1,2}\/[^\"]+)"/g,(_all,path)=>`from "${pathToFileURL(join(dirname(native),path))}"`)+'\nexport {cargoTargetRoots};\n')
 const {cargoTargetRoots}=await import(pathToFileURL(nativeCopy))
 const within=path=>path!=='..'&&!path.startsWith('../')&&!isAbsolute(path)
 // Mechanical path realization of the returned ordered raw plan. The full
 // Bend roots/path driver is not qualified by this selection-only check.
 function realize(plan,base,path){
  if(plan.$==='None')return undefined
  const value=plan.value,paths=unlist(value.raw_targets).map(path=>join(base,path))
  if(value.automatic_binary){
   const tail=relative(join(base,'src/bin'),path)
   if(within(tail)&&tail!==''){
    const first=tail.split(sep)[0]
    paths.splice(Number(value.automatic_index),0,join(base,'src/bin',first.endsWith('.rs')?first:join(first,'main.rs')))
   }
  }
  return paths.some(path=>!within(path)||extname(path)!=='.rs')?undefined:paths
 }
 const packages=[{name:'demo',edition:'2024'},{name:'demo',edition:'2018',autolib:false},{name:'demo',edition:'2021',autobins:false},
  {name:'',edition:'2024'},{name:'demo',edition:'2015'},{name:'demo',edition:'2024',build:false},
  {name:'demo',edition:'2024',build:'script.rs'},{name:'demo',edition:'2024',autolib:'false'},
  {name:'demo',edition:'2024',autobins:'true'},{name:'demo',edition:2024}]
 const libraries=[undefined,{},false,{path:'custom.rs'},{path:''},{path:'/absolute.rs'},{path:'../outside.rs'},
  {path:'custom.RS'},{edition:'2024'},new Date('2024-01-01T00:00:00Z')]
 const binaries=[undefined,[],[{name:'one',path:'one.rs'}],[{name:'one',path:'one.rs'},{name:'one',path:'two.rs'}],
  [{name:'one',path:'one.rs'},{name:'two',path:'two.rs'}],[{name:'one',path:'/one.rs'}],
  [{name:'one',path:'one.rs',edition:'2024'}],[{name:'',path:'one.rs'}],[{}],false]
 const selected=['src/lib.rs','src/bin/tool.rs','src/bin/tool/deep.rs','tests/check.rs','build.rs','src/bin','../outside.rs']
 let comparisons=0,accepted=0
 for(const pkg of packages)for(const lib of libraries)for(const bin of binaries)for(const path of selected)for(const limit of [0,1,4]){
  const manifest={package:pkg,...(lib===undefined?{}:{lib}),...(bin===undefined?{}:{bin})}
  const source=stringify(manifest),syntax=parse(source),task='Cargo.toml',base=dirname(task)
  const expected=cargoTargetRoots(task,source,path,limit)
  const actual=realize(spec.select(tomlValue(syntax),relative(base,path),BigInt(limit)),base,path)
  assert.deepEqual(actual,expected,JSON.stringify({manifest,path,limit}));comparisons++;if(actual)accepted++
 }
 for(const kind of ['test','example','bench']){
  const manifest={package:{name:'demo',edition:'2024'},[kind]:[]},source=stringify(manifest)
  assert.deepEqual(realize(spec.select(tomlValue(parse(source)),'src/lib.rs',4n),'.','src/lib.rs'),cargoTargetRoots('Cargo.toml',source,'src/lib.rs',4));comparisons++
 }
 assert.deepEqual(Object.fromEntries(inputs.map(path=>[path,hash(isAbsolute(path)?path:join(folder,path))])),sources)
 const record={at:new Date().toISOString(),runtime:typeof Bun==='undefined'?'node':'bun',sources,comparisons,accepted,
  scope:'Independent Cargo relative target policy versus actual native cargoTargetRoots, with mechanical host path realization. Linux only; does not qualify full Bend path realization, Rust driver, ordered effects, universal laws, proofs or performance.'}
 writeFileSync(join(folder,'cargo-specification-'+record.runtime+'-evidence.json'),JSON.stringify(record,null,2)+'\n')
 console.log(JSON.stringify(record))
}finally{rmSync(temporary,{recursive:true,force:true})}
