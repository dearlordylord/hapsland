import type { CanonicalProjection } from "../../../src/canonical/adapter.ts"

/** A partition lens over a checked resident snapshot. Shared totals/limits stay shared.
 * Unknown ownership is omitted rather than attributed to every agent. No decisions
 * or transitions are calculated here; IDs are joined only through checked records.
 */
export const projectAgent = (state: CanonicalProjection, partition: number): CanonicalProjection => {
  const work = state.work.filter((item) => item.partition === partition)
  const batches = state.delivery.submissions.batches.filter((item) => item.group === partition)
  const operations = new Set([...work.map((item) => item.operation), ...batches.map((item) => item.advice)])
  const claims = state.reuse.claims.filter((item) => operations.has(item.id))
  return {
    ...state,
    partitions: state.partitions.filter((item) => item.partition === partition),
    charges: state.charges.filter((item) => item.partition === partition),
    rounds: state.rounds.filter((item) => item.partition === partition),
    admissions: state.admissions.filter((item) => item.partition === partition),
    completedEdits: [],
    work,
    pendingFindings: state.pendingFindings.filter((item) => operations.has(item.operation)),
    dispatch: {
      ...state.dispatch,
      queued: state.dispatch.queued.filter((item) => item.partition === partition),
      running: state.dispatch.running.filter((item) => item.partition === partition),
      requests: state.dispatch.requests.filter((item) => item.partition === partition)
    },
    collection: {
      ready: state.collection.ready.filter((id) => operations.has(id)),
      leases: state.collection.leases.filter((item) => operations.has(item.advice)),
      claims: state.collection.claims.filter((item) => item.group === partition)
    },
    // Monkey Business does not issue native revision inputs. They
    // have no ownership binding in this projection and are not shown locally.
    revision: { ...state.revision, entries: [] },
    notices: state.notices.filter((item) => item.partition === partition),
    reuse: { claims, cache: state.reuse.cache.filter((item) => item.partition === partition) },
    delivery: {
      slots: state.delivery.slots.filter((item) => item.group === partition),
      counters: state.delivery.counters.filter((item) => item.group === partition),
      submissions: { batches, leases: state.delivery.submissions.leases.filter((item) => operations.has(item.advice)) }
    }
  }
}
