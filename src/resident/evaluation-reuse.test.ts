import { describe, expect, it } from "vitest";
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
import { makeCapacityLedger } from "./capacity.ts";
import {
  EvaluationReuse,
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

  it("evicts successful LRU entries without disturbing pending joins", () => {
    const ledger = makeCapacityLedger();
    const reuse = new EvaluationReuse<never>({
      ledger,
      logicalBytes: (value) => Buffer.byteLength(JSON.stringify(value), "utf8"),
    });
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
    expect(reuse.snapshot()).toMatchObject({
      entries: SUCCESS_CACHE_ENTRY_LIMIT,
      pending: 1,
    });
    expect(reuse.snapshot().bytes).toBeLessThanOrEqual(SUCCESS_CACHE_BYTE_LIMIT);
    expect(reuse.get(keys[0] ?? "missing")).toBeUndefined();
    expect(reuse.hasPending(pending)).toBe(true);
    expect(ledger.snapshot().bytes).toBe(reuse.snapshot().bytes);
    reuse.clear();
    expect(ledger.snapshot()).toMatchObject({ items: 0, bytes: 0 });
  });

  it("evicts the oldest success for byte pressure and rejects an oversized success", () => {
    const ledger = makeCapacityLedger();
    let size = 70_000;
    const reuse = new EvaluationReuse<never>({
      ledger,
      logicalBytes: () => size,
    });
    const first = prepared(input({ path: "first.ts", rules: [] }));
    const second = prepared(input({ path: "second.ts", rules: [] }));
    const firstKey = reuse.key("partition", first);
    const secondKey = reuse.key("partition", second);
    expect(reuse.put("partition", firstKey, { prepared: first, findings: [] })).toBe(true);
    expect(reuse.put("partition", secondKey, { prepared: second, findings: [] })).toBe(true);
    expect(reuse.get(firstKey)).toBeUndefined();
    expect(reuse.snapshot()).toMatchObject({ entries: 1, bytes: 70_000 });
    size = SUCCESS_CACHE_BYTE_LIMIT + 1;
    expect(reuse.put("partition", firstKey, { prepared: first, findings: [] })).toBe(false);
    expect(reuse.snapshot()).toMatchObject({ entries: 1, bytes: 70_000 });
    expect(ledger.snapshot().bytes).toBe(70_000);
    reuse.clear();
  });

  it("keeps canonical claim and LRU order aligned with native handles through expiry", () => {
    const ledger = makeCapacityLedger();
    const reuse = new EvaluationReuse<string>({ ledger, logicalBytes: () => 10 });
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
    expect(reuse.snapshot()).toMatchObject({ entries: 1, bytes: 10, pending: 0 });
    reuse.clear();
    expect(ledger.canonicalProjection().reuse).toEqual({ claims: [], cache: [] });
    expect(ledger.snapshot()).toMatchObject({ items: 0, bytes: 0 });
  });
});
