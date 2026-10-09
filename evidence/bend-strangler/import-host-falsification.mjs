import assert from 'node:assert/strict'
import {readFileSync,writeFileSync,rmSync} from 'node:fs'
import {resolve,dirname} from 'node:path'
import {pathToFileURL} from 'node:url'
const root=resolve(import.meta.dirname,'../..')
const baseline=process.env.HAPSLAND_PERFORMANCE_BASELINE_ROOT??'/workspace/typescript/hapsland-bend-baseline-compatible-4843e8d1'
const sourcePath=resolve(baseline,'packages/source-analysis/dist/direct-event/languages/typescript-functions.js')
const original=readFileSync(sourcePath,'utf8')
const artifact=process.env.HAPSLAND_IMPORT_ARTIFACT??resolve(root,'packages/agent-flow-bend/dist/import-policy.generated.js')
const paths=['native','staged'].map(label=>resolve(dirname(sourcePath),`.import-${label}-${process.pid}.mjs`))
let changed=original
for(const [before,after] of [
 ['imported === undefined || local === undefined || imports.has(local)','!api.importNativeSpecifierAdmission(imported, local, imports)'],
 ['local === undefined || imports.has(local)','!api.importNativeNamespaceAdmission(local, imports)'],
 ['module === undefined || clause === undefined','!api.importNativeReady(module, clause)'],
 ['/^import\\s+type\\b/u.test(node.text) || /^type\\b/u.test(specifier.text)','api.importNativeTypeOnly(node, specifier)']
]){assert.equal(changed.split(before).length,2,before);changed=changed.replace(before,after)}
let cases=0,exceptionCases=0
try{
 writeFileSync(paths[0],original+'\nexport {collectImportSpecifiers,collectFunctionImports};\n')
 writeFileSync(paths[1],`import * as api from ${JSON.stringify(pathToFileURL(artifact).href)};\n`+changed+'\nexport {collectImportSpecifiers,collectFunctionImports};\n')
 const [native,staged]=await Promise.all(paths.map(path=>import(pathToFileURL(path))))
 function run(fn,config,throwAt=Infinity){
  const trace=[],map=new Map(config.duplicate?[['X',{existing:true}]]:[])
  const touch=(event,value)=>{trace.push(event);if(trace.length===throwAt)throw Error('injected');return value}
  const node=(label,type,text,children=[])=>({get type(){return touch(label+'.type',type)},get text(){return touch(label+'.text',text)},get namedChildren(){return touch(label+'.children',children)}})
  const name=(label,text)=>node(label,'identifier',text)
  const ns=node('namespace','namespace_import','',[...(config.namespaceName===undefined?[]:[name('nsname',config.namespaceName)])])
  const first=node('first','import_specifier',config.specifierType?'type X':'X',[name('firstName','A')])
  const last=node('last','import_specifier',config.specifierType?'type X':'X',config.single?[name('lastName',config.local)]:[name('imported',config.imported),name('local',config.local)])
  const clause=node('clause','import_clause','',[...(config.namespace?[ns]:[]),...(config.prior?[first]:[]),last])
  const statement=node('statement','import_statement',config.statementType?'import type { X } from "m"':'import { X } from "m"')
  const imports={get has(){return touch('map.has.method',key=>touch('map.has:'+key,map.has(key)))},get set(){return touch('map.set.method',(key,value)=>{touch('map.set:'+key);map.set(key,value)})}}
  let result,error
  try{result=fn(statement,clause,'',imports)}catch(e){error=e.message}
  return {trace,result,error,entries:[...map]}
 }
 for(const namespace of [false,true])for(const namespaceName of [undefined,'','X'])for(const imported of [undefined,'','Y'])for(const local of [undefined,'','X'])for(const duplicate of [false,true])for(const statementType of [false,true])for(const specifierType of [false,true])for(const single of [false,true])for(const prior of [false,true]){
  const config={namespace,namespaceName,imported,local,duplicate,statementType,specifierType,single,prior}
  const expected=run(native.collectImportSpecifiers,config)
  assert.deepEqual(run(staged.collectImportSpecifiers,config),expected);cases++
  for(let at=1;at<=expected.trace.length;at++){
   assert.deepEqual(run(staged.collectImportSpecifiers,config,at),run(native.collectImportSpecifiers,config,at));exceptionCases++
  }
 }
 const record={passed:true,cases,exceptionCases,scope:'actual compiled native collectImportSpecifiers versus same helper composed with generated admission/type-only binders; controlled AST getters, Map method acquisition/writes, partial state and injected exceptions; empty strings and repeated single-identifier reads; no real parser or complete import extraction proof'}
 writeFileSync(resolve(root,'evidence/bend-strangler/import-host-falsification.json'),JSON.stringify(record,null,2)+'\n');console.log(JSON.stringify(record))
}finally{for(const path of paths)rmSync(path,{force:true})}
