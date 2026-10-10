import assert from 'node:assert/strict'
import {execFileSync} from 'node:child_process'
import {mkdtemp,mkdir,writeFile,symlink,rm,lstat} from 'node:fs/promises'
import {join,dirname,isAbsolute,sep} from 'node:path'
import {pathToFileURL} from 'node:url'
import {createServiceSession,unlist} from './service-session.mjs'
import {selectedByDirectFilePolicy,contextDirectFilePolicy,DEFAULT_DIRECT_FILE_POLICY} from '../../../packages/native-observation/dist/direct-event/selection.js'
const folder=import.meta.dirname,temp=await mkdtemp('/tmp/hapsland-python-stat-')
const t=(name,fields={})=>({$:'Types.'+name,...fields}),s=(name,fields={})=>({$:'python-module/Session.'+name,...fields})
try{
 const emitted=join(temp,'child.mjs');execFileSync('taskset',['-c','10','bend',join(folder,'PythonModule.bend'),'-o',emitted],{timeout:5000});const {default:child}=await import(pathToFileURL(emitted))
 for(const path of ['src/pkg/root.py','a/b/c/d/e/f/g/root.py']){await mkdir(dirname(join(temp,path)),{recursive:true});await writeFile(join(temp,path),'class Root: pass\n')}
 await writeFile(join(temp,'file.py'),'class Root: pass\n');await symlink('src',join(temp,'link'));await symlink('file.py',join(temp,'link.py'))
 const policy=contextDirectFilePolicy(DEFAULT_DIRECT_FILE_POLICY),signature=observation=>observation?.$==='Types.MembershipPresent'?observation.signature:'absent'
 const within=path=>!isAbsolute(path)&&path!=='..'&&!path.startsWith('..'+sep)
 const cases=[
  {name:'empty-membership',paths:[]},
  {name:'signature-change',paths:['file.py'],mutate:'file.py'},
  {name:'negative-becomes-positive',paths:['later.py'],mutate:'later.py'},
  {name:'ordered-and-cached',paths:['src/pkg/root.py','src/pkg/root.py']},
  {name:'absent-ancestor',paths:['absent/child.py','absent/other.py']},
  {name:'non-directory',paths:['file.py/child.py']},
  {name:'ancestor-symlink',paths:['link/pkg/root.py']},
  {name:'leaf-symlink',paths:['link.py','file.py']},
  {name:'cached-while-unavailable',paths:['file.py','link.py','file.py']},
  {name:'maximum-depth',paths:['a/b/c/root.py'],depth:1},
  {name:'one-beyond-depth',paths:['a/b/c/d/root.py'],depth:1},
  {name:'absent-leaf',paths:['src/pkg/absent.py']},
  {name:'policy-refusal',paths:['root.json']},
  {name:'escape',paths:['../root.py']},
  {name:'deadline',paths:['src/pkg/root.py'],expired:true},
  {name:'work-cut',paths:['src/pkg/root.py'],work:1}
 ]
 let invocation=0,steps=0,revalidations=0
 for(const fixture of cases){
  let elapsed=0,available=true,work=0;const membership=new Map(),expected=[],actual=[],depth=fixture.depth??4,workCap=fixture.work??40
  const io=createServiceSession({invocation:++invocation,root:temp,now:()=>{actual.push('clock');return elapsed},selectContextPath:path=>{actual.push('select:'+path);return selectedByDirectFilePolicy(path,policy)}})
  const clock=(await io.perform(t('Request',{invocation,id:0,operation:t('StartClock')}))).outcome.clock;actual.length=0
  let state=child.initial_session('file.py',50n,BigInt(depth),s('Remaining',{files:s('Nonnegative',{value:8n}),read_bytes:s('Nonnegative',{value:100n}),work:s('Nonnegative',{value:BigInt(workCap)})})),next=1n
  const permit=()=>{if(!available)return false;expected.push('clock');return elapsed<5000&&work<=workCap}
  async function observe(path,refresh=false){
   if(membership.has(path)&&!refresh)return membership.get(path)
   if(!within(path)||!permit()||work>=workCap){available=false;return undefined}
   work++;expected.push('probe:'+path);let observation
   try{const status=await lstat(join(temp,path));observation=t('MembershipPresent',{is_file:status.isFile(),is_directory:status.isDirectory(),is_symlink:status.isSymbolicLink(),signature:[status.mode,status.dev,status.ino,status.size,status.mtimeMs,status.ctimeMs].join(':')})}
   catch(error){observation=t(error.code==='ENOENT'?'MembershipAbsent':'MembershipFailed')}
   if(observation.$==='Types.MembershipFailed'||observation.is_symlink||(membership.has(path)&&signature(membership.get(path))!==signature(observation)))available=false
   membership.set(path,observation);return observation
  }
  async function nativeStat(path){
   if(!within(path)){available=false;return undefined}
   expected.push('select:'+path);if(!selectedByDirectFilePolicy(path,policy)){available=false;return undefined}
   const ancestors=[];let directory=dirname(path)
   while(directory!=='.'){if(ancestors.length>depth+1){available=false;return undefined}ancestors.push(directory);directory=dirname(directory)}
   for(const ancestor of ancestors.reverse()){const status=await observe(ancestor);if(!available||!status||status.$!=='Types.MembershipPresent')return undefined;if(!status.is_directory){available=false;return undefined}}
   return observe(path)
  }
  const drive=async(step,resume)=>{
   while(step.$.endsWith('.Await')){
    if(step.request.operation.$==='Types.ReadPathMembership')actual.push('probe:'+step.request.operation.path)
    step=resume(step,await io.perform(step.request))
   }
   return step
  }
  const assertState=()=>{assert.equal(state.available,available,fixture.name);assert.equal(state.work,BigInt(work),fixture.name);assert.deepEqual(unlist(state.membership).map(row=>[row.path,row.observation]),[...membership],fixture.name);assert.deepEqual(actual,expected,fixture.name)}
  try{
   if(fixture.expired)elapsed=5000
   for(const path of fixture.paths){
    const value=await nativeStat(path),step=await drive(child.stat(state,path,clock,sep,BigInt(invocation),next),child.resume_stat)
    assert.equal(step.$,'python-module/StatMachine.Returned',fixture.name);state=step.session;next=step.next_request
    const observation=step.observation.$==='Some'?step.observation.value:undefined
    assert.equal(observation?.$==='Types.MembershipPresent',value?.$==='Types.MembershipPresent',fixture.name);assertState();steps++
   }
   if(fixture.mutate)await writeFile(join(temp,fixture.mutate),"changed membership bytes "+fixture.name+"\n")
   // Validate the exact captured insertion-order snapshot and final permit.
   let valid=true
   for(const [path,old]of [...membership]){const current=await observe(path,true);if(!available||signature(current)!==signature(old)){valid=false;break}}
   if(valid)valid=permit()
   const validation=await drive(child.revalidate(state,clock,sep,BigInt(invocation),next),child.resume_revalidation)
   assert.equal(validation.$,'python-module/RevalidationMachine.Returned',fixture.name);state=validation.session;next=validation.next_request;assert.equal(validation.valid,valid,fixture.name);assertState();revalidations++
  }finally{io.close()}
 }
 console.log(JSON.stringify({at:new Date().toISOString(),cases:cases.length,statSteps:steps,revalidations,orderedEffectsAndState:true,ancestorOrder:true,negativeAncestorAvailable:true,nonDirectoryAndSymlinks:true,cachedUnavailable:true,depthBoundary:true,refreshSnapshotOrder:true,failFastWithoutFinalPermit:true,scope:'Complete stat and membership revalidation children against independent original-algorithm interpreter; not full Python GraphSession or Canonical acceptance'}))
}finally{await rm(temp,{recursive:true,force:true})}
