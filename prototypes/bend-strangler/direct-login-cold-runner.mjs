import assert from "node:assert/strict"
import {Effect} from "effect"
import {runDirectCredentialInput,DirectLoginOwnerService} from "../packages/administration/dist/credentials/direct-input.js"
import {makeInitialCredentialState} from "../packages/runtime-inputs/dist/credentials/state.js"
const available=process.argv[2]==='available'
const key='synthetic-offline-benchmark-credential'
const calls=[],transitions=[]
const result=await Effect.runPromise(runDirectCredentialInput({
 inputKind:'stdin',
 input:Effect.sync(()=>{calls.push('input');return key}),
 observe:transition=>Effect.sync(()=>{transitions.push(transition)})
}).pipe(Effect.provideService(DirectLoginOwnerService,{
 probe:Effect.sync(()=>{calls.push('probe');return available?'available':'locked'}),
 save:value=>Effect.sync(()=>{assert.equal(value,key);calls.push('save');return {status:'stored',state:{...makeInitialCredentialState(),generation:8},stateLock:'acquired'}})
})))
assert.deepEqual(calls,available?['probe','input','save']:['probe'])
assert.equal(result.model.phase,'Done')
assert.equal(result.model.revision,available?3:1)
assert.equal(result.outcome.kind,available?'observed':'unavailable')
assert.ok(!JSON.stringify({model:result.model,transitions}).includes(key))
console.log(JSON.stringify({phase:result.model.phase,revision:result.model.revision,outcome:result.outcome.kind,calls,transitions:transitions.length,storage:result.model.storage??null,availability:result.model.availability}))
