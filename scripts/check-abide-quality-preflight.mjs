import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { cases } from './abide-quality-fixtures.mjs';
const project = resolve(import.meta.dirname, '..');
const roots = [
  ['/tmp/haps-quality-offline-third', 'finding'],
  ['/tmp/haps-quality-clear-check', 'clear'],
  ['/tmp/haps-quality-unavailable-check', 'unavailable'],
];
let verifiedCells = 0;
for (const [root, kind] of roots) for (const fixture of cases) for (const candidate of ['hapsland', 'abide']) {
  const record = JSON.parse(readFileSync(join(root, `A-${fixture.id}-${candidate}-0.json`)));
  assert.equal(record.exitCode, 0);
  const skipped = candidate === 'hapsland' && fixture.excludedPaths.length > 0;
  assert.equal(record.requests.filter(x => x.kind === 'request').length, skipped ? 0 : 1);
  if (!skipped) {
    const response = record.requests.find(x => x.kind === 'response');
    assert.equal(response?.status, kind === 'unavailable' ? 503 : 200);
    if (kind !== 'unavailable') assert.equal(response.answers[fixture.ruleId].finding, kind === 'finding');
    if (candidate === 'hapsland') assert.equal(record.summary.evaluations[0].status, kind === 'unavailable' ? 'backend' : 'evaluated');
    if (candidate === 'abide') assert.equal(record.summary.finding, kind === 'finding');
  }
  verifiedCells++;
}
const gold = [];
for (const fixture of cases) {
  const temp = mkdtempSync(join(tmpdir(), 'hq-gold-'));
  try {
    for (const [name, source] of Object.entries(fixture.support)) writeFileSync(join(temp, name), source);
    writeFileSync(join(temp, 'subject.ts'), fixture.after);
    const args = [join(project, 'node_modules/typescript/bin/tsc'), '--strict', '--noEmit', '--skipLibCheck', '--target', 'ES2022', '--moduleResolution', 'bundler', '--module', 'ESNext', 'subject.ts'];
    const initial = spawnSync(process.execPath, args, { cwd: temp, encoding: 'utf8' });
    assert.equal(initial.status, 0, `Invalid source fixture ${fixture.id}`);
    if (fixture.counterexample) {
      writeFileSync(join(temp, 'probe.ts'), `import type {CaseState} from './subject';\nconst invalid: CaseState = ${fixture.counterexample};\n`);
      const r = spawnSync(process.execPath, [...args, 'probe.ts'], { cwd: temp, encoding: 'utf8' });
      assert.equal(r.status, 0, `Gold counterexample not admitted by ${fixture.id}`);
    }
    gold.push({ caseId: fixture.id, sourceCompiles: true, concreteCounterexampleAdmitted: fixture.counterexample ? true : null });
  } finally { rmSync(temp, { recursive: true, force: true }); }
}
console.log(JSON.stringify({ verifiedControlledCells: verifiedCells, externalJevAttempts: 0, gold,
  controls: ['finding', 'clear', 'unavailable', 'root-excluded', 'support-excluded'],
  claim: 'Deterministic fixture and transport conformance; not advice accuracy.' }, null, 2));
