import { expect, it } from "vitest";
import { readBendList, readRecord } from "../../../src/canonical/boundary-schema.ts";
import { runWorkloadNative, runWorkloadEmitted } from "../../monkey-business-bend/conformance/workload-native-runner.mjs";
import { decodeNativePrefix } from "./callback-native-prefix.ts";
import { decodeExpiryNativeBoundary, expiryPublicBoundary, captureExpiryPublicRun, compareExpiryBusinessTrace } from "./expiry-native-boundary.ts";
import { expiryTicks, reportNotice, collectNotice } from "./expiry-public.fixture.ts";
import { createRun, restoreReplay, type Run, type RunConfig } from "./index.ts";

const captures = new WeakMap<Run, ReturnType<typeof captureExpiryPublicRun>>();
const completeCaptures: ReturnType<ReturnType<typeof captureExpiryPublicRun>["finish"]>[] = [];
function capturedRun(config: RunConfig) {
  const capture = captureExpiryPublicRun(createRun(config));
  captures.set(capture.run,capture);
  return capture.run;
}
function makeExpiryRun(times: readonly number[], pendingMs: number, cooldownMs: number) {
  const run = capturedRun({ sessions: [{ agent: "first" }, { agent: "second" }],
    expiryProfile: { pendingMs, leaseMs: 2, cooldownMs }, inputs: expiryTicks(times) });
  run.applyControl({ kind: "suspendArrivals", suspended: true });
  run.advance({ untilTime: 0, maxEvents: 100 });
  return run;
}
function boundary(run: Run) {
  const replay = restoreReplay(JSON.parse(JSON.stringify(run.exportReplay())));
  expect(replay.observe()).toEqual(run.observe());
  expect(replay.exportReplay()).toEqual(run.exportReplay());
  const capture = captures.get(run);
  if (!capture) throw new Error("missing original public constructor capture");
  completeCaptures.push(capture.finish());
  return expiryPublicBoundary(run.observe());
}
function publicCases() {
  completeCaptures.length = 0;
  const results: ReturnType<typeof expiryPublicBoundary>[] = [];
  for (const time of [9, 10, 11]) {
    const run = makeExpiryRun([time, 20], 10, 20);
    reportNotice(run, 1, 101); reportNotice(run, 2, 202);
    expect(run.projection.global.bytes).toBe(256);
    run.advance({ untilTime: time, maxEvents: 100 });
    expect(collectNotice(run, 1)).toContainEqual({ kind: "noticeSelected", ids: time < 10 ? [101] : [] });
    expect(run.projection.notices.find(notice => notice.partition === 2)?.pending).toBeDefined();
    expect(run.projection.notices.find(notice => notice.partition === 1)?.pending !== undefined).toBe(time < 10);
    expect(run.projection.global.bytes).toBe(256);
    run.advance({ untilTime: 20, maxEvents: 100 }); collectNotice(run, 1);
    expect(run.projection.notices.map(notice => notice.partition)).toEqual([2]);
    expect(run.projection.global.bytes).toBe(128);
    results.push(boundary(run));
  }
  for (const time of [3, 4, 5]) {
    const run = makeExpiryRun([2, time], 100, 20);
    reportNotice(run, 1, 101); reportNotice(run, 2, 202);
    run.advance({ untilTime: 2, maxEvents: 100 });
    run.applyControl({ kind: "noticeLease", target: { partition: 1, group: 7, key: 101 } });
    run.advance({ untilTime: 2, maxEvents: 100 });
    run.applyControl({ kind: "expiryProfile", profile: { pendingMs: 1000, leaseMs: 20, cooldownMs: 1000 } });
    run.advance({ untilTime: time, maxEvents: 100 });
    expect(collectNotice(run, 1)).toContainEqual({ kind: "noticeSelected", ids: time < 4 ? [] : [101] });
    expect(run.projection.notices.find(notice => notice.partition === 1)?.pending?.leased).toBe(time < 4);
    expect(run.projection.notices.find(notice => notice.partition === 2)?.pending?.leased).toBe(false);
    expect(run.projection.global.bytes).toBe(256);
    results.push(boundary(run));
  }
  for (const seed of [3, 17, 41, 97]) {
    const deadline = 10 + seed % 7;
    const run = makeExpiryRun([deadline - 1, deadline, deadline + 1], deadline, 2);
    reportNotice(run, 1, 100 + seed);
    run.advance({ untilTime: deadline - 1, maxEvents: 100 });
    reportNotice(run, 1, 100 + seed);
    expect(collectNotice(run, 1)).toContainEqual({ kind: "noticeSelected", ids: [100 + seed] });
    run.applyControl({ kind: "expiryProfile", profile: { pendingMs: 1000, leaseMs: 20, cooldownMs: 1000 } });
    run.advance({ untilTime: deadline, maxEvents: 100 });
    expect(collectNotice(run, 1)).toContainEqual({ kind: "noticeSelected", ids: [] });
    expect(run.projection.notices[0]?.pending).toBeUndefined();
    expect(run.projection.global.bytes).toBe(128);
    run.advance({ untilTime: deadline + 1, maxEvents: 100 }); collectNotice(run, 1);
    expect(run.projection.notices).toEqual([]);
    expect(run.projection.global.bytes).toBe(0);
    results.push(boundary(run));
  }
  const duplicate = makeExpiryRun([2, 3, 4], 100, 20);
  reportNotice(duplicate, 1, 101);
  const lease = { kind: "noticeLease", target: { partition: 1, group: 7, key: 101 } } as const;
  duplicate.advance({ untilTime: 2, maxEvents: 100 });
  duplicate.applyControl(lease); duplicate.advance({ untilTime: 2, maxEvents: 100 });
  duplicate.applyControl({ kind: "expiryProfile", profile: { pendingMs: 1000, leaseMs: 20, cooldownMs: 1000 } });
  duplicate.advance({ untilTime: 3, maxEvents: 100 });
  duplicate.applyControl(lease); duplicate.advance({ untilTime: 3, maxEvents: 100 });
  expect(collectNotice(duplicate, 1)).toContainEqual({ kind: "noticeSelected", ids: [] });
  duplicate.advance({ untilTime: 4, maxEvents: 100 });
  expect(collectNotice(duplicate, 1)).toContainEqual({ kind: "noticeSelected", ids: [101] });
  expect(duplicate.projection.notices[0]?.pending?.leased).toBe(false);
  results.push(boundary(duplicate));
  const released = capturedRun({ sessions: [{ agent: "first" }, { agent: "second" }],
    expiryProfile: { pendingMs: 100, leaseMs: 2, cooldownMs: 20 }, inputs: [
      { at: 2, kind: "canonical", event: { kind: "collectionExpiryCheck", elapsed: 0, lifetime: 1 } },
      { at: 3, kind: "canonical", event: { kind: "noticeLease", key: 101, leased: false } },
      { at: 4, kind: "canonical", event: { kind: "collectionExpiryCheck", elapsed: 0, lifetime: 1 } },
      { at: 23, kind: "canonical", event: { kind: "collectionExpiryCheck", elapsed: 0, lifetime: 1 } },
    ] });
  released.applyControl({ kind: "suspendArrivals", suspended: true }); released.advance({ untilTime: 0, maxEvents: 100 });
  reportNotice(released, 1, 101);
  released.advance({ untilTime: 2, maxEvents: 100 }); released.applyControl(lease); released.advance({ untilTime: 2, maxEvents: 100 });
  released.advance({ untilTime: 3, maxEvents: 100 });
  expect(released.projection.notices[0]?.pending?.leased).toBe(false);
  released.applyControl({ kind: "expiryProfile", profile: { pendingMs: 100, leaseMs: 20, cooldownMs: 20 } });
  released.applyControl(lease); released.advance({ untilTime: 3, maxEvents: 100 });
  released.advance({ untilTime: 4, maxEvents: 100 });
  expect(collectNotice(released, 1)).toContainEqual({ kind: "noticeSelected", ids: [] });
  expect(released.projection.notices[0]?.pending?.leased).toBe(true);
  released.advance({ untilTime: 23, maxEvents: 100 });
  expect(collectNotice(released, 1)).toContainEqual({ kind: "noticeSelected", ids: [101] });
  expect(released.projection.notices[0]?.pending?.leased).toBe(false);
  results.push(boundary(released));
  return results;
}
const profile = (pending_duration: number, lease_duration: number, cooldown_duration: number) => ({
  $: "ExpiryScenario.Profile", pending_duration, lease_duration, cooldown_duration,
});
const original = (at: number, kind: string, fields: Record<string, unknown> = {}) => ({
  $: "expiry_observed_driver.Original", at, action: { $: `expiry_observed_driver.${kind}`, ...fields },
});
const failure = (partition: number, key: number, sequence: number) => ({ partition, group: 7, key, sequence, diagnostic: "backend" });
const selection = { partition: 1, group: 7, composed: false, authority_bound: false, allowed: { $: "Nil" } };
const list = (values: readonly unknown[]): unknown => values.reduceRight<unknown>((tail, head) => ({ $: "Con", head, tail }), { $: "Nil" });
function expectedOriginals() {
  return [
    ...[9, 10, 11].map(time => ({ profile: profile(10, 2, 20), original: list([
      original(0, "Failure", failure(1, 101, 1)), original(0, "Failure", failure(2, 202, 2)),
      original(time, "Tick"), original(time, "Collect", selection),
      original(20, "Tick"), original(20, "Collect", selection),
    ]) })),
    ...[3, 4, 5].map(time => ({ profile: profile(100, 2, 20), original: list([
      original(0, "Failure", failure(1, 101, 1)), original(0, "Failure", failure(2, 202, 2)),
      original(2, "Tick"), original(2, "Lease", { partition: 1, group: 7, key: 101 }),
      original(2, "Profile", { profile: profile(1000, 20, 1000) }), original(time, "Tick"), original(time, "Collect", selection),
    ]) })),
    ...[3, 17, 41, 97].map(seed => {
      const deadline = 10 + seed % 7;
      return { profile: profile(deadline, 2, 2), original: list([
        original(0, "Failure", failure(1, 100 + seed, 1)), original(deadline - 1, "Tick"),
        original(deadline - 1, "Failure", failure(1, 100 + seed, 2)), original(deadline - 1, "Collect", selection),
        original(deadline - 1, "Profile", { profile: profile(1000, 20, 1000) }),
        original(deadline, "Tick"), original(deadline, "Collect", selection),
        original(deadline + 1, "Tick"), original(deadline + 1, "Collect", selection),
      ]) };
    }),
    { profile: profile(100, 2, 20), original: list([
      original(0, "Failure", failure(1, 101, 1)), original(2, "Tick"),
      original(2, "Lease", { partition: 1, group: 7, key: 101 }),
      original(2, "Profile", { profile: profile(1000, 20, 1000) }), original(3, "Tick"),
      original(3, "Lease", { partition: 1, group: 7, key: 101 }), original(3, "Collect", selection),
      original(4, "Tick"), original(4, "Collect", selection),
    ]) },
    { profile: profile(100, 2, 20), original: list([
      original(0, "Failure", failure(1, 101, 1)), original(2, "Tick"),
      original(2, "Lease", { partition: 1, group: 7, key: 101 }), original(3, "Release", { key: 101 }),
      original(3, "Profile", { profile: profile(100, 20, 20) }),
      original(3, "Lease", { partition: 1, group: 7, key: 101 }), original(4, "Tick"), original(4, "Collect", selection),
      original(23, "Tick"), original(23, "Collect", selection),
    ]) },
  ];
}
function assertOriginals(words: unknown) {
  const envelopes = readBendList(decodeNativePrefix(words, "expiry_scenarios"), readRecord, 2048);
  expect(envelopes.map(envelope => ({ original: envelope.original, profile: envelope.profile }))).toEqual(expectedOriginals());
}
const fixture = new URL("../../monkey-business-bend/conformance/expiry-observed-native.bend", import.meta.url);

// Cheap public-owner mapping check before native qualification: JS15s + run5s,
// plus5s cleanup. It retains every original scenario and independent oracle.
it("compares all twelve expiry business histories with emitted JS, public API and replay", () => {
  const emitted = runWorkloadEmitted(fixture);
  assertOriginals(emitted);
  const expected = publicCases();
  expect(decodeExpiryNativeBoundary(emitted)).toEqual(expected);
  compareExpiryBusinessTrace(decodeNativePrefix(emitted,"expiry_scenarios"),completeCaptures);
}, 25000);

// Explicit qualification aggregate: C45s + clang90s + native5s + JS15s + run5s
// total160s, plus15s cleanup. Runtime and proof limits are unchanged.
it("compares all original expiry inputs and public owner facts across native Bend, emitted JS, public API and replay", () => {
  const native = runWorkloadNative(fixture, { emissionTimeoutMs: 45000, clangTimeoutMs: 90000 }), emitted = runWorkloadEmitted(fixture);
  expect(native).toEqual(emitted);
  expect(decodeNativePrefix(native, "expiry_scenarios")).toEqual(decodeNativePrefix(emitted, "expiry_scenarios"));
  assertOriginals(native); assertOriginals(emitted);
  const expected = publicCases();
  expect(decodeExpiryNativeBoundary(native)).toEqual(expected);
  expect(decodeExpiryNativeBoundary(emitted)).toEqual(expected);
  compareExpiryBusinessTrace(decodeNativePrefix(native,"expiry_scenarios"),completeCaptures);
  compareExpiryBusinessTrace(decodeNativePrefix(emitted,"expiry_scenarios"),completeCaptures);
}, 175000);
