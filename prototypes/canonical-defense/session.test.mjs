import assert from "node:assert/strict"
import {spawnSync} from "node:child_process"
import {mkdtempSync,readFileSync,writeFileSync,rmSync} from "node:fs"
import {tmpdir} from "node:os"
import {join} from "node:path"
import {pathToFileURL} from "node:url"
import {after,test} from "node:test"

const directory=mkdtempSync(join(tmpdir(),"hapsland-defeat-"))
after(()=>rmSync(directory,{recursive:true,force:true}))
const run=(file,args=[])=>{
 const result=spawnSync("bend",[file,...args],{encoding:"utf8",timeout:5000})
 assert.ifError(result.error)
 return result
}
const root=new URL("./",import.meta.url).pathname
const module=join(directory,"session.mjs")
const emitted=spawnSync("bend",[join(root,"DefenseSessionConformance.bend"),"-o",module],{encoding:"utf8",timeout:55000})
assert.ifError(emitted.error)
assert.equal(emitted.status,0,emitted.stdout+emitted.stderr)
const {default:G}=await import(pathToFileURL(module).href)
const list=value=>{const rows=[];while(value.$==="Con"){rows.push(value.head);value=value.tail}assert.equal(value.$,"Nil");return rows}
const snapshot=value=>JSON.stringify(value,(_,item)=>typeof item==="bigint"?item.toString():item)
const towerCount=world=>list(world.towers).length
const panel=world=>list(G.scene(world)).some(r=>r.x===208&&r.y===220&&r.w===608&&r.h===300)

test("defeat modal is absent during ordinary play and blocks unrelated actions and all ticking",()=>{
 const world=G.dead()
 assert.equal(G.health(world),0)
 assert.equal(G.defeated(world),true)
 assert.equal(panel(world),true)
 assert.equal(panel(G.initial()),false)
 for(const code of [110,13,32,112,49,117,97,9,115])assert.deepEqual(G.key(world,code),world,`defeated key ${code} is inert`)
 assert.deepEqual(G.click(world,100,200),world,"world click cannot build behind modal")
 assert.deepEqual(G.ticks(20,world),world,"defeat freezes business and presentation")
 assert.equal(G.placement(world),6)
 assert.match(G.lab_upgrade(world).result.$,/Dead$/)
})

test("continue keeps the exact world and resumes it with zero health and no damage",()=>{
 const dead=G.dead(),world=G.key(dead,99)
 assert.equal(G.sandbox(world),true)
 assert.equal(G.health(world),0)
 assert.equal(G.defeated(world),false)
 assert.equal(panel(world),false)
 assert.equal(world.paused,false)
 assert.deepEqual(world.engine,dead.engine,"continuation cannot reset queue or resources")
 assert.deepEqual(world.towers,dead.towers)
 assert.equal(G.time(world),G.time(dead))
 assert.equal(towerCount(world),1)
 assert.match(G.diagnostics(world),/^SANDBOX=YES /)
 assert.notEqual(G.placement(world),6,"sandbox permits prebuild at HP0")
 const after=G.ticks(1200,G.key(world,97))
 assert.ok(G.time(after)>G.time(world))
 assert.equal(G.health(after),0)
 assert.equal(G.sandbox(after),true,"all ordinary Control rebuilders preserve sandbox")
 assert.equal(G.health(G.ticks(200,G.set_health(world,100))),100,"sandbox disables damage even when health is positive")
 assert.equal(G.health(G.damage(G.set_health(world,100))),100)
 assert.notEqual(G.lab_upgrade(world).result.$,"Dead")
})

test("modal buttons and keys agree, and restart restores health and ordinary mode",()=>{
 const dead=G.dead()
 assert.deepEqual(G.click(dead,634,438),G.key(dead,99))
 const paused=G.set_health(G.key(G.set_health(dead,1),112),0)
 assert.equal(paused.paused,true)
 assert.equal(G.key(paused,99).paused,false,"Continue clears pause")
 assert.deepEqual(G.click(dead,350,438),G.key(dead,114))
 for(const [x,y] of [[239,438],[460,438],[483,438],[784,438],[634,409],[634,466]])assert.deepEqual(G.click(dead,x,y),dead)
 const sandbox=G.key(dead,99),reset=G.key(sandbox,114)
 assert.equal(G.sandbox(reset),false)
 assert.equal(G.health(reset),100)
 assert.equal(G.time(reset),0)
 assert.equal(towerCount(reset),0)
 assert.deepEqual(G.key(G.initial(),99),G.initial(),"C is not a cheat during normal play")
})

test("recorded continuation and click inputs replay exact worlds",()=>{
 const dead=G.dead()
 for(const entry of [[1,99,0],[2,634,438]]){
  let direct=entry[0]===1?G.key(dead,99):G.click(dead,634,438)
  let replay=G.apply(dead,...entry)
  for(const input of [[1,97,0],[4,8,0],[3,328,424],[4,8,0]]){
   direct=input[0]===1?G.key(direct,input[1]):input[0]===4?G.ticks(input[1],direct):G.apply(direct,...input)
   replay=G.apply(replay,...input)
  }
  assert.equal(snapshot(replay),snapshot(direct))
 }
})

test("session laws check and reject independently compiling semantic mutants",()=>{
 const checked=run(join(root,"SessionPROOF.bend"))
 assert.equal(checked.status,0,checked.stdout+checked.stderr)
 const core=readFileSync(join(root,"DefenseSession.bend"),"utf8")
 const laws=readFileSync(join(root,"SessionLAWS.bend"),"utf8")
 const proof=readFileSync(join(root,"SessionPROOF.bend"),"utf8")
 const cases=[
  ["health gate","sandbox(mode) || (hp > 0 : U32)","sandbox(mode) || True{}"],
  ["sandbox gate","case Sandbox{}: True{}","case Sandbox{}: False{}"],
  ["continuation","case Normal{} 0: Sandbox{}","case Normal{} 0: Normal{}"],
  ["sandbox persistence","case other _: other","case other _: Normal{}"],
  ["damage","Bool.pick(U32, sandbox(mode), 0, total)","total"]
 ]
 for(const [name,before,after] of cases){
  assert.ok(core.includes(before),name)
  writeFileSync(join(directory,"DefenseSession.bend"),core.replace(before,after))
  writeFileSync(join(directory,"SessionLAWS.bend"),laws)
  writeFileSync(join(directory,"SessionPROOF.bend"),proof)
  const compiles=run(join(directory,"DefenseSession.bend"))
  assert.equal(compiles.status,0,name+compiles.stdout+compiles.stderr)
  const rejected=run(join(directory,"SessionPROOF.bend"))
  assert.notEqual(rejected.status,0,`${name} must invalidate its unchanged proof`)
 }
})
