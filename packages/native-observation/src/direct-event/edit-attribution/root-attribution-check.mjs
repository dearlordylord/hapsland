import assert from 'node:assert/strict'
import {execFileSync} from 'node:child_process'
import {mkdtemp,rm} from 'node:fs/promises'
import {join} from 'node:path'
import {pathToFileURL} from 'node:url'
import {selectEditedRoots} from '../edit-attribution.ts'
const temp=await mkdtemp('/tmp/hapsland-root-attribution-')
try{
 const emitted=join(temp,'selection.mjs')
 execFileSync('taskset',['-c','10','bend',join(import.meta.dirname,'./RootAttribution.bend'),'-o',emitted],{timeout:5000})
 const m=(await import(pathToFileURL(emitted))).default
 const list=items=>items.reduceRight((tail,head)=>({$:'Con',head,tail}),{$:'Nil'})
 const array=value=>{const out=[];while(value.$==='Con'){out.push(value.head);value=value.tail}assert.equal(value.$,'Nil');return out}
 const position=x=>({$:'Position',line:BigInt(x.line),column:BigInt(x.column)})
 const location=x=>({$:'Location',start:position(x.start),end:position(x.end)})
 const decodedLocation=x=>({start:{line:Number(x.start.line),column:Number(x.start.column)},end:{line:Number(x.end.line),column:Number(x.end.column)}})
 let cases=0,invalid=0
 const check=(snapshot,hunks,declarations)=>{
  let expected
  try{expected=selectEditedRoots(snapshot,hunks,declarations)}catch{expected=undefined}
  const actual=m.select({$:'Snapshot',path:snapshot.path,addition:snapshot.operation==='add',source:snapshot.source},list(declarations.map(d=>({$:'Declaration',path:d.path,kind:d.kind,name:d.name,location:location(d.location),selection_locations:d.selectionLocations===undefined?{$:'None'}:{$:'Some',value:list(d.selectionLocations.map(location))}}))),list(hunks.map(h=>({$:'Hunk',path:h.path,verified:h.verified,location:location(h.location)}))))
  if(expected===undefined){assert.equal(actual.$,'InvalidFacts','invalid '+cases);invalid++}
  else{
   assert.equal(actual.$,'Selected','valid '+cases)
   const selected=array(actual.selection.selected).map(d=>({path:d.path,kind:d.kind,name:d.name,location:decodedLocation(d.location)}))
   const ambiguous=array(actual.selection.ambiguous).map(l=>({path:snapshot.path,location:decodedLocation(l),reason:'ambiguous-attribution'}))
   assert.deepEqual({selected,ambiguous},expected,'case '+cases+' '+JSON.stringify({snapshot,hunks,declarations}))
  }
  cases++
 }
 const span=(a,b,c,d)=>({start:{line:a,column:b},end:{line:c,column:d}})
 const path='nested/root.py',source='class Outer:\n 😀 inner body\n tail\n'
 const root=(name,location,extra={})=>({path,kind:'class',name,location,...extra})
 const roots=[root('Outer',span(1,1,3,6)),root('Inner',span(2,2,2,15)),root('Tail',span(3,2,3,6))]
 const hunk=location=>({path,verified:true,location})
 // Add/update, nested/same-width roots, duplicate identities, defining-only
 // selection spans, empty deletions, invalid optional spans and UTF-16 columns.
 const alternatives=[[],roots,[...roots,roots[1]],[...roots,root('Twin',roots[1].location)],roots.map(r=>({...r,selectionLocations:[]})),roots.map(r=>({...r,selectionLocations:[span(99,1,99,2),span(1,1,1,6)]}))]
 const spans=[span(1,1,1,6),span(2,2,2,3),span(2,2,2,4),span(2,2,2,5),span(2,2,3,1),span(2,3,2,3),span(3,2,4,1),span(1,1,4,1),span(4,1,4,1),span(0,1,1,1),span(1,0,1,1),span(2,16,2,17),span(3,4,2,4)]
 for(const operation of ['add','update'])for(const declarations of alternatives)for(const a of spans)for(const b of [undefined,...spans.slice(0,5)])check({path,operation,source},[hunk(a),...(b===undefined?[]:[hunk(b)])],declarations)
 for(const operation of ['add','update'])for(const badPath of ['', '/root.py','a//b','a/../b','a/./b','a\\b','a\0b'])check({path:badPath,operation,source},[],[])
 for(const operation of ['add','update'])for(const declarations of [[root('',roots[0].location)],[root('Empty',span(1,1,1,1))],[root('Invalid',span(100,1,100,2))],[root('Wrong',roots[0].location,{path:'other.py'})]])check({path,operation,source},[],declarations)
 check({path,operation:'update',source},[{...hunk(spans[0]),verified:false}],roots)
 check({path,operation:'update',source},[{...hunk(spans[0]),path:'other.py'}],roots)
 for(const operation of ['add','update'])check({path,operation,source},[hunk(spans[0])],[root('c',roots[0].location,{kind:'a:b'}),root('b:c',roots[0].location,{kind:'a'})])
 console.log(JSON.stringify({passed:true,cases,invalid,scope:'finite complete edit attribution differential against current native implementation: ordered roots/spans, validation, duplicate identities, smallest enclosure and ties, defining spans and UTF-16; not full preparation progression or universal correspondence'}))
}finally{await rm(temp,{recursive:true,force:true})}
