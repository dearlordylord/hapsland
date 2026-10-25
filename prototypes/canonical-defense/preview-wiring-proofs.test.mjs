import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {mkdtempSync,readFileSync,writeFileSync,readdirSync,mkdirSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join,resolve,relative,dirname} from "node:path";
import {test} from "node:test";
import {replaceTokens} from "./motion-state-slice.mjs";

const root=new URL("./",import.meta.url).pathname;
const sources=new Map(readdirSync(root).filter(f=>f.endsWith(".bend")).map(f=>[f,readFileSync(join(root,f),"utf8")]));
const targetStep="      keep_target(Fire.eligible(target,Fire.due(order,world),world,tower,0n),target,targets(tail,world,tower))";
const ordinary="    case CB.Target{owner,_,order}: Marks.Target{key(owner),None{},order,selected}";
const held="    case _ <> tail: targets(tail,world,tower)";
const mutants=[
 ["PreviewWiring","beam_tracks_current_body","beam_layers","beam(33n,Map.Point{fx,fy},point,beam_layers(tail,point,rest))","beam(33n,Map.Point{fx,fy},Map.Point{hx,hy},beam_layers(tail,point,rest))"],
 ["PreviewEntry","constructed_range_uses_physics","tower_range_color","  coverage_color((Fire.remaining(world,tower) > 0 : U32))","  kind_color(M.tkind(tower))","DefenseRender.bend"],
 ["PreviewEntry","prebuild_matches_constructed","ghost_range_color","  coverage_color((Preview.before(preview) > 0 : U32))","  coverage_color(False{})","DefenseRender.bend"],
 ["PreviewEntry","selected_range_is_drawn","selected_ring","H.built_range(tower),tower_range_color(world,tower),rest)","H.built_range(tower),kind_color(M.tkind(tower)),rest)","DefenseRender.bend"],
 ["PreviewEntry","pause_preserves_coverage","available","  targets(Fire.originals(Engine.callback_state(Run.core(M.engine(world)))),Fire.targeting_world(world),tower)","  Bool.pick(List<&2,CB.Target>,M.paused(world),[],targets(Fire.originals(Engine.callback_state(Run.core(M.engine(world)))),Fire.targeting_world(world),tower))"],
 ["PreviewWiring","coverage_uses_source_world","annotations","exact_marks(available(source,tower),source,next_plan(choice,tower),ready(choice,tower))","exact_marks(available(choice,tower),source,next_plan(choice,tower),ready(choice,tower))"],
 ["PreviewWiring","live_entity_position","history_actor","actor_at(Motion.point(actor),actor,world,rest)","actor_at(D.Point{0,0},actor,world,rest)","DefenseRender.bend"],
 ["PreviewWiring","every_live_entity_drawn","history_actors","case +actor <> tail: history_visible(rule_parent_visible(actor,world),actor,world,history_actors(tail,world,rest))","case +actor <> tail: history_actors(tail,world,rest)","DefenseRender.bend"],

 ["PreviewEntry","coverage_palette","coverage_color","    case True{}: 6741384","    case True{}: 15758447","DefenseRender.bend"],
 ["PreviewEntry","coverage_ignores_buildability","ghost_range_color","  coverage_color((Preview.before(preview) > 0 : U32))","  Bool.pick(U32,Preview.legal(preview),6741384,15758447)","DefenseRender.bend"],
 ["PreviewEligibility","eligible_callback_step","targets",targetStep,"      keep_target(False{},target,targets(tail,world,tower))"],
 ["PreviewEligibility","include_eligible_target","keep_target","    case True{}: target <> rest","    case True{}: rest"],
 ["PreviewEligibility","exclude_ineligible_target","keep_target","    case False{}: rest","    case False{}: target <> rest"],
 ["PreviewEligibility","no_originals_no_targets","targets","    case Nil{}: []","    case Nil{}: [CB.Target{CB.Owner{0n,0n,0n,0n},CB.PreparationCompleted{},0n}]"],
 ["PreviewEligibility","held_not_previewed","targets",held,"    case CB.Original{CB.Fact{target,_,_,_},_,_} <> tail: target <> targets(tail,world,tower)"],
 ["PreviewEligibility","dropped_not_previewed","targets",held,"    case CB.Original{CB.Fact{target,_,_,_},_,_} <> tail: target <> targets(tail,world,tower)"],
 ["PreviewChoice","preview_automatic_target","next_when","    case True{}: Fire.target(world,tower,0n)","    case True{}: None{}"],
 ["PreviewChoice","cooldown_has_no_instant_target","next_when","    case False{}: None{}","    case False{}: Fire.target(world,tower,0n)"],
 ["PreviewChoice","exact_callback_choice","chosen","    case Some{other}: CB.target_equal(target,other)","    case Some{other}: True{}"],
 ["PreviewChoice","no_choice_without_callback","chosen","    case None{}: False{}","    case None{}: True{}"],
 ["PreviewChoice","key_scope","key","    case CB.Owner{p,l,r,o}: V.WorkIdentity{p,l,r,o}","    case CB.Owner{p,l,r,o}: V.WorkIdentity{p,0n,r,o}"],
 ["PreviewChoice","finish_capture","candidate","    case CB.Target{owner,CB.FinishTerminal{_,_,_,_,ids},order}: Marks.Target{key(owner),Some{ids},order,selected}","    case CB.Target{owner,CB.FinishTerminal{_,_,_,_,ids},order}: Marks.Target{key(owner),Some{[]},order,selected}"],
 ...["jev_capture","preparation_capture","output_capture"].map(law=>["PreviewChoice",law,"candidate",ordinary,"    case CB.Target{owner,_,order}: Marks.Target{key(owner),None{},0n,selected}"]),
 ["PreviewWiring","render_annotations","render","  Marks.draw(annotations(source,choice,tower),Marks.draw_anchors(anchors(available(source,tower),source,next_plan(choice,tower),ready(choice,tower)),rest))","  rest"],
 ["PreviewWiring","scene_consumes_preview","preview_layer","  TowerPreview.overlay(world,preview,TowerPreview.live_layer(world,rest))","  rest","DefenseRender.bend"],
 ["PreviewWiring","body_position","body","    case Map.Point{x,y}: Marks.Body{key,x,y}","    case Map.Point{x,y}: Marks.Body{key,y,x}"]
 ,["PreviewEntry","actual_scene_has_preview","scene","  preview_layer(world,Preview.calculate(world),base(world))","  base(world)","DefenseRender.bend"]
 ,["PreviewEntry","overlay_dispatch","overlay","  overlay_when((M.selected(world) > 0 : U32),world,preview,rest)","  rest"]
 ,["PreviewEntry","overlay_selected","overlay_when","    case True{}: selected(H.selected_tower(M.towers(world),M.selected(world)),world,rest)","    case True{}: rest"]
 ,["PreviewEntry","overlay_placement","overlay_when","    case False{}: placed(world,preview,rest)","    case False{}: rest"]
 ,["PreviewEntry","selected_existing","selected","    case Some{tower}: render(world,context(world,M.selected(world)),tower,rest)","    case Some{tower}: rest"]
 ,["PreviewEntry","selected_missing","selected","    case None{}: rest","    case None{}: []"]
 ,["PreviewEntry","placement_active","placed_when","    case True{}: render(world,world,H.preview_tower(Placement.x(preview),Placement.y(preview),Placement.kind(preview)),rest)","    case True{}: rest"]
 ,["PreviewEntry","placement_inactive","placed_when","    case False{}: rest","    case False{}: []"]
 ,["PreviewEntry","placement_guard","placed","  placed_when((Placement.x(preview) < 792 : U32) && (Placement.y(preview) > 100 : U32) && (Placement.y(preview) < 656 : U32),world,preview,rest)","  placed_when(Placement.legal(preview) && (Placement.x(preview) < 792 : U32) && (Placement.y(preview) > 100 : U32) && (Placement.y(preview) < 656 : U32),world,preview,rest)"]
];
mutants.push(
 ["LiveMotion","target_uses_visible_body","target_point","  Live.position(Live.find(target,M.mobs(world)))","  Map.Point{380,444}","DefenseTowerFire.bend"],
 ["LiveMotion","hit_preserves_body","hit","LiveTypes.Mob{t,x,y,path,d,20,fx,fy,b,a,at,x,y,LiveTypes.Beam{fx,fy,x,y,b,a,20} <> beams,(speed * 2n : Nat)}","LiveTypes.Mob{t,0,y,path,d,20,fx,fy,b,a,at,x,y,LiveTypes.Beam{fx,fy,x,y,b,a,20} <> beams,(speed * 2n : Nat)}","DefenseLiveMotion.bend"],
 ["LiveMotion","exact_identity_lookup","find","CB.target_equal(wanted,target(head))","True{}","DefenseLiveMotion.bend"],
 ["LiveMotion","no_body_no_position","position","case None{}: Map.Point{0,0}","case None{}: Map.Point{380,444}","DefenseLiveMotion.bend"],
 ["LiveMotion","positive_visible_acceleration","shortened","Nat.min(remaining,Nat.max(100n,(remaining / 2n : Nat)))","0n","DefenseTowerFire.bend"]
);

function choose(text,prefix,name){
 const blocks=text.split(new RegExp(`^${prefix.replaceAll(".","\\.")}`,"m"));
 const selected=blocks.slice(1).find(b=>b.startsWith(name+(prefix==="law "?":":"(")));
 assert.ok(selected,`missing declaration ${name}`);return blocks[0]+prefix+selected;
}
const repository=resolve(root,"../..");
const sourceCache=new Map([...sources].map(([file,text])=>[join(root,file),text]));
function source(file){
 if(!sourceCache.has(file))sourceCache.set(file,readFileSync(file,"utf8"));
 return sourceCache.get(file);
}
// The dependency slice retains verbatim owner declarations. The explicit scene
// exceptions below generalizes scene composition over typed child renderers.
// No primitive model or child implementation is substituted. Identifier scanning
// is conservative: shadowed names may retain extra code.
function declarations(text){
 const starts=[...text.matchAll(/^(def|type|law) ([A-Za-z_][\w.]*)/gm)];
 return starts.map((match,index)=>({kind:match[1],name:match[2],
  text:text.slice(match.index,starts[index+1]?.index??text.length)}));
}
function writeSlice(directory,entry,{stem,law,mutation,coreOnly}){
 const modules=new Map(),pending=[];
 function module(file){
  if(modules.has(file))return modules.get(file);
  let text=source(file);
  if(file===join(root,`${stem}LAWS.bend`)&&law)text=choose(text,"law ",law);
  if(file===join(root,`${stem}PROOF.bend`)&&law)text=choose(text,"def Laws.",law);
  const blocks=declarations(text);
  if(mutation&&file===join(root,mutation.file)){
   const block=blocks.find(block=>block.kind==="def"&&block.name===mutation.def);
   assert.ok(block,`missing mutated definition ${mutation.def}`);
   block.text=replaceTokens(block.text,mutation.from,mutation.to);
  }
  // Definitional scene wiring is stronger when its two child renderers are
  // arbitrary typed functions. Keep the actual wrapper body (including any
  // mutation), only alpha-renaming those calls and adding their parameters.
  // This proves composition, not either child implementation. Real emitted
  // scene/mutant tests separately bind the original imported callee names.
  if(stem==="PreviewWiring"&&(law==="scene_consumes_preview"||coreOnly&&mutation?.def==="preview_layer")){
   const overlay=alias=>`@+state:M.World -> @preview:${alias}.Preview -> @rest:List<&2,F.Rect> -> List<&2,F.Rect>`;
   const live="@+state:M.World -> @rest:List<&2,F.Rect> -> List<&2,F.Rect>";
   const rename=(text,from,to)=>text.includes(from)?replaceTokens(text,from,to):text;
   if(file===join(root,"DefenseRender.bend")){
    const block=blocks.find(b=>b.name==="preview_layer");
    block.text=replaceTokens(block.text,"def preview_layer(",`def preview_layer(~overlay: ${overlay("Preview")},~live: ${live},`);
    block.text=rename(rename(block.text,"TowerPreview.overlay","overlay"),"TowerPreview.live_layer","live");
   }
   if(file===join(root,"PreviewWiringLAWS.bend")){
    const block=blocks.find(b=>b.name==="scene_consumes_preview");
    block.text=block.text.replace("law scene_consumes_preview:",`law scene_consumes_preview:\n  for ~overlay: ${overlay("Placement")}\n  for ~live: ${live}`)
     ;
    block.text=replaceTokens(block.text,"Render.preview_layer(","Render.preview_layer(~overlay,~live,");
    block.text=rename(rename(block.text,"P.overlay","overlay"),"P.live_layer","live");
   }
   if(file===join(root,"PreviewWiringPROOF.bend")){
    const block=blocks.find(b=>b.name==="Laws.scene_consumes_preview");
    block.text=replaceTokens(block.text,"Laws.scene_consumes_preview(","Laws.scene_consumes_preview(overlay,live,");
   }
  }
  if(stem==="PreviewEntry"&&(law==="actual_scene_has_preview"||coreOnly&&mutation?.def==="scene")){
   const layer=alias=>`@+state:M.World -> @preview:${alias}.Preview -> @rest:List<&2,F.Rect> -> List<&2,F.Rect>`;
   const calculate=alias=>`@+state:M.World -> ${alias}.Preview`;
   const rename=(text,from,to)=>text.includes(from)?replaceTokens(text,from,to):text;
   if(file===join(root,"DefenseRender.bend")){
    const block=blocks.find(b=>b.name==="scene");
    block.text=replaceTokens(block.text,"def scene(",`def scene(~layer: ${layer("Preview")},~calculate: ${calculate("Preview")},`);
    block.text=rename(rename(block.text,"preview_layer","layer"),"Preview.calculate","calculate");
   }
   if(file===join(root,"PreviewEntryLAWS.bend")){
    const block=blocks.find(b=>b.name==="actual_scene_has_preview");
    block.text=block.text.replace("law actual_scene_has_preview:",`law actual_scene_has_preview:\n  for ~layer: ${layer("Placement")}\n  for ~calculate: ${calculate("Placement")}`);
    block.text=replaceTokens(block.text,"R.scene(","R.scene(~layer,~calculate,");
    block.text=rename(rename(block.text,"R.preview_layer","layer"),"Placement.calculate","calculate");
   }
   if(file===join(root,"PreviewEntryPROOF.bend")){
    const block=blocks.find(b=>b.name==="Laws.actual_scene_has_preview");
    block.text=replaceTokens(block.text,"Laws.actual_scene_has_preview(","Laws.actual_scene_has_preview(layer,calculate,");
   }
  }
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
 if(coreOnly)keep(first,mutation.def);else for(const block of first.blocks)keep(first,block.name);
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
   const dependency=module(resolve(dirname(mod.file),imported.path));
   assert.ok(dependency.names.has(token.slice(dot+1)),`unknown imported declaration ${mod.file}: ${token}`);
   keep(dependency,token.slice(dot+1));
  }
 }
 for(const mod of modules.values()){
  const local=relative(repository,mod.file);assert.ok(!local.startsWith(".."),"slice stays inside repository");
  const output=join(directory,local);mkdirSync(dirname(output),{recursive:true});
  writeFileSync(output,mod.imports.filter(value=>value.used||value.path==="Base").map(value=>value.text).join("\n")+"\n"+
    mod.blocks.filter(block=>mod.kept.has(block)).map(block=>block.text).join(""));
 }
 return {entry:join(directory,relative(repository,entry)),summary:[...modules.values()].map(mod=>({
   file:relative(repository,mod.file),definitions:mod.kept.size,bytes:[...mod.kept].reduce((n,b)=>n+b.text.length,0)
  })).sort((a,b)=>b.bytes-a.bytes).slice(0,5)};
}
function check(stem,{law,mutation,coreOnly=false}={}){
 const directory=mkdtempSync(join(tmpdir(),"hapsland-preview-wiring-"));
 try{
  const entry=join(root,coreOnly?mutation.file:`${stem}PROOF.bend`);
  const sliced=writeSlice(directory,entry,{stem,law,mutation,coreOnly});
  const result=spawnSync("bend",[sliced.entry,"--check-only"],{encoding:"utf8",timeout:5000});
  if(result.error)result.error.message+=` [${stem}.${law??mutation?.def}: ${JSON.stringify(sliced.summary)}]`;
  return result;
 }finally{rmSync(directory,{recursive:true,force:true})}
}

for(const stem of["PreviewEligibility","PreviewChoice","PreviewWiring","PreviewEntry","LiveMotion"])test(`${stem} world boundary laws check`,()=>{
 const laws=[...sources.get(`${stem}LAWS.bend`).matchAll(/^law (\w+):/gm)].map(match=>match[1]);
 assert.ok(laws.length>0,"nonempty unchanged owner law inventory");
 for(const law of laws){const r=check(stem,{law});assert.ifError(r.error);assert.equal(r.status,0,`${stem}.${law}: ${r.stdout}${r.stderr}`);assert.match(r.stdout,/ALL PROOFS CHECK/);}
});
for(const[stem,law,def,from,to,file="DefenseTowerPreview.bend"]of mutants)test(`boundary law rejects ${law}`,()=>{
 const mutation={file,def,from,to};const core=check(stem,{mutation,coreOnly:true});assert.ifError(core.error);assert.equal(core.status,0,core.stdout+core.stderr);
 const r=check(stem,{law,mutation});assert.ifError(r.error);assert.equal(r.status,1,r.stdout+r.stderr);assert.match(r.stdout+r.stderr,new RegExp(`Location: Laws\\.${law}`));
});
