import assert from "node:assert/strict"
import {tokenSpan,replaceTokens} from "./motion-state-slice.mjs"
import {spawnSync} from "node:child_process"
import {mkdtempSync,readFileSync,writeFileSync,mkdirSync,rmSync} from "node:fs"
import {tmpdir} from "node:os"
import {join,resolve,dirname,relative} from "node:path"
import {test} from "node:test"
const root=resolve(new URL("../../",import.meta.url).pathname)
const owner="prototypes/canonical-defense/"
const laws=owner+"TowerTimingLAWS.bend",proof=owner+"TowerTimingPROOF.bend"
const sources=new Map()
function collect(file){
 if(sources.has(file))return
 const source=readFileSync(join(root,file),"utf8");sources.set(file,source)
 for(const m of source.matchAll(/^import (\.[^\s]+\.bend)(?: as \w+)?$/gm)) collect(relative(root,resolve(root,dirname(file),m[1])))
}
collect(proof)
const budgetLaws=owner+"LAWS.bend",budgetProof=owner+"PROOF.bend"
collect(budgetProof)
const mathematical=new Set(["finisher_prefers_short","accelerator_prefers_long","pulse_cadence","pulse_budget"]);
const mutants=[
 ["finisher_prefers_short",owner+"DefenseTowerFire.bend","case 5: (at < other : Nat)","case 5: (at > other : Nat)"],
 ["pulse_cadence",owner+"DefenseTowerFire.bend","case 6: 40","case 6: 20"],
 ["pulse_budget",owner+"DefenseTowerFire.bend","case 6: 3n","case 6: 4n"],
 ["empty_volley_is_inert",owner+"DefenseTowerFire.bend","case Nil{}: Shot{world, 2}","case Nil{}: Shot{world, 0}"],
 ["intervention_time",owner+"DefenseTowerFire.bend","  Nat.max(Run.clock(M.engine(world)),(U32.to_nat(M.time(world)) * 20n : Nat))","  Run.clock(M.engine(world))"],
 ["timed_transport","packages/monkey-business-bend/Callbacks.bend","[Scheduled{delivery_at,fresh_order,action}]","[Scheduled{0n,fresh_order,action}]"],
 ["invalid_time_no_change","packages/monkey-business-bend/Callbacks.bend","case False{} original: Changed{State{[original]},InvalidTime{},Nil{},Nil{}}","case False{} original: Changed{State{[original]},Applied{},Nil{},Nil{}}"],
 ["reschedule_time_guard","packages/monkey-business-bend/Callbacks.bend","reschedule_one((delivery_at >= at : Nat),original,delivery_at,fresh_order)","reschedule_one(True{},original,delivery_at,fresh_order)"],
 ["upgrade_keeps_armed_deadline",owner+"DefenseMechanics.bend","M.Tower{x,y,k,(l + 1 : U32),p,r,ready}","M.Tower{x,y,k,(l + 1 : U32),p,r,0}"],
 ["preview_remaining_time",owner+"DefenseTowerPreview.bend","Nat.sub(Live.due(world,target),Fire.delivery_at(world))","Nat.sub(Live.due(world,target),Run.clock(M.engine(world)))"],
 ["quoted_upgrade_range",owner+"DefenseTowerPreview.bend","U32.show(Mechanics.tower_range(Mechanics.upgraded(tower)))","U32.show(Mechanics.tower_range(tower))"],
 ["quoted_upgrade_cadence",owner+"DefenseTowerPreview.bend","U32.show(Fire.cooldown(Mechanics.upgraded(tower)))","U32.show(Fire.cooldown(tower))"]
]
mutants.push(
 ["consumed_preserves_gold",owner+"DefenseHost.bend","g,h,ts,a,(o + count_frames","(g + delivered * 5 : U32),h,ts,a,(o + count_frames","budget"],
 ["certain_submission_counted",owner+"DefenseHost.bend","Bool.to_u32(recorded_submission(outputs))","0","budget"],
 ["uncertain_submission_not_counted",owner+"DefenseHost.bend","C.SubmissionTerminal{_,_,True{}}","C.SubmissionTerminal{_,_,_}","budget"],
 ["ignored_submission_not_counted",owner+"DefenseHost.bend","Bool.to_u32(recorded_submission(outputs))","1","budget"],
 ["ignored_clear_not_counted",owner+"DefenseHost.bend","    case C.AdmitObservation{_, _, _}: Bool.to_u32(U32.is_eq(kind, 1))","    case C.ReviewServiceRequestSettled{_,_,_,_,_,C.RequestClear{},_}: Bool.to_u32(U32.is_eq(kind,2))\n    case C.AdmitObservation{_, _, _}: Bool.to_u32(U32.is_eq(kind, 1))","budget"]
)
mutants.push(
 ["disabled_stop_preserves_world",owner+"DefenseHost.bend","    case False{}: world\ndef request_finish(","    case False{}: M.with_submissions(world,0)\ndef request_finish(","budget"],
 ["absent_stop_activity_preserves_world",owner+"DefenseHost.bend","    case None{}: world\ndef schedule_finish(","    case None{}: M.with_engine(world,Run.invalid(M.engine(world)))\ndef schedule_finish(","budget"]
)
mutants.push(
 ["defeated_upgrade_preserves_world",owner+"DefenseHost.bend","    case False{}: world\ndef upgrade(","    case False{}: M.with_submissions(world,0)\ndef upgrade(","budget"],
 ["upgrade_checks_life",owner+"DefenseHost.bend","upgrade_when((M.hp(world) > 0 : U32),world)","upgrade_when(True{},world)","budget"],
 ["defeated_lab_upgrade_preserves_world",owner+"DefenseLab.bend","case False{}: Receipt{world,Dead{},0}","case False{}: Receipt{world,Applied{},0}","budget"],
 ["defeated_placement_refused",owner+"DefensePreview.bend","case 0 False{} _: 6","case 0 False{} _: 4","budget"],
 ["unknown_placement_refused",owner+"DefensePreview.bend","case 0 True{} False{}: 7","case 0 True{} False{}: 4","budget"]
)
function section(source,prefix,name){
 const blocks=source.split(new RegExp(`^${prefix.replaceAll(".","\\.")}`,"m"))
 const matches=blocks.slice(1).filter(b=>b.startsWith(name+(prefix==="law "?":":"(")))
 assert.equal(matches.length,1,`Expected exactly one declaration ${name}`);return blocks[0]+prefix+matches[0]
}
// Selected mutation checks retain verbatim owner declarations and their exact
// transitive dependency closure, as in preview-wiring proofs. No child function
// is replaced or parameterized here. Positive groups enumerate every original
// law and require exactly matching proof inventories, checking each unchanged
// declaration separately. Positive, mutant-typecheck and rejection stages use
// the same actual-source closure and unchanged five-second subprocess limit.
function declarations(text){
 const starts=[...text.matchAll(/^(def|type|law) ([A-Za-z_][\w.]*)/gm)];
 return starts.map((match,index)=>({kind:match[1],name:match[2],
  text:text.slice(match.index,starts[index+1]?.index??text.length)}));
}
function writeSlice(directory,entry,texts,rootName,extraEntries=[]){
 const modules=new Map(),pending=[];
 function module(file){
  if(modules.has(file))return modules.get(file);
  const text=texts.get(file);assert.ok(text!==undefined,`Missing source ${file}`);
  const blocks=declarations(text);
  const names=new Map();
  for(const block of blocks){
   names.set(block.name,[...(names.get(block.name)??[]),block]);
   if(block.kind==="type")for(const [,constructor]of block.text.matchAll(/\b([A-Z][A-Za-z_0-9]*)\s*\{/g))
    names.set(constructor,[...new Set([...(names.get(constructor)??[]),block])]);
  }
  const imports=[...text.matchAll(/^import ([^\s]+)(?: as ([A-Za-z_][\w]*))?[^\n]*$/gm)]
   .map(match=>({text:match[0],path:match[1],alias:match[2],used:false}));
  const value={file,blocks,names,imports,kept:new Set()};modules.set(file,value);return value;
 }
 function keep(mod,name){for(const block of mod.names.get(name)??[])if(!mod.kept.has(block)){mod.kept.add(block);pending.push([mod,block]);}}
 const first=module(entry);
 if(rootName){assert.ok(first.names.has(rootName),`Missing root ${rootName}`);keep(first,rootName);}
 else for(const block of first.blocks)keep(first,block.name);
 for(const file of extraEntries){const inventory=module(file);for(const block of inventory.blocks)keep(inventory,block.name);}
 while(pending.length){
  const [mod,block]=pending.pop();
  const scanned=block.text.replace(/#[^\n]*|"(?:\\.|[^"\\])*"/g,"");
  const bound=new Set(),caseBound=new Set();
  const header=/^def[\s\S]*?:[ \t]*(?:\n|$)/.exec(scanned)?.[0]??scanned.slice(0,scanned.indexOf("\n"));
  for(const [,name]of header.matchAll(/\+?([a-z_][\w]*)\s*:/g))bound.add(name);
  for(const [,name]of scanned.matchAll(/^\s*\+?([a-z_][\w]*)\s*(?::[^=\n]+)?=/gm))bound.add(name);
  for(const [pattern]of scanned.matchAll(/\bcase [^:]*?:/g))
   for(const [name]of pattern.matchAll(/(?<![\w.])[a-z_][\w]*/g))caseBound.add(name);
  for(const [,name]of scanned.matchAll(/\b([a-z_][\w]*)\s*=>/g))bound.add(name);
  for(const match of scanned.matchAll(/[A-Za-z_][\w]*(?:\.[A-Za-z_][\w]*)*/g)){
   const token=match[0],called=/^\s*\(/.test(scanned.slice(match.index+token.length));
   if(!bound.has(token)&&(!caseBound.has(token)||called)&&(block.kind!=="type"||/^[A-Z]/.test(token)))keep(mod,token);
   const dot=token.indexOf(".");if(dot<0)continue;
   const imported=mod.imports.find(value=>value.alias===token.slice(0,dot));
   if(!imported)continue;
   imported.used=true;
   const dependency=module(relative(root,resolve(root,dirname(mod.file),imported.path)));
   assert.ok(dependency.names.has(token.slice(dot+1)),`unknown imported declaration ${mod.file}: ${token}`);
   keep(dependency,token.slice(dot+1));
  }
 }
 for(const mod of modules.values()){
  const output=join(directory,mod.file);mkdirSync(dirname(output),{recursive:true});
  writeFileSync(output,mod.imports.filter(value=>value.used||value.path==="Base").map(value=>value.text).join("\n")+"\n"+
    mod.blocks.filter(block=>mod.kept.has(block)).map(block=>block.text).join(""));
 }
}
function mutationRoot(mutant){
 const original=sources.get(mutant[1]),[at]=tokenSpan(original,mutant[2]);
 assert.ok(at>=0);const definitions=[...original.matchAll(/^def ([A-Za-z_][\w.]*)/gm)];
 const found=definitions.findLast(m=>m.index<=at);assert.ok(found,`No owner for mutation ${mutant[0]}`);return found[1];
}
function check(mutant,changed=false,core=false,budget=mutant?.[4]==="budget",selectedLaw=mutant?.[0],environment=process.env){
 const selectedLaws=budget?budgetLaws:laws,selectedProof=budget?budgetProof:proof
 const dir=mkdtempSync(join(tmpdir(),"hapsland-tower-time-"))
 try{
  const texts=new Map();
  for(const [file,original]of sources){
   let source=original
   if(selectedLaw&&file===selectedLaws) source=section(source,"law ",selectedLaw)
   if(selectedLaw&&file===selectedProof) source=section(source,"def Laws.",selectedLaw)
   if(changed&&file===mutant[1]){source=replaceTokens(source,mutant[2],mutant[3])}
   texts.set(file,source);
   const path=join(dir,file);mkdirSync(dirname(path),{recursive:true});writeFileSync(path,source)
  }
  writeSlice(dir,core?mutant[1]:selectedProof,texts,core?mutationRoot(mutant):undefined,selectedLaw?[]:[selectedLaws]);
  return spawnSync("bend",[join(dir,core?mutant[1]:selectedProof),!core&&mathematical.has(selectedLaw)?"--verdict":"--check-only"],{encoding:"utf8",timeout:5000,env:environment})
 }finally{rmSync(dir,{recursive:true,force:true})}
}
function checkInventory(budget){
 const lawSource=sources.get(budget?budgetLaws:laws),proofSource=sources.get(budget?budgetProof:proof)
 const names=[...lawSource.matchAll(/^law (\w+):/gm)].map(m=>m[1])
 const proofs=[...proofSource.matchAll(/^def Laws\.(\w+)\(/gm)].map(m=>m[1])
 assert.ok(names.length>0,"Original law inventory is nonempty")
 assert.deepEqual([...names].sort(),[...proofs].sort(),"Every original law has exactly one original proof")
 for(const name of names){
  const r=check(undefined,false,false,budget,name)
  if(r.error)r.error.message+=` [original law ${name}]`
  assert.ifError(r.error);assert.equal(r.status,0,`${name}: ${r.stdout}${r.stderr}`)
  assert.match(r.stdout,/ALL PROOFS CHECK/)
 }
}
test("elapsed-time transport and numeric upgrade laws check",()=>checkInventory(false))
test("fixed investment and established delivery counter laws check",()=>checkInventory(true))
for(const mutant of mutants)test(`timing law rejects ${mutant[0]} mutation`,()=>{
 const good=check(mutant);assert.ifError(good.error);assert.equal(good.status,0,good.stdout+good.stderr)
 const compiled=check(mutant,true,true);assert.ifError(compiled.error);assert.equal(compiled.status,0,compiled.stdout+compiled.stderr)
 const bad=check(mutant,true);assert.ifError(bad.error);assert.equal(bad.status,1,bad.stdout+bad.stderr)
 assert.match(bad.stdout+bad.stderr,new RegExp(`Location: Laws\\.${mutant[0]}`))
})

test("new roster kernel proofs cannot pass with the mathematical checker disabled",()=>{
 const result=check(undefined,false,false,false,"finisher_prefers_short",{...process.env,BENDTT:"/usr/bin/false"});
 assert.ifError(result.error);assert.equal(result.status,1,result.stdout+result.stderr);
 assert.match(result.stdout+result.stderr,/BendTT infrastructure/);
});
