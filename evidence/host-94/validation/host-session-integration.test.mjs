import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, mkdirSync, rmSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import { initializePassLedger, readPassLedger, claimPassStart, finishPass } from './pass-ledger.mjs';

// The executable below is a scripted provider/host stand-in. It invokes the
// exact generated bridge and production controlled CLI with synthetic native
// payloads, but has no network or credential path.
const fakeHost = `#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { appendFileSync, readFileSync, writeFileSync, writeSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
const host=process.env.HAPSLAND_94_FAKE_HOST;
if(process.argv.includes('--version')) { process.stdout.write(host==='claude'?'2.1.218 (Claude Code)\\n':'1.14.44\\n'); process.exit(0); }
if(process.env.HAPSLAND_94_FAKE_PRE_EDIT_EXIT==='1'){
  writeSync(1,JSON.stringify({type:'system',subtype:'init',secret:'system-private'})+'\\n');
  writeSync(1,JSON.stringify({type:'assistant',message:{content:[
    {type:'text',text:'assistant-private'},
    {type:'tool_use',name:'Read',input:{file_path:'source-private'}},
    {type:'tool_use',name:'Bash',input:{command:'command-private'}}]}})+'\\n');
  writeSync(1,'invalid-private-json\\n');
  writeSync(1,JSON.stringify({type:'result',subtype:'error_during_execution',is_error:true,
    result:'error-private'})+'\\n');
  process.exit(1);
}
if(process.env.HAPSLAND_94_FAKE_FLOOD==='1'){
  writeSync(1,JSON.stringify({type:'noise',value:'x'.repeat(1100000)})+'\\n');
  writeSync(2,Buffer.alloc(1100000,120));
  process.exit(0);
}
const repo=process.cwd(), path=join(repo,'order-count.ts');
const session=process.env.HAPSLAND_94_FAKE_SESSION||'scripted-session';
const initial='type OrderCount = number\\n';
const repaired=process.env.HAPSLAND_94_FAKE_BRANDED_REPAIR==='1'
  ? 'type OrderCount = number & { readonly __brand: "OrderCount" }\\n'
  : 'type OrderCount = string\\n';
const print=(id,tool,input)=>{
  if(process.env.HAPSLAND_94_FAKE_EVENT_SHAPE==='unknown' && id==='second')
    return writeSync(1,JSON.stringify({type:'unknown'})+'\\n');
  if(process.env.HAPSLAND_94_FAKE_EVENT_SHAPE==='mismatch') id='different-call';
  const event=host==='claude'
    ? {type:'assistant',message:{content:[{type:'tool_use',id,name:tool,input}]}}
    : {type:'tool_use',part:{type:'tool',callID:id,messageID:'m-'+id,tool,state:{status:'completed',input}}};
  writeSync(1,JSON.stringify(event)+'\\n');
};

const call=async(id,tool,input,metadata)=>{
  print(id,tool,input);
  if(host==='claude'){
    const settings=JSON.parse(readFileSync(join(repo,'.claude','settings.json'),'utf8'));
    const command=settings.hooks.PostToolUse[0].hooks[0].command;
    const response=tool==='Edit' && process.env.HAPSLAND_94_FAKE_BRANDED_REPAIR==='1' &&
      process.env.HAPSLAND_94_FAKE_BAD_REPAIR_RESPONSE!=='1'
      ? {filePath:path,oldString:input.old_string,newString:input.new_string,
          originalFile:initial,replaceAll:false,userModified:false}
      : {filePath:path,content:input.content,
          originalFile:metadata?.exists===false?null:initial,userModified:false};
    const event={hook_event_name:'PostToolUse',tool_name:tool,cwd:repo,session_id:session,
      tool_use_id:id,tool_input:input,tool_response:response};
    const result=spawnSync(command,{shell:true,input:JSON.stringify(event),encoding:'utf8',env:process.env,timeout:6000});
    if(result.status!==0) process.exit(20);
    return result.stdout;
  }
  const plugin=await import(pathToFileURL(join(repo,'.opencode','plugins','hapsland-validation.mjs')).href);
  const hooks=await plugin.HapslandValidation({directory:repo});
  const output={title:'Edited',output:'Applied',metadata};
  await hooks['tool.execute.after']({tool,sessionID:session,callID:id,args:input},output);
  return output.output;
};
if(process.env.HAPSLAND_94_FAKE_NO_HOOK==='shell'){
  const edit=spawnSync('sh',['-c',"printf 'type OrderCount = number\\n' > order-count.ts"],{cwd:repo});
  process.exit(edit.status===0?0:30);
}
writeFileSync(path,initial);
if(process.env.HAPSLAND_94_FAKE_NO_HOOK==='unloaded'){
  print('first',host==='claude'?'Write':'write',host==='claude'
    ? {file_path:path,content:initial}:{filePath:path,content:initial});
  process.exit(0);
}
const first=await call('first',host==='claude'?'Write':'write',host==='claude'
  ? {file_path:path,content:initial}:{filePath:path,content:initial},{exists:false});
if(process.env.HAPSLAND_94_FAKE_DUPLICATE_INITIAL_FINISH==='1'){
  const key=id=>createHash('sha256').update(process.env.HAPSLAND_94_SALT+':'+id).digest('hex');
  appendFileSync(process.env.HAPSLAND_94_TRACE,JSON.stringify({phase:'finish',key:key('first'),
    sessionKey:key(session),tool:host==='claude'?'Write':'write',submitted:false,findingSubmitted:false,
    noticeSubmitted:false,unclassifiedSubmitted:false,elapsedMs:0,
    finishedAtMs:Date.now()-Number(process.env.HAPSLAND_94_LAUNCH_AT),ok:false})+'\\n');
}
if(first.includes('[r6_bare_domain_value, p=') && process.env.HAPSLAND_94_FAKE_REACT==='1'){
  const oldString=process.env.HAPSLAND_94_FAKE_BRANDED_REPAIR==='1'?'type OrderCount = number':'number';
  const newString=process.env.HAPSLAND_94_FAKE_BRANDED_REPAIR==='1'
    ? 'type OrderCount = number & { readonly __brand: "OrderCount" }':'string';
  const input=host==='claude'
    ? {file_path:path,old_string:oldString,new_string:newString,replace_all:false}
    : {filePath:path,oldString,newString,replaceAll:false};
  writeFileSync(path,repaired);
  await call('second',host==='claude'?'Edit':'edit',input,{exists:true});
}
if(process.env.HAPSLAND_94_FAKE_DIAGNOSTICS==='1')
  writeSync(1,JSON.stringify({type:'result',subtype:'success',is_error:false,
    result:'success-private'})+'\\n');
`;

const genericAfterReviewCli = `#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
const result=spawnSync(process.execPath,[process.env.HAPSLAND_94_REAL_CLI,...process.argv.slice(2)],
  {input:readFileSync(0),encoding:'utf8',env:process.env,timeout:4300,maxBuffer:262144});
if(result.status!==0)process.exit(2);
const context='Generic unclassified host message';
process.stdout.write(process.env.HAPSLAND_94_FAKE_HOST==='claude'
  ? JSON.stringify({hookSpecificOutput:{hookEventName:'PostToolUse',additionalContext:context}})
  : context);
`;

const advisoryDowngradeCli = `#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
const result=spawnSync(process.execPath,[process.env.HAPSLAND_94_REAL_CLI,...process.argv.slice(2)],
  {input:readFileSync(0),encoding:'utf8',env:process.env,timeout:4300,maxBuffer:262144});
if(result.status!==0)process.exit(2);
let output;try{output=JSON.parse(result.stdout)}catch{process.exit(3)}
if(output.decision==='block')process.stdout.write(JSON.stringify({hookSpecificOutput:{
  hookEventName:'PostToolUse',additionalContext:output.reason}})+'\\n');
else process.stdout.write(result.stdout);
`;

const runner = join(import.meta.dirname, 'host-session.mjs');
const projectRoot = resolve(import.meta.dirname, '../../..');
test('base TypeScript config freshness blocks before host, auth, or ledger claim', () => {
  const root = mkdtempSync(join(tmpdir(), 'hapsland-94-freshness-'));
  try {
    const fixture = join(root, 'project');
    cpSync(join(projectRoot, 'evidence/host-94/validation'),
      join(fixture, 'evidence/host-94/validation'), { recursive: true });
    cpSync(join(projectRoot, 'src'), join(fixture, 'src'), { recursive: true });
    for (const file of ['package.json', 'bun.lock', 'tsconfig.json', 'tsconfig.build.json'])
      cpSync(join(projectRoot, file), join(fixture, file));
    symlinkSync(join(projectRoot, 'node_modules'), join(fixture, 'node_modules'), 'dir');
    const cli = join(fixture, 'dist/cli.js');
    const resident = join(fixture, 'dist/resident/main.js');
    mkdirSync(join(fixture, 'dist/resident'), { recursive: true });
    writeFileSync(cli, '');
    writeFileSync(resident, '');
    const artifactsTime = Date.now() + 60_000;
    for (const artifact of [cli, resident])
      utimesSync(artifact, artifactsTime / 1_000, artifactsTime / 1_000);
    const staleConfigTime = artifactsTime + 60_000;
    utimesSync(join(fixture, 'tsconfig.json'), staleConfigTime / 1_000, staleConfigTime / 1_000);

    const ledger = join(root, 'ledger');
    initializePassLedger(ledger);
    const result = spawnSync(process.execPath, [join(fixture, 'evidence/host-94/validation/host-session.mjs'),
      'claude', 'control', '--auth-confirmed', '--claude-block-trial'], {
      env: { ...process.env, HAPSLAND_94_PASS_LEDGER: ledger,
        HAPSLAND_94_CLAUDE_EXECUTABLE: join(root, 'absent-host') },
      encoding: 'utf8', timeout: 10_000, maxBuffer: 262_144,
    });
    const summary = JSON.parse(result.stdout);
    assert.equal(result.status, 1);
    assert.equal(summary.acceptanceStatus, 'incomplete');
    assert.equal(summary.failure, 'stale-build');
    assert.equal(readPassLedger(ledger).length, 0);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
test('runner exception does not retain a sensitive path from a thrown error', () => {
  const root = mkdtempSync(join(tmpdir(), 'hapsland-94-secret-path-'));
  try {
    const fixture = join(root, 'credential-marker-project');
    cpSync(join(projectRoot, 'evidence/host-94/validation'),
      join(fixture, 'evidence/host-94/validation'), { recursive: true });
    cpSync(join(projectRoot, 'src'), join(fixture, 'src'), { recursive: true });
    for (const file of ['package.json', 'bun.lock', 'tsconfig.json', 'tsconfig.build.json'])
      cpSync(join(projectRoot, file), join(fixture, file));
    symlinkSync(join(projectRoot, 'node_modules'), join(fixture, 'node_modules'), 'dir');
    mkdirSync(join(fixture, 'dist/resident'), { recursive: true });
    writeFileSync(join(fixture, 'dist/cli.js'), '');
    writeFileSync(join(fixture, 'dist/resident/main.js'), '');
    rmSync(join(fixture, 'tsconfig.json'));
    const ledger = join(root, 'ledger');
    initializePassLedger(ledger);
    const result = spawnSync(process.execPath, [join(fixture, 'evidence/host-94/validation/host-session.mjs'),
      'claude', 'control', '--offline-scripted'], {
      env: { ...process.env, HAPSLAND_94_PASS_LEDGER: ledger,
        HAPSLAND_94_SCRIPTED_EXECUTABLE: join(root, 'absent-host') },
      encoding: 'utf8', timeout: 10_000, maxBuffer: 262_144,
    });
    const summary = JSON.parse(result.stdout);
    assert.equal(result.status, 1);
    assert.equal(summary.failure, 'stale-build');
    assert.doesNotMatch(result.stdout, /credential-marker|ENOENT|tsconfig\.json/);
    assert.equal(readPassLedger(ledger).length, 0);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
test('real-host stale and host-failure stop before version, auth, or ledger claim', () => {
  const root = mkdtempSync(join(tmpdir(), 'hapsland-94-blocked-'));
  try {
    const ledger = join(root, 'ledger');
    initializePassLedger(ledger);
    for (const scenario of ['stale', 'host-failure']) {
      const result = spawnSync(process.execPath, [runner, 'opencode', scenario, '--auth-confirmed'], {
        env: { ...process.env, HAPSLAND_94_PASS_LEDGER: ledger },
        encoding: 'utf8', timeout: 10_000, maxBuffer: 262_144,
      });
      const summary = JSON.parse(result.stdout);
      assert.equal(result.status, 1);
      assert.equal(summary.acceptanceStatus, 'incomplete');
      assert.equal(summary.failure, 'blocked-stage-b-admission');
      assert.equal(readPassLedger(ledger).length, 0);
    }
  } finally { rmSync(root, { recursive: true, force: true }); }
});
const runSingleControl = (host, options) => {
  const root = mkdtempSync(join(tmpdir(), 'hapsland-94-single-'));
  try {
    const executable = join(root, 'scripted-host.mjs');
    const ledger = join(root, 'ledger');
    writeFileSync(executable, fakeHost, { mode: 0o700 });
    initializePassLedger(ledger);
    const scriptedCli = join(root, 'generic-cli.mjs');
    if (options.generic) writeFileSync(scriptedCli, genericAfterReviewCli, { mode: 0o700 });
    const env = { ...process.env, HAPSLAND_94_PASS_LEDGER: ledger,
      HAPSLAND_94_SCRIPTED_EXECUTABLE: executable, HAPSLAND_94_FAKE_HOST: host,
      ...(options.generic ? { HAPSLAND_94_SCRIPTED_CLI: scriptedCli,
        HAPSLAND_94_REAL_CLI: resolve(import.meta.dirname, '../../../dist/cli.js') } : {}),
      ...(options.flood ? { HAPSLAND_94_FAKE_FLOOD: '1' } : {}),
      ...(options.noHook ? { HAPSLAND_94_FAKE_NO_HOOK: options.noHook } : {}),
      ...(options.eventShape ? { HAPSLAND_94_FAKE_EVENT_SHAPE: options.eventShape } : {}),
      ...(options.duplicateInitialFinish ? { HAPSLAND_94_FAKE_DUPLICATE_INITIAL_FINISH: '1' } : {}),
      ...(options.missingTimestamp ? { HAPSLAND_94_FAKE_MISSING_TIMESTAMP: '1' } : {}),
      ...(options.preEditExit ? { HAPSLAND_94_FAKE_PRE_EDIT_EXIT: '1' } : {}),
      ...(options.diagnostics ? { HAPSLAND_94_FAKE_DIAGNOSTICS: '1' } : {}),
      TYPESAFE_API_KEY: '' };
    const result = spawnSync(process.execPath, [runner, host, 'control', '--offline-scripted'], {
      env, encoding: 'utf8', timeout: 60_000, maxBuffer: 262_144,
      detached: process.env.HAPSLAND_94_TIMING_LOG !== undefined,
    });
    assert.equal(result.status, 0, 'runner failed (raw output withheld)');
    const summary = JSON.parse(result.stdout);
    assert.equal(readPassLedger(ledger).length, 1);
    return summary;
  } finally { rmSync(root, { recursive: true, force: true }); }
};
const runNoHookStageB = (host, scenario) => {
  const root = mkdtempSync(join(tmpdir(), 'hapsland-94-stage-b-gate-'));
  try {
    const executable = join(root, 'scripted-host.mjs');
    const ledger = join(root, 'ledger');
    writeFileSync(executable, fakeHost, { mode: 0o700 });
    initializePassLedger(ledger);
    // These entries exercise only the Stage B gate; Stage A is verified in
    // separate scripted bridge tests and consumes no model or backend call here.
    for (const previous of ['control', 'finding']) {
      const start = claimPassStart(ledger, { host, scenario: previous });
      finishPass(ledger, start.sequence, 'recorded', 0);
    }
    const result = spawnSync(process.execPath, [runner, host, scenario, '--offline-scripted'], {
      env: { ...process.env, HAPSLAND_94_PASS_LEDGER: ledger,
        HAPSLAND_94_SCRIPTED_EXECUTABLE: executable, HAPSLAND_94_FAKE_HOST: host,
        HAPSLAND_94_FAKE_NO_HOOK: 'unloaded', TYPESAFE_API_KEY: '' },
      encoding: 'utf8', timeout: 60_000, maxBuffer: 262_144,
    });
    const summary = JSON.parse(result.stdout);
    assert.equal(result.status, 0);
    assert.equal(summary.initialNativeEditMatched, false);
    assert.equal(summary.reviewAdmissionMarkerObserved, false);
    assert.equal(summary.acceptanceStatus, 'incomplete');
  } finally { rmSync(root, { recursive: true, force: true }); }
};
const run = (host, shape, stageB = null, blockTrial = false, advisoryDowngrade = false,
  badRepairResponse = false) => {
  const root = mkdtempSync(join(tmpdir(), 'hapsland-94-integration-'));
  try {
    const executable = join(root, 'scripted-host.mjs');
    const ledger = join(root, 'ledger');
    writeFileSync(executable, fakeHost, { mode: 0o700 });
    initializePassLedger(ledger);
    const env = { ...process.env, HAPSLAND_94_PASS_LEDGER: ledger,
      HAPSLAND_94_SCRIPTED_EXECUTABLE: executable, HAPSLAND_94_FAKE_HOST: host,
      HAPSLAND_94_FAKE_REACT: '1', HAPSLAND_94_FAKE_EVENT_SHAPE: shape,
      ...(badRepairResponse ? { HAPSLAND_94_FAKE_BAD_REPAIR_RESPONSE: '1' } : {}),
      TYPESAFE_API_KEY: '' };
    if (advisoryDowngrade) {
      const override = join(root, 'advisory-downgrade.mjs');
      writeFileSync(override, advisoryDowngradeCli, { mode: 0o700 });
      env.HAPSLAND_94_SCRIPTED_CLI = override;
      env.HAPSLAND_94_REAL_CLI = resolve(import.meta.dirname, '../../../dist/cli.js');
    }
    const invoke = scenario => {
      const result = spawnSync(process.execPath, [runner, host, scenario, '--offline-scripted',
        ...(blockTrial ? ['--claude-block-trial'] : [])], {
        env, encoding: 'utf8', timeout: 60_000, maxBuffer: 262_144,
      });
      const summary = JSON.parse(result.stdout);
      assert.equal(result.status, 0, `${host} ${scenario} runner failed: ${summary.failure ?? summary.acceptanceStatus ?? 'unknown'}`);
      return summary;
    };
    const control = invoke('control');
    assert.equal(control.acceptanceStatus, 'passed', JSON.stringify({
      initialNativeEditMatched: control.initialNativeEditMatched,
      initialHookCallKeyMatched: control.initialHookCallKeyMatched,
      initialHookSucceeded: control.initialHookSucceeded,
      reviewAdmissionMarkerObserved: control.reviewAdmissionMarkerObserved,
      reviewCompletedOutcome: control.reviewCompletedOutcome,
      nativeDirectHookCalls: control.nativeDirectHookCalls,
      nativeModelEditEvents: control.nativeModelEditEvents,
      hookDurationMs: control.hookDurationMs,
    }));
    assert.equal(control.findingSubmissions, 0);
    assert.equal(control.reviewCompletedOutcome, 'completed-clear');
    assert.equal(control.reviewAdmissionAttribution, 'unattributed-global-marker');
    assert.ok(typeof control.platform === 'string' && control.platform.length > 0);
    assert.equal(control.timestampSource, 'runner-wall-clock-relative-to-host-spawn');
    const finding = invoke('finding');
    assert.equal(finding.reviewCompletedOutcome, 'completed-findings');
    assert.ok(Number.isFinite(finding.editObservedToSubmissionMs));
    assert.equal(finding.findingSubmissions, 1);
    if (blockTrial) assert.equal(finding.blockFindingSubmissions, advisoryDowngrade ? 0 : 1);
    if (blockTrial) {
      assert.equal(finding.nativeModelEditEvents, 2);
      assert.equal(finding.nativeDirectHookCalls, 2);
      assert.equal(finding.repairReviewCompletedClear, !badRepairResponse);
    }
    assert.equal(finding.operationalNoticeSubmissions, 0);
    assert.equal(finding.hostSubmissions, 1);
    if (shape === 'unknown') {
      assert.equal(finding.initialNativeEditMatched, true);
      assert.equal(finding.nativeModelEditEvents, 1);
      assert.equal(finding.finalRepairObserved, true);
      assert.equal(finding.modelReaction.laterNativeRepairMatched, false);
      assert.equal(finding.modelReaction.status, 'unproven');
      assert.equal(finding.noLaterEventOutcome, 'submitted-unreacted');
      assert.equal(finding.acceptanceStatus, 'failed');
    } else {
      assert.equal(finding.modelReaction.status, blockTrial && !advisoryDowngrade
        ? 'observed-native-repair-after-block' : 'observed-native-repair-after-advice');
      if (advisoryDowngrade) {
        assert.equal(finding.modelReaction.initiatingNativeEditMatched, true);
        assert.equal(finding.modelReaction.laterNativeRepairMatched, true);
        assert.equal(finding.blockFindingSubmissions, 0);
      }
      assert.equal(finding.noLaterEventOutcome, 'observed-reaction');
      assert.equal(finding.acceptanceStatus, advisoryDowngrade || badRepairResponse ? 'failed' : 'passed');
    }
    assert.equal(readPassLedger(ledger).length, 2);
    assert.equal(readPassLedger(ledger)[1].finish.status,
      shape === 'unknown' || advisoryDowngrade || badRepairResponse ? 'failed' : 'recorded');
    if (stageB === 'stale') {
      const stale = invoke('stale');
      assert.equal(stale.acceptanceStatus, 'passed');
      assert.equal(stale.staleAdmissionObservedBeforeMutation, true);
      assert.equal(stale.findingSubmissions, 0);
      assert.equal(readPassLedger(ledger).length, 3);
    }
    if (stageB === 'stale-mismatch') {
      env.HAPSLAND_94_FAKE_EVENT_SHAPE = 'mismatch';
      const stale = invoke('stale');
      assert.equal(stale.acceptanceStatus, 'incomplete');
      assert.equal(stale.staleAdmissionObservedBeforeMutation, false);
      assert.equal(stale.admissionMatchedInitialNativeCall, false);
      assert.equal(stale.externalStaleMutation, false);
      assert.equal(readPassLedger(ledger)[2].finish.status, 'incomplete');
    }
    if (stageB === 'stale-generic') {
      const override = join(root, 'generic-after-review.mjs');
      writeFileSync(override, genericAfterReviewCli, { mode: 0o700 });
      env.HAPSLAND_94_SCRIPTED_CLI = override;
      env.HAPSLAND_94_REAL_CLI = resolve(import.meta.dirname, '../../../dist/cli.js');
      const stale = invoke('stale');
      assert.equal(stale.staleAdmissionObservedBeforeMutation, true);
      assert.equal(stale.unclassifiedSubmissions, 1);
      assert.equal(stale.hostSubmissions, 1);
      assert.equal(stale.acceptanceStatus, 'incomplete');
    }
    if (stageB === 'timeout') {
      const timeout = invoke('timeout');
      assert.equal(timeout.noLaterEventOutcome, 'undelivered');
      assert.equal(timeout.findingSubmissions, 0);
    }
    if (stageB === 'failure') {
      const failure = invoke('failure');
      assert.equal(failure.acceptanceStatus, 'passed');
      assert.equal(failure.findingSubmissions, 0);
      assert.equal(failure.operationalNoticeSubmissions, 1);
      assert.equal(failure.modelReaction.status, 'unproven');
      assert.equal(readPassLedger(ledger).length, 3);
    }
    if (stageB === 'host-failure') {
      const failure = invoke('host-failure');
      assert.equal(failure.acceptanceStatus, 'passed');
      assert.equal(failure.hostFailureTriggeredAfterAdmission, true);
      assert.equal(failure.completedSyntheticEdit, true);
      assert.equal(failure.findingSubmissions, 0);
      assert.equal(readPassLedger(ledger).length, 3);
    }
    if (stageB === 'restart') {
      const old = invoke('restart-old');
      assert.equal(old.acceptanceStatus, 'passed');
      assert.equal(old.restartOldOutcomeAbsent, true);
      assert.equal(old.restartResidentStopped, true);
      const next = invoke('restart-new');
      assert.equal(next.acceptanceStatus, 'passed');
      assert.equal(next.restartNewRecipientDistinct, true);
      assert.equal(next.restartOutcomesOnlyNewRecipient, true);
      assert.equal(readPassLedger(ledger).length, 4);
    }
  } finally { rmSync(root, { recursive: true, force: true }); }
};

test('offline Claude scripted bridge classifies finding and matched reaction', { timeout: 120_000 }, () => run('claude', 'known'));
test('offline Claude block trial requires production block and matched repair', { timeout: 120_000 },
  () => run('claude', 'known', null, true));
test('advisory finding and repair cannot pass a Claude block trial', { timeout: 120_000 },
  () => run('claude', 'known', null, true, true));
test('native repair without an attributed clear review cannot pass a Claude block trial', { timeout: 120_000 },
  () => run('claude', 'known', null, true, false, true));
test('offline OpenCode scripted bridge classifies finding and matched reaction', { timeout: 120_000 }, () => run('opencode', 'known'));
test('unknown Claude host event remains unproven despite classified finding and repair', { timeout: 120_000 },
  () => run('claude', 'unknown'));
test('unknown OpenCode host event remains unproven despite classified finding and repair', { timeout: 120_000 },
  () => run('opencode', 'unknown'));
test('offline Claude restart pair uses two claims and isolates old queued work', { timeout: 120_000 },
  () => run('claude', 'known', 'restart'));
test('offline OpenCode restart pair uses two claims and isolates old queued work', { timeout: 120_000 },
  () => run('opencode', 'known', 'restart'));
test('offline Claude stale run mutates only after admission', { timeout: 120_000 },
  () => run('claude', 'known', 'stale'));
test('offline OpenCode stale run mutates only after admission', { timeout: 120_000 },
  () => run('opencode', 'known', 'stale'));
test('offline Claude unavailable backend is a notice, never a finding', { timeout: 120_000 },
  () => run('claude', 'known', 'failure'));
test('offline OpenCode unavailable backend is a notice, never a finding', { timeout: 120_000 },
  () => run('opencode', 'known', 'failure'));
test('offline Claude host termination after admission preserves the edit', { timeout: 120_000 },
  () => run('claude', 'known', 'host-failure'));
test('offline OpenCode host termination after admission preserves the edit', { timeout: 120_000 },
  () => run('opencode', 'known', 'host-failure'));
test('combined stdout and stderr ceiling stops a scripted host', { timeout: 120_000 }, () => {
  const result = runSingleControl('claude', { flood: true });
  assert.ok(result.hostStdoutBytes < 2_000_000);
  assert.ok(result.hostStderrBytes < 2_000_000);
  assert.ok(result.hostOutputBytes > 2_000_000);
  assert.equal(result.outputCeilingExceeded, true);
  assert.equal(result.acceptanceStatus, 'incomplete');
});
test('source-free Claude diagnostics classify a scripted exit before any edit', { timeout: 120_000 }, () => {
  const result = runSingleControl('claude', { preEditExit: true });
  assert.equal(result.hostExitCode, 1);
  assert.equal(result.acceptanceStatus, 'incomplete');
  assert.equal(result.nativeModelEditEvents, 0);
  assert.equal(result.nativeDirectHookCalls, 0);
  assert.equal(result.claudeStreamDiagnostics.eventTypeCounts.system, 1);
  assert.equal(result.claudeStreamDiagnostics.eventTypeCounts.assistant, 1);
  assert.equal(result.claudeStreamDiagnostics.eventTypeCounts.result, 1);
  assert.equal(result.claudeStreamDiagnostics.resultSubtypeCounts.error_during_execution, 1);
  assert.equal(result.claudeStreamDiagnostics.resultIsError, true);
  assert.deepEqual(result.claudeStreamDiagnostics.assistantNativeToolCounts,
    { read: 1, edit: 0, write: 0, unknown: 1 });
  assert.equal(result.claudeStreamDiagnostics.parseFailureCount, 1);
  assert.ok(result.claudeStreamDiagnostics.firstEventAtMs >= 0);
  assert.ok(result.claudeStreamDiagnostics.lastEventAtMs >=
    result.claudeStreamDiagnostics.firstEventAtMs);
  assert.doesNotMatch(JSON.stringify(result), /private|Bash/);
});
test('source-free Claude diagnostics classify a successful scripted edit', { timeout: 120_000 }, () => {
  const result = runSingleControl('claude', { diagnostics: true });
  assert.equal(result.hostExitCode, 0);
  assert.equal(result.acceptanceStatus, 'passed');
  assert.equal(result.claudeStreamDiagnostics.eventTypeCounts.assistant, 1);
  assert.equal(result.claudeStreamDiagnostics.eventTypeCounts.result, 1);
  assert.equal(result.claudeStreamDiagnostics.resultSubtypeCounts.success, 1);
  assert.equal(result.claudeStreamDiagnostics.resultIsError, false);
  assert.deepEqual(result.claudeStreamDiagnostics.assistantNativeToolCounts,
    { read: 0, edit: 0, write: 1, unknown: 0 });
  assert.equal(result.claudeStreamDiagnostics.parseFailureCount, 0);
  assert.doesNotMatch(JSON.stringify(result), /success-private/);
});
test('generic Claude context fails the no-advice control', { timeout: 120_000 }, () => {
  const result = runSingleControl('claude', { generic: true });
  assert.equal(result.findingSubmissions, 0);
  assert.equal(result.operationalNoticeSubmissions, 0);
  assert.equal(result.unclassifiedSubmissions, 1);
  assert.equal(result.hostSubmissions, 1);
  assert.equal(result.reviewAdmissionMarkerObserved, true);
  assert.equal(result.reviewCompletedOutcome, 'completed-clear');
  assert.equal(result.acceptanceStatus, 'failed');
});
test('generic OpenCode context fails the no-advice control', { timeout: 120_000 }, () => {
  const result = runSingleControl('opencode', { generic: true });
  assert.equal(result.findingSubmissions, 0);
  assert.equal(result.operationalNoticeSubmissions, 0);
  assert.equal(result.unclassifiedSubmissions, 1);
  assert.equal(result.hostSubmissions, 1);
  assert.equal(result.reviewAdmissionMarkerObserved, true);
  assert.equal(result.reviewCompletedOutcome, 'completed-clear');
  assert.equal(result.acceptanceStatus, 'failed');
});
test('shell-authored file with no native edit or hook cannot pass control', { timeout: 120_000 }, () => {
  const result = runSingleControl('claude', { noHook: 'shell' });
  assert.equal(result.completedSyntheticEdit, true);
  assert.equal(result.initialNativeEditMatched, false);
  assert.equal(result.reviewCompletedOutcome, 'not-observed');
  assert.equal(result.editObservedToSubmissionMs, null);
  assert.equal(result.acceptanceStatus, 'incomplete');
});
test('model native edit without loaded hook cannot pass control', { timeout: 120_000 }, () => {
  const result = runSingleControl('opencode', { noHook: 'unloaded' });
  assert.equal(result.nativeModelEditEvents, 1);
  assert.equal(result.nativeDirectHookCalls, 0);
  assert.equal(result.acceptanceStatus, 'incomplete');
});
test('mismatched native call and hook cannot pass control', { timeout: 120_000 }, () => {
  const result = runSingleControl('claude', { eventShape: 'mismatch' });
  assert.equal(result.nativeModelEditEvents, 1);
  assert.equal(result.nativeDirectHookCalls, 1);
  assert.equal(result.initialNativeEditMatched, false);
  assert.equal(result.acceptanceStatus, 'incomplete');
});
test('missing native event timestamp cannot pass control', { timeout: 120_000 }, () => {
  const result = runSingleControl('opencode', { missingTimestamp: true });
  assert.equal(result.initialNativeEditMatched, false);
  assert.equal(result.initialNativeEditObservedAtMs, null);
  assert.equal(result.acceptanceStatus, 'incomplete');
});
test('duplicate initial hook finishes cannot pass control when one finish failed', { timeout: 120_000 }, () => {
  const result = runSingleControl('claude', { duplicateInitialFinish: true });
  assert.equal(result.nativeDirectHookCalls, 2);
  assert.equal(result.initialHookCallKeyMatched, false);
  assert.equal(result.initialHookSucceeded, false);
  assert.equal(result.initialNativeEditMatched, false);
  assert.equal(result.acceptanceStatus, 'incomplete');
});
test('timeout requires completed initial hook and observed admission', { timeout: 120_000 },
  () => runNoHookStageB('claude', 'timeout'));
test('unavailable backend requires completed initial hook and observed admission', { timeout: 120_000 },
  () => runNoHookStageB('opencode', 'failure'));
test('a nonmatching Claude native call cannot authorize stale mutation', { timeout: 120_000 },
  () => run('claude', 'known', 'stale-mismatch'));
test('a nonmatching OpenCode native call cannot authorize stale mutation', { timeout: 120_000 },
  () => run('opencode', 'known', 'stale-mismatch'));
test('generic handoff after ordered stale mutation prevents acceptance', { timeout: 120_000 },
  () => run('claude', 'known', 'stale-generic'));
test('timeout records an undelivered no-later-event result', { timeout: 120_000 },
  () => run('claude', 'known', 'timeout'));
test('one bounded offline Claude control with production CLI', {
  skip: process.env.HAPSLAND_94_SINGLE_CONTROL !== '1', timeout: 60_000,
}, () => {
  const control = runSingleControl('claude', {});
  const summary = {
    acceptanceStatus: control.acceptanceStatus,
    initialNativeEditMatched: control.initialNativeEditMatched,
    initialHookCallKeyMatched: control.initialHookCallKeyMatched,
    initialHookSucceeded: control.initialHookSucceeded,
    reviewAdmissionMarkerObserved: control.reviewAdmissionMarkerObserved,
    reviewCompletedOutcome: control.reviewCompletedOutcome,
    hookDurationMs: control.hookDurationMs[0] ?? null,
    admissionMarkerAtMs: control.admissionMarkerAtMs ?? null,
    reviewOutcomeFileAtMs: control.reviewOutcomeFileAtMs ?? null,
    bridgeInnerStartAtMs: control.bridgeInnerStartAtMs ?? null,
    bridgeInnerReturnAtMs: control.bridgeInnerReturnAtMs ?? null,
    timingHostLaunchEpochMs: control.timingHostLaunchEpochMs ?? null,
  };
  process.stdout.write(`source-free production-CLI control: ${JSON.stringify(summary)}\n`);
  assert.equal(control.nativeDirectHookCalls, 1);
  assert.equal(control.initialNativeEditMatched, true);
  assert.equal(control.initialHookCallKeyMatched, true);
  assert.equal(control.initialHookSucceeded, true);
  assert.equal(control.reviewCompletedOutcome, 'completed-clear');
  assert.equal(control.acceptanceStatus, 'passed');
});
test('five bounded offline Claude control readiness repetitions', {
  skip: process.env.HAPSLAND_94_CONTROL_READINESS !== '1', timeout: 120_000,
}, () => {
  const summaries = Array.from({ length: 5 }, () => runSingleControl('claude', {}));
  const retained = summaries.map(item => ({
    acceptanceStatus: item.acceptanceStatus,
    initialHookSucceeded: item.initialHookSucceeded,
    admissionObserved: item.reviewAdmissionMarkerObserved,
    hookDurationMs: item.hookDurationMs[0] ?? null,
  }));
  process.stdout.write(`source-free control readiness: ${JSON.stringify(retained)}\n`);
});
