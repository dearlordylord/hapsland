import assert from 'node:assert/strict'
import {execFileSync} from 'node:child_process'
import {mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs'
import {resolve,join} from 'node:path'
import {pathToFileURL} from 'node:url'
import {createHash} from 'node:crypto'
const folder=import.meta.dirname,root=resolve(folder,'../../../../../..'),temp=mkdtempSync('/tmp/hapsland-whole-resolver-foreign-')
try{
 const compiler=execFileSync('bend',['version'],{encoding:'utf8',timeout:5000}).trim();assert.equal(compiler,'bend 2.0.36')
 const program=join(temp,'program.js'),bootstrap=join(temp,'bootstrap.mjs')
 execFileSync('bend',[join(folder,'./Runtime.bend'),'-o',program],{timeout:5000})
 writeFileSync(bootstrap,`import {Parser,TypeScript} from ${JSON.stringify(pathToFileURL(join(root,'packages/source-analysis/dist/direct-event/languages/native-parser.js')).href)};
 globalThis.__hapslandWholeResolverProbeEngine=Object.freeze({Parser,TypeScript});
 await import(${JSON.stringify(pathToFileURL(program).href)});\n`)
 const expected='accepted:program:38:2\nsyntax-refusal:program:11\nengine-failure\n',lanes={bun:join(root,'node_modules/bun/bin/bun.exe'),node:'node'},samples={}
 for(const [lane,binary]of Object.entries(lanes)){
  const output=execFileSync(binary,[bootstrap],{encoding:'utf8',timeout:10000});assert.equal(output,expected);samples[lane]={output,exitCode:0}
 }
 const hashes=Object.fromEntries(['./Runtime.bend','./parser.js','./run.mjs'].map(name=>[name,createHash('sha256').update(readFileSync(join(folder,name))).digest('hex')]))
 const record={at:new Date().toISOString(),compiler,scope:'mechanism feasibility only; actual Bend-owned IO continuation calls tree-sitter TypeScript engine through foreign JS. Not whole resolver implementation, pure proof, production adoption or timing qualification.',samples,sourceHashes:hashes,encoding:{source:'JS text delivered to pinned parser; fixture includes astral Unicode; no text printed',positions:'UTF-16 indices; valid fixture38codeunits; invalid11',root:'typed parser metadata only'},resources:{owner:'foreign call creates Parser and holds Tree/Node only locally; reset in finally; no native handle crosses typedreply',release:'native allocations finalized by Node binding GC; reset is not deterministic Tree disposal'},requiredLaneEvidence:'current installed product bundles generated JavaScript; Bun and Node Linuxarm64 source runtime exercised; no C/nativeBend or macOS claim',boundary:'no GraphFrame/session.inspect/executeGraphCommand or application graph decisions in foreign binding; syntaxhasError returned asfact, branch selected in Bend'}
 writeFileSync(join(folder,'evidence.json'),JSON.stringify(record,null,2)+'\n');console.log(JSON.stringify({compiler,lanes:Object.keys(samples),actualForeignCall:true,fullResolverAccepted:false}))
}finally{rmSync(temp,{recursive:true,force:true})}
