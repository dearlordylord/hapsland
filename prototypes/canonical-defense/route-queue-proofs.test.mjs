import {replaceTokens} from "./motion-state-slice.mjs"
import assert from "node:assert/strict"
import {spawnSync} from "node:child_process"
import {mkdtempSync,rmSync,readFileSync,writeFileSync,copyFileSync} from "node:fs"
import {tmpdir} from "node:os"
import {join} from "node:path"
import {test} from "node:test"
const root=import.meta.dirname
const mutations=[
 ["ended bodies", "Track{other,q,finish,+left,True{}}", "Track{other,q,finish,+left,_}"],
 ["route gap", "< 28n", "< 280n"],
 ["close follower", "< 28n", "< 2n"],
 ["direction", "ahead(remaining,left,before(other,k))", "True{}"],
 ["separate route", "Map.same(end,finish)", "True{}"]
]
// Retain exact declaration bytes and their transitive call closure. The laws
// concern queue decisions; geometry extraction is exercised by real-Host tests.
function slice(source,seeds){
 const parts=source.split(/(?=^def )/m),header=parts.shift()
 const defs=new Map(parts.map(text=>[text.match(/^def (\w+)/)[1],text]))
 const selected=new Set(seeds),pending=[...seeds]
 while(pending.length){const body=defs.get(pending.pop());assert.ok(body)
  for(const name of defs.keys())if(!selected.has(name)&&new RegExp(`(?<![\\w.])${name}\\s*\\(`).test(body)){selected.add(name);pending.push(name)}
 }
 return header+[...defs].filter(([name])=>selected.has(name)).map(([,body])=>body).join("\n")
}
const run=(file,verdict=false)=>spawnSync("bend",[file,verdict?"--verdict":"--check-only"],{encoding:"utf8",timeout:5000})
test("directed queue laws hold and each compiling counterexample is rejected",()=>{
 const dir=mkdtempSync(join(tmpdir(),"route-queue-laws-"))
 try{
  for(const name of ["DefenseRouteQueue.bend","RouteQueueLAWS.bend","RouteQueuePROOF.bend","DefenseMap.bend","DefenseMotionTypes.bend"])copyFileSync(join(root,name),join(dir,name))
  const owner=join(dir,"DefenseRouteQueue.bend"),proof=join(dir,"RouteQueuePROOF.bend")
  const original=slice(readFileSync(owner,"utf8"),["blocks"])
  writeFileSync(owner,original)
  writeFileSync(join(dir,"DefenseMap.bend"),slice(readFileSync(join(dir,"DefenseMap.bend"),"utf8"),["same"]))
  const positive=run(proof,true);assert.ifError(positive.error);assert.equal(positive.status,0,positive.stdout+positive.stderr)
  for(const [label,before,after] of mutations){
   writeFileSync(owner,replaceTokens(original,before,after))
   const compile=run(owner);assert.ifError(compile.error);assert.equal(compile.status,0,label+compile.stdout+compile.stderr)
   const negative=run(proof);assert.ifError(negative.error);assert.notEqual(negative.status,0,label);assert.match(negative.stdout+negative.stderr,/Location: Laws\./,label)
  }
 }finally{rmSync(dir,{recursive:true,force:true})}
})
