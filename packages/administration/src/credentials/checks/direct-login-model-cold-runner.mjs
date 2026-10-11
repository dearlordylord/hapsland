import assert from 'node:assert/strict'
import {performance} from 'node:perf_hooks'
const started=performance.now(),cpuStart=process.cpuUsage()
const policy=await import('../packages/administration/dist/credentials/direct-login-model.js')
const imported=performance.now(),importCpu=process.cpuUsage(cpuStart),runCpu=process.cpuUsage()
const available=process.argv[2]==='available'
const storage={status:'stored',generation:8,stateLock:'acquired',savedUse:'active'}
let model=policy.initialLogin('stdin');const commands=[]
for(const action of available?[{kind:'checked',status:'available'},{kind:'entered'},{kind:'observed',storage}]:[{kind:'checked',status:'locked'}]){
 const command=policy.loginCommand(model);commands.push(command.kind)
 const prior=model;model=policy.reduceLogin(model,{revision:model.revision,action:{...action,commandId:command.id}})
 assert.notEqual(model,prior);assert.equal(model.revision,prior.revision+1)
}
const finished=performance.now(),executionCpu=process.cpuUsage(runCpu)
assert.equal(model.phase,'Done');assert.equal(model.revision,available?3:1)
assert.equal(policy.loginCommand(model),undefined)
if(available)assert.equal(model.storage,storage)
assert.equal(policy.reduceLogin(model,{revision:model.revision,action:{kind:'exit'}}),model)
console.log(JSON.stringify({timing:{initializationMilliseconds:imported-started,initializationCpuSeconds:(importCpu.user+importCpu.system)/1e6,journeyMilliseconds:finished-imported,journeyCpuSeconds:(executionCpu.user+executionCpu.system)/1e6},phase:model.phase,revision:model.revision,commands,availability:model.availability,storage:model.storage??null}))
