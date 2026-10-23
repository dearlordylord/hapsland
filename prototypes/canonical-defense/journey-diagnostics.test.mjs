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
const key=n=>({$:"DefenseMotionTypes.WorkIdentity",partition:1n,lifetime:1n,round:1n,operation:BigInt(n)})
const actor=(n,point,path,extra={})=>({$:"DefenseMotionTypes.Actor",key:key(n),family:BigInt(n),lane:0,x:point.x,y:point.y,phase:1,observed:1,path:cons(path.map(p=>({$:"DefenseMotionTypes.Waypoint",x:p.x,y:p.y,phase:1,time:0n}))),terminal:0,predecessor:{$:"Nil"},shown:0n,outcome:0,released:true,...extra})

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
  assert.ok(G.track(follower).remaining-G.track(leader).remaining>28n)
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
   const used=charges.reduce((sum,c)=>sum+c.bytes,0n),local=charges.filter(c=>c.partition===f.event.partition)
   const localBytes=local.reduce((sum,c)=>sum+c.bytes,0n)
   const fit=BigInt(charges.length)+1n<=limits.global_items&&used+f.event.bytes<=limits.global_bytes&&BigInt(local.length)+1n<=limits.partition_items&&localBytes+f.event.bytes<=limits.partition_bytes
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
