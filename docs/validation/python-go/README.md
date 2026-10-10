# Python and Go acceptance evidence

**Purpose:** Identify bounded-profile qualification and reproducible discovery evidence for #267 and the #268 coverage handoff.
**Audience:** Product/specification owners, contributors including coding agents, and evaluation reviewers.
**Status:** Acceptance candidate evidence; qualification outcomes are recorded in acceptance.json.
**Authority:** Implementation and validation evidence. Accepted [review contracts](../../type-function-review-proposal.md) and owner-approved #267 define behavior; inventories and controlled providers do not establish coverage or classifier accuracy.
**Expected use:** Reproduce the named checks and resume #268 using the exact evidence scope and limitations.
**Lifecycle:** Update qualification when profile, parser, capture, rule or native delivery boundaries change. Review upon acceptance of a support extension; remove superseded guidance while retaining source-bound records needed for current claims and open coverage decisions.

The merged implementation base is `69825bc5ae09c2da797939a7bb198c6f4c380be4`,
which incorporates #269/#270/#271/#272. [Current language guidance](../../adding-language-support.md#python-and-go-bounded-profiles)
and the README own navigation; the accepted contracts own precise support.
[acceptance.json](acceptance.json) records this candidate's executed qualification.
Native records under [native/](native) identify their own source revision and
archive digest. Earlier child records do not qualify the later combined candidate.
Archives and full logs remain local-only; tracked sanitized records survive worktree
cleanup. No source-bearing provider responses, credentials or raw host streams are retained.

[research-provenance.json](research-provenance.json) identifies the immutable
2026-10-09 advisory capture. The four temporary Markdown reports were consolidated
into accepted contracts, current guidance and the #268 handoff rather than retained
as maintained snapshots. [research/](research) retains the original source-only
manifests, inventories and replay scripts with exact upstream revisions/digests.
Script comments preserve their historical replay declarations; original absolute
local hints are advisory, not required artifact locations. Go replay verifies remote
pinned file digests; Python replay accepts the pinned inventory JSON, fetches those exact public codeload
archives and parses them without importing or executing surveyed projects. From the
repository root: `python3 docs/validation/python-go/research/python-coverage-inventory.py
docs/validation/python-go/research/python-coverage-inventory.json > /tmp/python-coverage-replay.json`.
Parser probes record authored synthetic syntax only, never provider responses.

These inventories are discovery evidence. Python's methods statistic has sampled
function definitions as its denominator. Go's large-directory statistic has sampled
production roots as its denominator. Neither measures adapter misses or actual user
edit frequency. No adapter coverage corpus or ecosystem percentage is established.

The Linux arm64 Codex controlled fixtures use explicit trust/sandbox settings and
prepared residents. Go selects pinned Bun for installation identity probing while
registered execution uses packaged hook/resident binaries. A prior default packaged
probe took 3516 ms against the 2000 ms bound; its Bun control took 183 ms. No verified
baseline established regression attribution. Default/cold setup, ordinary interactive
trust, Darwin execution, Claude delivery and real Jev classifier accuracy remain
unqualified. The default probe bound is unchanged.

For #268, acquire immutable target-user model edits with project/build context and
consent; classify useful supported and missed cases through the direct-edit/provider
seam with denominators reported per language, root family and rule. Start a separately
labeled small pilot, not a fixed benchmark or mandatory stage. Stop on the declared
pilot budget or when no useful edit cases can be acquired; report discovery-only
results in the latter case. Rank validator/constant-only edits, external-type rule
omissions, large-package authority, dynamic Python schemas/layouts, Go workspace/build
forms and grammar gaps by observed demand and a concrete resolving experiment.
No automatic expansion, 90% gate or budget increase is accepted.
