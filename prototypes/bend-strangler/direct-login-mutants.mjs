import assert from 'node:assert/strict'
import {spawnSync} from 'node:child_process'
import {readFileSync,writeFileSync,mkdtempSync,mkdirSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
const root='packages/agent-flow-bend/direct-login-policy/'
const source=readFileSync(root+'core.bend','utf8')
const mutations=[
 ['wrong probe command','case DirectLoginCheckingStore{}: DirectLoginProbe{}','case DirectLoginCheckingStore{}: DirectLoginSave{}'],
 ['terminal command','case _: DirectLoginNoCommand{}','case DirectLoginDone{}: DirectLoginProbe{}\n    case _: DirectLoginNoCommand{}'],
 ['ignore callback fence','Bool.pick(Plan, current, current_step(phase, action, available), DirectLoginHold{})','current_step(phase, action, available)'],
 ['deny available store','Bool.pick(Plan, available,','Bool.pick(Plan, False{},'],
 ['input completion stops','DirectLoginEnteringKey{} DirectLoginEntered{}: DirectLoginAdvance{DirectLoginSavingKey{}, DirectLoginNoPatch{}}','DirectLoginEnteringKey{} DirectLoginEntered{}: DirectLoginAdvance{DirectLoginDone{}, DirectLoginNoPatch{}}'],
 ['ended input saves','DirectLoginEnteringKey{} DirectLoginInputEnded{}: DirectLoginAdvance{DirectLoginCancelled{}, DirectLoginNoPatch{}}','DirectLoginEnteringKey{} DirectLoginInputEnded{}: DirectLoginAdvance{DirectLoginSavingKey{}, DirectLoginNoPatch{}}'],
 ['checking exit finishes','DirectLoginCheckingStore{} DirectLoginExit{}: DirectLoginAdvance{DirectLoginCancelled{}, DirectLoginNoPatch{}}','DirectLoginCheckingStore{} DirectLoginExit{}: DirectLoginAdvance{DirectLoginDone{}, DirectLoginNoPatch{}}'],
 ['entering exit finishes','DirectLoginEnteringKey{} DirectLoginExit{}: DirectLoginAdvance{DirectLoginCancelled{}, DirectLoginNoPatch{}}','DirectLoginEnteringKey{} DirectLoginExit{}: DirectLoginAdvance{DirectLoginDone{}, DirectLoginNoPatch{}}'],
 ['cancel saving','case _ _: DirectLoginHold{}','case DirectLoginSavingKey{} DirectLoginExit{}: DirectLoginAdvance{DirectLoginCancelled{}, DirectLoginNoPatch{}}\n    case _ _: DirectLoginHold{}'],
 ['omit storage patch','DirectLoginAdvance{DirectLoginDone{}, DirectLoginStoragePatch{}}','DirectLoginAdvance{DirectLoginDone{}, DirectLoginNoPatch{}}'],
 ['omit checked status','DirectLoginAdvance{DirectLoginEnteringKey{}, DirectLoginAvailabilityPatch{}}','DirectLoginAdvance{DirectLoginEnteringKey{}, DirectLoginNoPatch{}}'],
 ['reopen terminal','case _ _: DirectLoginHold{}','case DirectLoginDone{} DirectLoginEntered{}: DirectLoginAdvance{DirectLoginSavingKey{}, DirectLoginNoPatch{}}\n    case _ _: DirectLoginHold{}']
]
const temporary=mkdtempSync(join(tmpdir(),'hapsland-direct-login-mutants-'))
const results=[]
try{
 for(const [name,anchor,replacement] of mutations){
  const expression=new RegExp(anchor.trim().split(/\s+/).map(part=>part.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('\\s+'))
  assert.match(source,expression,name)
  const directory=join(temporary,String(results.length));mkdirSync(directory)
  const input=join(directory,'core.bend');writeFileSync(input,source.replace(expression,replacement))
  for(const file of ['LAWS.bend','PROOF.bend'])writeFileSync(join(directory,file),readFileSync(root+file))
  const parity=spawnSync(process.execPath,['evidence/bend-strangler/direct-login-parity.mjs',input],{timeout:5000,encoding:'utf8'})
  assert.equal(parity.error,undefined,name);assert.equal(parity.status,1,`behavioral survivor: ${name}`);assert.match(parity.stderr,/AssertionError/)
  const proof=spawnSync('bend',[join(directory,'PROOF.bend'),'--verdict'],{timeout:5000,encoding:'utf8'})
  assert.equal(proof.error,undefined,name);assert.equal(proof.status,1,`proof survivor: ${name}`);assert.match(proof.stdout+proof.stderr,/SOME PROOFS FAIL/);assert.doesNotMatch(proof.stdout+proof.stderr,/TODOs found|syntax error|unknown:/i)
  results.push({name,behavioralResult:'detected',proofResult:'rejected by unchanged approved proofs'})
 }
 writeFileSync('evidence/bend-strangler/direct-login-mutants.json',JSON.stringify({at:new Date().toISOString(),results,scope:'direct stdin login command/transition/patch policy; native field preservation and IO boundaries checked separately'},null,2)+'\n')
 console.log(JSON.stringify({mutantsDetected:results.length}))
}finally{rmSync(temporary,{recursive:true,force:true})}
