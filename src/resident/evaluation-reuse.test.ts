import { describe, expect, it } from "vitest";
import { Effect } from "effect";
import {
  freezeInput,
  freezeRules,
  semanticIdentity,
  type PreparedUnit,
  type ReviewInput,
  type TypeDeclaration,
} from "../direct-event/model.ts";
import { advicee } from "../direct-event/test-fixtures.ts";
import { configuredRules } from "../policy/rules.ts";
import { TYPE_INPUT_CONTRACT } from "../rules/targets.ts";
import { makeCapacityLedger, MAX_PARTITION_KEY_BYTES } from "./capacity.ts";
import {
  SUCCESS_CACHE_BYTE_LIMIT,
  SUCCESS_CACHE_ENTRY_LIMIT,
  residentEvaluationIdentity,
} from "./evaluation-reuse.ts";

const artifact = (source: string): TypeDeclaration => ({
  id: "type.ts::OrderCount",
  kind: "type-alias",
  name: "OrderCount",
  source,
  sourceHash: `hash:${source}`,
});

const input = (overrides: Partial<ReviewInput> = {}): ReviewInput => {
  const declaration = artifact("type OrderCount = number");
  return freezeInput({
    contract: TYPE_INPUT_CONTRACT,
    completeness: "complete",
    path: "type.ts",
    declaration,
    unit: { root: { artifact: declaration, references: [] } },
    rules: freezeRules(configuredRules),
    interpretation: "probability-strictly-greater-than-threshold",
    ...overrides,
  });
};

const prepared = (value: ReviewInput, toolUseId = "event-a"): PreparedUnit => ({
  root: "/canonical/root",
  advicee: advicee({ toolUseId }),
  input: value,
  identity: semanticIdentity(value),
});

describe("resident evaluation identity", () => {
  it("excludes event ids while including partition, path, evidence, contract, and immutable rules", () => {
    const base = input();
    const partition = "advicee-and-canonical-root";
    expect(residentEvaluationIdentity(partition, prepared(base, "event-a"))).toBe(
      residentEvaluationIdentity(partition, prepared(base, "event-b")),
    );
    expect(residentEvaluationIdentity("another-root", prepared(base))).not.toBe(
      residentEvaluationIdentity(partition, prepared(base)),
    );
    expect(residentEvaluationIdentity(partition, prepared(input({ path: "other.ts" })))).not.toBe(
      residentEvaluationIdentity(partition, prepared(base)),
    );
    const evidence = artifact("type Currency = string");
    expect(residentEvaluationIdentity(partition, prepared(input({
      unit: {
        root: {
          artifact: base.declaration,
          references: [{ kind: "expanded", site: { symbol: "Currency" }, node: { artifact: evidence, references: [] } }],
        },
      },
    })))).not.toBe(residentEvaluationIdentity(partition, prepared(base)));
    expect(residentEvaluationIdentity(partition, prepared(input({ contract: "other-contract" })))).not.toBe(
      residentEvaluationIdentity(partition, prepared(base)),
    );
    expect(residentEvaluationIdentity(partition, prepared(input({
      rules: base.rules.map((rule, index) => index === 0 ? { ...rule, message: `${rule.message} changed` } : rule),
    })))).not.toBe(residentEvaluationIdentity(partition, prepared(base)));
  });

  it("reuses unchanged semantic evidence after location and source capture move", () => {
    const base = input({
      rootLocation: { start: { line: 1, column: 1 }, end: { line: 1, column: 25 } },
      sourceFingerprints: [{ path: "type.ts", contentHash: "first", byteLength: 25 }],
    });
    const moved = input({
      rootLocation: { start: { line: 2, column: 1 }, end: { line: 2, column: 25 } },
      sourceFingerprints: [{ path: "type.ts", contentHash: "second", byteLength: 36 }],
    });
    expect(semanticIdentity(moved)).toBe(semanticIdentity(base));
    expect(residentEvaluationIdentity("same-partition", prepared(moved))).toBe(
      residentEvaluationIdentity("same-partition", prepared(base)),
    );
    const changed = input({ declaration: artifact("type OrderCount = string") });
    expect(semanticIdentity(changed)).not.toBe(semanticIdentity(base));
  });

  it("rolls back cache eviction, reservation release and identity allocation together", () => {
    const ledger = makeCapacityLedger();
    const reuse = ledger.reuse(() => 10);
    const successes = Array.from({ length: SUCCESS_CACHE_ENTRY_LIMIT }, (_, index) => {
      const item = prepared(input({ path: `retained-${index}.ts`, rules: [] }));
      const key = reuse.key("partition", item);
      const evaluation = { prepared: item, findings: [] };
      expect(reuse.put("partition", key, evaluation)).toBe(true);
      return { key, evaluation };
    });
    const before = ledger.canonicalProjection();
    const beforeCapacity = ledger.snapshot();
    const beforeReuse = Effect.runSync(reuse.snapshot());
    const replacement = prepared(input({ path: "replacement.ts", rules: [] }));
    const replacementKey = reuse.key("partition", replacement);

    // cachePrepare first evicts the oldest success. The later capacity identity
    // failure must roll back that eviction and its reservation release as well.
    expect(() => reuse.put("p".repeat(MAX_PARTITION_KEY_BYTES + 1), replacementKey,
      { prepared: replacement, findings: [] })).toThrow("advicee identity exceeds resident metadata bound");
    expect(ledger.canonicalProjection()).toEqual(before);
    expect(ledger.snapshot()).toEqual(beforeCapacity);
    expect(Effect.runSync(reuse.snapshot())).toEqual(beforeReuse);
    for (const success of successes) expect(Effect.runSync(reuse.cached(success.key)).evaluation).toBe(success.evaluation);

    expect(reuse.put("partition", replacementKey, { prepared: replacement, findings: [] })).toBe(true);
    expect(ledger.canonicalProjection().reuse.cache.at(-1)?.id).toBe(SUCCESS_CACHE_ENTRY_LIMIT + 1);
    expect(reuse.get(successes[0]?.key ?? "missing")).toBeUndefined();
    expect(Effect.runSync(reuse.snapshot())).toEqual({ entries: SUCCESS_CACHE_ENTRY_LIMIT, bytes: 80, pending: 0 });
  });

  it("shares native claims across views and clears them with the canonical owner", () => {
    const ledger = makeCapacityLedger<string>();
    const first = ledger.reuse(() => 10);
    const second = ledger.reuse(() => 10);
    const item = prepared(input({ rules: [] }));
    const key = first.key("partition", item);
    const pendingRead = first.pending(key);
    const snapshotRead = first.snapshot();
    expect(Effect.runSync(pendingRead)).toBeUndefined();
    expect(Effect.runSync(snapshotRead)).toEqual({ entries: 0, bytes: 0, pending: 0 });
    expect(first.route(key, false)).toBe("owner");
    expect(second.route(key, false)).toBe("joinedClaimed");
    expect(second.attachPending(key, "shared request")).toBe(true);
    expect(Effect.runSync(pendingRead)).toBe("shared request");
    const retainedSnapshot = Effect.runSync(snapshotRead);
    expect(retainedSnapshot.pending).toBe(1);
    expect(Effect.runSync(first.snapshot())).toEqual(Effect.runSync(second.snapshot()));
    ledger.clear();
    expect(Effect.runSync(first.hasPending(key))).toBe(false);
    expect(Effect.runSync(second.pending(key))).toBeUndefined();
    expect(Effect.runSync(pendingRead)).toBeUndefined();
    expect(Effect.runSync(snapshotRead)).toEqual({ entries: 0, bytes: 0, pending: 0 });
    expect(retainedSnapshot.pending).toBe(1);
    expect(Effect.runSync(second.snapshot())).toEqual({ entries: 0, bytes: 0, pending: 0 });
    expect(first.route(key, false)).toBe("owner");
    expect(ledger.canonicalProjection().reuse.claims).toEqual([{ id: 1, attached: false }]);
  });

  it("evicts successful LRU entries without disturbing pending joins", () => {
    const ledger = makeCapacityLedger();
    const reuse = ledger.reuse((value) => Buffer.byteLength(JSON.stringify(value), "utf8"));
    const partition = "partition";
    const pending = reuse.key(partition, prepared(input({ rules: [] })));
    expect(reuse.claim(pending)).toBe(true);
    expect(reuse.claim(pending)).toBe(false);
    const keys: Array<string> = [];
    for (let index = 0; index < SUCCESS_CACHE_ENTRY_LIMIT + 1; index += 1) {
      const value = input({ path: `type-${index}.ts`, rules: [] });
      const item = prepared(value);
      const key = reuse.key(partition, item);
      keys.push(key);
      expect(reuse.put(partition, key, { prepared: item, findings: [] })).toBe(true);
    }
    expect(Effect.runSync(reuse.snapshot())).toMatchObject({
      entries: SUCCESS_CACHE_ENTRY_LIMIT,
      pending: 1,
    });
    expect(Effect.runSync(reuse.snapshot()).bytes).toBeLessThanOrEqual(SUCCESS_CACHE_BYTE_LIMIT);
    expect(reuse.get(keys[0] ?? "missing")).toBeUndefined();
    expect(Effect.runSync(reuse.hasPending(pending))).toBe(true);
    expect(ledger.snapshot().bytes).toBe(Effect.runSync(reuse.snapshot()).bytes);
    reuse.clear();
    expect(ledger.snapshot()).toMatchObject({ items: 0, bytes: 0 });
  });

  it("evicts the oldest success for byte pressure and rejects an oversized success", () => {
    const ledger = makeCapacityLedger();
    let size = 70_000;
    const reuse = ledger.reuse(() => size);
    const first = prepared(input({ path: "first.ts", rules: [] }));
    const second = prepared(input({ path: "second.ts", rules: [] }));
    const firstKey = reuse.key("partition", first);
    const secondKey = reuse.key("partition", second);
    expect(reuse.put("partition", firstKey, { prepared: first, findings: [] })).toBe(true);
    expect(reuse.put("partition", secondKey, { prepared: second, findings: [] })).toBe(true);
    expect(reuse.get(firstKey)).toBeUndefined();
    expect(Effect.runSync(reuse.snapshot())).toMatchObject({ entries: 1, bytes: 70_000 });
    size = SUCCESS_CACHE_BYTE_LIMIT + 1;
    expect(reuse.put("partition", firstKey, { prepared: first, findings: [] })).toBe(false);
    expect(Effect.runSync(reuse.snapshot())).toMatchObject({ entries: 1, bytes: 70_000 });
    expect(ledger.snapshot().bytes).toBe(70_000);
    reuse.clear();
  });

  it("keeps canonical claim and LRU order aligned with native handles through expiry", () => {
    const ledger = makeCapacityLedger<string>();
    const reuse = ledger.reuse(() => 10);
    const first = prepared(input({ path: "first.ts", rules: [] }));
    const second = prepared(input({ path: "second.ts", rules: [] }));
    const firstKey = reuse.key("partition-a", first);
    const secondKey = reuse.key("partition-b", second);
    expect(reuse.route(firstKey, false)).toBe("owner");
    expect(reuse.route(firstKey, false)).toBe("joinedClaimed");
    expect(reuse.attachPending(firstKey, "active request")).toBe(true);
    expect(reuse.route(firstKey, false)).toBe("joinedPending");
    expect(reuse.route(firstKey, true)).toBe("joinedAdvice");
    expect(ledger.canonicalProjection().reuse.claims).toMatchObject([{ attached: true }]);
    reuse.releaseClaim(firstKey);
    expect(reuse.put("partition-a", firstKey, { prepared: first, findings: [] })).toBe(true);
    expect(reuse.put("partition-b", secondKey, { prepared: second, findings: [] })).toBe(true);
    expect(reuse.route(firstKey, false)).toBe("cached");
    const beforeExpiry = ledger.canonicalProjection().reuse.cache;
    expect(beforeExpiry.map(({ partition }) => partition)).toEqual([
      ledger.partitionId("partition-b"), ledger.partitionId("partition-a"),
    ]);
    reuse.discardPartition("partition-b");
    expect(ledger.canonicalProjection().reuse.cache).toMatchObject([{ partition: ledger.partitionId("partition-a") }]);
    expect(Effect.runSync(reuse.snapshot())).toMatchObject({ entries: 1, bytes: 10, pending: 0 });
    reuse.clear();
    expect(ledger.canonicalProjection().reuse).toEqual({ claims: [], cache: [] });
    expect(ledger.snapshot()).toMatchObject({ items: 0, bytes: 0 });
  });
});
