import assert from 'node:assert/strict'
const empty=()=>({$:'MTip'}),list=xs=>xs.reduceRight((tail,head)=>({$:'Con',head,tail}),{$:'Nil'})
const unlist=xs=>{const result=[];while(xs.$==='Con'){result.push(xs.head);xs=xs.tail}if(xs.$!=='Nil')throw new TypeError('invalid emitted list tail');return result}
const entries=m=>{const result=[],stack=[m];while(stack.length){const node=stack.pop();if(node.$==='Own.DNil'||node.$==='MTip')continue;if(node.$==='Own.DLeaf')result.push([node.key,node.value]);else if(node.$==='MLeaf')result.push([node.key,node.val]);else if(node.$==='Own.DCon'){result.push([node.key,node.value]);stack.push(node.rest)}else if(node.$==='Own.DBranch')stack.push(node.one,node.zero);else if(node.$==='MNode')stack.push(node.hi,node.lo);else throw new TypeError('invalid emitted dictionary')}return result}
const expectation=value=>({$:value===undefined?'AnyKind':value==='type'?'TypeKind':'FunctionKind'})

export function createLocalGraphPlanner(core){
 const models={direct:core}
 function planLocal(file,invocationPath,name,expected,visited,budget,depth){
  const ids=new Map(),strings=[],labels=new Map()
  const intern=s=>{if(typeof s!=='string')throw new TypeError('registry key must be String');const old=ids.get(s);if(old!==undefined)return old;const id=ids.size+1;if(!Number.isSafeInteger(id)||id>0xffffffff)throw new RangeError('registry ID outside uint32');ids.set(s,id);strings[id]=s;return id}
  const label=s=>{const old=labels.get(s);if(old!==undefined)return old;const value={$:'Label',key:intern(s),type_key:intern('type:'+s),function_key:intern('function:'+s)};labels.set(s,value);return value}
  const decodedEntries=m=>entries(m).map(([key,value])=>[text(key),value])
  const text=v=>{const s=strings[Number(v)];if(typeof s!=='string')throw new TypeError('missing decoded String');return s}
  const declarationsByHandle=new Map();let next=1
  const encodeDeclaration=d=>{const handle=next++;declarationsByHandle.set(handle,{declaration:d,file});return {$:'Declaration',handle,identity:intern(d.artifact.id),function:d.artifact.kind==='function',bundled:d.artifact.origin?.kind==='bundled',references:list(d.references.map(r=>({$:'Reference',kind:{$:r.kind==='unsupported'?'Unsupported':'Named'},name:label(r.name),expected:expectation(r.expectedKind),target:r.targetId===undefined?{$:'None'}:{$:'Some',value:intern(r.targetId)}})))}}
  const dictionary=xs=>{
   const build=records=>{
    if(records.length===0)return {$:'Own.DNil'}
    if(records.length===1)return {$:'Own.DLeaf',key:records[0][0],value:records[0][1]}
    let difference=0;for(const [key]of records)difference|=records[0][0]^key
    const divisor=(difference&-difference)>>>0;assert.ok(divisor>0)
    const zero=[],one=[];for(const record of records)(Math.floor(record[0]/divisor)%2===0?zero:one).push(record)
    return {$:'Own.DBranch',divisor,zero:build(zero),one:build(one),count:records.length}
   }
   return build(xs.map(([name,value])=>[intern(name),value]))
  }
  const declarations=dictionary([...file.declarations].map(([key,d])=>[key,{$:'Some',value:encodeDeclaration(d)}]))
  const supporting=dictionary([...file.supportingDeclarations??[]].map(([key,d])=>[key,{$:'Some',value:encodeDeclaration(d)}]))
  const imports=dictionary([...file.imports].map(([key,b])=>[key,{$:'Some',value:{$:'ImportBinding',path:intern(b.path),name:intern(b.name),type_only:b.typeOnly===true,composite:intern(invocationPath+'\0'+b.path+'\0'+b.name)}}]))
  const seen=dictionary([...visited].map(key=>[key,true]))
  const targets=dictionary([...budget.targetsByPath].map(([key,t])=>[key,dictionary([...t].map(id=>[id,true]))]))
  const rawBudget={$:'Budget',limits:{$:'LocalLimits',work:budget.limits.work,depth:budget.limits.depth,targets:budget.limits.outgoingEdges},targets_by_path:targets,max_targets:budget.maxTargetsInFile,work:budget.work,graph_work:budget.graphWork,max_depth:budget.maxDepth}
  const result=models.direct.plan({$:'Facts',kind_aware:!!file.kindAware,declarations,imports,supporting},intern(invocationPath),label(name),expectation(expected),seen,rawBudget,depth)
  if(result.$!=='CompletePlan'&&result.$!=='MissingRoot')throw new TypeError('unexpected checked planner result variant')
  const raw=result.$==='MissingRoot'?result:result.plan
  const updatedVisited=new Set(decodedEntries(raw.visited).map(([key])=>key)),updatedBudget={...budget,targetsByPath:new Map(decodedEntries(raw.budget.targets_by_path).map(([path,t])=>[path,new Set(decodedEntries(t).map(([key])=>key))])),work:Number(raw.budget.work),maxDepth:Number(raw.budget.max_depth),maxTargetsInFile:Number(raw.budget.max_targets),graphWork:Number(raw.budget.graph_work)}
  if(result.$==='MissingRoot')return {built:undefined,visited:updatedVisited,budget:updatedBudget}
  const nodeRecords=unlist(raw.nodes),nodes=new Map(),parents=new Map()
  for(const n of nodeRecords){
   const address=Number(n.node),payload=declarationsByHandle.get(Number(n.artifact))
   if(address!==nodes.size||payload===undefined)throw new TypeError('invalid planned node address or artifact handle')
   nodes.set(address,{artifact:payload.declaration.artifact,references:[]})
  }
  if(Number(raw.root)!==0||!nodes.has(0))throw new TypeError('invalid planned root')
  const reasons={Unresolved:'unresolved',UnsupportedTarget:'unsupported',ReferenceLimit:'reference-limit',Unavailable:'unavailable'}
  for(const slot of unlist(raw.references)){
   const r=slot.reference,site={symbol:text(slot.symbol)},owner=Number(slot.owner),index=Number(slot.index),node=nodes.get(owner)
   if(node===undefined||index!==node.references.length)throw new TypeError('invalid reference owner or slot index')
   if(r.$!=='Included'&&r.$!=='Expanded'&&r.$!=='Omitted')throw new TypeError('invalid planned reference variant')
   if(r.$==='Omitted'&&!Object.hasOwn(reasons,r.reason.$))throw new TypeError('invalid omission reason')
   if(r.$==='Expanded'){
    const child=Number(r.node)
    if(!nodes.has(child)||child<=owner||parents.has(child))throw new TypeError('invalid expanded child address')
    parents.set(child,owner)
   }
   node.references[index]=r.$==='Included'?{kind:'included',site,target:text(r.identity)}:r.$==='Expanded'?{kind:'expanded',site,node:nodes.get(Number(r.node))}:{kind:'omitted',site,target:{kind:'unresolved',symbol:text(r.target_name)},reason:reasons[r.reason.$]}
  }
  if(parents.size!==nodes.size-1)throw new TypeError('disconnected planned tree')
  const pendingSlots=new Map()
  const validatePending=p=>{
   const owner=nodes.get(Number(p.owner)),index=Number(p.index),reference=owner?.references[index]
   if(reference?.kind!=='omitted'||reference.reason!=='unavailable'||reference.site.symbol!==text(p.symbol))throw new TypeError('invalid pending owner or placeholder')
   let indexes=pendingSlots.get(owner);if(indexes===undefined){indexes=new Set();pendingSlots.set(owner,indexes)}
   if(indexes.has(index))throw new TypeError('duplicate pending slot');indexes.add(index)
   if(!['AnyKind','TypeKind','FunctionKind'].includes(p.expected.$))throw new TypeError('invalid pending expected kind')
   if(p.target.$!=='Imported'&&p.target.$!=='BundledTarget')throw new TypeError('invalid pending target variant')
   if(p.target.$==='Imported'&&text(p.name)!==text(p.target.name))throw new TypeError('inconsistent pending import name')
   if(!Number.isSafeInteger(Number(p.depth))||Number(p.depth)<0)throw new TypeError('invalid pending depth')
   return p
  }
  const bundledFor=handle=>{const payload=declarationsByHandle.get(Number(handle));if(payload===undefined||payload.file!==file)throw new TypeError('missing complete bundled payload');return payload}
  const pending=unlist(raw.pending).map(validatePending).map(p=>({owner:nodes.get(Number(p.owner)),index:Number(p.index),from:text(p.from),symbol:text(p.symbol),name:text(p.name),depth:Number(p.depth),...(p.expected.$==='AnyKind'?{}:{expectedKind:p.expected.$==='TypeKind'?'type':'function'}),...(p.target.$==='Imported'?{importPath:text(p.target.path)}:{importPath:'',bundled:bundledFor(p.target.declaration)})}))
  for(const node of nodes.values())for(let index=0;index<node.references.length;index++){const reference=node.references[index];if(reference.kind==='omitted'&&reference.reason==='unavailable'&&!pendingSlots.get(node)?.has(index))throw new TypeError('missing pending for unavailable placeholder')}
  return {built:{node:nodes.get(Number(raw.root)),pending},visited:updatedVisited,budget:updatedBudget}
 }
 return planLocal
}

// Commit only after the complete result and all artifact payloads are decoded.
// Preserve caller-owned Set/Map objects, including existing per-path Sets.
export function commitLocalGraphPlan(result,visited,budget){
 if(result.built===undefined)return undefined
 for(const identity of result.visited)visited.add(identity)
 for(const [path,targets] of result.budget.targetsByPath){
  let current=budget.targetsByPath.get(path)
  if(current===undefined){current=new Set();budget.targetsByPath.set(path,current)}
  for(const target of targets)current.add(target)
 }
 budget.work=result.budget.work
 budget.graphWork=result.budget.graphWork
 budget.maxDepth=result.budget.maxDepth
 budget.maxTargetsInFile=result.budget.maxTargetsInFile
 return result.built
}
