# #129 canonical evaluation reuse and successful cache evidence

`Canonical.step` now retains numeric evaluation claims, attachment state, and
successful cache entries in oldest-first order. One route event gives live
advice priority, then attached evaluation, bare claim, successful cache, and a
fresh owner. A cache hit moves its entry to the newest position. Cache
preparation handles already-retained results, oversize rejection, entry
pressure, and byte pressure. It returns exact evicted IDs so the native cache
can release their ledger reservations. A second transition commits only after
native capacity reservation succeeds; the canonical commit validates the
stored-result charge ID, purpose, partition, and byte count. The adapter also
checks each retained entry against its live charge. Partition expiry and resident cleanup
return exact IDs for release. Native TypeScript retains source-derived keys,
request handles, cached evaluated payloads, reservation handles, and the
credential and currentness facts used to form a key and determine eligibility.

The key includes partition, work cohort, credential generation, and the exact
prepared review input. The prepared input includes the review-input contract,
source evidence, rules, and interpretation. Resident current-work and
credential checks remain at their established effect barriers. Cached clear
and finding outcomes still settle through canonical work/review transitions;
failed or malformed Jev results do not enter the success cache. The direct
`bendReuseRoute`, `bendReuseCacheRoute`, `bendCacheAdmit`, and `bendCacheEvict`
calls were removed from the resident path, with
`scripts/check-reuse-boundary.mjs` guarding their return.

`conformance/canonical-reuse-v1.json` checks three independent source-free
traces: route priority across callback orders; byte-pressure eviction,
orphan commit rejection, oversize rejection, and partition expiry; and entry-pressure LRU movement
without disturbing a pending claim. The resident reuse fixture checks native
handles against canonical claims and LRU order through expiry and cleanup.
The new terminal fixture queues two equivalent tickets into one dispatch
cohort and holds the owner after its claim but before attachment. It observes
the second ticket join that bare claim, then checks both settle clear after
one controlled evaluation. A second regression injects a pre-attachment
exception, verifies the abandoned claim is released, and checks a same-key
retry evaluates and clears.
Existing fake-clock, Git source, controlled offline Jev, and host collection
fixtures rerun pending joins, cached clear and finding reuse, source revision
changes, credential rotation, and eviction/re-evaluation.

Verification: Bend proofs and 37 independent canonical traces passed. The
installed build and focused 91 resident/cache tests passed. The complete
offline suite passed 65 files and 594 tests, with one file and two
credential-gated tests skipped. The spec review found and rechecked the
claim-before-attach waiter and pre-attachment cleanup fixes. The standards
review found and rechecked the cache reservation invariant. Both final
reviews found no remaining concrete issue.
