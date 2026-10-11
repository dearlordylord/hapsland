import {nativeCases} from "./update-parity.mjs"
import * as reference from "./update-reference.ts"
import * as candidate from "../../../dist/onboarding/update-model.js"
import {writeFileSync} from "node:fs"
const groups = new Map()
for(const fixture of nativeCases) {
 const [model,event]=fixture
 const key=model.phase+":"+event.action.kind
 if(!groups.has(key))groups.set(key,[])
 groups.get(key).push(fixture)
}
const results=[]
for(const [key,fixtures] of groups) {
 const lanes={}
 for(const [name,lane] of [["typescript",reference],["integratedBend",candidate]]) {
  let checksum=0
  const start=performance.now()
  for(let round=0;round<20;round++)for(const [model,event] of fixtures)checksum+=lane.reduceUpdate(model,event).revision
  const reduceMs=performance.now()-start
  const commandStart=performance.now()
  for(let round=0;round<20;round++)for(const [model] of fixtures)checksum+=lane.updateCommand(model)?.id??0
  lanes[name]={reduceMs,commandMs:performance.now()-commandStart,checksum}
 }
 results.push({key,cases:fixtures.length,lanes})
}
writeFileSync("evidence/bend-strangler/update-diagnostic.json",JSON.stringify({at:new Date().toISOString(),results,scope:"diagnostic per native phase/action; sequential lanes, not qualification evidence"},null,2)+"\n")
console.log(JSON.stringify(results.sort((a,b)=>(b.lanes.integratedBend.reduceMs-b.lanes.typescript.reduceMs)-(a.lanes.integratedBend.reduceMs-a.lanes.typescript.reduceMs)).slice(0,8)))
