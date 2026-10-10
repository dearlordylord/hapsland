import {createHash} from 'node:crypto'
import assert from 'node:assert/strict'
import {execFileSync,spawnSync} from 'node:child_process'
import {mkdtempSync,readFileSync,writeFileSync,rmSync,copyFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
const root='packages/agent-flow-bend/maintenance-policy'
execFileSync('bend',[join(root,'PROOF.bend'),'--verdict'],{timeout:5000})
const source=readFileSync(join(root,'core.bend'),'utf8')
const mutants=[
  [
    "discovery-command-lost",
    "case MaintenanceDiscovering{}: MaintenanceDiscoverCommand{}",
    "case MaintenanceDiscovering{}: MaintenanceNoCommand{}",
    "command_exact"
  ],
  [
    "empty-activation-command-lost",
    "case MaintenanceActivatingEmpty{}: MaintenanceActivateEmptyCommand{}",
    "case MaintenanceActivatingEmpty{}: MaintenanceNoCommand{}",
    "command_exact"
  ],
  [
    "inspect-without-agent",
    "case MaintenanceInspecting{}: Bool.pick(Command, agent_present,",
    "case MaintenanceInspecting{}: Bool.pick(Command, True{},",
    "command_exact"
  ],
  [
    "preview-without-operation",
    "Bool.and(agent_present, operation_present)",
    "agent_present",
    "command_exact"
  ],
  [
    "apply-without-digest",
    "Bool.and(agent_present, Bool.and(operation_present, digest_present))",
    "Bool.and(agent_present, operation_present)",
    "command_exact"
  ],
  [
    "terminal-command-emitted",
    "case _: MaintenanceNoCommand{}",
    "case _: MaintenanceDiscoverCommand{}",
    "command_exact"
  ],
  [
    "stale-event-admitted",
    "Bool.pick(Plan, current, current_step(",
    "Bool.pick(Plan, True{}, current_step(",
    "step_exact"
  ],
  [
    "next-does-not-finish",
    "Bool.pick(Phase, more, MaintenanceInspecting{}, MaintenanceDone{})",
    "Bool.pick(Phase, more, MaintenanceInspecting{}, MaintenanceInspecting{})",
    "step_exact"
  ],
  [
    "duplicate-discovery-admitted",
    "case MaintenanceDiscovering{} MaintenanceDiscovered{}: Bool.pick(Plan, unique,",
    "case MaintenanceDiscovering{} MaintenanceDiscovered{}: Bool.pick(Plan, True{},",
    "step_exact"
  ],
  [
    "empty-reinstall-skips-activation",
    "Bool.pick(Phase, reinstall, MaintenanceActivatingEmpty{}, MaintenanceDone{})",
    "Bool.pick(Phase, reinstall, MaintenanceDone{}, MaintenanceDone{})",
    "step_exact"
  ],
  [
    "back-wrong-phase",
    "case MaintenanceApproval{} MaintenanceBack{}: MaintenanceAdvance{MaintenanceReview{}, MaintenanceNoPatch{}}",
    "case MaintenanceApproval{} MaintenanceBack{}: MaintenanceAdvance{MaintenanceCancelled{}, MaintenanceNoPatch{}}",
    "step_exact"
  ],
  [
    "review-exit-loses-pending-skip",
    "case MaintenanceReview{} MaintenanceExit{}: MaintenanceAdvance{MaintenanceCancelled{}, MaintenanceSkipPendingPatch{}}",
    "case MaintenanceReview{} MaintenanceExit{}: MaintenanceAdvance{MaintenanceCancelled{}, MaintenanceNoPatch{}}",
    "step_exact"
  ],
  [
    "proposal-validity-ignored",
    "case MaintenancePreviewing{} MaintenanceProposalPreviewed{}: Bool.pick(Plan, valid_digest,",
    "case MaintenancePreviewing{} MaintenanceProposalPreviewed{}: Bool.pick(Plan, True{},",
    "step_exact"
  ],
  [
    "approval-digest-ignored",
    "case MaintenanceApproval{} MaintenanceApprove{}: Bool.pick(Plan, digest_matches,",
    "case MaintenanceApproval{} MaintenanceApprove{}: Bool.pick(Plan, True{},",
    "step_exact"
  ],
  [
    "declined-mutation-applied",
    "Bool.pick(Plan, yes, MaintenanceAdvance{MaintenanceApplying{}, MaintenanceNoPatch{}}, MaintenanceAdvance{next_phase(more), MaintenanceSkippedNextPatch{}})",
    "Bool.pick(Plan, yes, MaintenanceAdvance{MaintenanceApplying{}, MaintenanceNoPatch{}}, MaintenanceAdvance{MaintenanceApplying{}, MaintenanceNoPatch{}})",
    "step_exact"
  ],
  [
    "uninstall-activates",
    "case MaintenanceApplying{} MaintenanceObserved{}: Bool.pick(Plan, activate,",
    "case MaintenanceApplying{} MaintenanceObserved{}: Bool.pick(Plan, True{},",
    "step_exact"
  ],
  [
    "inspection-failure-lost",
    "case MaintenanceInspecting{} MaintenanceFailed{}: MaintenanceAdvance{next_phase(more), MaintenanceFailedNextPatch{}}",
    "case MaintenanceInspecting{} MaintenanceFailed{}: MaintenanceAdvance{next_phase(more), MaintenanceNoPatch{}}",
    "step_exact"
  ],
  [
    "preview-outcome-lost",
    "case MaintenancePreviewing{} MaintenanceOutcomePreviewed{}: MaintenanceAdvance{next_phase(more), MaintenanceOutcomeNextPatch{}}",
    "case MaintenancePreviewing{} MaintenanceOutcomePreviewed{}: MaintenanceAdvance{next_phase(more), MaintenanceNoPatch{}}",
    "step_exact"
  ],
  [
    "activation-result-lost",
    "case MaintenanceActivating{} MaintenanceActivated{}: MaintenanceAdvance{next_phase(more), MaintenanceActivatedNextPatch{}}",
    "case MaintenanceActivating{} MaintenanceActivated{}: MaintenanceAdvance{next_phase(more), MaintenanceNoPatch{}}",
    "step_exact"
  ],
  [
    "empty-activation-result-lost",
    "case MaintenanceActivatingEmpty{} MaintenanceActivatedEmpty{}: MaintenanceAdvance{MaintenanceDone{}, MaintenanceEmptyActivationPatch{}}",
    "case MaintenanceActivatingEmpty{} MaintenanceActivatedEmpty{}: MaintenanceAdvance{MaintenanceDone{}, MaintenanceNoPatch{}}",
    "step_exact"
  ],
  [
    "terminal-reopened",
    "case _ _: MaintenanceHold{}",
    "case MaintenanceDone{} MaintenanceExit{}: MaintenanceAdvance{MaintenanceDiscovering{}, MaintenanceNoPatch{}}\n    case _ _: MaintenanceHold{}",
    "step_exact"
  ]
]
const results=[]
for(const [name,from,to,law] of mutants){
 const compact=source.replace(/\s/g,'');const needle=from.replace(/\s/g,'')
 assert.equal(compact.split(needle).length,2,name+' unique mutation')
 const offsets=[...source.matchAll(/\S/g)].map(m=>m.index),start=compact.indexOf(needle)
 const mutated=source.slice(0,offsets[start])+to+source.slice(offsets[start+needle.length-1]+1)
 const temp=mkdtempSync(join(tmpdir(),'hapsland-maintenance-mutant-'))
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
const record={sourceSha256:Object.fromEntries(['core.bend','LAWS.bend','PROOF.bend'].map(file=>[file,createHash('sha256').update(readFileSync(join(root,file))).digest('hex')])),at:new Date().toISOString(),mutantsDetected:results.length,results,scope:'both maintenance laws; each well-formed wrong core fails its unchanged law proof; host correctness checked separately'}
writeFileSync(new URL('./maintenance-mutants.json',import.meta.url),JSON.stringify(record,null,2)+'\n')
console.log(JSON.stringify(record))
