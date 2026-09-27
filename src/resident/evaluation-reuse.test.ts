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
import { CapacityLedger } from "./capacity.ts";
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
    contract: "direct-event/same-file-named-types/v1",
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
    expect(residentEvaluationIdentity(partition, prepared(input({ contract: "contract/v2" })))).not.toBe(
      residentEvaluationIdentity(partition, prepared(base)),
    );
    expect(residentEvaluationIdentity(partition, prepared(input({
      rules: base.rules.map((rule, index) => index === 0 ? { ...rule, message: `${rule.message} changed` } : rule),
    })))).not.toBe(residentEvaluationIdentity(partition, prepared(base)));
  });

  it("evicts successful LRU entries without disturbing pending joins", () => {
    const ledger = new CapacityLedger();
    const reuse = new EvaluationReuse<never>({
      reserve: (partition, bytes) => ledger.reserve(partition, bytes),
      release: (reservation) => { ledger.release(reservation); },
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
    const ledger = new CapacityLedger();
    let size = 70_000;
    const reuse = new EvaluationReuse<never>({
      reserve: (partition, bytes) => ledger.reserve(partition, bytes),
      release: (reservation) => { ledger.release(reservation); },
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
});
