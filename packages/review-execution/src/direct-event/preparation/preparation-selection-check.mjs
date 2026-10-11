import assert from 'node:assert/strict'
import {execFileSync} from 'node:child_process'
import {readFile,mkdtemp,rm} from 'node:fs/promises'
import {join} from 'node:path'
import {pathToFileURL} from 'node:url'
import {stripTypeScriptTypes} from 'node:module'
import {selectEditedRoots} from '../../../../native-observation/src/direct-event/edit-attribution.ts'
import {TYPE_INPUT_CONTRACT,FUNCTION_INPUT_CONTRACT} from '../../../../review-definition/src/rules/targets.ts'
const source=await readFile(join(import.meta.dirname,'../pipeline.ts'),'utf8')
const section=(start,end)=>source.slice(source.indexOf('const '+start+' ='),source.indexOf('const '+end+' ='))
const referenceCode=[section('analysisRoot','extractionFailures'),section('candidatePostEditHunks','capturedCandidateFiles'),section('isGraphInputContract','hasVerifiedClaudeSpan'),section('selectCapturedCandidate','positionBefore')].join('\n')
// Extract current private selection owners rather than copying their algorithm.
// Native patch verification and Go ambiguity-reason classification remain outside
// this declared selection-stage comparison and are still migration obligations.
const reference=new Function('selectEditedRoots','TYPE_INPUT_CONTRACT','FUNCTION_INPUT_CONTRACT','verifyCodexPostEditHunks','languageForPath',stripTypeScriptTypes(referenceCode,{mode:'transform'})+'\nreturn selectCapturedCandidate;')(selectEditedRoots,TYPE_INPUT_CONTRACT,FUNCTION_INPUT_CONTRACT,()=>{throw new Error('undeclared native patch fixture')},()=>undefined)
const temp=await mkdtemp('/tmp/hapsland-preparation-selection-')
try{
 const emitted=join(temp,'selection.mjs')
 execFileSync('taskset',['-c','10','bend',join(import.meta.dirname,'PreparationSelection.bend'),'-o',emitted],{timeout:5000})
 const m=(await import(pathToFileURL(emitted))).default
 const list=items=>items.reduceRight((tail,head)=>({$:'Con',head,tail}),{$:'Nil'})
 const array=value=>{const out=[];while(value.$==='Con'){out.push(value.head);value=value.tail}assert.equal(value.$,'Nil');return out}
 const maybe=value=>value===undefined?{$:'None'}:{$:'Some',value}
 const position=p=>({$:'RootAttribution.Position',line:BigInt(p.line),column:BigInt(p.column)})
 const location=p=>({$:'RootAttribution.Location',start:position(p.start),end:position(p.end)})
 const span=(a,b,c,d)=>({start:{line:a,column:b},end:{line:c,column:d}})
 const path='root.py',capture={text:'class Foo:\n field: int\nclass Bar:\n value: str\n',contentHash:'hash'}
 const root=(name,loc)=>({artifact:{id:'id-'+name,kind:'class',name},location:loc})
 const foo=root('Foo',span(1,1,2,12)),bar=root('Bar',span(3,1,4,12))
 const hunk={path,verified:true,location:span(2,2,2,7)}
 const alternatives=[[],[foo],[foo,bar],[foo,{...foo,artifact:{...foo.artifact,id:'duplicate'}}],[{...foo,artifact:{...foo.artifact,kind:'constant-group'}}]]
 let cases=0
 for(const operation of ['add','update'])for(const line of [undefined,1,2,3,5])for(const frozen of [undefined,new Set(),new Set(['Foo']),new Set(['Bar'])])for(const contract of [TYPE_INPUT_CONTRACT,FUNCTION_INPUT_CONTRACT,'other'])for(const declarations of alternatives)for(const verified of [undefined,{path,contentHash:'hash',hunks:[hunk]},{path,contentHash:'wrong',hunks:[hunk]},{path:'other.py',contentHash:'hash',hunks:[hunk]}]){
  const analyses=[bar,foo].map(({artifact})=>({status:'unsupported',root:artifact,reason:'missing-evidence'}))
  const roots=new Set(),observation={...(line===undefined?{}:{lineSelection:{line,roots}}),verifiedPostEditHunks:verified}
  const expected=reference({observation,contract},operation,path,capture,declarations,analyses,frozen)
  const input={$:'Input',snapshot:{$:'RootAttribution.Snapshot',path,addition:operation==='add',source:capture.text},content_hash:capture.contentHash,contract:contract===TYPE_INPUT_CONTRACT?{$:'TypeContract'}:contract===FUNCTION_INPUT_CONTRACT?{$:'FunctionContract'}:{$:'OtherContract',name:contract},line:maybe(line===undefined?undefined:BigInt(line)),frozen:maybe(frozen===undefined?undefined:list([...frozen])),verified:maybe(verified===undefined?undefined:{$:'VerifiedSpans',path:verified.path,content_hash:verified.contentHash,hunks:list(verified.hunks.map(h=>({$:'RootAttribution.Hunk',path:h.path,verified:h.verified,location:location(h.location)})))}),native_hunks:{$:'None'},declarations:list(declarations.map(d=>({$:'Root',id:d.artifact.id,declaration:{$:'RootAttribution.Declaration',path,kind:d.artifact.kind,name:d.artifact.name,location:location(d.location),selection_locations:{$:'None'}}}))),analyses:list(analyses.map(a=>({$:'Analysis',...a.root})))}
  const actual=m.select(input)
  assert.deepEqual(array(actual.selected).map(a=>a.id),expected.selected.map(a=>a.root.id),'selected '+cases)
  assert.equal(actual.ambiguous,expected.ambiguous,'ambiguity '+cases)
  assert.deepEqual([...new Set(array(actual.line_roots))],[...roots],'line roots '+cases)
  cases++
 }
 console.log(JSON.stringify({passed:true,cases,scope:'actual private pipeline source differential for line/frozen/graph/edit precedence, verified path/hash, constants, analysis order and line-root accumulation; native patch verification, Go reason classification, full preparation progression and universal proof remain open'}))
}finally{await rm(temp,{recursive:true,force:true})}
