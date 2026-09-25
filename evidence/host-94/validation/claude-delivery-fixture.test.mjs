import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { join } from 'node:path';

const fixture = join(import.meta.dirname, 'claude-delivery-fixture.mjs');
for (const variant of ['block', 'clear', 'notice']) {
  test(`exact Claude offline production ${variant} delivery`, () => {
    const result = spawnSync(process.execPath, [fixture, variant], {
      encoding: 'utf8', timeout: 95_000, maxBuffer: 2_000_000,
    });
    assert.equal(result.status, 0, `fixture ${variant} failed; stderr withheld`);
    const evidence = JSON.parse(result.stdout);
    assert.equal(evidence.hostVersion, '2.1.218');
    assert.equal(evidence.userBlockOptIn, true);
    assert.equal(evidence.requestCount, 2);
    assert.equal(evidence.postHookRequest, true);
    assert.equal(evidence.initialRequestHasRuleReference, false);
    assert.equal(evidence.initialRequestHasRepairRequest, false);
    assert.equal(evidence.hookExitZero, true);
    assert.equal(evidence.hookOutputValid, true);
    assert.equal(evidence.cliOutputForwardedUnchanged, true);
    assert.equal(evidence.forwardedOutputBytes, evidence.hostOutputBytes);
    assert.equal(evidence.completedFinding, variant === 'block');
    assert.equal(evidence.completedClear, variant === 'clear');
    assert.equal(evidence.completedNoticeOnly, variant === 'notice');
    assert.equal(evidence.completedReviewOutcome, variant !== 'notice');
    assert.equal(evidence.syntheticFileCreated, true);
    assert.equal(evidence.hostTimedOut, false);
    assert.equal(evidence.outputCeilingExceeded, false);
    assert.equal(evidence.hostLineCeilingExceeded, false);
    assert.ok(evidence.hostOutputBytes <= 2_048);
    assert.equal(evidence.requestBodyRetained, false);
    assert.equal(evidence.hostOutputRetained, false);
    assert.equal(evidence.modelTextRetained, false);
    assert.equal(evidence.sourceRetained, false);
    assert.equal(JSON.stringify(evidence).includes('OrderCount'), false);
    if (variant === 'block') {
      assert.equal(evidence.productionRuleReferenceCount, 1);
      assert.equal(evidence.productionRepairRequestInHostOutput, true);
      assert.equal(evidence.postHookRequestHasRuleReference, true);
      assert.equal(evidence.postHookRequestHasRepairRequest, true);
      assert.equal(evidence.postHookUserMessageHasRuleReference, true);
      assert.equal(evidence.postHookUserMessageHasRepairRequest, true);
      assert.equal(evidence.postHookRequestHasNotice, false);
    } else if (variant === 'clear') {
      assert.equal(evidence.completedFinding, false);
      assert.equal(evidence.postHookRequestHasRuleReference, false);
      assert.equal(evidence.postHookRequestHasRepairRequest, false);
    } else {
      assert.equal(evidence.postHookRequestHasNotice, true);
      assert.equal(evidence.postHookRequestHasRuleReference, false);
      assert.equal(evidence.postHookRequestHasRepairRequest, false);
      assert.equal(evidence.postHookRequestHasRepairInNoticeControl, false);
    }
    assert.ok(evidence.hookFinishedAtMs < evidence.postHookRequestAtMs);
  });
}
