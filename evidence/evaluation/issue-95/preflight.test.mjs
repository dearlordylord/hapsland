import assert from "node:assert/strict";
import test from "node:test";
import { FRESH_ORDER, tokenAccounting, validateNext } from "./preflight.mjs";

const hashes = { promptSha256: "prompt", proceduralInstructionSha256: "instruction" };
const makeRecord = (position, overrides = {}) => ({
  ...FRESH_ORDER[position],
  host: { version: "0.155.1", model: "gpt-6-luna", reasoning: "max",
    platform: `${process.platform}-${process.arch}`, sandboxBypass: true, hookTrustBypass: true },
  ...hashes,
  hostElapsedMs: 100_000,
  hostReportedUsage: [{ input_tokens: 100_000, cached_input_tokens: 50_000,
    output_tokens: 20_000, reasoning_output_tokens: 10_000 }],
  providerRequests: FRESH_ORDER[position].arm === "A" ? 10 : 0,
  providerRequestBytes: FRESH_ORDER[position].arm === "A" ? 10_000 : 0,
  hostReportedCostUsd: null,
  jevReportedCostUsd: null,
  ...overrides,
});
const makeFailure = (position, overrides = {}) => makeRecord(position, {
  kind: "infrastructure-failure-before-edit", attempt: 0,
  hostExitCode: 1, hostTimedOut: false,
  hostKnownErrors: { bwrap: true, modelUnavailable: false },
  providerRequests: 0, providerRequestBytes: 0,
  proof: { noToolInvocation: true, pristineRepository: true, validHostEvents: true },
  ...overrides,
});

test("derives uncached and reasoning subsets without double counting", () => {
  assert.deepEqual(tokenAccounting([{
    input_tokens: 1_336_616, cached_input_tokens: 1_253_632,
    output_tokens: 36_983, reasoning_output_tokens: 19_812,
  }]), { input: 1_336_616, cachedInput: 1_253_632, uncachedInput: 82_984,
    output: 36_983, reasoningOutput: 19_812, uncachedPlusOutput: 119_967 });
});

test("derives legacy missing or null computed tokens from retained host usage", () => {
  assert.equal(validateNext([makeRecord(0, { tokenAccounting: null })], FRESH_ORDER[1], 1, hashes)
    .priorUncachedPlusOutput, 70_000);
  assert.equal(validateNext([makeRecord(0)], FRESH_ORDER[1], 1, hashes)
    .priorCachedInput, 50_000);
});

test("allows only the fresh A1, B1, B2, A2 order with matched settings", () => {
  assert.equal(validateNext([], FRESH_ORDER[0], 0, hashes).priorRuns, 0);
  assert.equal(validateNext([makeRecord(0)], FRESH_ORDER[1], 1, hashes).priorRuns, 1);
  assert.equal(validateNext([makeRecord(0), makeRecord(1)], FRESH_ORDER[2], 2, hashes).priorRuns, 2);
  assert.equal(validateNext([makeRecord(0), makeRecord(1), makeRecord(2)], FRESH_ORDER[3], 3, hashes).priorRuns, 3);
  assert.throws(() => validateNext([], FRESH_ORDER[1], 0, hashes), /order mismatch/);
  assert.throws(() => validateNext([makeRecord(0)], FRESH_ORDER[1], 2, hashes), /unfinished or excessive host starts/);
  assert.throws(() => validateNext([makeRecord(0, { promptSha256: "wrong" })], FRESH_ORDER[1], 1, hashes), /prompt hash mismatch/);
});

test("stops before the next session on per-run token, provider, or observed cost gates", () => {
  const overUncached = makeRecord(0, { hostReportedUsage: [{ input_tokens: 250_000,
    cached_input_tokens: 0, output_tokens: 1, reasoning_output_tokens: 0 }] });
  assert.throws(() => validateNext([overUncached], FRESH_ORDER[1], 1, hashes), /per-run token stop/);
  const overCached = makeRecord(0, { hostReportedUsage: [{ input_tokens: 2_000_000,
    cached_input_tokens: 2_000_000, output_tokens: 1, reasoning_output_tokens: 0 }] });
  assert.throws(() => validateNext([overCached], FRESH_ORDER[1], 1, hashes), /per-run token stop/);
  assert.throws(() => validateNext([makeRecord(0, { providerRequests: 81 })], FRESH_ORDER[1], 1, hashes), /Jev request budget/);
  assert.throws(() => validateNext([makeRecord(0, { providerRequestBytes: 2 * 1024 * 1024 + 1 })], FRESH_ORDER[1], 1, hashes), /Jev request budget/);
  assert.throws(() => validateNext([makeRecord(0, { jevReportedCostUsd: 25 })], FRESH_ORDER[1], 1, hashes), /Jev cost stop/);
  assert.throws(() => validateNext([makeRecord(0, { hostReportedCostUsd: 40 })], FRESH_ORDER[1], 1, hashes), /Codex cost stop/);
});

test("fails closed on missing usage, changed host, and control-arm Jev calls", () => {
  assert.throws(() => validateNext([makeRecord(0, { hostReportedUsage: [] })], FRESH_ORDER[1], 1, hashes), /missing host token usage/);
  assert.throws(() => validateNext([makeRecord(0, { host: { version: "0.156.1" } })], FRESH_ORDER[1], 1, hashes), /host settings/);
  assert.throws(() => validateNext([makeRecord(0), makeRecord(1, { providerRequests: 1 })], FRESH_ORDER[2], 2, hashes), /control arm/);
});

test("allows one proven pre-edit infrastructure retry in an exclusive second start", () => {
  const failedA1 = makeFailure(0);
  const retry = validateNext([], FRESH_ORDER[0], 1, hashes, [failedA1]);
  assert.equal(retry.attempt, 1);
  assert.equal(retry.priorHostStarts, 1);
  assert.equal(retry.priorHostMs, 100_000);
  assert.equal(retry.priorUncachedPlusOutput, 70_000);
  assert.equal(validateNext([makeRecord(0)], FRESH_ORDER[1], 2, hashes, [failedA1]).attempt, 0);
  const failedB1 = makeFailure(1);
  assert.equal(validateNext([makeRecord(0)], FRESH_ORDER[1], 2, hashes, [failedB1]).attempt, 1);
  assert.throws(() => validateNext([makeRecord(0)], FRESH_ORDER[1], 3, hashes,
    [failedA1, failedB1]), /more than one retry in pair/);
});

test("rejects ambiguous, excessive, or unmatched infrastructure attempts", () => {
  for (const change of [
    { proof: { noToolInvocation: false, pristineRepository: true, validHostEvents: true } },
    { proof: { noToolInvocation: true, pristineRepository: false, validHostEvents: true } },
    { proof: { noToolInvocation: true, pristineRepository: true, validHostEvents: false } },
    { hostTimedOut: true },
    { hostKnownErrors: { bwrap: false, modelUnavailable: false } },
    { hostReportedUsage: [] },
    { providerRequests: 1 },
  ]) {
    assert.throws(() => validateNext([], FRESH_ORDER[0], 1, hashes,
      [makeFailure(0, change)]));
  }
  assert.throws(() => validateNext([], FRESH_ORDER[0], 1, hashes,
    [makeFailure(1)]), /durable pre-edit infrastructure proof/);
  assert.throws(() => validateNext([], FRESH_ORDER[0], 2, hashes,
    [makeFailure(0)]), /unfinished or excessive host starts/);
  assert.throws(() => validateNext([], FRESH_ORDER[0], 1, hashes,
    [makeFailure(0, { hostElapsedMs: 20 * 60_000 + 1 })]), /session cap/);
});
