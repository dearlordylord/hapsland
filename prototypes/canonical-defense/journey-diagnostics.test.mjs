import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import { after, test } from "node:test"
const temp=mkdtempSync(join(tmpdir(),"defense-journey-diagnostics-"))
after(()=>rmSync(temp,{recursive:true,force:true}))
const emitted=join(temp,"game.mjs")
const build=spawnSync("bend",[join(import.meta.dirname,"DefenseJourneyDiagnostics.bend"),"-o",emitted],{encoding:"utf8",timeout:55000})
assert.ifError(build.error);assert.equal(build.status,0,build.stdout+build.stderr)
const {default:G}=await import(pathToFileURL(emitted))
const list=x=>{const a=[];while(x.$==="Con"){a.push(x.head);x=x.tail}assert.equal(x.$,"Nil");return a}
const cons=a=>a.reduceRight((tail,head)=>({$:"Con",head,tail}),{$:"Nil"})
const tag=(x,name)=>x?.$===name||x?.$?.endsWith("."+name)
const key=n=>({$:"WorkIdentity",partition:1,lifetime:1,round:1,operation:n})
const actor=(n,point,path,extra={})=>({$:"Actor",key:key(n),family:n,lane:0,x:point.x,y:point.y,phase:1,observed:1,path:cons(path.map(p=>({$:"Waypoint",x:p.x,y:p.y,phase:1,time:0}))),terminal:0,predecessor:{$:"Nil"},shown:0,outcome:0,released:true,...extra})

test("adjacent maze rows are independent until their directed route gap closes",()=>{
 for(const layout of [0,1,2]){
  const route=list(G.maze(layout));
  // Long horizontal passes of the real authored maze; adjacent rows are8px apart.
  const i=route.findIndex((p,j)=>j+3<route.length&&p.y===route[j+1].y&&Math.abs(p.x-route[j+1].x)===40)
  assert.ok(i>=0)
  const start=route[i],end=route[i+1],next=route[i+2]
  const follower=actor(2,{x:start.x+4,y:start.y},route.slice(i+1))
  const leader=actor(1,{x:start.x+4,y:next.y},route.slice(i+3))
  assert.equal(Math.abs(follower.y-leader.y),8)
  assert.ok(G.track(follower).remaining-G.track(leader).remaining>28)
  assert.equal(G.blocked(follower,cons([leader,follower])),false,"a body across the wall is not directly ahead")
  const close=actor(1,{x:start.x+16,y:start.y},route.slice(i+1))
  assert.equal(G.blocked(follower,cons([close,follower])),true,"actual nearby leader on same directed segment blocks")
  const behind=actor(1,{x:start.x,y:start.y},route.slice(i+1))
  assert.equal(G.blocked(follower,cons([behind,follower])),false,"identity cannot make a body behind block the leader")
 }
})
test("completed bodies expire even when their movement was blocked",()=>{
 const ended=actor(2,{x:0,y:0},[],{terminal:30,outcome:5})
 const aged=G.ordinary(false,ended)
 assert.equal(aged.terminal,29);assert.equal(aged.x,ended.x);assert.equal(aged.y,ended.y)
 let actors=cons([ended]);for(let i=0;i<30;i++)actors=G.step(actors)
 assert.equal(list(actors).length,0)
})
test("retained work occupies the route exit but completed history does not",()=>{
 const retained=actor(1,{x:100,y:0},[])
 const follower=actor(2,{x:80,y:0},[{x:100,y:0}])
 assert.equal(G.blocked(follower,cons([retained,follower])),true)
 const history={...retained,terminal:30,outcome:5}
 assert.equal(G.blocked(follower,cons([history,follower])),false)
})
test("normal single release does not invent a preparation refusal",()=>{
 let w=G.start(1),refused=0
 for(let i=0;i<1800;i++){
  const observed=G.observe(w);w=observed.world
  for(const f of list(observed.frames))if(tag(f,"ProductFrame"))for(const out of list(f.outputs))if(tag(out,"PolicyDecided")&&Object.values(out).some(v=>tag(v,"PreparationRefused")))refused++
 }
 assert.equal(refused,0)
 assert.equal(list(G.works(w)).length,0,"ordinary workload drains")
})
test("every burst preparation refusal is justified by its exact frame-time reservations",()=>{
 let w=G.start(19),refused=0,accepted=0,firstRefusal,lastRefusal
 for(let i=0;i<3000;i++){
  const observed=G.observe(w);w=observed.world
  for(const f of list(observed.frames)){
   if(!tag(f,"ProductFrame")||!tag(f.event,"BeginObservedPreparation"))continue
   const outputs=list(f.outputs)
   const rejection=outputs.some(o=>tag(o,"PolicyDecided")&&Object.values(o).some(v=>tag(v,"PreparationRefused")))
   const admitted=outputs.some(o=>tag(o,"ResidentActionRequested")&&Object.values(o).some(v=>tag(v,"Prepare")))
   const ledger=list(f.before)[0].ledger,charges=list(ledger.charges),limits=ledger.limits
   const used=charges.reduce((sum,c)=>sum+c.bytes,0),local=charges.filter(c=>c.partition===f.event.partition)
   const localBytes=local.reduce((sum,c)=>sum+c.bytes,0)
   const fit=charges.length+1<=limits.global_items&&used+f.event.bytes<=limits.global_bytes&&local.length+1<=limits.partition_items&&localBytes+f.event.bytes<=limits.partition_bytes
   assert.equal(G.fits(f.before,f.event.partition,f.event.bytes),fit)
   if(rejection){
    refused++;assert.equal(fit,false,"a refusal cannot occur when that exact prior ledger can reserve the request")
    const receipt={at:String(f.time),used:String(used),limit:String(limits.global_bytes),requested:String(f.event.bytes),reservations:charges.map(c=>({bytes:String(c.bytes),purpose:c.purpose.$}))}
    firstRefusal??=receipt;lastRefusal=receipt
   }
   if(admitted){accepted++;assert.equal(fit,true)}
  }
 }
 assert.ok(refused>0,"overloaded case must exercise real refusal")
 assert.ok(accepted>0,"same run must also exercise accepted preparations")
 assert.equal(list(G.works(w)).length,0,"accepted and refused work eventually drains")
 assert.equal(G.bytes(w),0,"all retained reservations eventually release")
 assert.equal(list(G.actors(w)).length,0,"no historical body remains stuck at the source after drain")
 assert.equal(G.refuse_label(),"PREP REFUSED EARLIER / SHARED CAPACITY")
 console.log(JSON.stringify({refused,accepted,firstRefusal,lastRefusal,drainedAtTick:G.time(w)}))
})

test("accepted certain delivery releases its payload before retention expiry",()=>{
 let w=G.start(1),acknowledged=0
 for(let tick=0;tick<1800;tick++){
  const observed=G.observe(w);w=observed.world
  for(const frame of list(observed.frames)){
   if(!tag(frame.event,"SubmissionTerminal")||frame.event.certain!==true)continue
   if(!list(frame.outputs).some(o=>tag(o,"EventEstablished")&&tag(o.event,"SubmissionRecorded")))continue
   acknowledged++
   const advice=frame.event.advice,old=list(list(frame.before)[0].work).find(item=>item.operation===advice)
   assert.ok(old&&tag(old.kind,"PendingFinding"),"real ACK must have retained payload before completion")
   const core=G.core(w)
   const body=list(G.actors(w)).find(a=>a.key.operation===advice)
   assert.ok(body&&body.outcome===10&&body.terminal>0,"the released body retains its confirmed SENT outcome")
   const duplicateRetirement=G.retirement(core,old.partition,old.lifetime,old.round,advice)
   assert.ok(tag(duplicateRetirement,"Rejected"));assert.deepEqual(duplicateRetirement.state,core,"late or duplicate cleanup cannot change the completed state")
   assert.ok(!list(core.work).some(item=>item.operation===advice),`ACK ${advice} retained its PendingFinding payload`)
   assert.ok(!list(core.ledger.charges).some(item=>item.id===old.charge),`ACK ${advice} retained its capacity reservation`)
   assert.ok(!list(core.collection.ready).includes(advice),"acknowledged payload cannot remain advertised as ready")
   const evidence=list(core.collection.delivery.submissions.batches).find(batch=>batch.advice===advice)
   assert.ok(evidence&&tag(evidence.phase,"Submitted"),"payload release must retain submitted token/fingerprint evidence")
   assert.equal(G.suppressed(core,advice,old.round),true,"Stop must suppress this submitted fingerprint")
   assert.deepEqual(G.duplicate(core,advice,frame.event.token).state,core,"duplicate ACK cannot release any other work")
   assert.equal(G.fits(cons([core]),1,100),true,"fresh preparation can reserve before old payload expiry")
   const siblings=list(list(frame.before)[0].work).filter(item=>item.operation!==advice)
   const acks=new Set(list(observed.frames).filter(f=>tag(f.event,"SubmissionTerminal")&&f.event.certain).map(f=>f.event.advice))
   for(const sibling of siblings.filter(item=>!acks.has(item.operation))){
    const still=list(core.work).find(item=>item.operation===sibling.operation)
    if(tag(sibling.kind,"PendingFinding")){
     assert.deepEqual(still,sibling,"another pending finding is not retired by this ACK")
     assert.deepEqual(list(core.ledger.charges).find(c=>c.id===sibling.charge),list(list(frame.before)[0].ledger.charges).find(c=>c.id===sibling.charge),"another finding retains its exact reservation")
    }
   }
   const broken={...list(frame.before)[0],ledger:{...list(frame.before)[0].ledger,charges:cons(list(list(frame.before)[0].ledger.charges).filter(item=>item.id!==old.charge))}}
   const refused=G.retirement(broken,old.partition,old.lifetime,old.round,advice)
   assert.ok(tag(refused,"Rejected"));assert.deepEqual(refused.state,broken,"failed ledger release cannot change readiness or authority")
  }
 }
 assert.ok(acknowledged>0,"must observe actual accepted certain output, not just expiry cleanup")
 assert.equal(list(G.core(w).collection.delivery.submissions.batches).length,0,"ordinary expiry eventually prunes compact submission evidence too")
})


test("uncertain accepted delivery retains its exact payload and reservation",()=>{
 let w=G.uncertain(G.start(1)),uncertain=0
 for(let tick=0;tick<1400&&!uncertain;tick++){
  const observed=G.observe(w);w=observed.world
  for(const frame of list(observed.frames)){
   if(!tag(frame.event,"SubmissionTerminal")||frame.event.certain!==false)continue
   if(!list(frame.outputs).some(o=>tag(o,"EventEstablished")&&tag(o.event,"SubmissionRecorded")))continue
   uncertain++
   const advice=frame.event.advice,old=list(list(frame.before)[0].work).find(item=>item.operation===advice),core=G.core(w)
   assert.deepEqual(list(core.work).find(item=>item.operation===advice),old)
   assert.ok(list(core.ledger.charges).some(item=>item.id===old.charge))
   const evidence=list(core.collection.delivery.submissions.batches).find(item=>item.advice===advice)
   assert.ok(evidence&&tag(evidence.phase,"Uncertain"))
  }
 }
 assert.ok(uncertain>0,"must observe the actual uncertain completion")
})

test("Stop cannot offer already acknowledged payload while suppression evidence is retained",()=>{
 let w=G.start(1),seen=new Set()
 for(let tick=0;tick<1800&&seen.size<2;tick++){
  const o=G.observe(w);w=o.world
  for(const f of list(o.frames))if(tag(f.event,"SubmissionTerminal")&&f.event.certain&&list(f.outputs).some(x=>tag(x,"EventEstablished")&&tag(x.event,"SubmissionRecorded")))seen.add(f.event.advice)
 }
 assert.equal(seen.size,2)
 for(const advice of seen)assert.equal(G.suppressed(G.core(w),advice,1),true)
 w=G.stop(w)
 for(let tick=0;tick<200;tick++){
  const o=G.observe(w);w=o.world
  for(const f of list(o.frames))if(tag(f.event,"FinishTerminal"))assert.ok(list(f.event.selected).every(id=>!seen.has(id)),"Stop cannot replay an acknowledged member")
 }
 assert.equal(list(G.works(w)).length,0)
 assert.equal(G.bytes(w),0)
})

test("uncertain background output can still be captured once by Stop",()=>{
 let w=G.uncertain(G.start(1)),advice
 for(let tick=0;tick<1400&&advice===undefined;tick++){
  const o=G.observe(w);w=o.world
  for(const f of list(o.frames))if(tag(f.event,"SubmissionTerminal")&&!f.event.certain&&list(f.outputs).some(x=>tag(x,"EventEstablished")&&tag(x.event,"SubmissionRecorded")))advice=f.event.advice
 }
 assert.ok(advice!==undefined)
 w=G.stop(w);let captured=0,protectedChecks=0
 for(let tick=0;tick<1600;tick++){
  const o=G.observe(w);w=o.world
  for(const f of list(o.frames)){
   if(tag(f.event,"FinishTerminal")&&list(f.event.selected).includes(advice))captured++
   if(tag(f.event,"FinishAuthorize")&&list(f.event.selected).includes(advice)&&list(f.outputs).some(x=>tag(x,"EventEstablished")&&tag(x.event,"FinishAuthorized"))){
    const state=list(f.after)[0],work=list(state.work).find(x=>x.operation===advice)
    assert.ok(work,"the real authorized Finish still owns its selected pending payload")
    const retired=G.retirement(state,work.partition,work.lifetime,work.round,advice)
    assert.ok(tag(retired,"Rejected"));assert.ok(tag(retired.reason,"WrongStage"));assert.deepEqual(retired.state,state,"retirement cannot steal an authorized Finish member")
    protectedChecks++
   }
  }
 }
 assert.equal(captured,1,"the original advice may be reoffered once, rather than prematurely deleted")
 assert.ok(protectedChecks>0,"must inspect a real accepted Finish authorization")
})

test("fresh source work is admitted after ACK without waiting for retained-result expiry",()=>{
 let w=G.start(1),acks=0
 for(let tick=0;tick<1800&&acks<2;tick++){
  const o=G.observe(w);w=o.world
  acks+=list(o.frames).filter(f=>tag(f.event,"SubmissionTerminal")&&f.event.certain&&list(f.outputs).some(x=>tag(x,"EventEstablished")&&tag(x.event,"SubmissionRecorded"))).length
 }
 assert.equal(acks,2);assert.equal(G.bytes(w),0)
 const afterAck=G.time(w);w=G.release(w);let accepted=false
 for(let tick=0;tick<200&&!accepted;tick++){
  const o=G.observe(w);w=o.world
  accepted=list(o.frames).some(f=>tag(f.event,"BeginObservedPreparation")&&list(f.outputs).some(x=>tag(x,"ResidentActionRequested")&&Object.values(x).some(v=>tag(v,"Prepare"))))
 }
 assert.equal(accepted,true,"fresh work reaches real preparation before old pending TTL could expire")
 assert.ok(G.time(w)-afterAck<=200)
})
