import assert from 'node:assert/strict'
import {execFileSync} from 'node:child_process'
import {mkdtemp,writeFile,symlink,rm,lstat} from 'node:fs/promises'
import {join,isAbsolute,sep} from 'node:path'
import {pathToFileURL} from 'node:url'
import {createServiceSession,list,unlist} from './service-session.mjs'
const folder=import.meta.dirname,temp=await mkdtemp('/tmp/hapsland-python-module-')
const t=(name,fields={})=>({$:'Types.'+name,...fields}),s=(name,fields={})=>({$:'python-module/Session.'+name,...fields})
try{
 const emitted=join(temp,'child.mjs');execFileSync('taskset',['-c','10','bend',join(folder,'PythonModule.bend'),'-o',emitted],{timeout:5000})
 const {default:child}=await import(pathToFileURL(emitted))
 await writeFile(join(temp,'root.py'),'class Root: pass\n');await symlink('root.py',join(temp,'link.py'))
 let elapsed=0,invocation=0,checks=0
 async function scenario(paths,remaining={files:10,readBytes:100,work:10},mutation){
  elapsed=0;const io=createServiceSession({invocation:++invocation,root:temp,now:()=>elapsed})
  const clock=(await io.perform(t('Request',{invocation,id:0,operation:t('StartClock')}))).outcome.clock
  let state=child.initial_session('root.py',50n,4n,s('Remaining',{files:child.difference(Math.max(remaining.files,0),Math.max(-remaining.files,0)),read_bytes:child.difference(Math.max(remaining.readBytes,0),Math.max(-remaining.readBytes,0)),work:child.difference(Math.max(remaining.work,0),Math.max(-remaining.work,0))}))
  const membership=new Map();let work=0,available=true,next=1n
  try{
   for(let round=0;round<paths.length;round++){
    const [path,refresh=false,expired=false]=paths[round];elapsed=expired?5000:0
    if(mutation)await mutation(round)
    const expected=[]
    if(!membership.has(path)||refresh){
     if(isAbsolute(path)||path==='..'||path.startsWith('..'+sep)||!available)available=false
     else{
      expected.push('Types.ReadClock')
      if(expired||0>remaining.files||0>remaining.readBytes||work>remaining.work||work>=remaining.work)available=false
      else{
       work++;expected.push('Types.ReadPathMembership')
       let observation
       try{const v=await lstat(join(temp,path));observation=t('MembershipPresent',{is_file:v.isFile(),is_directory:v.isDirectory(),is_symlink:v.isSymbolicLink(),signature:[v.mode,v.dev,v.ino,v.size,v.mtimeMs,v.ctimeMs].join(':')})}
       catch(error){observation=t(error.code==='ENOENT'?'MembershipAbsent':'MembershipFailed')}
       const signature=v=>v?.$==='Types.MembershipPresent'?v.signature:'absent'
       if(observation.$==='Types.MembershipFailed'||observation.is_symlink||(membership.has(path)&&signature(membership.get(path))!==signature(observation)))available=false
       membership.set(path,observation)
      }
     }
    }
    let step=child.observe(state,path,refresh,clock,sep,BigInt(invocation),next);const actual=[]
    while(step.$==='python-module/MembershipMachine.Await'){
     const request=step.request;if(request.operation.$!=='Types.PathIsAbsolute')actual.push(request.operation.$)
     step=child.resume(step,await io.perform(request))
    }
    assert.equal(step.$,'python-module/MembershipMachine.Returned');state=step.session;next=step.next_request
    assert.deepEqual(actual,expected);assert.equal(state.available,available);assert.equal(state.work,BigInt(work));assert.deepEqual(unlist(state.membership).map(row=>[row.path,row.observation]),[...membership]);checks++
   }
  }finally{io.close()}
 }
 await scenario([['root.py'],['root.py',false,true],['missing.py'],['missing.py',false,true],['root.py',true]])
 await scenario([['root.py'],['root.py',true,true],['root.py']])
 await scenario([['root.py']],{files:10,readBytes:-1,work:10})
 await scenario([['root.py']],{files:-1,readBytes:100,work:10})
 await scenario([['root.py']],{files:10,readBytes:100,work:-1})
 await scenario([['root.py']],{files:10,readBytes:100,work:0})
 await scenario([['link.py']]);await scenario([['root.py/child']]);await scenario([['../outside.py']])
 await scenario([['root.py'],['root.py',true]],undefined,async round=>{if(round===1)await writeFile(join(temp,'root.py'),'changed bytes\n')})
 const io=createServiceSession({invocation:++invocation,root:temp})
 let grammarCases=0
 try{
  const names=['','.','..','...','Root','_','_x','a.b','a.','a..b','.a','..a.b','𐐀.x','a\u0301','\u0301a','a\n','a\r\n','a\ud800','1a','a.1','α.β','a-b']
  for(let i=0;i<300;i++){let name='',x=i*1664525+1013904223;for(let k=0;k<5;k++){name+=['.','a','_','1','𐐀','\u0301','-','\ud800'][x%8];x=Math.floor(x/8)}names.push(name)}
  for(const name of names)for(const depth of [0,1,4]){
   const chars=(await io.perform(t('Request',{invocation,id:grammarCases,operation:t('ReadIdentifierCharacters',{text:name})}))).outcome.characters
   const actual=child.import_name(chars,BigInt(depth)),match=/^(\.*)([\p{ID_Start}_][\p{ID_Continue}]*(?:\.[\p{ID_Start}_][\p{ID_Continue}]*)*)?$/u.exec(name)
   const dots=match?.[1].length??0,segments=match?.[2]?.split('.')??[],accepted=match!==null&&name.length>0&&dots+segments.length<=depth+1
   assert.equal(actual.$,accepted?'Some':'None',JSON.stringify({name,depth}));if(accepted){assert.equal(actual.value.dots,BigInt(dots));assert.deepEqual(unlist(actual.value.segments),segments)}grammarCases++
  }
 }finally{io.close()}
 let state=child.initial_session('root.py',50n,4n,s('Remaining',{files:s('Nonnegative',{value:2n}),read_bytes:s('Nonnegative',{value:100n}),work:s('Nonnegative',{value:10n})}))
 state=child.reserve_capture(state,'a.py');state=child.reserve_capture(state,'a.py');assert.deepEqual([child.usage(state).files,child.usage(state).read_bytes],[1n,50n])
 state=child.capture_succeeded(state,'a.py');const capture=t('CaptureToken',{invocation:1n,id:1n});const adopted=child.finish_capture(state,'a.py',capture,20n,false);assert.equal(adopted.$,'python-module/Session.AuthorityAccepted');state=adopted.state
 assert.deepEqual([child.usage(state).files,child.usage(state).read_bytes],[1n,20n]);state=child.transfer_to_canonical(state,'a.py');assert.deepEqual([child.usage(state).files,child.usage(state).read_bytes],[0n,0n]);assert.deepEqual(unlist(state.dependencies),['a.py']);assert.deepEqual(unlist(state.canonical),['root.py','a.py'])
 let awaitStep=child.observe(state,'root.py',false,t('ClockToken',{invocation:1n,id:1n}),sep,1n,1n)
 for(const reply of [t('Reply',{invocation:2n,id:1n,outcome:t('AbsoluteResult',{absolute:false})}),t('Reply',{invocation:1n,id:2n,outcome:t('AbsoluteResult',{absolute:false})}),t('Reply',{invocation:1n,id:1n,outcome:t('MembershipResult',{membership:t('MembershipAbsent')})})])assert.equal(child.resume(awaitStep,reply).$,'python-module/MembershipMachine.Failed')
 console.log(JSON.stringify({at:new Date().toISOString(),membershipSteps:checks,grammarCases,signedBudgets:true,physicalEffectsAndStateAgreement:true,failedReadCharge:true,canonicalTransfer:true,protocolRefusals:3,scope:'Python membership/accounting and grammar child only; module search/package authority/full resolver/Canonical not qualified'}))
}finally{await rm(temp,{recursive:true,force:true})}
