import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { join } from 'node:path';

const fixture = join(import.meta.dirname, 'claude-delivery-fixture.mjs');
for (const variant of ['context', 'plain', 'block']) {
  test(`exact Claude offline ${variant} delivery envelope`, () => {
    const result = spawnSync(process.execPath, [fixture, variant], {
      encoding: 'utf8', timeout: 90_000, maxBuffer: 2_000_000,
    });
    assert.equal(result.status, 0, `fixture ${variant} failed; stderr withheld`);
    const evidence = JSON.parse(result.stdout);
    assert.equal(evidence.hostExitCode, 0);
    assert.equal(evidence.requestCount, 2);
    assert.equal(evidence.completedFinding, true);
    assert.equal(evidence.completedReviewOutcome, true);
    assert.equal(evidence.hookExitZero, true);
    assert.equal(evidence.hookOutputValid, true);
    assert.equal(evidence.syntheticFileCreated, true);
    assert.equal(evidence.postHookRequest, true);
    assert.equal(evidence.markerInInitialRequest, false);
    assert.equal(evidence.productionFindingRuleInInitialRequest, false);
    assert.equal(evidence.markerInUserMessage, variant !== 'plain');
    assert.equal(evidence.markerInPostHookRequest, variant !== 'plain');
    assert.equal(evidence.productionFindingRuleInUserMessage, variant === 'context');
    assert.equal(evidence.actingRuleReferenceInUserMessage, variant === 'block');
    assert.equal(evidence.hostTimedOut, false);
    assert.equal(evidence.outputCeilingExceeded, false);
    assert.ok(evidence.hookFinishedAtMs < evidence.postHookRequestAtMs);
  });
}
