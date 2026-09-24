// Stop-before-next gates for the owner-approved fresh paired pilot.
export const FRESH_ORDER = [
  { pair: 1, arm: "A" },
  { pair: 1, arm: "B" },
  { pair: 2, arm: "B" },
  { pair: 2, arm: "A" },
];

const perRunUncachedOutput = 250_000;
const totalUncachedOutput = 750_000;
const perRunCached = 2_000_000;
const totalCached = 8_000_000;
const maxHostMs = 120 * 60_000;
const maxHostStarts = 6;
const maxProviderRequests = 80;
const maxProviderRequestBytes = 2 * 1024 * 1024;

export function tokenAccounting(usage) {
  if (!Array.isArray(usage) || usage.length === 0) throw new Error("missing host token usage");
  const totals = { input: 0, cachedInput: 0, uncachedInput: 0, output: 0,
    reasoningOutput: 0, uncachedPlusOutput: 0 };
  for (const item of usage) {
    const input = item.input_tokens;
    const cached = item.cached_input_tokens;
    const output = item.output_tokens;
    const reasoning = item.reasoning_output_tokens;
    if (![input, cached, output, reasoning].every((value) => Number.isSafeInteger(value) && value >= 0) ||
      cached > input || reasoning > output) throw new Error("invalid host token usage");
    totals.input += input;
    totals.cachedInput += cached;
    totals.uncachedInput += input - cached;
    totals.output += output;
    totals.reasoningOutput += reasoning;
  }
  totals.uncachedPlusOutput = totals.uncachedInput + totals.output;
  if (!Object.values(totals).every(Number.isSafeInteger)) throw new Error("host token usage overflow");
  return totals;
}

export function validateNext(records, next, observedStarts = records.length, expectedHashes = undefined,
  failedAttempts = []) {
  const expected = FRESH_ORDER[records.length];
  if (!expected || expected.pair !== next.pair || expected.arm !== next.arm) {
    throw new Error("fresh arm order mismatch");
  }
  if (!Array.isArray(failedAttempts) || !Number.isSafeInteger(observedStarts) ||
    observedStarts !== records.length + failedAttempts.length ||
    observedStarts >= maxHostStarts) throw new Error("unfinished or excessive host starts");
  const failuresByPair = new Map();
  let previousFailurePosition = -1;
  for (const failure of failedAttempts) {
    const position = FRESH_ORDER.findIndex((entry) => entry.pair === failure.pair && entry.arm === failure.arm);
    if (position < previousFailurePosition || position < 0 || position > records.length || failure.attempt !== 0 ||
      failure.kind !== "infrastructure-failure-before-edit" ||
      failure.proof?.noToolInvocation !== true || failure.proof?.pristineRepository !== true ||
      failure.proof?.validHostEvents !== true || failure.hostTimedOut !== false ||
      failure.hostExitCode === 0 || !Number.isSafeInteger(failure.hostExitCode) ||
      (failure.hostKnownErrors?.bwrap !== true && failure.hostKnownErrors?.modelUnavailable !== true)) {
      throw new Error("failed attempt lacks durable pre-edit infrastructure proof");
    }
    if (failure.host?.version !== "0.155.1" || failure.host?.model !== "gpt-6-luna" ||
      failure.host?.reasoning !== "max" || failure.host?.platform !== `${process.platform}-${process.arch}` ||
      failure.host?.sandboxBypass !== true || failure.host?.hookTrustBypass !== true ||
      (expectedHashes && (failure.promptSha256 !== expectedHashes.promptSha256 ||
        failure.proceduralInstructionSha256 !== expectedHashes.proceduralInstructionSha256))) {
      throw new Error("failed attempt host settings or prompt mismatch");
    }
    failuresByPair.set(failure.pair, (failuresByPair.get(failure.pair) ?? 0) + 1);
    if (failuresByPair.get(failure.pair) > 1) throw new Error("more than one retry in pair");
    previousFailurePosition = position;
  }
  let elapsed = 0;
  let uncachedOutput = 0;
  let cached = 0;
  let jevSpent = 0;
  let codexSpent = 0;
  let jevCostObserved = false;
  let codexCostObserved = false;
  const runTokens = [];
  const allAttempts = [...records, ...failedAttempts];
  for (let index = 0; index < allAttempts.length; index += 1) {
    const record = allAttempts[index];
    const position = FRESH_ORDER[index < records.length ? index :
      FRESH_ORDER.findIndex((entry) => entry.pair === record.pair && entry.arm === record.arm)];
    if (record.pair !== position.pair || record.arm !== position.arm ||
      record.host?.version !== "0.155.1" || record.host?.model !== "gpt-6-luna" ||
      record.host?.reasoning !== "max" || record.host?.platform !== `${process.platform}-${process.arch}` ||
      record.host?.sandboxBypass !== true || record.host?.hookTrustBypass !== true ||
      typeof record.promptSha256 !== "string" || typeof record.proceduralInstructionSha256 !== "string") {
      throw new Error("prior host settings or arm matching failed");
    }
    if (expectedHashes && (record.promptSha256 !== expectedHashes.promptSha256 ||
      record.proceduralInstructionSha256 !== expectedHashes.proceduralInstructionSha256)) {
      throw new Error("prior prompt hash mismatch");
    }
    if (!Number.isSafeInteger(record.hostElapsedMs) || record.hostElapsedMs < 0 ||
      record.hostElapsedMs > 20 * 60_000) throw new Error("prior host time exceeded session cap");
    elapsed += record.hostElapsedMs;
    const tokens = tokenAccounting(record.hostReportedUsage);
    // A1 was started before this computed field was added. Derive from its
    // retained raw host counters when the derived field is absent or null.
    if (record.tokenAccounting != null &&
      JSON.stringify(record.tokenAccounting) !== JSON.stringify(tokens)) {
      throw new Error("recorded token accounting disagrees with host usage");
    }
    if (tokens.uncachedPlusOutput >= perRunUncachedOutput || tokens.cachedInput >= perRunCached) {
      throw new Error("prior run reached per-run token stop");
    }
    uncachedOutput += tokens.uncachedPlusOutput;
    cached += tokens.cachedInput;
    runTokens.push(tokens);
    if (record.arm === "A") {
      if (!Number.isSafeInteger(record.providerRequests) || record.providerRequests < 0 ||
        record.providerRequests > maxProviderRequests ||
        !Number.isSafeInteger(record.providerRequestBytes) || record.providerRequestBytes < 0 ||
        record.providerRequestBytes > maxProviderRequestBytes) {
        throw new Error("prior Jev request budget not verified");
      }
    } else if (record.providerRequests !== 0) {
      throw new Error("control arm unexpectedly contacted Jev");
    }
    if (record.kind === "infrastructure-failure-before-edit" &&
      (record.providerRequests !== 0 || record.providerRequestBytes !== 0)) {
      throw new Error("failed attempt has provider activity");
    }
    if (typeof record.jevReportedCostUsd === "number") {
      if (!Number.isFinite(record.jevReportedCostUsd) || record.jevReportedCostUsd < 0) throw new Error("invalid Jev cost");
      jevCostObserved = true;
      jevSpent += record.jevReportedCostUsd;
    }
    if (typeof record.hostReportedCostUsd === "number") {
      if (!Number.isFinite(record.hostReportedCostUsd) || record.hostReportedCostUsd < 0) throw new Error("invalid Codex cost");
      codexCostObserved = true;
      codexSpent += record.hostReportedCostUsd;
    }
  }
  const first = records[0];
  for (const record of records.slice(1)) {
    if (record.promptSha256 !== first.promptSha256 ||
      record.proceduralInstructionSha256 !== first.proceduralInstructionSha256) {
      throw new Error("prompt mismatch across arms");
    }
  }
  if (uncachedOutput >= totalUncachedOutput || cached >= totalCached) {
    throw new Error("cumulative token stop reached");
  }
  if (elapsed + 20 * 60_000 > maxHostMs) throw new Error("120-host-minute ceiling would be exceeded");
  if (jevCostObserved && jevSpent >= 25) throw new Error("observed Jev cost stop reached");
  if (codexCostObserved && codexSpent >= 40) throw new Error("observed Codex cost stop reached");
  return { priorRuns: records.length, priorHostStarts: observedStarts,
    attempt: failedAttempts.some((failure) => failure.pair === next.pair && failure.arm === next.arm) ? 1 : 0,
    priorHostMs: elapsed, priorUncachedPlusOutput: uncachedOutput,
    priorCachedInput: cached, priorRunTokens: runTokens,
    jevCostUsd: jevCostObserved ? jevSpent : null,
    codexCostUsd: codexCostObserved ? codexSpent : null };
}
