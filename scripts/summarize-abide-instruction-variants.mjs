// Join frozen anonymous domain scores with native receipt evidence.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';

const root = path.resolve(process.argv[2] ?? path.resolve(import.meta.dirname, '../../hapsland-research/evidence/abide-quality-instructions'));
const declaration = JSON.parse(fs.readFileSync(path.join(root, 'declaration.json')));
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
assert.equal(hash(fs.readFileSync(new URL('./score-abide-quality-artifacts.mjs', import.meta.url))), declaration.protectedOracleSha256);
const output = path.join(root, 'comparison.json');
assert(!fs.existsSync(output), 'Never overwrite a closed comparison');
const frozen = declaration.variants.map(variant => {
  const dir = path.join(root, variant);
  assert(fs.existsSync(path.join(dir, 'index.json')), `Incomplete variant ${variant}`);
  const scorePath = path.join(dir, 'blind-scores.json');
  if (!fs.existsSync(scorePath)) {
    const result = spawnSync(process.execPath, [path.join(import.meta.dirname, 'score-abide-quality-artifacts.mjs'),
      '--score', `--blind-root=${path.join(dir, 'blind')}`, `--output=${scorePath}`], { encoding: 'utf8', timeout: 120000 });
    assert.equal(result.status, 0, `Anonymous scoring failed for ${variant}`);
  }
  const bytes = fs.readFileSync(scorePath);
  const scores = JSON.parse(bytes);
  assert.equal(scores.scorerDigest, declaration.protectedOracleSha256);
  assert.equal(scores.scores.length, 18);
  return { variant, dir, scores, scoresSha256: hash(bytes) };
});
fs.writeFileSync(path.join(root, 'unblinding-receipt.json'), JSON.stringify({ version: 1,
  frozenAt: new Date().toISOString(), scoreDigests: Object.fromEntries(frozen.map(item => [item.variant, item.scoresSha256])),
  ordering: 'All anonymous scores existed and were hashed before joining arm ledgers.' }, null, 2) + '\n', { flag: 'wx' });
const variants = frozen.map(({ variant, dir, scores, scoresSha256 }) => {
  const rows = fs.readdirSync(dir).filter(file => /^B-.*\.json$/.test(file)).sort().map(file => {
    const record = JSON.parse(fs.readFileSync(path.join(dir, file)));
    const score = scores.scores.find(item => item.blindId === record.blindId);
    assert(score, `Missing score for ${file}`);
    const emitted = record.hookEvents.find(event => event.receiptInserted);
    const verified = Boolean(emitted && record.feedbackReceipt.echoedInFinalAgentMessage);
    return { file, taskId: record.taskId, candidate: record.candidate, blindId: record.blindId,
      status: score.status, underlyingGold: score.underlyingGold, compiles: score.compiles,
      successfulSession: record.code === 0 && !record.timedOut, timedOut: record.timedOut,
      requests: record.requests.filter(item => item.kind === 'request').length,
      positiveReviewerAnswer: record.requests.some(item => item.kind === 'response' && Object.values(item.answers ?? {}).some(answer => answer.finding)),
      ruleBearingOutput: Boolean(emitted), receiptVerified: verified,
      reportedApplication: record.feedbackReceipt.reportedOutcome,
      reportedReasonCategories: record.feedbackReceipt.reasonCategories,
      sourceChangedAfterOutput: Boolean(emitted && record.hookEvents.some(event => event.doneAt > emitted.doneAt && event.sourceHash !== emitted.sourceHash)),
      laterReviewerAnswerWithoutFinding: Boolean(emitted && record.requests.some(item => item.kind === 'response' && item.at > emitted.doneAt && Object.values(item.answers ?? {}).some(answer => !answer.finding))),
      completionUsageKnown: record.usage !== null };
  });
  assert.equal(rows.length, 18);
  const groups = Object.fromEntries(declaration.arms.map(candidate => {
    const selected = rows.filter(row => row.candidate === candidate);
    return [candidate, { sessions: selected.length, successfulSessions: selected.filter(row => row.successfulSession).length,
      repaired: selected.filter(row => row.status === 'repaired').length,
      completedRepaired: selected.filter(row => row.status === 'repaired' && row.successfulSession).length,
      timedOutRepaired: selected.filter(row => row.status === 'repaired' && row.timedOut).length,
      remaining: selected.filter(row => row.status === 'remaining').length,
      cleanPreserved: selected.filter(row => row.status === 'clean-preserved').length,
      newDomainRestriction: selected.filter(row => row.status === 'new-domain-restriction').length,
      unassessed: selected.filter(row => row.status === 'unassessed').length,
      positiveReviewerAnswers: selected.filter(row => row.positiveReviewerAnswer).length,
      ruleBearingOutputs: selected.filter(row => row.ruleBearingOutput).length,
      verifiedReceipts: selected.filter(row => row.receiptVerified).length,
      verifiedReceiptsWithClaimedApplication: selected.filter(row => row.receiptVerified && row.reportedApplication === 'APPLIED').length,
      verifiedReceiptsWithSubsequentRepair: selected.filter(row => row.receiptVerified && row.sourceChangedAfterOutput && row.status === 'repaired').length,
      requests: selected.reduce((count, row) => count + row.requests, 0), timeouts: selected.filter(row => row.timedOut).length }];
  }));
  return { variant, scoresSha256, groups, rows };
});
const requests = variants.reduce((count, variant) => count + variant.rows.reduce((sum, row) => sum + row.requests, 0), 0);
assert.equal(requests, fs.readFileSync(path.join(root, 'attempts.jsonl'), 'utf8').trim().split('\n').filter(Boolean).length);
assert(requests <= declaration.sharedPhysicalRequestCap);
fs.writeFileSync(output, JSON.stringify({ version: 1, generatedAt: new Date().toISOString(), variants, requests,
  limits: 'Reused cases and one run per task/arm/variant. Receipt instructions modify feedback; application claims require independent repair checks. No optimization keep or population superiority.' }, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ requests, variants: variants.map(({ variant, groups }) => ({ variant, groups })), output }));
