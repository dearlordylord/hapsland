import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {mkdtempSync,readFileSync,writeFileSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {test} from "node:test";

const files=["DefensePreviewMarks.bend","Font.bend","DefenseMotionTypes.bend","PreviewLAWS.bend","PreviewPROOF.bend"];
const sources=new Map(files.map(f=>[f,readFileSync(new URL(f,import.meta.url),"utf8")]));
const mutants=[
 ["valid_body_is_marked","valid body omitted","    case True{}: Mark{target,body,selected,ready} <> rest","    case True{}: rest"],
 ["invalid_body_not_marked","invalid body included","    case False{}: rest","    case False{}: Mark{target,body,selected,ready} <> rest"],
 ["visits_every_body","only first body visited","    case body <> tail: for_body(target,body,selected,ready,for_target(tail,target,selected,ready,rest))","    case body <> tail: for_body(target,body,selected,ready,rest)"],
 ["visits_every_target","only first target visited","    case +target <> tail: for_target(bodies,target,chosen(target),ready,collect(tail,bodies,ready,rest))","    case +target <> tail: for_target(bodies,target,chosen(target),ready,rest)"],
 ["ordinary_identity","ordinary body never matches","    case Target{owner,None{},_,_} Body{other,_,_}: same(owner,other)","    case Target{owner,None{},_,_} Body{other,_,_}: False{}"],
 ["finish_membership","Finish includes uncommitted work","      Nat.is_eq(p,bp) && Nat.is_eq(l,bl) && Nat.is_eq(r,br) && contains(bo,ids)","      Nat.is_eq(p,bp) && Nat.is_eq(l,bl) && Nat.is_eq(r,br)"],
 ["exact_chosen","chosen callback hidden","    case Target{_,_,_,value}: value","    case Target{_,_,_,value}: False{}"],
 ["render_every_mark","all marker drawing deleted","    case mark <> tail: draw_one(mark,draw(tail,rest))","    case mark <> tail: rest"],
 ["visible_marker_at_body","marker at wrong body position","      F.Box{left(x),top(y),21,2,color(selected,ready)} <>","      F.Box{0,0,21,2,color(selected,ready)} <>"],
 ["empty_targets_no_phantoms","empty list erases existing annotations","    case Nil{}: rest","    case Nil{}: []",2],
 ["cooldown_is_visible","paused eligibility disappears","    case _ False{}: 6741384","    case _ False{}: 9148069"],
 ["body_membership_exact","membership is ignored","  keep(belongs(target,body),target,body,selected,ready,rest)","  keep(True{},target,body,selected,ready,rest)"],
 ["membership_empty","empty Finish selects everything","    case Nil{}: False{}","    case Nil{}: True{}"],
 ["membership_step","only first Finish member considered","    case head <> tail: Nat.is_eq(id,head) || contains(id,tail)","    case head <> tail: Nat.is_eq(id,head)"],
 ["same_full_identity","lifetime and round lost","    case V.WorkIdentity{p,l,r,o} V.WorkIdentity{bp,bl,br,bo}: Nat.is_eq(p,bp) && Nat.is_eq(l,bl) && Nat.is_eq(r,br) && Nat.is_eq(o,bo)","    case V.WorkIdentity{p,l,r,o} V.WorkIdentity{bp,bl,br,bo}: Nat.is_eq(o,bo)"],
 ["accelerator_scope_without_targets","accelerator purpose disappears","    case 3: \"AUTO: PREPARATION / JEV WORK\"","    case 3: \"\""],
 ["courier_scope_without_targets","courier purpose disappears","    case 4: \"AUTO: AUTHORIZED OUTPUT / FINISH\"","    case 4: \"\""],
 ["no_bodies_no_mark","empty body list erases prior annotations","    case Nil{}: rest","    case Nil{}: []",1],
 ["no_marks_no_drawing","empty marks erase scene","    case Nil{}: rest","    case Nil{}: []",3],
 ["every_anchor_is_drawn","logical targets have no preview","    case item <> tail: draw_anchor(item,draw_ordered(tail,rest))","    case item <> tail: rest"],
 ["no_targets_no_anchor_drawing","empty anchors erase scene","    case Nil{}: rest","    case Nil{}: []",4],
 ["anchor_visible_at_target","logical target cross is misplaced","      F.Box{left(x),(y + 2 : U32),21,3,color(selected,ready)} <>","      F.Box{0,0,21,3,color(selected,ready)} <>"]
 ,["anchor_partition_empty","empty partition invents a target","    case Nil{}: []","    case Nil{}: [Anchor{0,0,\"BAD\",True{},True{}}]",1]
 ,["anchor_partition_step","anchor partition skips a target","    case +head <> tail: anchor_keep(wanted,anchor_selected(head),head,anchor_partition(tail,wanted))","    case +head <> tail: anchor_partition(tail,wanted)"]
 ,["anchor_partition_membership","selected target omitted from front layer","    case True{} True{}: value <> rest","    case True{} True{}: rest"]
 ,["anchors_order_chosen_first","other targets cover the chosen one","  draw_ordered(List.append(&2,Anchor,anchor_partition(items,True{}),anchor_partition(items,False{})),rest)","  draw_ordered(List.append(&2,Anchor,anchor_partition(items,False{}),anchor_partition(items,True{})),rest)"]
 ,["left_coordinate","body x coordinate erased","def left(+x: U32) -> U32: U32.sub(x,U32.min(x,10))","def left(+x: U32) -> U32: 0"]
 ,["top_coordinate","body y coordinate erased","def top(+y: U32) -> U32: U32.sub(y,U32.min(y,10))","def top(+y: U32) -> U32: 0"]
 ,["anchor_selected_field","next target loses its priority","    case Anchor{_,_,_,selected,_}: selected","    case Anchor{_,_,_,selected,_}: False{}"]
 ,["selected_ready_color","next target looks like all others","    case True{} True{}: 16768133","    case True{} True{}: 65483"]
 ,["other_ready_color","eligible targets look unavailable","    case _ _: 6741384","    case _ _: 9148069"]
];
function selectedLaw(name){
 const all=sources.get("PreviewLAWS.bend");
 return all.split(/^law /m)[0]+"law "+all.split(/^law /m).slice(1).find(b=>b.startsWith(name+":"));
}
function selectedProof(name){
 const all=sources.get("PreviewPROOF.bend");
 return all.split(/^def Laws\./m)[0]+"def Laws."+all.split(/^def Laws\./m).slice(1).find(b=>b.startsWith(name+"("));
}
function check({law,mutation,coreOnly=false,verdict=false}={}){
 const dir=mkdtempSync(join(tmpdir(),"hapsland-preview-proof-"));
 try{
  for(const [name,original]of sources){
   let value=original;
   if(name==="PreviewLAWS.bend"&&law)value=selectedLaw(law);
   if(name==="PreviewPROOF.bend"&&law)value=selectedProof(law);
   if(name==="DefensePreviewMarks.bend"&&mutation){
    const[from,to,nth=1]=mutation;let count=0;
    value=original.split("\n").map(line=>line===from&&++count===nth?to:line).join("\n");
    assert.ok(count>=nth,"mutation must find its actual implementation line");
   }
   writeFileSync(join(dir,name),value);
  }
  return spawnSync("bend",[join(dir,coreOnly?"DefensePreviewMarks.bend":"PreviewPROOF.bend"),...(verdict?["--verdict"]:[])],{encoding:"utf8",timeout:5000});
 }finally{rmSync(dir,{recursive:true,force:true})}
}
test("preview laws pass Bend and mathematical kernel",()=>{
 const r=check({verdict:true});assert.ifError(r.error);assert.equal(r.status,0,r.stdout+r.stderr);assert.match(r.stdout,/ALL PROOFS CHECK/);
});
for(const[law,why,from,to,nth]of mutants)test(`preview law rejects ${why}`,()=>{
 const baseline=check({law});assert.ifError(baseline.error);assert.equal(baseline.status,0,baseline.stdout+baseline.stderr);
 const mutation=[from,to,nth];const core=check({mutation,coreOnly:true});assert.ifError(core.error);assert.equal(core.status,0,core.stdout+core.stderr);
 const r=check({law,mutation});assert.ifError(r.error);assert.equal(r.status,1,r.stdout+r.stderr);assert.match(r.stdout+r.stderr,new RegExp(`Location: Laws\\.${law}`));
});
