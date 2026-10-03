import test from 'node:test';
import assert from 'node:assert/strict';
import { faultProfile, targetsFault, assessPreFault, observeHold } from './native-hook-faults.mjs';
const events = [{kind:'before-edit',injectedFault:'pre-delay',toolUseHash:'same',monoMs:10},
 {kind:'fault-completed',targetKind:'before-edit',monoMs:20,hold:{samples:30,baselineExists:false,endExists:false,changedDuringHold:false}},
 {kind:'edit',toolUseHash:'same',monoMs:30}];
test('PRE faults target only PRE; existing POST faults remain POST-only',()=>{
 for(const name of ['pre-delay','pre-timeout','pre-crash']) {
  assert.equal(targetsFault(faultProfile(name),'before-edit'),true);
  for(const kind of ['edit','background','stop'])assert.equal(targetsFault(faultProfile(name),kind),false);
 }
 assert.equal(targetsFault(faultProfile('hook-timeout'),'before-edit'),false);
 assert.equal(targetsFault(faultProfile('hook-timeout'),'edit'),true);
 assert.equal(targetsFault(faultProfile('hook-crash'),'background'),true);
});
test('synchronous PRE delay ordering positive control',()=>{
 const checks=assessPreFault({scenario:'pre-delay',events,mutation:{monoMs:25},reviewerRequests:0,providerRequests:0});
 assert.equal(Object.values(checks).every(Boolean),true);
});
test('async PRE / early mutation planted control fails the wait checker',()=>{
 const checks=assessPreFault({scenario:'pre-delay',events,mutation:{monoMs:15},reviewerRequests:0,providerRequests:0});
 assert.equal(checks.mutationAfterPreReady,false);
 assert.equal(Object.values(checks).every(Boolean),false);
});
test('timeout does not assert cancellation from absent natural completion',()=>{
 const checks=assessPreFault({scenario:'pre-timeout',events:[{...events[0],injectedFault:'pre-timeout'},events[2]],mutation:{monoMs:15},reviewerRequests:0,providerRequests:0});
 assert.equal(Object.values(checks).every(Boolean),true);
 assert.equal('preCompletedNaturally' in checks,false);
 assert.equal('processKilled' in checks,false);
});
test('unrelated POST and any reviewer/provider request fail bounded control',()=>{
 const checks=assessPreFault({scenario:'pre-delay',events:[events[0],events[1],{...events[2],toolUseHash:'other'}],mutation:{monoMs:25},reviewerRequests:1,providerRequests:1});
 assert.equal(checks.postForSameAttemptObserved,false);
 assert.equal(checks.noReviewerRequests,false);assert.equal(checks.noProviderRequests,false);
});

import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
test('same hold observer detects a planted persistent mutation',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'hapsland-pre-control-')),path=join(dir,'fixture');
 try {
  const observation=observeHold(path,80,5);
  setTimeout(()=>writeFileSync(path,'synthetic'),15);
  const hold=await observation;
  assert.equal(hold.changedDuringHold,true);
  const checks=assessPreFault({scenario:'pre-delay',events:[events[0],{...events[1],hold},events[2]],mutation:{monoMs:25},reviewerRequests:0,providerRequests:0});
  assert.equal(checks.noPersistentMutationDuringHold,false);
 } finally {rmSync(dir,{recursive:true,force:true})}
});

test('multiple edits and observer absence invalidate one-edit evidence',()=>{
 const checks=assessPreFault({scenario:'pre-delay',events:[...events,events[2]],mutation:{monoMs:25},reviewerRequests:0,providerRequests:0,fixtureMatches:false,observerInstalled:false});
 assert.equal(checks.singleSourceEditObservation,false);
 assert.equal(checks.fixtureMatchesExpectedSingleEdit,false);assert.equal(checks.providerObserverInstalled,false);
});
