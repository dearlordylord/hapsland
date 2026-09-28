# #128 canonical ticket settlement evidence

`Canonical.step` now retains the source-free phase of each ticket, the ordered
units and their pending, clear, finding, delivered, or unavailable stages, and
the first retained failure reason. Native ticket and unit objects keep only
host identity, source/advice payload handles, credential/expiry facts, and IDs
that locate canonical state. Ticket opening, failure retention, closure, unit
admission and result, joined-unit disposition, collection gate, final feedback
authority, and terminal status now use canonical events and commands. The
resident uses a focused canonical unit snapshot when settling callbacks;
ticket failure and closure consume the canonical transition result directly.
The direct generated ticket policy calls for these decisions were removed from the
resident and guarded by `scripts/check-ticket-boundary.mjs`. Ticket eviction
count remains in the #131 retention slice.

Terminal status combines canonical phase and ordered unit results with native
facts observed at the barrier: credential validity, expiry, whether selected
advice still exists, and pending operational notice. A finding is reported as
delivered only after an acknowledged host submission is finalized. This means
`delivered` records the host handoff result; it does not claim the agent saw or
repaired the issue. Duplicate delivery marking and a late finding after a
stale unit failure are refused by the canonical transition. A known failed or
uncertain host submission does not turn a finding into a clear result.

`conformance/canonical-ticket-v1.json` contains four independent source-free
traces for mixed clear/unavailable units, pending and unacknowledged findings,
duplicate delivery marking, late superseded results, first failure retention,
and credential/expiry priority. Existing resident fixtures rerun the changed
path with fake clocks, Git source, controlled offline Jev decisions, response
barriers, and host acknowledgements. The terminal collection fixture now
asserts duplicate acknowledge and finalize calls return empty after the first
successful handoff. The server fixtures cover two tickets sharing one finding,
failed acknowledgement, superseded clear tickets, late revalidation, and
mixed finding/backend failure.

Verification: Bend proofs and 34 independent canonical traces passed. The
installed build and focused 85 resident tests passed. The complete offline
suite passed 65 files and 591 tests, with one file and two credential-gated
tests skipped. The spec review found no concrete defect. The standards review
identified full-state projection reads on the ticket path; focused unit
snapshots and direct failure/closure transition results replaced them, and the
final standards pass found no remaining concrete issue. The new resident test
assertions cover duplicate acknowledgement and finalization; the other fake
clock, source, Jev, and host scenarios were existing fixtures rerun here.
