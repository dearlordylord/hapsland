# Effect primitives for bounded operational-notice cooldowns

**Status:** advisory research for the supported-envelope decision; not a product
specification.
**Date:** 2026-09-21
**Scope:** the repository-pinned `effect` `4.0.0-rc.116`; no paid Jev calls and no
external runtime dependencies.
**Question:** can Effect implement this policy: for each advice recipient, canonical
root, and failure kind, emit the first operational notice, suppress repeats for 60
seconds, and let the first later failure emit again, without a periodic timer?

## Finding

Yes. The policy is viable with stable Effect modules. The smallest exact fit is an
in-memory `Ref<HashMap<NoticeKey, CooldownState>>` owned by the resident reviewer,
combined with `Clock.currentTimeMillis` and one atomic `Ref.modify` per failure.
The state transition can return either `emit` or `suppress`, reset the 60-second
deadline on an emitted notice, and carry a suppressed count into the next emitted
notice. No sleeper, polling fiber, or `Schedule` is needed.

Effect also supplies count-bounded queues and caches. Those capacities solve different
problems:

- `Queue.dropping(capacity)` gives immediate count-based work admission; a full
  `Queue.offer` returns `false` and preserves accepted work.
- `Cache.make` / `Cache.makeWith` require an entry-count capacity and support TTL, but
  cache eviction is not an exact notification-suppression policy.
- queue and cache capacities count entries, not bytes. The accepted count-and-byte
  work/advice limits still need the existing atomic admission ledger.

This supports the proposed Q3 behavior. One design condition remains: the cooldown
table and the operational-notice retention budget must themselves be bounded. The
product should bind entries to admitted recipient/root partitions, remove them when
those partitions retire, prune expired entries opportunistically, and define a hard
maximum or overflow policy. Evicting a live cooldown entry would permit an extra notice
inside 60 seconds, so ordinary LRU eviction is not equivalent to the stated policy.

## Recommended transition

Use one hashed or otherwise source-free key for:

```text
(advice recipient, canonical root, failure kind)
```

Store:

```text
{ nextAllowedAtMillis, suppressedCount }
```

For each capacity rejection or Jev-unavailable event:

1. Read `now` from the Effect `Clock`.
2. In one `Ref.modify`, remove expired unrelated entries if necessary, then inspect
   the key.
3. If the key is absent or `now >= nextAllowedAtMillis`, return `emit` with the old
   suppressed count and store `{ now + 60_000, 0 }`.
4. Otherwise return `suppress` and increment `suppressedCount`.
5. Only an `emit` decision creates a bounded operational notice. A failure to retain
   that notice must not recursively create another capacity notice.

`Ref.modify` is the correct concurrency boundary because RC.116 defines it as an
atomic pure state update returning `[result, newValue]` ([Effect `Ref.modify` source](https://unpkg.com/effect@4.0.0-rc.116/src/Ref.ts)).
`Clock.currentTimeMillis` reads through Effect's clock service, so `TestClock` can test
the exact 59,999 ms / 60,000 ms boundary without real sleeps ([Effect `Clock` source](https://unpkg.com/effect@4.0.0-rc.116/src/Clock.ts)).
`HashMap.empty`, `get`, `set`, `remove`, `filter`, and `size` are present in the pinned
stable module and return immutable maps ([Effect `HashMap` source](https://unpkg.com/effect@4.0.0-rc.116/src/HashMap.ts)).

A `SynchronizedRef` is not necessary for this pure cooldown update. It remains the
better fit for the multidimensional work/advice admission ledger if that transition
must run effects while serialized: RC.116's `SynchronizedRef.modifyEffect` holds its
semaphore across the effectful modification ([Effect `SynchronizedRef` source](https://unpkg.com/effect@4.0.0-rc.116/src/SynchronizedRef.ts)).

## Capacity and queue semantics

### Work admission

Use `Queue.dropping<ReviewWorkItem>(capacity)` when a hook request must not wait for
space. In RC.116, `Queue.offer` returns `false` when a dropping queue is full. In
contrast, `Queue.bounded` uses the suspend strategy, and `Queue.sliding` accepts the new
item while removing the oldest one ([Effect `Queue` constructors and `offer`](https://unpkg.com/effect@4.0.0-rc.116/src/Queue.ts)).

Classification for this use: **DEPEND ON**. Effect is already an exact, cohort-pinned
production dependency in [`package.json`](./package.json#L27-L28).

The queue capacity alone is not the full product capacity. It does not include running
work, reserved result space, per-recipient/root limits, or bytes. Keep one atomic
admission ledger for the global `64 items / 8 MiB` and partition `16 items / 2 MiB`
limits. Reserve bounded result/advice space before accepting work; release it only at a
defined terminal transition. A full work queue then produces an explicit capacity
rejection rather than blocking or silently replacing accepted work.

### Pending advice and operational notices

Pending advice needs count and byte limits plus stale/expiry removal. A plain FIFO
`Queue` has no predicate-delete operation, so it is not sufficient as the only pending
advice index. Retain the accepted design's bounded keyed state plus ordering metadata.

Capacity notices create a special recursion risk: if the notice uses the last space in
the same queue whose fullness it reports, later rejection reporting can disappear or
recurse. Pre-reserve a small operational-notice budget, coalesce one pending notice per
cooldown key, or define a separate bounded notice store that the normal advice batch
drains. This is product policy assembled from Effect primitives, not a library default.

Classification: **DEPEND ON** `Ref`/`SynchronizedRef` and immutable `HashMap` as
building blocks. **BORROW** the explicit reservation pattern; Effect does not provide a
single product-specific count-and-byte admission object.

## Alternatives considered

| Candidate | Exact RC.116 behavior | Classification for Q3 | Decision |
|---|---|---|---|
| `Ref<HashMap<...>>` + `Clock` | Atomic event-time transition; retains suppressed count; no timer | **DEPEND ON** | Simplest correct fit in the resident reviewer. |
| `Cache.make` / `Cache.makeWith` | Required entry capacity; optional fixed/per-exit TTL; lookup on miss/expiry | **REJECT** | A side-effecting cache lookup could approximate “once per TTL,” but capacity eviction can reopen a live key early, and the cache does not naturally retain the suppressed count. Cache eviction is a reuse policy, not notification authority. ([Effect `Cache` source](https://unpkg.com/effect@4.0.0-rc.116/src/Cache.ts)) |
| `effect/unstable/persistence/RateLimiter` | Keyed fixed-window or token-bucket `consume`; exceed can fail or return delay; memory and Redis stores | **REJECT** | It is an unstable persistence API designed to consume tokens, protect APIs, and delay/fail work. It adds a service/store/error boundary, does not retain the suppressed count, and its process-memory store has no configured key capacity. It is disproportionate for resident local notice state. ([RC.116 `RateLimiter` source](https://unpkg.com/effect@4.0.0-rc.116/src/unstable/persistence/RateLimiter.ts)) |
| `Schedule.fixed` / `Schedule.spaced` | Drives repetition or retry cadence | **REJECT** | The policy has no periodic action. The next failure, not a scheduled tick, reopens notice emission. ([Effect `Schedule` source](https://unpkg.com/effect@4.0.0-rc.116/src/Schedule.ts)) |
| `Stream.throttle(..., strategy: "enforce")` | Token-bucket enforcement drops over-budget stream chunks; `shape` delays them | **REJECT** | It shapes one stream, does not provide the keyed state/reporting contract, and loses the suppressed-count requirement. ([Effect `Stream.throttle` source](https://unpkg.com/effect@4.0.0-rc.116/src/Stream.ts)) |
| `Semaphore` | Permit-based concurrency; `takeIfAvailable` is non-waiting | **OPTIONAL INTEGRATION** | Useful for one weighted resource or backend-call concurrency, but separate semaphores cannot atomically enforce the product's several count/byte dimensions. ([Effect `Semaphore` source](https://unpkg.com/effect@4.0.0-rc.116/src/Semaphore.ts)) |

## Evidence ledger

| Claim | Proposition | Evidence | State | Limits |
|---|---|---|---|---|
| EN01 | The repository pins `effect` and companion Effect packages to `4.0.0-rc.116`. | [`package.json`](./package.json#L27-L31) | SRC / SOURCE-INSPECTED | Manifest evidence, not runtime behavior. |
| EN02 | `Ref.modify` atomically returns a result and installs new state; `Clock.currentTimeMillis` is service-based. | [`Ref.ts`](https://unpkg.com/effect@4.0.0-rc.116/src/Ref.ts), [`Clock.ts`](https://unpkg.com/effect@4.0.0-rc.116/src/Clock.ts) | SRC / SOURCE-INSPECTED | The proposed product transition was not implemented in this pass. |
| EN03 | `Queue.dropping` rejects a full offer with `false`; bounded suspends; sliding removes the oldest entry. | [`Queue.ts`](https://unpkg.com/effect@4.0.0-rc.116/src/Queue.ts) | SRC / SOURCE-INSPECTED | Capacity is item count only. |
| EN04 | `Cache.make` requires count capacity and supports TTL; cache capacity eviction is separate from notification policy. | [`Cache.ts`](https://unpkg.com/effect@4.0.0-rc.116/src/Cache.ts) | SRC / SOURCE-INSPECTED; conclusion INFERRED | The mismatch follows if exact at-most-once-per-window semantics are required. |
| EN05 | RC.116's keyed `RateLimiter` is under `effect/unstable/persistence`; it offers fixed-window/token-bucket consume with fail/delay and memory/Redis stores. | [`RateLimiter.ts`](https://unpkg.com/effect@4.0.0-rc.116/src/unstable/persistence/RateLimiter.ts) | SRC / SOURCE-INSPECTED | No live Redis or memory-store run was needed. |
| EN06 | Existing product research already selected dropping queues plus an atomic count/byte ledger for explicit admission. | [`RESEARCH-EFFECT-REVIEW-SCHEDULING-2026-09-21.md`](./RESEARCH-EFFECT-REVIEW-SCHEDULING-2026-09-21.md) | SRC / DOCUMENTED | Advisory precedent, not a normative specification. |
| EN07 | Current draft text says once per session/problem plus recovery, which differs from recurring once-per-minute notices while errors persist. | [`PRODUCT-CONFIGURATION-SPEC-DRAFT.md`](./PRODUCT-CONFIGURATION-SPEC-DRAFT.md#L150-L160) | SRC / DOCUMENTED | The supported-envelope decision must explicitly supersede or reconcile this text. |

## Acceptance checks for later implementation

Use `@effect/vitest` and `TestClock` to verify:

1. first failure emits immediately;
2. concurrent same-key failures produce exactly one emit decision;
3. repeats at 1 ms and 59,999 ms are suppressed;
4. a failure at 60,000 ms emits and reports the accumulated suppressed count;
5. silence after the first notice causes no later emission;
6. capacity and Jev-unavailable use independent keys;
7. different advice-recipient/root scopes do not suppress one another;
8. expired entries are pruned without a background timer;
9. the cooldown table cannot exceed its declared bound under high identity churn;
10. notice-store exhaustion does not recurse and does not turn unavailable work into a
    clean review.

## Advisory handoff

| Implication | Support | Proposed disposition |
|---|---|---|
| Adopt failure-triggered, 60-second per-scope cooldown state in the resident reviewer. | EN02, EN05; RateLimiter rejected as disproportionate | Take to specification; prototype with `TestClock`. |
| Keep immediate queue rejection and multidimensional reservation separate from notice cooldown. | EN03, EN06 | Take to specification and implementation plan. |
| Bound cooldown identities and reserve/coalesce operational-notice capacity. | EN03-EN06 | Take to prototype; exact bound and overflow behavior remain a specification choice. |
| Reconcile the older once-per-session notification rule with the newly accepted repeated reminder. | EN07 | Take to specification before claiming the route is settled. |

## Limitations and stopping condition

This was a focused API-fit pass, not ecosystem discovery. It inspected the installed
RC.116 source, the exact package pin, existing repository scheduling research, and the
current operational-notification draft. All materially different in-cohort primitive
classes requested in the brief were checked: queue strategies, cache TTL/capacity,
stable atomic state, schedule/stream throttling, semaphore capacity, and the unstable
persistent rate limiter. No candidate supplies a closer exact stable abstraction than
the recommended atomic state transition, so the bounded stopping condition was met.
