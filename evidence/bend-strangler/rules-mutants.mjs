import {createHash} from 'node:crypto'
import assert from 'node:assert/strict'
import {execFileSync,spawnSync} from 'node:child_process'
import {mkdtempSync,readFileSync,writeFileSync,rmSync,copyFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
const root='packages/agent-flow-bend/rules-policy'
execFileSync('bend',[join(root,'PROOF.bend'),'--verdict'],{timeout:5000})
const source=readFileSync(join(root,'core.bend'),'utf8')
const mutants=[
  [
    "preview-without-scope",
    "case RulesPreviewing{}: Bool.pick(Command, scope_present,",
    "case RulesPreviewing{}: Bool.pick(Command, True{},",
    "command_exact"
  ],
  [
    "apply-without-plan",
    "case RulesApplying{}: Bool.pick(Command, plan_present,",
    "case RulesApplying{}: Bool.pick(Command, True{},",
    "command_exact"
  ],
  [
    "terminal-command",
    "case _: RulesNoCommand{}",
    "case _: RulesApplyCommand{}",
    "command_exact"
  ],
  [
    "stale-event-admitted",
    "Bool.pick(Plan, current, current_step(",
    "Bool.pick(Plan, True{}, current_step(",
    "step_exact"
  ],
  [
    "preview-back-keeps-plan-outcome",
    "case RulesPreview{} RulesBack{}: RulesAdvance{RulesScope{}, RulesClearPlanOutcomePatch{}}",
    "case RulesPreview{} RulesBack{}: RulesAdvance{RulesScope{}, RulesNoPatch{}}",
    "step_exact"
  ],
  [
    "pending-preview-back-wrong-phase",
    "case RulesPreviewing{} RulesBack{}: RulesAdvance{RulesScope{}, RulesClearPlanOutcomePatch{}}",
    "case RulesPreviewing{} RulesBack{}: RulesAdvance{RulesPreview{}, RulesClearPlanOutcomePatch{}}",
    "step_exact"
  ],
  [
    "approval-back-clears-payloads",
    "case RulesApproval{} RulesBack{}: RulesAdvance{RulesPreview{}, RulesNoPatch{}}",
    "case RulesApproval{} RulesBack{}: RulesAdvance{RulesPreview{}, RulesClearPlanOutcomePatch{}}",
    "step_exact"
  ],
  [
    "exit-preserves-plan",
    "case RulesPreview{} RulesExit{}: RulesAdvance{RulesCancelled{}, RulesClearPlanPatch{}}",
    "case RulesPreview{} RulesExit{}: RulesAdvance{RulesCancelled{}, RulesNoPatch{}}",
    "step_exact"
  ],
  [
    "scope-selection-loses-scope",
    "case RulesScope{} RulesScopeSelected{}: RulesAdvance{RulesPreviewing{}, RulesScopePatch{}}",
    "case RulesScope{} RulesScopeSelected{}: RulesAdvance{RulesPreviewing{}, RulesNoPatch{}}",
    "step_exact"
  ],
  [
    "preview-metadata-ignored",
    "case RulesPreviewing{} RulesPreviewed{}: Bool.pick(Plan, plan_matches,",
    "case RulesPreviewing{} RulesPreviewed{}: Bool.pick(Plan, True{},",
    "step_exact"
  ],
  [
    "preview-plan-lost",
    "RulesAdvance{RulesPreview{}, RulesPreviewPatch{}}",
    "RulesAdvance{RulesPreview{}, RulesNoPatch{}}",
    "step_exact"
  ],
  [
    "approval-digest-ignored",
    "case RulesApproval{} RulesApprove{}: Bool.pick(Plan, digest_matches,",
    "case RulesApproval{} RulesApprove{}: Bool.pick(Plan, True{},",
    "step_exact"
  ],
  [
    "decline-authorizes-write",
    "RulesAdvance{RulesDone{}, RulesDeclinedPatch{}}",
    "RulesAdvance{RulesApplying{}, RulesNoPatch{}}",
    "step_exact"
  ],
  [
    "stale-does-not-repreview",
    "RulesAdvance{RulesPreviewing{}, RulesStalePatch{}}",
    "RulesAdvance{RulesDone{}, RulesOutcomePatch{}}",
    "step_exact"
  ],
  [
    "observation-outcome-lost",
    "RulesAdvance{RulesDone{}, RulesOutcomePatch{}}",
    "RulesAdvance{RulesDone{}, RulesNoPatch{}}",
    "step_exact"
  ],
  [
    "exit-during-apply",
    "case _ _: RulesHold{}",
    "case RulesApplying{} RulesExit{}: RulesAdvance{RulesCancelled{}, RulesClearPlanPatch{}}\n    case _ _: RulesHold{}",
    "step_exact"
  ],
  [
    "terminal-reopened",
    "case _ _: RulesHold{}",
    "case RulesDone{} RulesExit{}: RulesAdvance{RulesCancelled{}, RulesClearPlanPatch{}}\n    case _ _: RulesHold{}",
    "step_exact"
  ]
]
const results=[]
for(const [name,from,to,law] of mutants){
 const compact=source.replace(/\s/g,'');const needle=from.replace(/\s/g,'')
 assert.equal(compact.split(needle).length,2,name+' unique mutation')
 const offsets=[...source.matchAll(/\S/g)].map(m=>m.index),start=compact.indexOf(needle)
 const mutated=source.slice(0,offsets[start])+to+source.slice(offsets[start+needle.length-1]+1)
 const temp=mkdtempSync(join(tmpdir(),'hapsland-rules-mutant-'))
 try{
  writeFileSync(join(temp,'core.bend'),mutated)
  for(const file of ['LAWS.bend','PROOF.bend'])copyFileSync(join(root,file),join(temp,file))
  const validity=spawnSync('bend',[join(temp,'core.bend')],{timeout:5000,encoding:'utf8'})
  assert.equal(validity.status,0,name+' malformed mutation: '+validity.stdout+validity.stderr)
  const proof=spawnSync('bend',[join(temp,'PROOF.bend'),'--verdict'],{timeout:5000,encoding:'utf8'})
  assert.equal(proof.error,undefined)
  assert.notEqual(proof.status,0,name+' survived')
  assert.ok((proof.stdout+proof.stderr).includes(law),name+' rejected outside law: '+proof.stdout+proof.stderr)
  results.push({name,law,wellFormed:true,unchangedKernelProofRejected:true})
 }finally{rmSync(temp,{recursive:true,force:true})}
}
const record={sourceSha256:Object.fromEntries(['core.bend','LAWS.bend','PROOF.bend'].map(file=>[file,createHash('sha256').update(readFileSync(join(root,file))).digest('hex')])),at:new Date().toISOString(),mutantsDetected:results.length,results,scope:'both rules conversation laws; each well-formed wrong core fails its unchanged law proof; host correctness checked separately'}
writeFileSync(new URL('./rules-mutants.json',import.meta.url),JSON.stringify(record,null,2)+'\n')
console.log(JSON.stringify(record))
