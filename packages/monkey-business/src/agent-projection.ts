import type { CanonicalProjection } from "../../../src/canonical/adapter.ts";
import Shared from "../../monkey-business-bend/engine.mjs";

type Binding = { readonly owner: number; readonly id: number };
const selected = (bindings: readonly Binding[], partition: number): Set<number> => {
  if (!Number.isSafeInteger(partition) || partition < 1 || partition >= 2 ** 48) return new Set();
  const encoded = bindings.reduceRight<unknown>((tail, item) => ({ $: "Con",
    head: { $: "AdviceeScope.Binding", owner: BigInt(item.owner), id: BigInt(item.id) }, tail }), { $: "Nil" });
  const result = Shared.scope_select(encoded, BigInt(partition)) as
    { $: "Nil" } | { $: "Con"; head: bigint; tail: unknown };
  const ids = new Set<number>();
  let cursor = result;
  while (cursor.$ === "Con") {
    ids.add(Number(cursor.head));
    cursor = cursor.tail as typeof result;
  }
  return ids;
};
const scoped = <T>(records: readonly T[], partition: number, owner: (item: T) => number): T[] => {
  const indexes = selected(records.map((item, id) => ({ owner: owner(item), id })), partition);
  return records.filter((_item, index) => indexes.has(index));
};

/** A partition lens over a checked resident snapshot. Shared totals/limits stay shared.
 * Unknown ownership is omitted rather than attributed to every agent. No decisions
 * or transitions are calculated here; IDs are joined only through checked records.
 */
export const projectAgent = (state: CanonicalProjection, partition: number): CanonicalProjection => {
  const work = scoped(state.work, partition, item => item.partition);
  const batches = scoped(state.delivery.submissions.batches, partition, item => item.group);
  const operations = selected([...state.work.map(item => ({ owner: item.partition, id: item.operation })),
    ...state.delivery.submissions.batches.map(item => ({ owner: item.group, id: item.advice }))], partition);
  const claims = state.reuse.claims.filter(item => operations.has(item.id));
  return {
    ...state,
    partitions: scoped(state.partitions, partition, item => item.partition),
    charges: scoped(state.charges, partition, item => item.partition),
    rounds: scoped(state.rounds, partition, item => item.partition),
    admissions: scoped(state.admissions, partition, item => item.partition),
    completedEdits: [],
    work,
    pendingFindings: state.pendingFindings.filter(item => operations.has(item.operation)),
    dispatch: { ...state.dispatch,
      queued: scoped(state.dispatch.queued, partition, item => item.partition),
      running: scoped(state.dispatch.running, partition, item => item.partition),
      requests: scoped(state.dispatch.requests, partition, item => item.partition),
    },
    collection: {
      ready: state.collection.ready.filter(id => operations.has(id)),
      leases: state.collection.leases.filter(item => operations.has(item.advice)),
      claims: scoped(state.collection.claims, partition, item => item.group),
    },
    // Revision subjects carry no advicee ownership binding in this snapshot.
    revision: { ...state.revision, entries: [] },
    notices: scoped(state.notices, partition, item => item.partition),
    reuse: { claims, cache: scoped(state.reuse.cache, partition, item => item.partition) },
    delivery: {
      slots: scoped(state.delivery.slots, partition, item => item.group),
      counters: scoped(state.delivery.counters, partition, item => item.group),
      submissions: { batches, leases: state.delivery.submissions.leases.filter(item => operations.has(item.advice)) },
    },
  };
};
