import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
const root = resolve(process.argv[2] ?? 'evidence/abide-quality');
const frozen = JSON.parse(readFileSync(join(root, 'fixtures.json')));
const files = readdirSync(root).filter(x => /^A-.*\.json$/.test(x));
const all = files.map(x => JSON.parse(readFileSync(join(root, x))));
const groups = {};
for (const candidate of ['hapsland', 'abide']) {
  const cells = all.filter(x => x.candidate === candidate);
  const labelled = cells.filter(x => frozen.cases.find(f => f.id === x.caseId).gold !== null);
  const counts = { truePositive: 0, falsePositive: 0, trueNegative: 0, falseNegative: 0, uncheckedPositive: 0, uncheckedNegative: 0 };
  const categories = {};
  for (const cell of labelled) {
    const fixture = frozen.cases.find(x => x.id === cell.caseId);
    const response = cell.requests.find(x => x.kind === 'response' && x.status === 200);
    const answer = response?.answers?.[fixture.ruleId];
    const checked = typeof answer?.finding === 'boolean' && (candidate === 'abide' || cell.summary.evaluations.some(x => x.status === 'evaluated'));
    const category = categories[fixture.category] ??= { cells: 0, checked: 0, correct: 0 };
    category.cells++; category.checked += checked ? 1 : 0;
    if (!checked) counts[fixture.gold ? 'uncheckedPositive' : 'uncheckedNegative']++;
    else {
      counts[fixture.gold ? answer.finding ? 'truePositive' : 'falseNegative' : answer.finding ? 'falsePositive' : 'trueNegative']++;
      category.correct += answer.finding === fixture.gold ? 1 : 0;
    }
  }
  const durations = cells.flatMap(x => x.requests.filter(y => y.kind === 'response').map(y => y.durationMs)).sort((a,b) => a-b);
  groups[candidate] = { labelledCells: labelled.length, ...counts,
    precision: counts.truePositive + counts.falsePositive ? counts.truePositive / (counts.truePositive + counts.falsePositive) : null,
    recallIncludingUnchecked: counts.truePositive / (counts.truePositive + counts.falseNegative + counts.uncheckedPositive),
    checkedCoverage: (labelled.length - counts.uncheckedPositive - counts.uncheckedNegative) / labelled.length,
    categories, requests: cells.reduce((n,x) => n + x.requests.filter(y => y.kind === 'request').length, 0),
    latencyMs: { count: durations.length, median: durations[Math.floor(durations.length / 2)], minimum: durations[0], maximum: durations.at(-1) },
    matchedGoldInputTokens: labelled.reduce((n,x) => n + x.requests.filter(y => y.kind === 'response').reduce((m,y) => m + (y.usage?.input_tokens ?? 0),0),0),
    inputTokens: cells.reduce((n,x) => n + x.requests.filter(y => y.kind === 'response').reduce((m,y) => m + (y.usage?.input_tokens ?? 0),0),0),
    exclusionDiagnostics: cells.filter(x => frozen.cases.find(f => f.id === x.caseId).gold === null).map(x => ({ caseId: x.caseId, pass: x.pass, requests: x.requests.filter(y => y.kind === 'request').length, ready: x.summary.ready ?? null,
      answers: x.requests.find(y => y.kind === 'response')?.answers ?? null })) };
}
const native = readdirSync(root).filter(x => /^B-.*\.json$/.test(x)).map(x => JSON.parse(readFileSync(join(root,x))));
const report = { generatedAt: new Date().toISOString(), stageA: groups, stageB: { sessions: native.length,
  candidates: Object.fromEntries(['baseline','hapsland','abide'].map(candidate => {
    const rows = native.filter(x => x.candidate === candidate);
    return [candidate, { sessions: rows.length, successfulHostExits: rows.filter(x=>x.code===0).length,
      typechecksPassed: rows.filter(x=>x.finalTypecheck?.passes).length, timeouts: rows.filter(x=>x.timedOut).length,
      setupFailures: rows.filter(x=>x.setupFailed).length, requestAttempts: rows.reduce((n,x)=>n+(x.requests??[]).filter(y=>y.kind==='request').length,0),
      sessionsWithFindingHook: rows.filter(x=>(x.hookEvents??[]).some(y=>y.findingIds?.length)).length,
      hookDeliveryIsNotProvenModelVisibility: true,
      hostUncachedPlusOutputTokens: rows.reduce((n,x)=>n+(x.uncachedPlusOutputTokens??0),0) }];
  })) },
  limits: { oneTargetRulePerCase: true, repeatedCasesNotIndependentSamples: true, blindedRepairScoresSeparate: true, noPopulationSuperiorityClaim: true } };
writeFileSync(join(root,'summary.json'), JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report, null, 2));
