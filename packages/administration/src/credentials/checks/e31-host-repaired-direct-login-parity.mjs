import assert from "node:assert/strict"
import {execFileSync} from "node:child_process"
import {mkdtempSync,rmSync,writeFileSync} from "node:fs"
import {tmpdir} from "node:os"
import {join,resolve} from "node:path"
import {pathToFileURL} from "node:url"
import * as reference from "./direct-login-reference.ts"
const corePath=resolve(process.argv.find(arg=>arg.endsWith('.bend'))??'packages/agent-flow-bend/direct-login-policy/core.bend')
const temporary=mkdtempSync(join(tmpdir(),'hapsland-direct-login-parity-'))
const production=process.argv.some(arg=>arg.endsWith('.bend')) ? undefined : await import('../../../dist/credentials/direct-login-model.js')
export const nativeCases=[]
try {
  const output=join(temporary,'core.mjs')
  execFileSync('bend',[corePath,'-o',output],{timeout:5000})
  const core=(await import(pathToFileURL(output))).default
  const phases=['CheckingStore','EnteringKey','SavingKey','Done','Cancelled']
  const statuses=['available','stored','deleted','present','missing','locked','interaction-required','invalid','unavailable','indeterminate','timed-out','cancelled']
  const storage=statuses.concat('busy').flatMap(status=>['acquired','recovered','busy','unavailable'].flatMap(stateLock=>['active','suspended'].map(savedUse=>({status,generation:17,stateLock,savedUse}))))
  const models=phases.flatMap(phase=>[undefined,...statuses].flatMap(availability=>[undefined,storage[0],{...storage.at(-1),generation:9007199254740991}].flatMap(saved=>[0,17,9007199254740991,Infinity,NaN].map(revision=>({phase,revision,inputKind:'stdin',...(availability===undefined?{}:{availability}),...(saved===undefined?{}:{storage:saved})})))))
  const actions=statuses.map(status=>({kind:'checked',status})).concat([{kind:'entered'},{kind:'input-ended'}],storage.map(storage=>({kind:'observed',storage})),[{kind:'exit'}])
  const constructors={'checked':'Checked','entered':'Entered','input-ended':'InputEnded','observed':'Observed','exit':'Exit'}
  const commands={DirectLoginProbe:'probe',DirectLoginInput:'input',DirectLoginSave:'save',DirectLoginNoCommand:undefined}
  let cases=0, commandCases=0
  for(const model of models){
    const tag=core.command({$:'DirectLogin'+model.phase}).$
    assert.ok(Object.hasOwn(commands,tag))
    const command=commands[tag]===undefined?undefined:{kind:commands[tag],id:model.revision}
    assert.deepEqual(command,reference.loginCommand(model))
    if(production)assert.deepEqual(production.loginCommand(model),command)
    commandCases++
    for(const payload of actions)for(let bits=0;bits<4;bits++){
      const action=payload.kind==='exit'?payload:{...payload,commandId:bits&2?model.revision+1:model.revision}
      const event={revision:bits&1?model.revision+1:model.revision,action}
      const current=event.revision===model.revision&&(!('commandId' in action)||action.commandId===model.revision)
      const plan=core.step({$:'DirectLogin'+model.phase},{$:'DirectLogin'+constructors[action.kind]},current,action.kind==='checked'&&action.status==='available')
      let actual=model
      if(plan.$!=='DirectLoginHold'){
        assert.equal(plan.$,'DirectLoginAdvance')
        const patch=plan.patch.$==='DirectLoginNoPatch'?{}:plan.patch.$==='DirectLoginAvailabilityPatch'?(assert.equal(action.kind,'checked'),{availability:action.status}):plan.patch.$==='DirectLoginStoragePatch'?(assert.equal(action.kind,'observed'),{storage:action.storage}):assert.fail('Unknown direct-login patch')
        actual={...model,...patch,phase:plan.phase.$.slice(11),revision:model.revision+1}
      }
      const expected=reference.reduceLogin(model,event)
      assert.deepEqual(actual,expected)
      assert.equal(actual===model,expected===model)
      if(production){const result=production.reduceLogin(model,event);assert.deepEqual(result,expected);assert.equal(result===model,expected===model);if(plan.$==='DirectLoginAdvance'&&plan.patch.$==='DirectLoginStoragePatch')assert.equal(result.storage,action.storage)}
      if(bits===0&&Number.isFinite(model.revision))nativeCases.push([model,event])
      cases++
    }
  }
  const record={at:new Date().toISOString(),cases,commandCases,productionCompared:Boolean(production),result:'pass',scope:'finite direct stdin login native phase/action/status/storage/correlation cases, including large and nonfinite native tokens; exact fields, Hold identity and storage-object identity; no IO or universal native claim'}
  if(!process.argv.some(arg=>arg.endsWith('.bend')))writeFileSync('evidence/bend-strangler/e31-host-repaired-direct-login-parity.json',JSON.stringify(record,null,2)+'\n')
  console.log(JSON.stringify(record))
} finally {rmSync(temporary,{recursive:true,force:true})}
