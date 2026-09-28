# #130 canonical operational notice evidence

`Canonical.step` now retains numeric notice keys, pending notice identities,
suppression counts, lease state, delivery group, and order. It decides whether a
failure is suppressed, creates a new key or pending notice, merges an unleased
pending notice, or preserves a leased one. It also decides notice expiry,
ordered partition or group selection, and ticket ownership filtering. Native
code supplies relative cooldown and expiry facts, reserves ledger capacity,
and retains exact keys, timestamps, owner tokens, and host output text. A new
key commits only after the ledger holds an `operationalNotice` charge for its
partition. The adapter checks retained notice identities and charges. Source,
credentials, and notice text do not enter Bend state.

The resident uses those canonical commands when admitting, pruning, leasing,
releasing, finalizing, and selecting notices. Candidate fit still uses
`CollectionNoticeCheck` for each encoded host response: Codex stops at the
first notice that cannot fit; Claude can skip one and continue. Notices are
advisory and the canonical Stop/final-authority rules do not let a notice alone
reserve a continuation. The standalone resident notice policy and direct
notice policy calls were removed. `scripts/check-notice-boundary.mjs` guards
the installed path against their return.

`conformance/canonical-notice-v1.json` has three independent, source-free
traces for suppression and merge, lease release and expiry, full-table
pressure, composed ordering, ticket ownership, and notice fit commands.
Resident tests use a fake clock, Git source fixtures, controlled offline Jev,
and host encoders to check exact cooldown and expiry boundaries, batching with
findings, host output size and prefix behavior, terminal callback order, and
notice-only Stop rejection. No live Jev call was needed for this slice.

Verification: `npm --prefix packages/agent-flow-bend run test:canonical` passed
Bend proofs and 40 independent canonical traces. `npm run build` passed.
The complete offline suite passed 65 files and 592 tests, with one file and
two credential-gated tests skipped. The two-axis review found no concrete
issue gap or documented standard violation. The standards review identified
two optional simplifications; the notice transition helper now constrains its
event and expected command to notice variants. Pending ID and sequence remain
separate because ordering is a distinct canonical fact (the composed trace
uses different ID and sequence orders). The spec review noted that source-free
fit commands use numeric facts, while resident host tests measure encoded
output bytes.
