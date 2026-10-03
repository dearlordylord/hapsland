// Non-comparative receipt diagnostic; reuse the unchanged domain oracle.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { score } from './score-abide-quality-artifacts.mjs';

const root = path.resolve(process.argv[2] ?? path.resolve(import.meta.dirname, '../../hapsland-research/evidence/abide-quality-receipt'));
const output = path.join(root, 'receipt-validation.json');
assert(!fs.existsSync(output), 'Never overwrite a completed diagnostic receipt');
const declaration = JSON.parse(fs.readFileSync(path.join(root, 'declaration.json')));
assert(declaration.feedbackReceiptProbe && declaration.onlyCandidate === 'hapsland');
const files = fs.readdirSync(root).filter(file => /^B-.*\.json$/.test(file)).sort();
assert.equal(files.length, declaration.stageBSessions);
const rows = files.map(file => {
  const record = JSON.parse(fs.readFileSync(path.join(root, file)));
  assert.equal(record.candidate, 'hapsland');
  const artifactScore = score(path.join(root, 'blind', record.blindId), record.blindId);
  const positive = record.requests.some(item => item.kind === 'response' &&
    Object.values(item.answers ?? {}).some(answer => answer.finding));
  const receipt = record.feedbackReceipt;
  const outputRecorded = record.hookEvents.some(event => event.receiptInserted);
  assert.equal(outputRecorded, receipt.requestedByHook);
  const verified = outputRecorded && receipt.echoedInFinalAgentMessage;
  return { file, taskId: record.taskId, hostSucceeded: record.code === 0 && !record.timedOut, timedOut: record.timedOut,
    positiveReviewerAnswer: positive, receiptRequestedByHook: outputRecorded,
    receiptVerified: verified, reportedApplication: receipt.reportedOutcome,
    artifactStatus: artifactScore.status, artifactScore,
    sourceChangedAfterFinding: record.hookEvents.some(event => {
      const emitted = record.hookEvents.find(item => item.receiptInserted);
      return emitted && event.doneAt > emitted.doneAt && event.sourceHash !== emitted.sourceHash;
    }),
    interpretation: !positive ? 'Positive finding path was not exercised.' : !outputRecorded
      ? 'No marker-bearing output recorded; model receipt untested.' : !verified
        ? 'Output recorded but model receipt unconfirmed; do not call this refusal.'
        : 'Final assistant echoed a nonce supplied only by finding-bearing hook output; cooperative receipt demonstrated in this diagnostic.' };
});
const report = { version: 1, generatedAt: new Date().toISOString(), rows,
  sourceClass: 'RUN', verificationState: 'RUNTIME-TESTED',
  scorerSha256: crypto.createHash('sha256').update(fs.readFileSync(new URL('./score-abide-quality-artifacts.mjs', import.meta.url))).digest('hex'),
  requests: files.reduce((count, file) => count + JSON.parse(fs.readFileSync(path.join(root, file))).requests.filter(item => item.kind === 'request').length, 0),
  limits: 'Single Hapsland-only runs with an additive receipt instruction; not blinded comparative scoring, not proof of historical exposure, and not a causal explanation of unchanged-prompt failures.' };
fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ completed: rows.length, receiptsVerified: rows.filter(row => row.receiptVerified).length,
  repaired: rows.filter(row => row.artifactStatus === 'repaired').length, output }));
