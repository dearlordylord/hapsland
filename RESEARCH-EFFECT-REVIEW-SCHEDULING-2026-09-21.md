# Effect primitives for review scheduling and retained advice

**Status:** advisory research for the scheduling decision; not a product specification.
**Source class:** first-party package source, installed locally at the repository-pinned `effect` `4.0.0-rc.116`; links use that exact published package. **Verification state:** source-inspected, not runtime-tested in this investigation. No paid Jev calls were made. Effect is a `DEPEND ON` candidate already fixed by the project baseline; the uses below remain choices for the later design and prototype.

## Finding

Effect supplies the concurrency, lifecycle, timeout, queue, cache, and atomic-state primitives needed for the accepted behavior. It does **not** supply one scheduler that automatically enforces finite dispatch cycles, count and byte admission limits, result reservations, stale-advice retirement, and delivery policy. Those are product state transitions assembled from the primitives.

`Schedule` should express time policy only (for example recurring housekeeping or retry pacing). It does not set queue capacity or Jev-call concurrency. `Effect.forEach(cycle, review, { concurrency })` or `Stream.mapEffect(review, { concurrency, unordered: true })` bounds independent per-item calls; this is the appropriate shape because Jev is being called once per semantic unit, not through a batch endpoint ([Effect `forEach`](https://unpkg.com/effect@4.0.0-rc.116/src/Effect.ts), [Stream `mapEffect`](https://unpkg.com/effect@4.0.0-rc.116/src/Stream.ts)). The parallelism number and topology remain deliberately unresolved.

## Recommended building blocks

### Finite, immediate-first dispatch cycles

Keep a private work queue owned by the reviewer. When idle, block on `Queue.take`; that first item starts immediately. Then use the non-waiting `Queue.takeAll` to capture other items available when the drain runs. That array is one finite cycle, and later offers remain for the next cycle. This is a practical bounded snapshot, but `take` followed by `takeAll` does not define an atomic cutoff against concurrent producers: arrivals between those operations may join. If the product requires a precise cutoff, one owner fiber must serialize admission and cycle selection, or both transitions must live in one atomic reviewer-state operation. Run the captured array with bounded `Effect.forEach` concurrency. Either form prevents a continuous edit stream from extending a cycle forever.

The result gate should open when either all calls in the cycle finish or the configured maximum advice age is reached. A cycle-local `Ref` can retain completed results, while `Deferred`/fiber completion plus `Effect.raceFirst` or `Effect.timeout` implements the completion-or-age race. On the age branch, publish results already complete; later results from the same finite cycle can be published as they complete without resetting the original age. `Stream.groupedWithin` is not the cycle primitive: it groups by size or elapsed time and therefore changes the accepted immediate-first/captured-ready semantics ([`groupedWithin`](https://unpkg.com/effect@4.0.0-rc.116/src/Stream.ts)).

### Two owned queues and explicit admission

Use separate logical stores:

1. a work queue for accepted evaluations; and
2. a retained advice queue for completed, currently relevant advice awaiting a host response.

`Queue.dropping(count)` is useful at the hook boundary because a full offer returns `false` immediately and preserves already accepted entries. In contrast, `Queue.bounded(count)` suspends the producer, and `Queue.sliding(count)` silently evicts older entries; neither matches explicit incomplete admission ([queue strategies](https://unpkg.com/effect@4.0.0-rc.116/src/Queue.ts), [`Queue.offer`](https://unpkg.com/effect@4.0.0-rc.116/src/Queue.ts)). `Queue.takeBetween` can bound each response drain by item count ([`takeBetween`](https://unpkg.com/effect@4.0.0-rc.116/src/Queue.ts)). Stop can apply `Effect.timeout` to its collection effect and return the eligible subset plus explicit unfinished status ([timeouts](https://unpkg.com/effect@4.0.0-rc.116/src/Effect.ts)). Advice that does not fit a response remains in the second queue.

Queue capacity counts elements, not bytes. Stream buffer capacity has the same limitation ([`Stream.buffer`](https://unpkg.com/effect@4.0.0-rc.116/src/Stream.ts)). Therefore count and byte limits need an admission ledger. A `SynchronizedRef` holding all counters can atomically test and reserve work slots, work bytes, future advice slots, and future advice bytes in one `modify`; its modification is serialized by an internal semaphore ([`SynchronizedRef.modify`](https://unpkg.com/effect@4.0.0-rc.116/src/SynchronizedRef.ts)). A `Semaphore` with `takeIfAvailable(bytes)` is suitable for one weighted byte budget, but separate semaphores cannot make a multidimensional reservation atomic without a rollback protocol ([`takeIfAvailable`](https://unpkg.com/effect@4.0.0-rc.116/src/Semaphore.ts)).

Reserve a configured upper bound for every retained outcome before accepting work, including success advice and any failure/status record the product promises to retain. Then offer to the dropping work queue; if that offer unexpectedly fails, release the reservation. Hold the reservation through queued, running, completed, and pending-advice states, adjusting it to actual retained size when known, and release it only on delivery, stale retirement, or terminal failure after its promised status is accounted for. This prevents accepted work from later losing its result merely because the result queue filled. Exact byte accounting, upper bounds, and capacities require prototype measurement and the supported-envelope decision.

### Reviewer lifetime and bounded collection

Build the queues, ledger, cache, and worker fibers once in the reviewer service/layer scope. Fork the dispatcher with `Effect.forkScoped` or into a captured reviewer scope with `Effect.forkIn(scope)`. A hook/IPC request may time out while waiting for a response, but accepted work then remains owned by the longer reviewer scope. `forkScoped` interrupts a fiber when its owning scope closes, so using the per-request scope would incorrectly cancel accepted work ([`forkScoped`](https://unpkg.com/effect@4.0.0-rc.116/src/Effect.ts)). Turn-end collection returns whatever feedback is ready within the response budget, even if other reviews remain pending; it must not deny turn completion just to drain reviews. During a live session, accepted work and pending advice survive ordinary pauses and client timeouts. Once the agent application closes, the user accepts losing all remaining work and advice; no explicit collection command or post-exit drain is required. Closing the reviewer scope may then interrupt its remaining fibers.

### Successful evaluation cache, in-flight joining, and stale advice

`Cache.makeWith` requires a count capacity and accepts `timeToLive(exit, key)`, so a positive TTL for success and zero TTL for failure gives a bounded success-only evaluation cache ([constructor](https://unpkg.com/effect@4.0.0-rc.116/src/Cache.ts), [completion TTL handling](https://unpkg.com/effect@4.0.0-rc.116/src/Cache.ts)). Pending advice must remain separate from this cache: cache eviction is a compute-reuse decision, while advice retention is a delivery obligation.

Do not use this cache as the sole strict in-flight join registry. Although concurrent gets normally share a pending lookup, RC.116 enforces capacity by removing the oldest map entries without excluding pending entries; a later same-key request could therefore start a second lookup after eviction ([shared pending lookup](https://unpkg.com/effect@4.0.0-rc.116/src/Cache.ts), [capacity eviction](https://unpkg.com/effect@4.0.0-rc.116/src/Cache.ts)). Keep accepted in-flight evaluations in a reviewer-owned keyed registry until completion, then put only successful completed evaluations in `Cache`.

Advice relevance follows current review-input applicability, not cache membership. The A/B example concerns a changed review input; a change to an unrelated artifact in the same file must not automatically retire still-applicable advice. Precise stable-capture, publication, and stale-generation checks belong to the concurrency decision. For the accepted A → B → A behavior:

- observing B atomically retires undelivered advice derived from A;
- the bounded successful evaluation of A may remain cached;
- restoring A may reuse that evaluation and materialize fresh, currently relevant advice, even if A's earlier advice was delivered; and
- completion of an older A evaluation after B was observed must not enqueue A advice unless A is again the current fingerprint at publication time.

This requires a publication-time applicability check and stale removal from the advice queue (or a keyed retained-advice structure that supports deletion). `Queue` has no predicate-delete operation, so a plain FIFO queue alone is insufficient for efficient stale retirement. A bounded keyed structure guarded by the same serialized reviewer state, with an ordering index for response selection, is the clearer fit.

## Unresolved product choices

The Effect APIs do not decide the Jev-call concurrency value or whether concurrency is global, per reviewer, or additionally per file; maximum cycle advice age; Stop deadline; response item/byte limits; admission count/byte limits; the conservative result reservation size; cache TTL/capacity; response ordering; or the exact host signal proving that the session has ended. Session-end loss is accepted; an ordinary pause or turn end is not session termination. Those values should come from measurement and the supported-envelope decision rather than from library defaults.

## Primary sources

- Repository pin: [`package.json`](./package.json#L27)
- Effect RC.116: [`Queue.ts`](https://unpkg.com/effect@4.0.0-rc.116/src/Queue.ts), [`Effect.ts`](https://unpkg.com/effect@4.0.0-rc.116/src/Effect.ts), [`Stream.ts`](https://unpkg.com/effect@4.0.0-rc.116/src/Stream.ts), [`Semaphore.ts`](https://unpkg.com/effect@4.0.0-rc.116/src/Semaphore.ts), [`SynchronizedRef.ts`](https://unpkg.com/effect@4.0.0-rc.116/src/SynchronizedRef.ts), and [`Cache.ts`](https://unpkg.com/effect@4.0.0-rc.116/src/Cache.ts)
