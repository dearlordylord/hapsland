// Join only after all anonymous scores have been frozen. No outcome-selected additions.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
const root=path.resolve(process.argv[2]??path.resolve(import.meta.dirname, '../../hapsland-research/evidence/abide-contextual-confirmation'));
const read=p=>JSON.parse(fs.readFileSync(p));
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const ledger=p=>fs.readFileSync(p,'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
const declaration=read(path.join(root,'declaration.json'));assert(fs.existsSync(path.join(root,'execution-complete.json')),'Execution not complete');
for(const [p,d]of Object.entries(declaration.protectedDigests))assert.equal(hash(fs.readFileSync(path.resolve(import.meta.dirname,'..',p))),d,`Source drift ${p}`);
assert(!fs.existsSync(path.join(root,'comparison.json')),'Never overwrite a completed comparison');
const controls=read(path.join(root,'control-adjudication.json'));assert.equal(controls.rows.length,18);
const controlFor=(repeat,id)=>controls.rows.find(r=>r.repeat===repeat&&r.blindId===id);
const frozen=declaration.repeats.map(repeat=>{const dir=path.join(root,repeat),file=path.join(dir,'blind-scores.json'),bytes=fs.readFileSync(file),scores=JSON.parse(bytes);assert.equal(scores.scores.length,18);assert.equal(scores.scorerDigest,declaration.protectedOracleSha256);return {repeat,dir,scores:scores.scores,digest:hash(bytes)}});
const receiptPath=path.join(root,'unblinding-receipt.json');
const scoreDigests=Object.fromEntries(frozen.map(x=>[x.repeat,x.digest])),controlDigest=hash(fs.readFileSync(path.join(root,'control-adjudication.json')));
if(fs.existsSync(receiptPath)){const existing=read(receiptPath);assert.deepEqual(existing.scoreDigests,scoreDigests);assert.equal(existing.controlAdjudicationSha256,controlDigest)}else fs.writeFileSync(receiptPath,JSON.stringify({version:1,frozenAt:new Date().toISOString(),scoreDigests,controlAdjudicationSha256:controlDigest,ordering:'All 54 anonymous artifact scores existed and were hashed before this arm join.'},null,2)+'\n',{flag:'wx'});
const rows=frozen.flatMap(({repeat,dir,scores})=>fs.readdirSync(dir).filter(f=>/^B-.*\.json$/.test(f)).sort().map(file=>{
  const r=read(path.join(dir,file)),s=scores.find(x=>x.blindId===r.blindId);assert(s,'Missing anonymous score');
  const control=controlFor(repeat,r.blindId);if(!s.underlyingGold){assert(control);assert.equal(control.sourceDigest,s.sourceDigest)}
  const emitted=r.hookEvents.find(e=>e.receiptInserted),receipt=Boolean(emitted&&r.feedbackReceipt?.echoedInFinalAgentMessage);
  return {repeat,file,taskId:r.taskId,caseId:s.caseId,candidate:r.candidate,blindId:r.blindId,status:s.status,adjudicatedControlStatus:control?.status??null,underlyingGold:s.underlyingGold,compiles:s.compiles,finalWholeProjectTypecheck:r.finalTypecheck?.passes??false,presentationRename:s.presentationRename,
    successfulSession:r.code===0&&!r.timedOut&&r.usage!==null,hostExitCode:r.code,timedOut:r.timedOut,completedTurnUsagePresent:r.usage!==null,durationMs:r.durationMs,requests:r.requests.filter(x=>x.kind==='request').length,
    transportErrors:r.requests.filter(x=>x.kind==='transport-error').length,budgetStops:r.requests.filter(x=>x.kind==='budget-stop').length,
    positiveReviewerAnswer:r.requests.some(x=>x.kind==='response'&&Object.values(x.answers??{}).some(a=>a.finding)),ruleBearingOutput:Boolean(emitted),receiptVerified:receipt,
    reportedApplication:r.feedbackReceipt?.reportedOutcome??null,firstEmissionSurface:emitted?.kind??null,
    sourceChangedAfterOutput:Boolean(emitted&&r.hookEvents.some(e=>e.doneAt>emitted.doneAt&&e.sourceHash&&e.sourceHash!==emitted.sourceHash)),
    independentlyCorrectRepairAfterVerifiedReceipt:Boolean(receipt&&s.status==='repaired'&&r.hookEvents.some(e=>e.doneAt>emitted.doneAt&&e.sourceHash&&e.sourceHash!==emitted.sourceHash)),
    laterReviewerAnswerWithoutFinding:Boolean(emitted&&r.requests.some(x=>x.kind==='response'&&x.at>emitted.doneAt&&Object.values(x.answers??{}).some(a=>!a.finding))),
    stopStarts:r.hookEvents.filter(e=>e.trace==='start'&&e.kind==='stop').length,stopCompletions:r.hookEvents.filter(e=>e.trace==='complete'&&e.kind==='stop').length,
    tokenCapExceeded:r.tokenCapExceeded,uncachedPlusOutputTokens:r.uncachedPlusOutputTokens};
}));assert.equal(rows.length,54);
const detectionDir=path.join(root,'detection');
const detection=fs.readdirSync(detectionDir).filter(f=>/^A-.*\.json$/.test(f)).sort().map(file=>{const r=read(path.join(detectionDir,file)),gold=declaration.cases.find(c=>c.id===r.caseId).gold;
  const responses=r.requests.filter(x=>x.kind==='response'),answered=responses.some(x=>x.status===200&&Object.values(x.answers??{}).some(a=>typeof a.finding==='boolean'));
  const positive=responses.some(x=>Object.values(x.answers??{}).some(a=>a.finding));
  const emitted=r.candidate==='hapsland'?r.summary.evaluations?.some(e=>e.findingIds?.length>0):r.summary.finding;
  const handled=r.exitCode===0&&!r.timedOut&&(r.candidate==='hapsland'?r.summary.status==='complete':r.summary.hookExit===0&&r.summary.startExit===0);
  return {file,caseId:r.caseId,candidate:r.candidate,pass:r.pass,gold,handled,answered,positiveReviewerAnswer:positive,correct:handled&&answered&&positive===gold,ruleBearingOutput:!!emitted,requests:r.requests.filter(x=>x.kind==='request').length};
});assert.equal(detection.length,36);
const group=selected=>({sessions:selected.length,successfulSessions:selected.filter(r=>r.successfulSession).length,flawedSessions:selected.filter(r=>r.underlyingGold).length,
  repaired:selected.filter(r=>r.status==='repaired').length,completedRepaired:selected.filter(r=>r.status==='repaired'&&r.successfulSession).length,remaining:selected.filter(r=>r.status==='remaining').length,
  cleanPreserved:selected.filter(r=>r.status==='clean-preserved').length,adjudicatedCleanPreserved:selected.filter(r=>r.adjudicatedControlStatus==='clean-preserved').length,cleanPositiveReviewerAnswers:selected.filter(r=>!r.underlyingGold&&r.positiveReviewerAnswer).length,cleanReceiptsWithClaimedApplication:selected.filter(r=>!r.underlyingGold&&r.receiptVerified&&r.reportedApplication==='APPLIED').length,cleanReceiptsWithClaimedNonApplication:selected.filter(r=>!r.underlyingGold&&r.receiptVerified&&r.reportedApplication==='NOT_APPLIED').length,newDomainRestriction:selected.filter(r=>r.status==='new-domain-restriction').length,unassessed:selected.filter(r=>r.status==='unassessed').length,
  positiveReviewerAnswers:selected.filter(r=>r.positiveReviewerAnswer).length,ruleBearingOutputs:selected.filter(r=>r.ruleBearingOutput).length,verifiedReceipts:selected.filter(r=>r.receiptVerified).length,
  receiptAndClaimedApplication:selected.filter(r=>r.receiptVerified&&r.reportedApplication==='APPLIED').length,correctRepairsAfterVerifiedReceipt:selected.filter(r=>r.independentlyCorrectRepairAfterVerifiedReceipt).length,
  requests:selected.reduce((n,r)=>n+r.requests,0),timeouts:selected.filter(r=>r.timedOut).length,transportErrors:selected.reduce((n,r)=>n+r.transportErrors,0),budgetStops:selected.reduce((n,r)=>n+r.budgetStops,0),uncachedPlusOutputTokens:selected.reduce((n,r)=>n+(r.uncachedPlusOutputTokens??0),0)});
const nativeGroups=Object.fromEntries(declaration.arms.map(a=>[a,group(rows.filter(r=>r.candidate===a))]));
const perRepeat=Object.fromEntries(declaration.repeats.map(rep=>[rep,Object.fromEntries(declaration.arms.map(a=>[a,group(rows.filter(r=>r.candidate===a&&r.repeat===rep))]))]));
const detectionGroups=Object.fromEntries(['hapsland','abide'].map(a=>{const rs=detection.filter(r=>r.candidate===a);return[a,{cells:rs.length,truePositives:rs.filter(r=>r.gold&&r.correct).length,falseNegatives:rs.filter(r=>r.gold&&r.answered&&!r.positiveReviewerAnswer).length,falsePositives:rs.filter(r=>!r.gold&&r.positiveReviewerAnswer).length,trueNegatives:rs.filter(r=>!r.gold&&r.correct).length,incomplete:rs.filter(r=>!r.handled||!r.answered).length,requests:rs.reduce((n,r)=>n+r.requests,0)}]}));
const caseResults=Object.fromEntries(declaration.cases.map(c=>[c.id,Object.fromEntries(declaration.arms.map(a=>[a,rows.filter(r=>r.caseId===c.id&&r.candidate===a).map(r=>r.status)]))]));
const flowGaps=rows.filter(r=>r.candidate!=='baseline'&&r.underlyingGold&&r.positiveReviewerAnswer&&(!r.ruleBearingOutput||!r.receiptVerified||r.status!=='repaired')).map(r=>({repeat:r.repeat,file:r.file,candidate:r.candidate,caseId:r.caseId,gold:r.underlyingGold,positiveReviewerAnswer:r.positiveReviewerAnswer,ruleBearingOutput:r.ruleBearingOutput,receiptVerified:r.receiptVerified,reportedApplication:r.reportedApplication,status:r.status}));
const attemptCount=ledger(path.join(root,'attempts.jsonl')).length,requestCount=rows.reduce((n,r)=>n+r.requests,0)+detection.reduce((n,r)=>n+r.requests,0);assert.equal(attemptCount,requestCount);assert(attemptCount<=declaration.sharedPhysicalRequestCap);
const result={version:1,generatedAt:new Date().toISOString(),sourceClass:'RUN',verificationState:'RUNTIME-TESTED',physicalRequests:requestCount,detectionGroups,nativeGroups,perRepeat,caseResults,flowGaps,detection,rows,
 limitations:'Four deliberately selected contextual duplicate-encoding flaw cases, two clean independent-fact controls, three repeated sessions; repeats are not independent case samples. Same artificial feedback protocol, custom active rubric, source checkout and cooperative nonce receipt. No general superiority, installed-release or causal context-only effect claim.'};
fs.writeFileSync(path.join(root,'comparison.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({physicalRequests:requestCount,detectionGroups,nativeGroups,flowGaps,output:path.join(root,'comparison.json')}));
