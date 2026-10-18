import {readFileSync} from "node:fs"
// Literal adversarial instances before universal proofs; no application IO.
const owner = (p:number,l:number,r:number,o:number) => `V.WorkIdentity{${p}n,${l}n,${r}n,${o}n}`
const target = (o:string, members="None{}") => `P.Target{${o},${members},1n,False{}}`
const instances: {name:string,claim:string}[]=[]
for(let mask=0;mask<32;mask++) {
  const a=owner(1,1,1,3),b=owner(mask&1?2:1,mask&2?2:1,mask&4?2:1,mask&8?4:3)
  const t=target(a), body=`P.Body{${b},380,428}`
  const expected=mask%16===0
  for(const ready of ["True{}","False{}"]) {
    instances.push({name:`identity_${mask}_${ready.startsWith("True")?1:0}`,
      claim:`{P.for_body(${t},${body},False{},${ready},[]) == ${expected?`[P.Mark{${t},${body},False{},${ready}}]`:"[]"} : List<&2,P.Mark>}`})
  }
  for(const ids of ["[]","[3n]","[4n]","[3n,4n]"]) {
    const member=!(mask&7)&&((mask&8)?ids.includes("4n"):ids.includes("3n"))
    instances.push({name:`finish_${mask}_${instances.length}`,claim:`{P.belongs(${target(a,`Some{${ids}}`)},${body}) == ${member?"True{}":"False{}"} : Bool}`})
  }
}
for(const x of [0,1,9,10,380,1023])for(const y of [0,1,428]) {
 const t=target(owner(1,1,1,3)),body=`P.Body{${owner(1,1,1,3)},${x},${y}}`
 instances.push({name:`draw_${x}_${y}`,claim:`{P.draw([P.Mark{${t},${body},True{},True{}}],[]) == [F.Box{${Math.max(0,x-10)},${Math.max(0,y-10)},21,2,16768133},F.Box{${Math.max(0,x-10)},${y+9},21,2,16768133},F.Box{${Math.max(0,x-10)},${Math.max(0,y-10)},2,21,16768133},F.Box{${x+9},${Math.max(0,y-10)},2,21,16768133}] : List<&2,F.Rect>}`})
}

const laws=readFileSync(new URL("./PreviewLAWS.bend",import.meta.url),"utf8")
for(const block of laws.split(/^law /m).slice(1)) {
 const name=block.slice(0,block.indexOf(":"))
 const binders=[...block.matchAll(/^  for [~+]?(\w+): (.+)$/gm)]
 const begin=block.indexOf("  {")
 const claim=block.slice(begin).split(/\n(?=#|law )/)[0].trim()
 for(const flag of [false,true]) {
  const t=target(owner(1,1,1,3)),b=`P.Body{${owner(1,1,1,3)},380,428}`,m=`P.Mark{${t},${b},False{},True{}}`
  const values:Record<string,string>={}
  for(const [,key,type] of binders) values[key]=type==="P.Anchor"?`P.Anchor{380,428,"TARGET U3",False{},True{}}`:type==="String"?'"TARGET U3"':type==="List<&2,P.Anchor>"?'[P.Anchor{380,428,"TARGET U3",False{},True{}}]':type==="P.Target"?t:type==="P.Body"?b:type==="P.Mark"?m:type==="V.WorkIdentity"?owner(1,1,1,3):type==="Bool"?(flag?"True{}":"False{}"):type==="Nat"?"3n":type==="U32"?"380":type==="List<&2,P.Body>"?`[${b}]`:type==="List<&2,P.Mark>"?`[${m}]`:type==="List<&2,P.Target>"?`[${t}]`:type==="List<&2,Nat>"?"[3n]":type==="Maybe<&2,List<&2,Nat>>"?"Some{[3n]}":type==="List<&2,F.Rect>"?"[F.Box{0,0,1,1,1}]":(()=>{throw Error(type)})()
  instances.push({name:`law_${name}_${flag?1:0}`,claim:claim.replace(/\b[A-Za-z_]\w*\b/g,key=>values[key]??key)})
 }
}

const requestedBatch=process.env.PREVIEW_BATCH
let selected=instances
if(requestedBatch !== undefined) {
 const batch=Number(requestedBatch)
 if(!/^\d+$/.test(requestedBatch)||!Number.isSafeInteger(batch)||batch*64>=instances.length)throw new RangeError("invalid PREVIEW_BATCH")
 selected=instances.slice(batch*64,(batch+1)*64)
}
export default {imports:[`${process.env.PREVIEW_CORE ?? "./DefensePreviewMarks.bend"} as P`,"./Font.bend as F","./DefenseMotionTypes.bend as V"],instances:selected}
