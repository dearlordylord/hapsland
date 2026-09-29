# #125 canonical collection evidence

**Purpose:** Record the implementation boundary and validation evidence for #125.
**Status:** Integrated #125 implementation checkpoint; evidence is scoped to the runs and fixtures recorded below.
**Authority:** Implementation or validation evidence; this report does not amend accepted product behavior.
**Expected use:** Support #125 acceptance and the #137 source-linked authority review.
**Lifecycle:** Temporary. Review at #125 acceptance and again during #137. Once #137 incorporates the necessary boundary conclusions, exceptions, and validation limitations into its final authority report, consolidate those conclusions there, move any accepted product decision to its contract owner, update inbound links, and delete this snapshot. Keep executable traces and checks in their native artifacts.

`Canonical.step` now owns collection readiness, credential disposition, candidate
eligibility, cycle order, advice expiry, encoded output fit, exclusive advice
leases, and background collector claims. `CollectionState.bend` retains only
numeric advice, group, and owner IDs. The resident supplies native facts from
root and advicee attribution, source revision, credential generation, clock,
suppression, and encoded host output size. Source text, credentials, Jev
payloads, and host output remain outside canonical state.

Ordinary and background collection call the same canonical advice transitions.
A lease is reserved before asynchronous revalidation and released before
authorization when validation, current work, expiry, suppression, or output fit
fails. The final handoff also releases empty leases. A second collector cannot
reserve the same advice until that lease is released. Background claims use
the shared canonical state and exact group and owner identities; expiration
uses a native elapsed time fact. Stop-specific reoffer rules remain in the
delivery slice (#126).

`conformance/canonical-collection-v1.json` contains independent, source-free
expected outcomes for readiness and overlapping leases (including wrong owner
checks), live background
writer exclusion and expiry, and cycle, expiry, finding, and notice fit. The
resident tests exercise overlapping collection and callback order using fake
clock, temporary source files, offline Jev responses, and synthetic host
effects. A new composed-delivery test checks exact background ownership and
expiry. `scripts/check-collection-boundary.mjs` guards the resident and
standalone collection helpers against the superseded direct collection and
background decisions. Standalone helper calls also use the canonical adapter.

Verification: package `npm run test:canonical` passed Bend proofs and 21 independent
canonical traces. `npm run build` passed. Root `npm test -- --reporter=dot`
passed 65 test files and 590 offline tests; one file and two credential-gated
live tests were skipped. The focused resident, collection, and composed
delivery run passed 102 tests after the review fix.
