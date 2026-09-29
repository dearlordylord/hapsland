# #127 canonical revision supersession evidence

**Purpose:** Record the implementation boundary and validation evidence for #127.
**Status:** Integrated #127 implementation checkpoint; evidence is scoped to the runs and fixtures recorded below.
**Authority:** Implementation or validation evidence; this report does not amend accepted product behavior.
**Expected use:** Support #127 acceptance and the #137 source-linked authority review.
**Lifecycle:** Temporary. Review at #127 acceptance and again during #137. Once #137 incorporates the necessary boundary conclusions, exceptions, and validation limitations into its final authority report, consolidate those conclusions there, move any accepted product decision to its contract owner, update inbound links, and delete this snapshot. Keep executable traces and checks in their native artifacts.

`Canonical.step` now owns the current semantic subject and canonical input
identity, generation, and live same-input member count. Registering an equal
input reuses its generation; a changed input replaces only its subject. Releasing
an older generation cannot release the replacement. Current and supersession
queries fence old review and collection callbacks. The resident retires older
ticket units and advice through the existing canonical collection and capacity
release paths, leaving other subjects and advicees untouched.
The supersession event supplies both target and candidate subject IDs; Bend
requires their equality before comparing generations.

The native boundary maps each exact semantic subject and canonical input to a
positive numeric ID. Bend retains only those IDs and counts, never source,
credentials, or host output. Native IDs are monotonic for the resident lifetime;
only identities referenced by active canonical revisions remain in the lookup
map. A stale check uses a fresh temporary ID if its original mapping has been
pruned, so it cannot match an active revision. Source-bearing native input and
random tokens remain outside Bend. The direct generated `Revision.register`
and `Revision.superseded` resident calls and native member-count decision were
removed. `scripts/check-revision-boundary.mjs` guards that route.

Independent source-free traces in `conformance/canonical-revision-v1.json`
check same-input sharing and final release, replacement and stale release with
another subject intact, and restore without double-counting a member. Existing
resident fixtures were rerun with new current-work assertions:

- `server.test.ts`: “retires A when replacement B registers before A completes”
  holds an older controlled Jev response behind the replacement and checks
  only the new generation and one live subject.
- `server.test.ts`: the active revalidation replacement fixture uses fake
  clock, source, and host collection barriers, then checks the old lease and
  temporary capacity release exactly, and zero live subjects after the new
  advice is acknowledged and finalized.
- `server.test.ts`: “filters an earlier item superseded while a later final
  revalidation waits” checks the later B advice remains selected while old A
  is removed and two live subjects remain.
- `terminal-collection.test.ts`: same-tool revision supersession invalidates
  an earlier clear ticket; a later tool-use of the same declaration keeps its
  own clear ticket valid.

Verification: Bend proofs and 30 independent canonical traces passed. The
installed build and focused 85 resident tests passed. The complete offline
suite passed 65 files and 591 tests, with one file and two credential-gated
tests skipped. The spec and standards reviews found no remaining concrete
issue after the active-ID retention and resident assertion fixes.
